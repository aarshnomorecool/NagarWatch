"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import type { DbIssueEvent, IssueEventType } from "@/types/database";

type IssueTimelineProps = {
  issueId: string;
};

const eventIcons: Record<IssueEventType, string> = {
  reported: "📍",
  upvote: "👍",
  downvote: "👎",
  priority: "🚨",
  assigned: "🏛",
  in_progress: "🛠",
  resolved: "✅",
  comment: "💬",
  resolution_proof: "📷",
};

export function IssueTimeline({ issueId }: IssueTimelineProps) {
  const [events, setEvents] = useState<DbIssueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClientOrNull();

    if (!supabase) {
      setError("Timeline is available after Supabase setup.");
      setLoading(false);
      return;
    }

    const loadEvents = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("issue_events")
        .select("id,issue_id,event_type,message,created_by,created_at")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setEvents(data ?? []);
      }

      setLoading(false);
    };

    void loadEvents();

    const channel = supabase
      .channel(`issue-timeline-${issueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issue_events",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          await loadEvents();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [issueId]);

  const content = useMemo(() => {
    if (loading) {
      return <p className="text-sm text-muted">Loading timeline...</p>;
    }

    if (error) {
      return <p className="text-sm" style={{ color: "var(--primary-strong)" }}>{error}</p>;
    }

    if (events.length === 0) {
      return <p className="text-sm text-muted">No timeline events yet.</p>;
    }

    return (
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="relative pl-10">
            <span className="absolute left-0 top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {eventIcons[event.event_type]}
            </span>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <p className="text-sm font-medium">{event.message}</p>
              <p className="mt-1 text-xs text-muted">{formatDate(event.created_at)} · {event.created_by}</p>
            </div>
          </li>
        ))}
      </ul>
    );
  }, [events, loading, error]);

  return (
    <section className="surface-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Issue Timeline</h2>
      <p className="mt-1 text-xs text-muted">Chronological activity log for this issue.</p>
      <div className="mt-4">{content}</div>
    </section>
  );
}