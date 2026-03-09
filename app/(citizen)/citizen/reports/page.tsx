"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import { authorityLevelLabel, escalationLevelLabel } from "@/lib/authority-display";
import { formatDate } from "@/lib/utils";
import type { DbIssue } from "@/types/database";

export default function CitizenMyReportsPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadReports = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowserClientOrNull();
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const { user } = await getAuthUserSafe();
        if (!user) {
          router.replace("/citizen/login?next=/citizen/reports");
          return;
        }

        const profile = await ensureUserProfile();
        const userId = profile?.id ?? user.id;

        const { data, error: issuesError } = await supabase
          .from("issues")
          .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,assigned_authority_level,escalation_level,last_escalated_at,reopened_at,reopened_by,reopen_reason,reopen_proof")
          .eq("created_by", userId)
          .order("created_at", { ascending: false });

        if (issuesError) {
          throw new Error(issuesError.message);
        }

        if (!active) {
          return;
        }

        setIssues(data ?? []);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Could not load your reports.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadReports();

    return () => {
      active = false;
    };
  }, [router]);

  const deleteIssue = async (issueId: string) => {
    const confirmed = window.confirm("Delete this report permanently?");
    if (!confirmed) {
      return;
    }

    setBusyIssueId(issueId);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error: deleteError } = await supabase.from("issues").delete().eq("id", issueId);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setIssues((current) => current.filter((issue) => issue.id !== issueId));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete report.");
    } finally {
      setBusyIssueId(null);
    }
  };

  if (loading) {
    return <section className="surface-card mx-auto w-full max-w-6xl p-4 text-sm text-muted">Loading your reports...</section>;
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <header className="surface-card p-5">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>My Reports</h1>
        <p className="mt-1 text-sm text-muted">View and manage issues you reported.</p>
      </header>

      <div className="surface-card p-4">
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {issues.length === 0 ? <p className="text-sm text-muted">You have not reported any issues yet.</p> : null}

        {issues.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="min-w-full text-sm">
              <thead style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Issue</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Handling Authority</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Created</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Escalation</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Upvotes</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <p className="font-medium" style={{ color: "var(--text)" }}>{issue.title}</p>
                    </td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{issue.category}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{issue.status}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{authorityLevelLabel(issue.assigned_authority_level)}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{formatDate(issue.created_at)}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{escalationLevelLabel(issue.assigned_authority_level)}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>{issue.upvote_count}</td>
                    <td className="border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/issue/${issue.id}`} className="btn-secondary px-2.5 py-1 text-xs">View</Link>
                        <button
                          type="button"
                          className="btn-secondary px-2.5 py-1 text-xs"
                          disabled={busyIssueId === issue.id}
                          onClick={() => void deleteIssue(issue.id)}
                        >
                          {busyIssueId === issue.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
