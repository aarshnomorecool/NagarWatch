"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IssueCard } from "@/components/issues/issue-card";
import { createIssueEvent } from "@/lib/issue-events";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { DbIssue, IssueStatus, UserRole } from "@/types/database";

type IssueListProps = {
  statusFilter?: "latest" | IssueStatus;
};

export function IssueList({ statusFilter = "latest" }: IssueListProps) {
  const router = useRouter();
  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [commentCountByIssue, setCommentCountByIssue] = useState<Record<string, number>>({});
  const [userVoteByIssue, setUserVoteByIssue] = useState<Record<string, "upvote" | null>>({});
  const [voteBusyByIssue, setVoteBusyByIssue] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
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

      let issuesQuery = supabase
        .from("issues")
        .select("id,title,description,category,road_name,landmark,area_name,latitude,longitude,image_url,status,created_by,created_at,upvote_count,downvote_count,is_priority,sla_target_hours,reopened_at,reopened_by,reopen_reason,reopen_proof")
        .order("created_at", { ascending: false })
        .limit(8);

      if (statusFilter !== "latest") {
        issuesQuery = issuesQuery.eq("status", statusFilter);
      }

      const { data, error: fetchError } = await issuesQuery;

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        const loadedIssues = data ?? [];
        setIssues(loadedIssues);

        const issueIds = loadedIssues.map((issue) => issue.id);
        if (issueIds.length === 0) {
          setCommentCountByIssue({});
        } else {
          const { data: commentsData, error: commentError } = await supabase
            .from("comments")
            .select("issue_id")
            .in("issue_id", issueIds);

          if (!commentError) {
            const buckets = (commentsData ?? []).reduce<Record<string, number>>((acc, row) => {
              acc[row.issue_id] = (acc[row.issue_id] ?? 0) + 1;
              return acc;
            }, {});
            setCommentCountByIssue(buckets);
          }
        }

        const { user } = await getAuthUserSafe();
        if (!active || !user || issueIds.length === 0) {
          if (!active) {
            return;
          }

          setCurrentUserId(user?.id ?? null);
          setCurrentUserRole(null);
          setUserVoteByIssue({});
          setLoading(false);
          return;
        }

        const profile = await ensureUserProfile();
        setCurrentUserId(user.id);
        setCurrentUserRole(profile?.role ?? "citizen");

        if ((profile?.role ?? "citizen") === "admin") {
          setUserVoteByIssue({});
          setLoading(false);
          return;
        }

        const { data: myUpvotes } = await supabase.from("upvotes").select("issue_id").eq("user_id", user.id).in("issue_id", issueIds);

        if (!active) {
          return;
        }

        const nextUserVotes: Record<string, "upvote" | null> = {};
        for (const row of myUpvotes ?? []) {
          nextUserVotes[row.issue_id] = "upvote";
        }
        setUserVoteByIssue(nextUserVotes);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [statusFilter]);

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading issues...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm" style={{ color: "var(--primary-strong)" }}>{error}</div>;
  }

  if (issues.length === 0) {
    return <div className="surface-card p-4 text-sm text-muted">No issues found for the selected filter.</div>;
  }

  const handleVote = async (issueId: string) => {
        if (!currentUserRole) {
          setError("Checking account permissions. Please try again.");
          return;
        }

        if (currentUserRole === "admin") {
              setError("Admins cannot vote on complaints.");
          return;
        }

    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }

    if (!currentUserId) {
      router.push(`/login?next=${encodeURIComponent("/")}`);
      return;
    }

    setVoteBusyByIssue((current) => ({ ...current, [issueId]: true }));
    setError(null);

    try {
      const previousVote = userVoteByIssue[issueId] ?? null;

      if (previousVote === "upvote") {
        const { error: removeError } = await supabase.from("upvotes").delete().eq("issue_id", issueId).eq("user_id", currentUserId);
        if (removeError) throw new Error(removeError.message);
        setUserVoteByIssue((current) => ({ ...current, [issueId]: null }));
      } else {
        const { error: insertError } = await supabase.from("upvotes").insert({ issue_id: issueId, user_id: currentUserId });
        if (insertError) throw new Error(insertError.message);

        await createIssueEvent(supabase, {
          issueId,
          eventType: "upvote",
          message: "Citizen upvoted issue from home feed",
          createdBy: "citizen",
        });

        setUserVoteByIssue((current) => ({ ...current, [issueId]: "upvote" }));
      }

      const { count: upvoteCount } = await supabase.from("upvotes").select("id", { count: "exact", head: true }).eq("issue_id", issueId);

      const latestUpvotes = upvoteCount ?? 0;

      setIssues((currentIssues) =>
        currentIssues.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                upvote_count: latestUpvotes,
              }
            : issue
        )
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update vote.");
    } finally {
      setVoteBusyByIssue((current) => ({ ...current, [issueId]: false }));
    }
  };

  return (
    <div className="grid gap-3">
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          commentCount={commentCountByIssue[issue.id] ?? 0}
          userVote={userVoteByIssue[issue.id] ?? null}
          voteBusy={voteBusyByIssue[issue.id] ?? false}
          onVote={handleVote}
          loginRequired={!currentUserId}
          canVote={currentUserRole === "citizen" || currentUserRole === "authority"}
        />
      ))}
    </div>
  );
}