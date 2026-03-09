"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import { authorityLevelLabel, escalatedFromLevel, escalationLevelLabel, levelTitle } from "@/lib/authority-display";
import { formatDate } from "@/lib/utils";
import { getSlaState } from "@/lib/sla";
import type { AuthorityLevel, DbEscalation, DbIssue, UserRole } from "@/types/database";

type EscalationRow = DbEscalation & {
  issue: Pick<DbIssue, "id" | "title" | "category" | "status" | "created_at" | "sla_target_hours" | "assigned_authority_level"> | null;
};

function getLevelBadgeStyle(level: AuthorityLevel) {
  if (level === "ward") {
    return { color: "#1e3a8a", background: "rgba(59, 130, 246, 0.2)", border: "1px solid rgba(59, 130, 246, 0.45)" };
  }

  if (level === "zone") {
    return { color: "#854d0e", background: "rgba(234, 179, 8, 0.22)", border: "1px solid rgba(234, 179, 8, 0.5)" };
  }

  if (level === "city") {
    return { color: "#7f1d1d", background: "rgba(248, 113, 113, 0.2)", border: "1px solid rgba(248, 113, 113, 0.5)" };
  }

  return { color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.45)" };
}

export function EscalationsPanel() {
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              .select("id,title,category,status,created_at,sla_target_hours,assigned_authority_level")
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

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="min-w-full text-sm">
            <thead style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Issue</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Category</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Escalation Level</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Escalated From</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Escalated To</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Time Escalated</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">SLA / Time Left</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const fromLevel = escalatedFromLevel(row.escalated_to_level);
                const issue = row.issue;
                const slaState = issue ? getSlaState(issue) : null;

                return (
                  <tr key={row.id}>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="font-medium" style={{ color: "var(--text)" }}>{issue?.title ?? row.issue_id}</p>
                    </td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{issue?.category ?? "-"}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none" style={getLevelBadgeStyle(row.escalated_to_level)}>
                        {escalationLevelLabel(row.escalated_to_level)}
                      </span>
                    </td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{fromLevel ? authorityLevelLabel(fromLevel) : "-"}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{authorityLevelLabel(row.escalated_to_level)}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{formatDate(row.created_at)}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{issue?.status ?? "-"}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      {slaState ? (
                        <span
                          className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
                          style={
                            slaState.isOverdue
                              ? { color: "#7f1d1d", background: "rgba(248, 113, 113, 0.2)", border: "1px solid rgba(248, 113, 113, 0.5)" }
                              : { color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.4)" }
                          }
                        >
                          {slaState.label}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <Link href={issue ? `/issue/${issue.id}` : "#"} className="btn-secondary px-2.5 py-1 text-xs">
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="border-t px-3 py-3 text-muted" style={{ borderColor: "var(--border)" }} colSpan={9}>
                    No escalations available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
