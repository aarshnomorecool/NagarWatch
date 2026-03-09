"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/utils";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { createIssueEvent } from "@/lib/issue-events";
import { notifyIssueFollowers } from "@/lib/notifications";
import { ensureUserProfile, getCurrentUserRole, readRememberedAuthorityLevel } from "@/lib/user-profile";
import {
  categoryChartData,
  computeDepartmentResolutionRates,
  escalationChartData,
  escalationRuleForIssue,
  pendingDurationDays,
  pendingDurationHours,
  sortIssues,
  type DepartmentChartDatum,
} from "@/lib/admin-dashboard";
import { getSlaState } from "@/lib/sla";
import { canManageIssueByAuthority } from "@/lib/authority";
import type { Database, DbDepartment, DbEscalation, DbIssue, UserRole } from "@/types/database";

type SortMode = "upvotes" | "pending_duration";

type ResolutionDraft = {
  note: string;
  file: File | null;
};

type EscalationInsert = Database["public"]["Tables"]["escalations"]["Insert"];

const RESOLUTION_BUCKET = "resolution-proofs";

function getStatusClass(status: DbIssue["status"]) {
  if (status === "resolved") {
    return {
      label: "Resolved",
      style: {
        color: "#14532d",
        background: "rgba(34, 197, 94, 0.18)",
        border: "1px solid rgba(34, 197, 94, 0.45)",
        boxShadow: "0 0 18px rgba(34, 197, 94, 0.35)",
      },
    };
  }

  if (status === "in_progress") {
    return {
      label: "Processing",
      style: {
        color: "#713f12",
        background: "rgba(250, 204, 21, 0.22)",
        border: "1px solid rgba(250, 204, 21, 0.5)",
        boxShadow: "0 0 18px rgba(250, 204, 21, 0.35)",
      },
    };
  }

  return {
    label: "Pending",
    style: {
      color: "#7f1d1d",
      background: "rgba(248, 113, 113, 0.2)",
      border: "1px solid rgba(248, 113, 113, 0.5)",
      boxShadow: "0 0 18px rgba(248, 113, 113, 0.35)",
    },
  };
}

function getCompactSlaLabel(label: string) {
  const remainingMatch = label.match(/^(\d+)h remaining$/i);
  if (remainingMatch) {
    return `${remainingMatch[1]}h left`;
  }

  const overdueMatch = label.match(/^Overdue by (\d+)h$/i);
  if (overdueMatch) {
    return `Overdue ${overdueMatch[1]}h`;
  }

  return label;
}

export function AdminDashboard() {
  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [departments, setDepartments] = useState<DbDepartment[]>([]);
  const [escalations, setEscalations] = useState<DbEscalation[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showResolvedIssues, setShowResolvedIssues] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState<SortMode>("upvotes");
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userAuthorityLevel, setUserAuthorityLevel] = useState<"ward" | "zone" | "city" | "state" | null>(null);
  const [resolvedAtByIssueId, setResolvedAtByIssueId] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet. Admin tools are available after API setup.");
        setIssues([]);
        setDepartments([]);
        setEscalations([]);
        setLoading(false);
        return;
      }

      const profile = await ensureUserProfile();
      if (profile?.role) {
        setUserRole(profile.role);
        setUserAuthorityLevel(profile.authority_level);
      } else {
        const resolvedRole = await getCurrentUserRole();
        setUserRole(resolvedRole ?? "citizen");
        setUserAuthorityLevel(readRememberedAuthorityLevel());
      }

      const [issuesRes, departmentsRes, escalationsRes, resolutionsRes] = await Promise.all([
        supabase
          .from("issues")
          .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,assigned_authority_level,escalation_level,last_escalated_at,reopened_at,reopened_by,reopen_reason,reopen_proof")
          .order("created_at", { ascending: false }),
        supabase.from("departments").select("id,name,resolution_rate").order("name", { ascending: true }),
        supabase.from("escalations").select("id,issue_id,escalation_level,escalated_to,escalated_to_level,created_at"),
        supabase.from("resolutions").select("issue_id,resolved_at").order("resolved_at", { ascending: false }),
      ]);

      if (!active) return;

      if (issuesRes.error || departmentsRes.error || escalationsRes.error || resolutionsRes.error) {
        setError(issuesRes.error?.message || departmentsRes.error?.message || escalationsRes.error?.message || resolutionsRes.error?.message || "Failed to load dashboard data.");
        setLoading(false);
        return;
      }

      const loadedIssues = issuesRes.data ?? [];
      const loadedDepartments = departmentsRes.data ?? [];
      let loadedEscalations = escalationsRes.data ?? [];
      const resolvedMap = (resolutionsRes.data ?? []).reduce<Record<string, string>>((acc, resolution) => {
        if (!acc[resolution.issue_id]) {
          acc[resolution.issue_id] = resolution.resolved_at;
        }

        return acc;
      }, {});

      const escalationMaxByIssue = loadedEscalations.reduce<Record<string, number>>((acc, escalation) => {
        const current = acc[escalation.issue_id] ?? 0;
        acc[escalation.issue_id] = Math.max(current, escalation.escalation_level);
        return acc;
      }, {});

      const escalationInserts = loadedIssues.reduce<EscalationInsert[]>((acc, issue) => {
          const rule = escalationRuleForIssue(issue);
          if (!rule) {
            return acc;
          }

          const existingLevel = escalationMaxByIssue[issue.id] ?? 0;
          if (existingLevel >= rule.escalation_level) {
            return acc;
          }

          acc.push({
            issue_id: issue.id,
            escalation_level: rule.escalation_level,
            escalated_to: rule.escalated_to,
            escalated_to_level: rule.escalated_to_level,
          });

          return acc;
        }, []);

      if (escalationInserts.length > 0) {
        const { error: insertEscalationError } = await supabase.from("escalations").insert(escalationInserts);
        if (insertEscalationError) {
          setError(insertEscalationError.message);
        } else {
          await Promise.all(
            escalationInserts.map((entry) =>
              supabase
                .from("issues")
                .update({
                  assigned_authority_level: entry.escalated_to_level,
                  escalation_level: entry.escalation_level,
                  last_escalated_at: new Date().toISOString(),
                })
                .eq("id", entry.issue_id),
            ),
          );

          const { data: refreshedEscalations } = await supabase
            .from("escalations")
            .select("id,issue_id,escalation_level,escalated_to,escalated_to_level,created_at");
          loadedEscalations = refreshedEscalations ?? loadedEscalations;
        }
      }

      const computedRates = computeDepartmentResolutionRates(loadedIssues, loadedDepartments);
      const rateUpdates = computedRates
        .map((rate) => {
          const department = loadedDepartments.find((item) => item.name === rate.name);
          if (!department) {
            return null;
          }

          if (department.resolution_rate === rate.resolution_rate) {
            return null;
          }

          return supabase.from("departments").update({ resolution_rate: rate.resolution_rate }).eq("id", department.id);
        })
        .filter(Boolean);

      if (rateUpdates.length > 0) {
        await Promise.all(rateUpdates);
      }

      if (!active) return;

      setIssues(loadedIssues);
      setDepartments(
        loadedDepartments.map((department) => {
          const computed = computedRates.find((rate) => rate.name === department.name);
          return {
            ...department,
            resolution_rate: computed?.resolution_rate ?? department.resolution_rate,
          };
        })
      );
      setEscalations(loadedEscalations);
      setResolvedAtByIssueId(resolvedMap);
      setLoading(false);
    };

    void loadDashboardData();

    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => {
        void loadDashboardData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "resolutions" }, () => {
        void loadDashboardData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "escalations" }, () => {
        void loadDashboardData();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(issues.map((issue) => issue.category)))], [issues]);

  const filteredSortedIssues = useMemo(() => {
    const filtered = issues.filter((issue) => {
      const categoryMatch = categoryFilter === "all" ? true : issue.category === categoryFilter;
      const statusMatch = statusFilter === "all" ? true : issue.status === statusFilter;
      const resolvedVisibilityMatch = showResolvedIssues ? true : issue.status !== "resolved";
      return categoryMatch && statusMatch && resolvedVisibilityMatch;
    });

    return sortIssues(filtered, sortMode);
  }, [issues, categoryFilter, statusFilter, sortMode, showResolvedIssues]);

  const ITEMS_PER_PAGE = 15;
  const totalPages = Math.max(1, Math.ceil(filteredSortedIssues.length / ITEMS_PER_PAGE));
  const pagedIssues = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSortedIssues.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSortedIssues, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, sortMode, showResolvedIssues]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (filteredSortedIssues.length === 0) {
      setSelectedIssueId(null);
      return;
    }

    if (!selectedIssueId || !filteredSortedIssues.some((issue) => issue.id === selectedIssueId)) {
      setSelectedIssueId(filteredSortedIssues[0].id);
    }
  }, [filteredSortedIssues, selectedIssueId]);

  const categoryAnalytics = useMemo(() => categoryChartData(issues), [issues]);
  const escalationAnalytics = useMemo(() => escalationChartData(escalations), [escalations]);
  const departmentAnalytics: DepartmentChartDatum[] = useMemo(
    () => computeDepartmentResolutionRates(issues, departments),
    [issues, departments]
  );

  const flaggedDepartments = useMemo(() => departmentAnalytics.filter((department) => department.isFlagged), [departmentAnalytics]);

  const issueTitleMap = useMemo(() => {
    return issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.id] = issue.title;
      return acc;
    }, {});
  }, [issues]);

  const escalationAlerts = useMemo(() => {
    return [...escalations]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((escalation) => ({
        ...escalation,
        issueTitle: issueTitleMap[escalation.issue_id] ?? escalation.issue_id,
      }));
  }, [escalations, issueTitleMap]);

  const resolutionCount = useMemo(() => issues.filter((issue) => issue.status === "resolved").length, [issues]);
  const pendingCount = useMemo(() => issues.filter((issue) => issue.status === "pending").length, [issues]);

  const isAuthority = userRole === "authority" || userRole === "admin";
  const selectedIssue = selectedIssueId ? filteredSortedIssues.find((issue) => issue.id === selectedIssueId) ?? null : null;

  if (!userRole) {
    return <div className="surface-card p-4 text-sm" style={{ color: "var(--primary-strong)" }}>User role is not initialized yet.</div>;
  }

  const updateIssueStatus = async (issueId: string, status: DbIssue["status"]) => {
    if (!isAuthority) {
      setError("Only authority/admin users can update issue status.");
      return;
    }

    const issue = issues.find((item) => item.id === issueId);
    if (!issue) {
      setError("Issue not found.");
      return;
    }

    if (!canManageIssueByAuthority(userRole, userAuthorityLevel, issue)) {
      setError("This issue is assigned to a higher authority tier.");
      return;
    }

    setBusyIssueId(issueId);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const { error: updateError } = await supabase.from("issues").update({ status }).eq("id", issueId);
      if (updateError) throw new Error(updateError.message);

      if (status === "in_progress") {
        await createIssueEvent(supabase, {
          issueId,
          eventType: "in_progress",
          message: "Authority started working on issue",
          createdBy: "authority",
        });

        await notifyIssueFollowers(supabase, {
          issueId,
          notificationType: "issue_in_progress",
          title: "Issue under process",
          body: "Authority has started work on this issue.",
        });
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update issue status.");
    } finally {
      setBusyIssueId(null);
    }
  };

  const setDraftNote = (issueId: string, note: string) => {
    setResolutionDrafts((prev) => ({
      ...prev,
      [issueId]: {
        note,
        file: prev[issueId]?.file ?? null,
      },
    }));
  };

  const setDraftFile = (issueId: string, file: File | null) => {
    setResolutionDrafts((prev) => ({
      ...prev,
      [issueId]: {
        note: prev[issueId]?.note ?? "",
        file,
      },
    }));
  };

  const submitResolution = async (issue: DbIssue) => {
    if (!isAuthority) {
      setError("Only authority/admin users can submit resolutions.");
      return;
    }

    if (!canManageIssueByAuthority(userRole, userAuthorityLevel, issue)) {
      setError("This issue is assigned to a higher authority tier.");
      return;
    }

    const draft = resolutionDrafts[issue.id];
    if (!draft?.note.trim() || !draft.file) {
      setError("Resolution note and proof image are required to mark as resolved.");
      return;
    }

    setBusyIssueId(issue.id);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const profile = await ensureUserProfile();
      const resolvedBy = profile?.id ?? issue.created_by;

      const extension = draft.file.name.split(".").pop() || "jpg";
      const path = `${issue.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(RESOLUTION_BUCKET).upload(path, draft.file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from(RESOLUTION_BUCKET).getPublicUrl(path);

      await createIssueEvent(supabase, {
        issueId: issue.id,
        eventType: "resolution_proof",
        message: "Resolution proof image uploaded",
        createdBy: "authority",
      });

      const { error: resolutionError } = await supabase.from("resolutions").insert({
        issue_id: issue.id,
        resolved_by: resolvedBy,
        proof_image: publicUrl,
        resolution_note: draft.note.trim(),
      });
      if (resolutionError) throw new Error(resolutionError.message);

      const { error: statusError } = await supabase.from("issues").update({ status: "resolved" }).eq("id", issue.id);
      if (statusError) throw new Error(statusError.message);

      await createIssueEvent(supabase, {
        issueId: issue.id,
        eventType: "resolved",
        message: "Authority marked issue as resolved",
        createdBy: "authority",
      });

      await notifyIssueFollowers(supabase, {
        issueId: issue.id,
        actorUserId: resolvedBy,
        notificationType: "issue_resolved",
        title: "Issue resolved",
        body: `${issue.title} was marked as resolved with proof uploaded.`,
      });

      setResolutionDrafts((prev) => ({
        ...prev,
        [issue.id]: { note: "", file: null },
      }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not submit resolution.");
    } finally {
      setBusyIssueId(null);
    }
  };

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total Issues</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>{issues.length}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Pending</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>{pendingCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Resolved</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>{resolutionCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Escalation Alerts</p>
          <p className="mt-2 text-2xl font-bold" style={{ color: "var(--text)" }}>{escalationAlerts.length}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="surface-card p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Issue Categories</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryAnalytics} dataKey="count" nameKey="category" outerRadius={85} fill="#2563eb" />
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="surface-card p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Department Resolution Rate</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentAnalytics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide={departmentAnalytics.length > 5} />
                <YAxis unit="%" />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Bar dataKey="resolution_rate">
                  {departmentAnalytics.map((entry) => (
                    <Cell key={entry.name} fill={entry.isFlagged ? "#dc2626" : "#16a34a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {flaggedDepartments.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-red-600">Flagged (&lt;50%): {flaggedDepartments.map((department) => department.name).join(", ")}</p>
          ) : (
            <p className="mt-2 text-xs text-muted">All departments are above the 50% resolution threshold.</p>
          )}
        </article>

        <article className="surface-card p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Escalation Alerts</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={escalationAnalytics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="escalation_level" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="surface-card p-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Escalation Alert Feed</h2>
        <p className="mt-1 text-xs text-muted">Automatic escalation: &gt;7 days ward authority, &gt;15 commissioner, &gt;30 state authority.</p>

        <div className="mt-3 space-y-2">
          {escalationAlerts.slice(0, 10).map((alert) => (
            <article key={alert.id} className="rounded-md border p-3 shadow-sm" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 16%, var(--surface))" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{alert.issueTitle}</p>
              <p className="mt-1 text-xs text-muted">
                Escalation L{alert.escalation_level} → {alert.escalated_to} · {formatDate(alert.created_at)}
              </p>
            </article>
          ))}

          {escalationAlerts.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted" style={{ borderColor: "var(--border)" }}>No active escalation alerts.</p>
          ) : null}
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>All Issues</h2>
            <p className="text-xs text-muted">Upvotes and pending duration are key prioritization signals.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="input-base mt-1 py-1.5"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === "all" ? "All" : category}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-muted">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="input-base mt-1 py-1.5"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>

            <label className="text-xs text-muted">
              Sort By
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="input-base mt-1 py-1.5"
              >
                <option value="upvotes">Upvotes</option>
                <option value="pending_duration">Pending Duration</option>
              </select>
            </label>

            <label className="mt-1 flex items-center gap-2 text-xs text-muted sm:col-span-3">
              <input
                type="checkbox"
                checked={showResolvedIssues}
                onChange={(event) => setShowResolvedIssues(event.target.checked)}
              />
              Show resolved issues
            </label>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 space-y-3">
          {filteredSortedIssues.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="min-w-full text-sm">
                <thead style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Issue</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Votes</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Location</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Age</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">SLA</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedIssues.map((issue) => {
                    const selected = selectedIssueId === issue.id;
                    const statusTone = getStatusClass(issue.status);
                    const slaState = getSlaState(issue);
                    const resolvedAt = resolvedAtByIssueId[issue.id];
                    const resolvedHours = resolvedAt
                      ? Math.max(0, Math.floor((new Date(resolvedAt).getTime() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60)))
                      : null;
                    return (
                      <tr key={issue.id} style={{ background: selected ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent" }}>
                        <td className="border-t px-3 py-2 align-top" style={{ borderColor: "var(--border)" }}>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{issue.title}</p>
                          <p className="text-xs text-muted">{issue.category} · {formatDate(issue.created_at)}</p>
                        </td>
                        <td className="border-t px-3 py-2 align-top" style={{ borderColor: "var(--border)" }}>
                          <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none" style={statusTone.style}>
                            {statusTone.label}
                          </span>
                        </td>
                        <td className="border-t px-3 py-2 align-top text-xs" style={{ borderColor: "var(--border)" }}>Up {issue.upvote_count}</td>
                        <td className="border-t px-3 py-2 align-top text-xs text-muted" style={{ borderColor: "var(--border)" }}>
                          {[issue.area_name, issue.road_name, issue.landmark ? `Near ${issue.landmark}` : null].filter(Boolean).join(" · ") || "Location n/a"}
                        </td>
                        <td className="border-t px-3 py-2 align-top text-xs" style={{ borderColor: "var(--border)" }}>
                          {pendingDurationHours(issue.created_at)}h ({pendingDurationDays(issue.created_at)}d)
                        </td>
                        <td className="border-t px-3 py-2 align-top text-xs" style={{ borderColor: "var(--border)" }}>
                          {issue.status === "resolved" && resolvedHours !== null ? (
                            <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none" style={{ color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.4)" }}>
                              Resolved {resolvedHours}h
                            </span>
                          ) : (
                            <span
                              className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
                              style={
                                slaState.isOverdue
                                  ? { color: "#7f1d1d", background: "rgba(248, 113, 113, 0.2)", border: "1px solid rgba(248, 113, 113, 0.5)" }
                                  : { color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.4)" }
                              }
                            >
                              {getCompactSlaLabel(slaState.label)}
                            </span>
                          )}
                        </td>
                        <td className="border-t px-3 py-2 align-top" style={{ borderColor: "var(--border)" }}>
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/issue/${issue.id}`} className="btn-secondary px-2.5 py-1 text-xs">
                              Details
                            </Link>
                            <button
                              type="button"
                              onClick={() => setSelectedIssueId(issue.id)}
                              className="btn-secondary px-2.5 py-1 text-xs"
                            >
                              Manage
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {filteredSortedIssues.length > ITEMS_PER_PAGE ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary px-2.5 py-1 text-xs"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                &lt;-
              </button>
              <span className="text-xs text-muted">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                className="btn-secondary px-2.5 py-1 text-xs"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                -&gt;
              </button>
            </div>
          ) : null}

          {selectedIssue ? (
            <article className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 94%, var(--surface))" }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Manage Selected Issue</p>
                  <p className="mt-1 text-xs text-muted">{selectedIssue.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyIssueId === selectedIssue.id || selectedIssue.status === "in_progress" || !isAuthority || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
                    onClick={() => void updateIssueStatus(selectedIssue.id, "in_progress")}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Mark In Progress
                  </button>
                  <button
                    type="button"
                    disabled={busyIssueId === selectedIssue.id || selectedIssue.status === "resolved" || !isAuthority || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
                    onClick={() => void submitResolution(selectedIssue)}
                    className="btn-success px-3 py-1.5 text-xs"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={(resolutionDrafts[selectedIssue.id] ?? { note: "", file: null }).note}
                  onChange={(event) => setDraftNote(selectedIssue.id, event.target.value)}
                  placeholder="Resolution note"
                  className="input-base"
                  disabled={!isAuthority || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setDraftFile(selectedIssue.id, event.target.files?.[0] ?? null)}
                  className="input-base"
                  disabled={!isAuthority || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
                />
              </div>
            </article>
          ) : null}

          {filteredSortedIssues.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted" style={{ borderColor: "var(--border)" }}>No issues match the selected filters.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
