"use client";

import { useEffect, useMemo, useState } from "react";
import { getMapboxToken } from "@/lib/mapbox";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { IssueComments } from "@/components/comments/issue-comments";
import { IssueTimeline } from "@/components/issues/IssueTimeline";
import { createIssueEvent } from "@/lib/issue-events";
import { ensureUserProfile } from "@/lib/user-profile";
import type { DbIssue } from "@/types/database";

type IssueDetailViewProps = {
  issueId: string;
};

function getStatusBadge(status: DbIssue["status"]) {
  if (status === "resolved") {
    return "bg-green-100 text-green-700";
  }

  if (status === "in_progress") {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-red-100 text-red-700";
}

function getStatusLabel(status: DbIssue["status"]) {
  if (status === "resolved") {
    return "Resolved";
  }

  if (status === "in_progress") {
    return "In Progress";
  }

  return "Pending";
}

export function IssueDetailView({ issueId }: IssueDetailViewProps) {
  const [issue, setIssue] = useState<DbIssue | null>(null);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upvoteBusy, setUpvoteBusy] = useState(false);

  const mapboxToken = useMemo(() => getMapboxToken(), []);

  const miniMapUrl = useMemo(() => {
    if (!issue || !mapboxToken) {
      return null;
    }

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+2563eb(${issue.longitude},${issue.latitude})/${issue.longitude},${issue.latitude},15,0/700x340?access_token=${mapboxToken}`;
  }, [issue, mapboxToken]);

  useEffect(() => {
    const resolveUserId = async () => {
      const profile = await ensureUserProfile();
      setCurrentUserId(profile?.id ?? null);
    };

    void resolveUserId();
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;

    const loadIssueAndVotes = async () => {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        setLoading(false);
        return;
      }

      const { data: issueData, error: issueError } = await supabase
        .from("issues")
        .select("id,title,description,category,latitude,longitude,image_url,status,created_by,created_at,upvote_count")
        .eq("id", issueId)
        .single();

      if (!active) {
        return;
      }

      if (issueError || !issueData) {
        setError(issueError?.message ?? "Issue not found.");
        setLoading(false);
        return;
      }

      setIssue(issueData);

      const [{ count: totalCount }, { count: myUpvoteCount }] = await Promise.all([
        supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId),
        supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("user_id", currentUserId),
      ]);

      if (!active) {
        return;
      }

      const safeCount = totalCount ?? issueData.upvote_count ?? 0;
      setUpvoteCount(safeCount);
      setHasUpvoted((myUpvoteCount ?? 0) > 0);
      setLoading(false);
    };

    void loadIssueAndVotes();

    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`issue-upvotes-${issueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "upvotes",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          const [{ count: totalCount }, { count: myUpvoteCount }] = await Promise.all([
            supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId),
            supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("user_id", currentUserId),
          ]);

          if (!active) {
            return;
          }

          setUpvoteCount(totalCount ?? 0);
          setHasUpvoted((myUpvoteCount ?? 0) > 0);
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, issueId]);

  const handleUpvote = async () => {
    if (!currentUserId || !issue || hasUpvoted || upvoteBusy) {
      return;
    }

    setUpvoteBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const { count: existingCount, error: existingError } = await supabase
        .from("upvotes")
        .select("id", { count: "exact", head: true })
        .eq("issue_id", issueId)
        .eq("user_id", currentUserId);

      if (existingError) {
        throw new Error(existingError.message);
      }

      if ((existingCount ?? 0) > 0) {
        setHasUpvoted(true);
        return;
      }

      const { error: insertError } = await supabase.from("upvotes").insert({
        issue_id: issueId,
        user_id: currentUserId,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      await createIssueEvent(supabase, {
        issueId,
        eventType: "upvote",
        message: "Citizen confirmed issue",
        createdBy: "citizen",
      });

      const { count: updatedCount, error: countError } = await supabase
        .from("upvotes")
        .select("id", { count: "exact", head: true })
        .eq("issue_id", issueId);

      if (countError) {
        throw new Error(countError.message);
      }

      const finalCount = updatedCount ?? upvoteCount + 1;
      setUpvoteCount(finalCount);
      setHasUpvoted(true);

      const { error: syncError } = await supabase.from("issues").update({ upvote_count: finalCount }).eq("id", issueId);
      if (syncError) {
        console.warn("Upvote count sync warning", syncError.message);
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not complete upvote.";
      setError(message);
    } finally {
      setUpvoteBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="surface-card mx-auto w-full max-w-3xl p-5 text-sm text-slate-600">
        Loading issue details...
      </section>
    );
  }

  if (error && !issue) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </section>
    );
  }

  if (!issue) {
    return (
      <section className="surface-card mx-auto w-full max-w-3xl p-5 text-sm text-slate-600">
        Issue not found.
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="surface-card p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Issue {issue.id}</p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{issue.title}</h1>
            <p className="mt-2 text-sm text-slate-600">{issue.description}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center sm:min-w-44">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Affected Citizens</p>
            <p className="mt-1 text-3xl font-bold leading-none text-blue-700">{upvoteCount}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadge(issue.status)}`}>{getStatusLabel(issue.status)}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{issue.category}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Created {formatDate(issue.created_at)}</span>
        </div>

        <div className="mt-4">
          <button type="button" onClick={handleUpvote} disabled={!currentUserId || hasUpvoted || upvoteBusy} className="btn-primary w-full py-2.5 sm:w-auto">
            {hasUpvoted ? "Upvoted" : upvoteBusy ? "Submitting..." : "Upvote (I am affected)"}
          </button>
          {!currentUserId ? <p className="mt-1 text-xs text-amber-700">Login to upvote and validate this issue.</p> : null}
          <p className="mt-2 text-xs text-slate-500">Upvotes are the primary validation signal for issue prioritization.</p>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {issue.image_url ? (
          <img src={issue.image_url} alt={issue.title} className="h-64 w-full object-cover sm:h-80" />
        ) : (
          <div className="flex h-64 w-full items-center justify-center bg-slate-100 text-sm text-slate-500 sm:h-80">No image uploaded</div>
        )}
      </div>

      <div className="surface-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Location</h2>
        {miniMapUrl ? (
          <img src={miniMapUrl} alt="Issue location map" className="mt-3 h-52 w-full rounded-md border border-slate-200 object-cover" />
        ) : (
          <div className="mt-3 flex h-52 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
            Map preview unavailable.
          </div>
        )}
        <p className="mt-2 text-xs text-slate-600">
          Latitude: {issue.latitude.toFixed(6)} · Longitude: {issue.longitude.toFixed(6)}
        </p>
      </div>

      <IssueTimeline issueId={issueId} />

      <IssueComments issueId={issueId} />
    </section>
  );
}
