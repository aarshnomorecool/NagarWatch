"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createIssueEvent } from "@/lib/issue-events";
import { notifyIssueFollowers, notifyIssueOwner } from "@/lib/notifications";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentUserRole, readRememberedAuthorityLevel } from "@/lib/user-profile";
import { getSlaState } from "@/lib/sla";
import { formatDate } from "@/lib/utils";
import { canManageIssueByAuthority } from "@/lib/authority";
import { authorityLevelLabel } from "@/lib/authority-display";
import type { AuthorityLevel, DbIssue, UserRole } from "@/types/database";

type ResolutionDraft = {
  note: string;
  file: File | null;
};

const RESOLUTION_BUCKET = "resolution-proofs";
const ITEMS_PER_PAGE = 15;

function getResolvedDurationLabel(createdAt: string, resolvedAt: string) {
  const totalHours = Math.max(0, Math.floor((new Date(resolvedAt).getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60)));
  return `Resolved ${totalHours}h`;
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

export function IssuesTable() {
  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [resolvedAtByIssueId, setResolvedAtByIssueId] = useState<Record<string, string>>({});
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [showResolvedIssues, setShowResolvedIssues] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [resolutionDraft, setResolutionDraft] = useState<ResolutionDraft>({ note: "", file: null });
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userAuthorityLevel, setUserAuthorityLevel] = useState<AuthorityLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet. Add env keys to enable admin issue management.");
        setLoading(false);
        return;
      }

      const role = await getCurrentUserRole();
      setUserRole(role ?? "citizen");
      const profile = await ensureUserProfile();
      setUserAuthorityLevel(profile?.authority_level ?? readRememberedAuthorityLevel());

      const [issuesRes, resolutionsRes] = await Promise.all([
        supabase
          .from("issues")
          .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,assigned_authority_level,escalation_level,last_escalated_at,reopened_at,reopened_by,reopen_reason,reopen_proof")
          .order("created_at", { ascending: false }),
        supabase.from("resolutions").select("issue_id,resolved_at").order("resolved_at", { ascending: false }),
      ]);

      if (!active) return;

      if (issuesRes.error || resolutionsRes.error) {
        setError(issuesRes.error?.message || resolutionsRes.error?.message || "Could not load issues.");
      } else {
        const loadedIssues = issuesRes.data ?? [];
        const resolvedMap = (resolutionsRes.data ?? []).reduce<Record<string, string>>((acc, resolution) => {
          if (!acc[resolution.issue_id]) {
            acc[resolution.issue_id] = resolution.resolved_at;
          }

          return acc;
        }, {});

        setIssues(loadedIssues);
        setResolvedAtByIssueId(resolvedMap);
        setSelectedIssueId((current) => current ?? loadedIssues[0]?.id ?? null);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filteredSortedIssues = useMemo(() => {
    const filtered = showResolvedIssues ? issues : issues.filter((issue) => issue.status !== "resolved");
    return [...filtered].sort((a, b) => b.upvote_count - a.upvote_count);
  }, [issues, showResolvedIssues]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedIssues.length / ITEMS_PER_PAGE));
  const pagedIssues = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSortedIssues.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSortedIssues, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [showResolvedIssues]);

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

  const selectedIssue = selectedIssueId ? filteredSortedIssues.find((issue) => issue.id === selectedIssueId) ?? null : null;
  const canManageIssues = userRole === "authority" || userRole === "admin";

  const updateIssueStatus = async (issueId: string, status: DbIssue["status"]) => {
    if (!canManageIssues) {
      setError("Only authority/admin users can manage issue status.");
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
      if (updateError) {
        throw new Error(updateError.message);
      }

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

        await notifyIssueOwner(supabase, {
          userId: issue.created_by,
          issueId,
          notificationType: "issue_authority_changed",
          title: "Issue moved to processing",
          body: `Your issue \"${issue.title}\" is now under process at ${issue.assigned_authority_level} authority.`,
        });
      }

      setIssues((current) => current.map((issue) => (issue.id === issueId ? { ...issue, status } : issue)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update issue status.");
    } finally {
      setBusyIssueId(null);
    }
  };

  const submitResolution = async () => {
    if (!selectedIssue) {
      setError("Select an issue first.");
      return;
    }

    if (!canManageIssues) {
      setError("Only authority/admin users can submit resolutions.");
      return;
    }

    if (!canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)) {
      setError("This issue is assigned to a higher authority tier.");
      return;
    }

    if (!resolutionDraft.note.trim() || !resolutionDraft.file) {
      setError("Resolution note and proof image are required.");
      return;
    }

    setBusyIssueId(selectedIssue.id);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const profile = await ensureUserProfile();
      const resolvedBy = profile?.id ?? selectedIssue.created_by;

      const extension = resolutionDraft.file.name.split(".").pop() || "jpg";
      const path = `${selectedIssue.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage.from(RESOLUTION_BUCKET).upload(path, resolutionDraft.file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(RESOLUTION_BUCKET).getPublicUrl(path);

      await createIssueEvent(supabase, {
        issueId: selectedIssue.id,
        eventType: "resolution_proof",
        message: "Resolution proof image uploaded",
        createdBy: "authority",
      });

      const { error: resolutionError } = await supabase.from("resolutions").insert({
        issue_id: selectedIssue.id,
        resolved_by: resolvedBy,
        proof_image: publicUrl,
        resolution_note: resolutionDraft.note.trim(),
      });
      if (resolutionError) {
        throw new Error(resolutionError.message);
      }

      const { error: statusError } = await supabase.from("issues").update({ status: "resolved" }).eq("id", selectedIssue.id);
      if (statusError) {
        throw new Error(statusError.message);
      }

      await createIssueEvent(supabase, {
        issueId: selectedIssue.id,
        eventType: "resolved",
        message: "Authority marked issue as resolved",
        createdBy: "authority",
      });

      await notifyIssueFollowers(supabase, {
        issueId: selectedIssue.id,
        actorUserId: resolvedBy,
        notificationType: "issue_resolved",
        title: "Issue resolved",
        body: `${selectedIssue.title} was marked as resolved with proof uploaded.`,
      });

      await notifyIssueOwner(supabase, {
        userId: selectedIssue.created_by,
        issueId: selectedIssue.id,
        notificationType: "issue_resolved",
        title: "Issue resolved",
        body: `Your issue \"${selectedIssue.title}\" has been resolved.`,
      });

      setIssues((current) => current.map((issue) => (issue.id === selectedIssue.id ? { ...issue, status: "resolved" } : issue)));
      setResolutionDraft({ note: "", file: null });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not submit resolution.");
    } finally {
      setBusyIssueId(null);
    }
  };

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading issues...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm" style={{ color: "var(--primary-strong)" }}>{error}</div>;
  }

  if (issues.length === 0) {
    return <div className="surface-card p-4 text-sm text-muted">No complaints found.</div>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="surface-card p-3 text-sm" style={{ color: "var(--primary-strong)" }}>{error}</div> : null}

      <div className="surface-card overflow-hidden">
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showResolvedIssues}
              onChange={(event) => setShowResolvedIssues(event.target.checked)}
            />
            Show resolved issues
          </label>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y" style={{ borderColor: "var(--border)" }}>
          <thead style={{ background: "rgba(250,204,21,0.15)" }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Issue</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Handling Authority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Upvotes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">SLA</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {pagedIssues.map((issue) => (
              (() => {
                const statusTone = getStatusClass(issue.status);
                const slaState = getSlaState(issue);
                const resolvedAt = resolvedAtByIssueId[issue.id];
                return (
              <tr
                key={issue.id}
                className="cursor-pointer transition"
                style={selectedIssueId === issue.id ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" } : undefined}
                onClick={() => setSelectedIssueId(issue.id)}
              >
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-xs text-muted">{issue.id}</p>
                </td>
                <td className="px-4 py-3 text-sm">{issue.category}</td>
                <td className="px-4 py-3 text-sm text-muted">{[issue.area_name, issue.road_name, issue.landmark ? `Near ${issue.landmark}` : null].filter(Boolean).join(" · ") || "-"}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none" style={statusTone.style}>
                    {statusTone.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{authorityLevelLabel(issue.assigned_authority_level)}</td>
                <td className="px-4 py-3 text-sm">{issue.upvote_count}</td>
                <td className="px-4 py-3 text-sm">
                  {issue.status === "resolved" && resolvedAt ? (
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none"
                      style={{ color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.4)" }}
                    >
                      {getResolvedDurationLabel(issue.created_at, resolvedAt)}
                    </span>
                  ) : (
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none"
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
                <td className="px-4 py-3 text-sm">{formatDate(issue.created_at)}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Link href={`/issue/${issue.id}`} className="btn-secondary px-3 py-1.5 text-xs">
                      Details
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedIssueId(issue.id)}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Manage
                    </button>
                  </div>
                </td>
              </tr>
                );
              })()
            ))}
            {pagedIssues.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-muted" colSpan={9}>
                  No complaints found for the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
        {filteredSortedIssues.length > ITEMS_PER_PAGE ? (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
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
      </div>

      {selectedIssue ? (
        <section className="surface-card space-y-3 p-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Manage Selected Issue</p>
            <p className="mt-1 text-sm text-muted">{selectedIssue.title}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void updateIssueStatus(selectedIssue.id, "in_progress")}
              disabled={!canManageIssues || busyIssueId === selectedIssue.id || selectedIssue.status === "in_progress" || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
              className="btn-secondary px-3 py-2 text-sm"
            >
              {busyIssueId === selectedIssue.id ? "Working..." : "Mark In Progress"}
            </button>

            <button
              type="button"
              onClick={() => void submitResolution()}
              disabled={!canManageIssues || busyIssueId === selectedIssue.id || selectedIssue.status === "resolved" || !canManageIssueByAuthority(userRole, userAuthorityLevel, selectedIssue)}
              className="btn-success px-3 py-2 text-sm"
            >
              {busyIssueId === selectedIssue.id ? "Submitting..." : "Mark Resolved"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <input
              type="text"
              placeholder="Resolution note"
              value={resolutionDraft.note}
              onChange={(event) => setResolutionDraft((prev) => ({ ...prev, note: event.target.value }))}
              className="input-base"
            />

            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setResolutionDraft((prev) => ({ ...prev, file }));
              }}
              className="input-base"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
