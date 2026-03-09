"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import { createIssueEvent } from "@/lib/issue-events";
import { authorityLevelLabel, escalatedFromLevel, escalationLevelLabel, levelTitle } from "@/lib/authority-display";
import { formatDate } from "@/lib/utils";
import { notifyIssueFollowers, notifyIssueOwner } from "@/lib/notifications";
import type { AuthorityLevel, DbEscalation, DbIssue, UserRole } from "@/types/database";

type EscalationRow = DbEscalation & {
  issue: Pick<DbIssue, "id" | "title" | "status" | "assigned_authority_level" | "created_by"> | null;
};

export function EscalationsPanel() {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignNote, setAssignNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowserClientOrNull();
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const profile = await ensureUserProfile();
        const currentRole = profile?.role ?? null;
        const currentLevel = profile?.authority_level ?? null;

        if (!active) {
          return;
        }

        setRole(currentRole);
        setAuthorityLevel(currentLevel);

        const { data, error: escalationsError } = await supabase
          .from("escalations")
          .select("id,issue_id,escalation_level,escalated_to,escalated_to_level,created_at")
          .order("created_at", { ascending: false });

        if (escalationsError) {
          throw new Error(escalationsError.message);
        }

        const issueIds = Array.from(new Set((data ?? []).map((row) => row.issue_id)));
        const { data: issuesData, error: issuesError } = issueIds.length > 0
          ? await supabase
              .from("issues")
              .select("id,title,status,assigned_authority_level,created_by")
              .in("id", issueIds)
          : { data: [], error: null };

        if (issuesError) {
          throw new Error(issuesError.message);
        }

        if (!active) {
          return;
        }

        const issueMap = new Map((issuesData ?? []).map((issue) => [issue.id, issue]));
        setRows(
          (data ?? []).map((row) => ({
            ...row,
            issue: issueMap.get(row.issue_id) ?? null,
          })),
        );
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load escalations.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const visibleRows = useMemo(() => {
    if (role === "admin") {
      return rows;
    }

    if (role === "authority" && authorityLevel) {
      return rows.filter((row) => row.escalated_to_level === authorityLevel);
    }

    return [];
  }, [rows, role, authorityLevel]);

  const acceptEscalation = async (row: EscalationRow) => {
    if (!row.issue) {
      return;
    }

    setBusyId(row.id);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error: updateError } = await supabase.from("issues").update({ status: "in_progress" }).eq("id", row.issue.id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      await createIssueEvent(supabase, {
        issueId: row.issue.id,
        eventType: "in_progress",
        message: `${authorityLevelLabel(row.escalated_to_level)} accepted escalation`,
        createdBy: "authority",
      });

      await notifyIssueFollowers(supabase, {
        issueId: row.issue.id,
        notificationType: "issue_authority_changed",
        title: "Escalation accepted",
        body: `Your issue \"${row.issue.title}\" is now being handled by ${authorityLevelLabel(row.escalated_to_level)}.`,
      });

      await notifyIssueOwner(supabase, {
        userId: row.issue.created_by,
        issueId: row.issue.id,
        notificationType: "issue_authority_changed",
        title: "Issue reassigned",
        body: `Your issue \"${row.issue.title}\" has been assigned to ${authorityLevelLabel(row.escalated_to_level)}.`,
      });

      setRows((current) => current.map((item) => (item.id === row.id && item.issue ? { ...item, issue: { ...item.issue, status: "in_progress" } } : item)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not accept escalation.");
    } finally {
      setBusyId(null);
    }
  };

  const assignAction = async (row: EscalationRow) => {
    if (!row.issue) {
      return;
    }

    const note = (assignNote[row.id] ?? "").trim();
    if (!note) {
      setError("Enter an action note before assigning.");
      return;
    }

    setBusyId(row.id);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      await createIssueEvent(supabase, {
        issueId: row.issue.id,
        eventType: "assigned",
        message: `Assigned action: ${note}`,
        createdBy: "authority",
      });

      await notifyIssueFollowers(supabase, {
        issueId: row.issue.id,
        notificationType: "issue_authority_changed",
        title: "New authority action assigned",
        body: `Action assigned on your issue \"${row.issue.title}\": ${note}`,
      });

      await notifyIssueOwner(supabase, {
        userId: row.issue.created_by,
        issueId: row.issue.id,
        notificationType: "issue_authority_changed",
        title: "Authority action assigned",
        body: `Action assigned on your issue \"${row.issue.title}\": ${note}`,
      });

      setAssignNote((current) => ({ ...current, [row.id]: "" }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not assign action.");
    } finally {
      setBusyId(null);
    }
  };

  const resolveIssue = async (row: EscalationRow) => {
    if (!row.issue) {
      return;
    }

    setBusyId(row.id);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error: statusError } = await supabase.from("issues").update({ status: "resolved" }).eq("id", row.issue.id);
      if (statusError) {
        throw new Error(statusError.message);
      }

      await createIssueEvent(supabase, {
        issueId: row.issue.id,
        eventType: "resolved",
        message: "Authority resolved escalated issue",
        createdBy: "authority",
      });

      await notifyIssueFollowers(supabase, {
        issueId: row.issue.id,
        notificationType: "issue_resolved",
        title: "Issue resolved",
        body: `Your issue \"${row.issue.title}\" has been resolved.`,
      });

      await notifyIssueOwner(supabase, {
        userId: row.issue.created_by,
        issueId: row.issue.id,
        notificationType: "issue_resolved",
        title: "Issue resolved",
        body: `Your issue \"${row.issue.title}\" has been resolved.`,
      });

      setRows((current) => current.map((item) => (item.id === row.id && item.issue ? { ...item, issue: { ...item.issue, status: "resolved" } } : item)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not resolve issue.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <section className="surface-card p-4 text-sm text-muted">Loading escalations...</section>;
  }

  if (role !== "admin" && role !== "authority") {
    return <section className="surface-card p-4 text-sm text-red-600">Only authority/admin accounts can view escalations.</section>;
  }

  return (
    <section className="space-y-4">
      <header className="surface-card p-4">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Escalations</h1>
        <p className="mt-1 text-sm text-muted">
          {role === "admin" ? "Showing all escalations." : `Showing escalations assigned to ${authorityLevel ? levelTitle(authorityLevel) : "your"} authority.`}
        </p>
      </header>

      <section className="surface-card p-4">
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {visibleRows.length === 0 ? <p className="text-sm text-muted">No escalations available.</p> : null}

        <div className="space-y-3">
          {visibleRows.map((row) => {
            const fromLevel = escalatedFromLevel(row.escalated_to_level);
            return (
              <article key={row.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 14%, var(--surface))" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{row.issue?.title ?? row.issue_id}</p>
                <p className="mt-1 text-xs text-muted">Escalation Level: {escalationLevelLabel(row.escalated_to_level)}</p>
                <p className="mt-1 text-xs text-muted">Escalated To: {authorityLevelLabel(row.escalated_to_level)}</p>
                <p className="mt-1 text-xs text-muted">Escalated From: {fromLevel ? authorityLevelLabel(fromLevel) : "-"}</p>
                <p className="mt-1 text-xs text-muted">Time Escalated: {formatDate(row.created_at)}</p>
                <p className="mt-1 text-xs text-muted">Status: {row.issue?.status ?? "-"}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1 text-xs"
                    disabled={busyId === row.id || !row.issue}
                    onClick={() => void acceptEscalation(row)}
                  >
                    {busyId === row.id ? "Working..." : "Accept Escalation"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1 text-xs"
                    disabled={busyId === row.id || !row.issue}
                    onClick={() => void resolveIssue(row)}
                  >
                    Resolve Issue
                  </button>
                </div>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input-base"
                    placeholder="Assign action note"
                    value={assignNote[row.id] ?? ""}
                    onChange={(event) => setAssignNote((current) => ({ ...current, [row.id]: event.target.value }))}
                  />
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1 text-xs"
                    disabled={busyId === row.id || !row.issue}
                    onClick={() => void assignAction(row)}
                  >
                    Assign Action
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
