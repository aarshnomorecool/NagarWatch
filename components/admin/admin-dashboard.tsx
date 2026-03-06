"use client";

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
import { ensureUserProfile, getCurrentUserRole } from "@/lib/user-profile";
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
import type { Database, DbDepartment, DbEscalation, DbIssue, UserRole } from "@/types/database";

type SortMode = "upvotes" | "pending_duration";

type ResolutionDraft = {
  note: string;
  file: File | null;
};

type EscalationInsert = Database["public"]["Tables"]["escalations"]["Insert"];

const RESOLUTION_BUCKET = "resolution-proofs";

function getStatusClass(status: DbIssue["status"]) {
  if (status === "resolved") return "bg-green-100 text-green-700";
  if (status === "in_progress") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-700";
}

export function AdminDashboard() {
  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [departments, setDepartments] = useState<DbDepartment[]>([]);
  const [escalations, setEscalations] = useState<DbEscalation[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("upvotes");
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

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
      } else {
        const resolvedRole = await getCurrentUserRole();
        setUserRole(resolvedRole ?? "citizen");
      }

      const [issuesRes, departmentsRes, escalationsRes] = await Promise.all([
        supabase
          .from("issues")
          .select("id,title,description,category,latitude,longitude,image_url,status,created_by,created_at,upvote_count")
          .order("created_at", { ascending: false }),
        supabase.from("departments").select("id,name,resolution_rate").order("name", { ascending: true }),
        supabase.from("escalations").select("id,issue_id,escalation_level,escalated_to,created_at"),
      ]);

      if (!active) return;

      if (issuesRes.error || departmentsRes.error || escalationsRes.error) {
        setError(issuesRes.error?.message || departmentsRes.error?.message || escalationsRes.error?.message || "Failed to load dashboard data.");
        setLoading(false);
        return;
      }

      const loadedIssues = issuesRes.data ?? [];
      const loadedDepartments = departmentsRes.data ?? [];
      let loadedEscalations = escalationsRes.data ?? [];

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
          });

          return acc;
        }, []);

      if (escalationInserts.length > 0) {
        const { error: insertEscalationError } = await supabase.from("escalations").insert(escalationInserts);
        if (insertEscalationError) {
          setError(insertEscalationError.message);
        } else {
          const { data: refreshedEscalations } = await supabase
            .from("escalations")
            .select("id,issue_id,escalation_level,escalated_to,created_at");
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
      return categoryMatch && statusMatch;
    });

    return sortIssues(filtered, sortMode);
  }, [issues, categoryFilter, statusFilter, sortMode]);

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

  if (!userRole) {
    return <div className="surface-card p-4 text-sm text-amber-700">User role is not initialized yet.</div>;
  }

  const updateIssueStatus = async (issueId: string, status: DbIssue["status"]) => {
    if (!isAuthority) {
      setError("Only authority/admin users can update issue status.");
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
    return <div className="surface-card p-4 text-sm text-slate-600">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Issues</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{issues.length}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{pendingCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolved</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{resolutionCount}</p>
        </article>
        <article className="surface-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Escalation Alerts</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{escalationAlerts.length}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="surface-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">Issue Categories</h2>
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
          <h2 className="text-sm font-semibold text-slate-900">Department Resolution Rate</h2>
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
            <p className="mt-2 text-xs text-slate-500">All departments are above the 50% resolution threshold.</p>
          )}
        </article>

        <article className="surface-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">Escalation Alerts</h2>
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
        <h2 className="text-base font-semibold text-slate-900">Escalation Alert Feed</h2>
        <p className="mt-1 text-xs text-slate-500">Automatic escalation: &gt;7 days ward authority, &gt;15 commissioner, &gt;30 state authority.</p>

        <div className="mt-3 space-y-2">
          {escalationAlerts.slice(0, 10).map((alert) => (
            <article key={alert.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 shadow-sm">
              <p className="text-sm font-semibold text-amber-900">{alert.issueTitle}</p>
              <p className="mt-1 text-xs text-amber-800">
                Escalation L{alert.escalation_level} → {alert.escalated_to} · {formatDate(alert.created_at)}
              </p>
            </article>
          ))}

          {escalationAlerts.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No active escalation alerts.</p>
          ) : null}
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">All Issues</h2>
            <p className="text-xs text-slate-500">Upvotes and pending duration are key prioritization signals.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-slate-600">
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

            <label className="text-xs text-slate-600">
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

            <label className="text-xs text-slate-600">
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
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 space-y-3">
          {filteredSortedIssues.map((issue) => {
            const draft = resolutionDrafts[issue.id] ?? { note: "", file: null };
            return (
              <article key={issue.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {issue.category} · Upvotes: {issue.upvote_count} · Created {formatDate(issue.created_at)} · Pending for {pendingDurationHours(issue.created_at)}h ({pendingDurationDays(issue.created_at)}d)
                    </p>
                    <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClass(issue.status)}`}>
                      {issue.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyIssueId === issue.id || issue.status === "in_progress" || !isAuthority}
                      onClick={() => void updateIssueStatus(issue.id, "in_progress")}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Mark In Progress
                    </button>
                    <button
                      type="button"
                      disabled={busyIssueId === issue.id || issue.status === "resolved" || !isAuthority}
                      onClick={() => void submitResolution(issue)}
                      className="btn-success px-3 py-1.5 text-xs"
                    >
                      Mark Resolved
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={draft.note}
                    onChange={(event) => setDraftNote(issue.id, event.target.value)}
                    placeholder="Resolution note"
                    className="input-base"
                    disabled={!isAuthority}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setDraftFile(issue.id, event.target.files?.[0] ?? null)}
                    className="input-base"
                    disabled={!isAuthority}
                  />
                </div>
              </article>
            );
          })}

          {filteredSortedIssues.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No issues match the selected filters.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
