"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import type { DbIssue } from "@/types/database";

export function IssuesTable() {
  const [issues, setIssues] = useState<DbIssue[]>([]);
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

      const { data, error: fetchError } = await supabase
        .from("issues")
        .select("id,title,description,category,latitude,longitude,image_url,status,created_by,created_at,upvote_count")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setIssues(data ?? []);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const sortedIssues = useMemo(() => [...issues].sort((a, b) => b.upvote_count - a.upvote_count), [issues]);

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading issues...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm" style={{ color: "var(--primary-strong)" }}>{error}</div>;
  }

  if (sortedIssues.length === 0) {
    return <div className="surface-card p-4 text-sm text-muted">No real complaints found.</div>;
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y" style={{ borderColor: "var(--border)" }}>
          <thead style={{ background: "rgba(250,204,21,0.15)" }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Issue</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Upvotes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {sortedIssues.map((issue) => (
              <tr key={issue.id}>
                <td className="px-4 py-3 text-sm">
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-xs text-muted">{issue.id}</p>
                </td>
                <td className="px-4 py-3 text-sm">{issue.category}</td>
                <td className="px-4 py-3 text-sm">{issue.status}</td>
                <td className="px-4 py-3 text-sm">{issue.upvote_count}</td>
                <td className="px-4 py-3 text-sm">{formatDate(issue.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
