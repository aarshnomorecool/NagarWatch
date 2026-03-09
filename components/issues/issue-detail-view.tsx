"use client";

import { useEffect, useMemo, useState } from "react";
import { getMapboxToken } from "@/lib/mapbox";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { IssueComments } from "@/components/comments/issue-comments";
import { createIssueEvent } from "@/lib/issue-events";
import { notifyIssueFollowers } from "@/lib/notifications";
import { getSlaState } from "@/lib/sla";
import { ensureUserProfile } from "@/lib/user-profile";
import { authorityLevelLabel, escalationLevelLabel } from "@/lib/authority-display";
import type { DbIssue, DbResolution, UserRole } from "@/types/database";

type IssueDetailViewProps = {
  issueId: string;
};

function getStatusBadge(status: DbIssue["status"]) {
  if (status === "resolved") {
    return {
      color: "#14532d",
      background: "rgba(34, 197, 94, 0.18)",
      border: "1px solid rgba(34, 197, 94, 0.45)",
      boxShadow: "0 0 18px rgba(34, 197, 94, 0.35)",
    };
  }

  if (status === "in_progress") {
    return {
      color: "#713f12",
      background: "rgba(250, 204, 21, 0.22)",
      border: "1px solid rgba(250, 204, 21, 0.5)",
      boxShadow: "0 0 18px rgba(250, 204, 21, 0.35)",
    };
  }

  return {
    color: "#7f1d1d",
    background: "rgba(248, 113, 113, 0.2)",
    border: "1px solid rgba(248, 113, 113, 0.5)",
    boxShadow: "0 0 18px rgba(248, 113, 113, 0.35)",
  };
}

function getStatusLabel(status: DbIssue["status"]) {
  if (status === "resolved") {
    return "Resolved";
  }

  if (status === "in_progress") {
    return "Under Process";
  }

  return "Pending";
}

export function IssueDetailView({ issueId }: IssueDetailViewProps) {
  const REOPEN_WINDOW_HOURS = 72;
  const REOPEN_PROOF_BUCKET = "resolution-proofs";

  const [issue, setIssue] = useState<DbIssue | null>(null);
  const [upvoteCount, setUpvoteCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);
  const [resolution, setResolution] = useState<DbResolution | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenFile, setReopenFile] = useState<File | null>(null);
  const [stageTimes, setStageTimes] = useState<{
    reported: string | null;
    inProgress: string | null;
    fixed: string | null;
    escalated: string | null;
  }>({ reported: null, inProgress: null, fixed: null, escalated: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);

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
      setCurrentUserRole(profile?.role ?? null);
    };

    void resolveUserId();
  }, []);

  useEffect(() => {
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
        .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,assigned_authority_level,escalation_level,last_escalated_at,reopened_at,reopened_by,reopen_reason,reopen_proof")
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

      const [{ count: totalCount }, { count: totalComments }, { data: escalationRows }, { data: stageEvents }, { data: resolutionRow }, { count: myUpvoteCount }, { count: myFollowCount }] = await Promise.all([
        supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("issue_id", issueId),
        supabase.from("escalations").select("created_at").eq("issue_id", issueId).order("created_at", { ascending: true }),
        supabase
          .from("issue_events")
          .select("event_type,created_at")
          .eq("issue_id", issueId)
          .in("event_type", ["reported", "in_progress", "resolved"])
          .order("created_at", { ascending: true }),
        supabase
          .from("resolutions")
          .select("id,issue_id,resolved_by,proof_image,resolution_note,resolved_at")
          .eq("issue_id", issueId)
          .order("resolved_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        currentUserId
          ? supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("user_id", currentUserId)
          : Promise.resolve({ count: 0, error: null }),
        currentUserId
          ? supabase.from("issue_follows").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("user_id", currentUserId)
          : Promise.resolve({ count: 0, error: null }),
      ]);

      if (!active) {
        return;
      }

      const safeCount = totalCount ?? issueData.upvote_count ?? 0;
      setUpvoteCount(safeCount);
      setCommentCount(totalComments ?? 0);
      const reportedAt = stageEvents?.find((event) => event.event_type === "reported")?.created_at ?? issueData.created_at;
      const inProgressAt = stageEvents?.find((event) => event.event_type === "in_progress")?.created_at ?? null;
      const fixedAt = stageEvents?.find((event) => event.event_type === "resolved")?.created_at ?? null;
      const escalatedAt = escalationRows?.[0]?.created_at ?? null;

      setStageTimes({
        reported: reportedAt,
        inProgress: inProgressAt,
        fixed: fixedAt,
        escalated: escalatedAt,
      });
      setIsEscalated(Boolean(escalatedAt));
      setResolution(resolutionRow ?? null);
      setHasUpvoted((myUpvoteCount ?? 0) > 0);
      setIsFollowing((myFollowCount ?? 0) > 0);
      setLoading(false);
    };

    void loadIssueAndVotes();

    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`issue-votes-${issueId}`)
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
            currentUserId
              ? supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId).eq("user_id", currentUserId)
              : Promise.resolve({ count: 0, error: null }),
          ]);

          if (!active) {
            return;
          }

          setUpvoteCount(totalCount ?? 0);
          setHasUpvoted((myUpvoteCount ?? 0) > 0);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          const { count: totalComments } = await supabase.from("comments").select("id", { count: "exact", head: true }).eq("issue_id", issueId);
          if (!active) {
            return;
          }
          setCommentCount(totalComments ?? 0);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
          filter: `id=eq.${issueId}`,
        },
        async () => {
          const { data: latestIssue } = await supabase
            .from("issues")
            .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,assigned_authority_level,escalation_level,last_escalated_at,reopened_at,reopened_by,reopen_reason,reopen_proof")
            .eq("id", issueId)
            .maybeSingle();

          if (!active || !latestIssue) {
            return;
          }

          setIssue(latestIssue);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "resolutions",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          const { data: latestResolution } = await supabase
            .from("resolutions")
            .select("id,issue_id,resolved_by,proof_image,resolution_note,resolved_at")
            .eq("issue_id", issueId)
            .order("resolved_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!active) {
            return;
          }

          setResolution(latestResolution ?? null);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issue_follows",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          if (!currentUserId) {
            return;
          }

          const { count: myFollowCount } = await supabase
            .from("issue_follows")
            .select("id", { count: "exact", head: true })
            .eq("issue_id", issueId)
            .eq("user_id", currentUserId);

          if (!active) {
            return;
          }

          setIsFollowing((myFollowCount ?? 0) > 0);
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, issueId]);

  const toggleFollow = async () => {
    if (!currentUserId || followBusy) {
      return;
    }

    setFollowBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      if (isFollowing) {
        const { error: unfollowError } = await supabase
          .from("issue_follows")
          .delete()
          .eq("issue_id", issueId)
          .eq("user_id", currentUserId);

        if (unfollowError) {
          throw new Error(unfollowError.message);
        }

        setIsFollowing(false);
      } else {
        const { error: followError } = await supabase.from("issue_follows").insert({
          issue_id: issueId,
          user_id: currentUserId,
        });

        if (followError) {
          throw new Error(followError.message);
        }

        setIsFollowing(true);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update follow status.");
    } finally {
      setFollowBusy(false);
    }
  };

  const reopenIssue = async () => {
    if (!currentUserId || !issue || issue.status !== "resolved" || reopenBusy) {
      return;
    }

    const note = reopenReason.trim();
    if (!note) {
      setError("Please describe why this issue should be reopened.");
      return;
    }

    const resolvedAtMs = resolution?.resolved_at ? new Date(resolution.resolved_at).getTime() : NaN;
    const ageHours = Number.isNaN(resolvedAtMs) ? 0 : (Date.now() - resolvedAtMs) / (1000 * 60 * 60);
    if (!Number.isNaN(resolvedAtMs) && ageHours > REOPEN_WINDOW_HOURS) {
      setError("Reopen window has expired for this issue.");
      return;
    }

    setReopenBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      let reopenProof: string | null = null;
      if (reopenFile) {
        const extension = reopenFile.name.split(".").pop() || "jpg";
        const path = `reopen/${issue.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(REOPEN_PROOF_BUCKET).upload(path, reopenFile, {
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) {
          throw new Error(uploadError.message);
        }

        reopenProof = supabase.storage.from(REOPEN_PROOF_BUCKET).getPublicUrl(path).data.publicUrl;
      }

      const { error: updateError } = await supabase
        .from("issues")
        .update({
          status: "pending",
          reopened_at: new Date().toISOString(),
          reopened_by: currentUserId,
          reopen_reason: note,
          reopen_proof: reopenProof,
        })
        .eq("id", issue.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await createIssueEvent(supabase, {
        issueId: issue.id,
        eventType: "reopened",
        message: "Citizen reopened resolved issue",
        createdBy: "citizen",
      });

      await notifyIssueFollowers(supabase, {
        issueId: issue.id,
        actorUserId: currentUserId,
        notificationType: "issue_reopened",
        title: "Issue reopened",
        body: `${issue.title} was reopened by a citizen with additional context.`,
      });

      setIssue((prev) =>
        prev
          ? {
              ...prev,
              status: "pending",
              reopened_at: new Date().toISOString(),
              reopened_by: currentUserId,
              reopen_reason: note,
              reopen_proof: reopenProof,
            }
          : prev,
      );
      setReopenReason("");
      setReopenFile(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not reopen issue.");
    } finally {
      setReopenBusy(false);
    }
  };

  const handleVote = async () => {
    if (!currentUserId || !issue || voteBusy) {
      return;
    }

    if (!currentUserRole) {
      setError("Checking account permissions. Please try again.");
      return;
    }

    if (currentUserRole === "admin") {
      setError("Admins cannot vote on complaints.");
      return;
    }

    setVoteBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      if (hasUpvoted) {
        const { error: removeError } = await supabase.from("upvotes").delete().eq("issue_id", issueId).eq("user_id", currentUserId);
        if (removeError) {
          throw new Error(removeError.message);
        }
        setHasUpvoted(false);
      } else {
        const { error: insertError } = await supabase.from("upvotes").insert({ issue_id: issueId, user_id: currentUserId });
        if (insertError) {
          throw new Error(insertError.message);
        }

        await createIssueEvent(supabase, {
          issueId,
          eventType: "upvote",
          message: "Citizen upvoted issue",
          createdBy: "citizen",
        });

        setHasUpvoted(true);
      }

      const { count: updatedUpvotes } = await supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId);

      const finalUpvotes = updatedUpvotes ?? 0;

      setUpvoteCount(finalUpvotes);
      setIssue((previous) => (previous ? { ...previous, upvote_count: finalUpvotes } : previous));

      const { error: syncError } = await supabase
        .from("issues")
        .update({ upvote_count: finalUpvotes })
        .eq("id", issueId);

      if (syncError) {
        console.warn("Vote counter sync warning", syncError.message);
      }

    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not update vote.";
      setError(message);
    } finally {
      setVoteBusy(false);
    }
  };

  function UpvoteIcon() {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 14 6-6 6 6" />
        <path d="M12 19V9" />
      </svg>
    );
  }

  function CommentIcon() {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4c-4.97 0-9 3.58-9 8 0 2.2 1 4.2 2.7 5.6L5 21l3.8-1.5c1 .3 2.1.5 3.2.5 4.97 0 9-3.58 9-8s-4.03-8-9-8Z" />
      </svg>
    );
  }

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

  const currentStage: "reported" | "in_progress" | "fixed" | "escalated" =
    issue.status === "resolved"
      ? "fixed"
      : issue.status === "in_progress"
      ? "in_progress"
      : isEscalated
      ? "escalated"
      : "reported";

  const currentStageInfo =
    currentStage === "reported"
      ? { label: "Citizen reported issue", timestamp: stageTimes.reported ?? issue.created_at }
      : currentStage === "in_progress"
      ? { label: "Problem under process", timestamp: stageTimes.inProgress }
      : currentStage === "fixed"
      ? { label: "Problem fixed", timestamp: stageTimes.fixed }
      : { label: "Escalated", timestamp: stageTimes.escalated };
  const slaState = getSlaState(issue);
  const canReopen = issue.status === "resolved" && currentUserRole === "citizen";

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="surface-card p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Issue {issue.id}</p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{issue.title}</h1>
            <p className="mt-2 text-sm text-muted">{issue.description}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center sm:min-w-44">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Affected Citizens</p>
            <p className="mt-1 text-3xl font-bold leading-none text-blue-700">{upvoteCount}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={getStatusBadge(issue.status)}>{getStatusLabel(issue.status)}</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={
              slaState.isOverdue
                ? { color: "#7f1d1d", background: "rgba(248, 113, 113, 0.2)", border: "1px solid rgba(248, 113, 113, 0.5)" }
                : { color: "#14532d", background: "rgba(34, 197, 94, 0.18)", border: "1px solid rgba(34, 197, 94, 0.4)" }
            }
          >
            SLA: {slaState.label}
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--text)" }}>{issue.category}</span>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--text)" }}>
            Handling Authority: {authorityLevelLabel(issue.assigned_authority_level)}
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--text)" }}>
            Escalation Level: {escalationLevelLabel(issue.assigned_authority_level)}
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--text)" }}>Created {formatDate(issue.created_at)}</span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {currentUserRole !== "citizen" && currentUserRole !== "authority" ? (
              <span className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
                <UpvoteIcon /> {upvoteCount}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleVote()}
                  disabled={!currentUserId || voteBusy}
                  className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                  style={hasUpvoted ? { borderColor: "#16a34a", background: "rgba(22,163,74,0.15)", color: "#16a34a" } : undefined}
                >
                  <UpvoteIcon /> {upvoteCount}
                </button>
              </>
            )}

            <a href="#issue-comments" className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <CommentIcon /> {commentCount}
            </a>

            <button
              type="button"
              onClick={() => void toggleFollow()}
              disabled={!currentUserId || followBusy}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
            >
              {followBusy ? "Saving..." : isFollowing ? "Following" : "Follow"}
            </button>
          </div>

          {!currentUserId ? <p className="mt-1 text-xs text-amber-700">Login to upvote and validate this issue.</p> : null}
          {currentUserRole === "admin" ? <p className="mt-1 text-xs text-muted">Admin accounts have read-only access to vote counters.</p> : null}
          <p className="mt-2 text-xs text-slate-500">Upvotes are a public validation signal for issue visibility.</p>
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
        <p className="mt-1 text-xs text-slate-600">
          {[issue.area_name, issue.road_name, issue.landmark ? `Near ${issue.landmark}` : null].filter(Boolean).join(" · ") || "Area details not provided"}
        </p>
      </div>

      <div className="surface-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Issue Progress</h2>
        <div className="mt-3 relative pl-6">
          <span className="absolute left-0 top-0 text-xs" style={{ color: "var(--primary)" }} aria-hidden="true">-&gt;</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
              {currentStageInfo.label} (current)
            </p>
            <p className="text-xs text-muted">{currentStageInfo.timestamp ? formatDate(currentStageInfo.timestamp) : "Timestamp unavailable"}</p>
          </div>
        </div>
      </div>

      {issue.status === "resolved" ? (
        <div className="surface-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Resolution Proof</h2>
          {resolution?.proof_image ? (
            <img
              src={resolution.proof_image}
              alt="Resolution proof uploaded by authority"
              className="mt-3 h-64 w-full rounded-md border object-cover sm:h-80"
              style={{ borderColor: "var(--border)" }}
            />
          ) : (
            <div className="mt-3 rounded-md border p-3 text-sm text-muted" style={{ borderColor: "var(--border)" }}>
              Resolution image has not been uploaded yet.
            </div>
          )}

          {resolution?.resolution_note ? (
            <p className="mt-3 text-sm text-muted">{resolution.resolution_note}</p>
          ) : null}

          <p className="mt-2 text-xs text-muted">
            {resolution?.resolved_at ? `Resolved on ${formatDate(resolution.resolved_at)}` : "Marked resolved recently."}
          </p>

          {canReopen ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted">Citizens can reopen resolved issues within 72 hours if the problem persists.</p>
              <textarea
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="Why does this issue need to be reopened?"
                className="input-base"
                rows={3}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setReopenFile(event.target.files?.[0] ?? null)}
                className="input-base"
              />
              <button
                type="button"
                onClick={() => void reopenIssue()}
                disabled={reopenBusy || !reopenReason.trim()}
                className="btn-warning px-3 py-2 text-sm"
              >
                {reopenBusy ? "Reopening..." : "Reopen Issue"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <IssueComments issueId={issueId} />
    </section>
  );
}
