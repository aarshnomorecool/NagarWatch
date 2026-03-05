"use client";

import { useEffect, useState } from "react";
import { IssueCard } from "@/components/issues/issue-card";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import type { DbIssue } from "@/types/database";

export function IssueList() {
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
        setError("Supabase is not configured yet.");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("issues")
        .select("id,title,description,category,latitude,longitude,image_url,status,created_by,created_at,upvote_count")
        .order("created_at", { ascending: false })
        .limit(8);

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

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading issues...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm" style={{ color: "var(--primary-strong)" }}>{error}</div>;
  }

  if (issues.length === 0) {
    return <div className="surface-card p-4 text-sm text-muted">No real complaints reported yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}