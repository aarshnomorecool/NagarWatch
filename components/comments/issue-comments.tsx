"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import { createIssueEvent } from "@/lib/issue-events";
import { ensureUserProfile } from "@/lib/user-profile";
import type { DbComment, DbUser, UserRole } from "@/types/database";

type IssueCommentsProps = {
  issueId: string;
};

type CommentWithUser = DbComment & {
  userEmail: string;
  userRole: UserRole;
};

function roleBadge(role: UserRole) {
  if (role === "admin") {
    return "bg-purple-100 text-purple-700";
  }
  if (role === "authority") {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-slate-100 text-slate-700";
}

function roleLabel(role: UserRole) {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "authority") {
    return "Authority";
  }
  return "Citizen";
}

export function IssueComments({ issueId }: IssueCommentsProps) {
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("citizen");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(() => {
    if (currentUserRole === "authority" || currentUserRole === "admin") {
      return "Respond with an official update...";
    }
    return "Add a comment...";
  }, [currentUserRole]);

  useEffect(() => {
    const initUser = async () => {
      const profile = await ensureUserProfile();
      setCurrentUserId(profile?.id ?? null);
      if (profile?.role) {
        setCurrentUserRole(profile.role);
      }
    };

    void initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setLoading(false);
      setError("Supabase is not configured yet.");
      return;
    }

    const loadComments = async () => {
      setLoading(true);
      setError(null);

      const { data: commentRows, error: commentsError } = await supabase
        .from("comments")
        .select("id,issue_id,user_id,message,created_at")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true });

      if (!active) {
        return;
      }

      if (commentsError) {
        setError(commentsError.message);
        setLoading(false);
        return;
      }

      const uniqueUserIds = Array.from(new Set((commentRows ?? []).map((row) => row.user_id)));
      let userMap = new Map<string, Pick<DbUser, "email" | "role">>();

      if (uniqueUserIds.length > 0) {
        const { data: userRows } = await supabase.from("users").select("id,email,role").in("id", uniqueUserIds);
        userMap = new Map((userRows ?? []).map((user) => [user.id, { email: user.email, role: user.role }]));
      }

      if (!active) {
        return;
      }

      const mapped: CommentWithUser[] = (commentRows ?? []).map((comment) => {
        const user = userMap.get(comment.user_id);
        return {
          ...comment,
          userEmail: user?.email ?? comment.user_id,
          userRole: user?.role ?? "citizen",
        };
      });

      setComments(mapped);
      setLoading(false);
    };

    void loadComments();

    const channel = supabase
      .channel(`issue-comments-${issueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `issue_id=eq.${issueId}`,
        },
        async () => {
          await loadComments();
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [issueId]);

  const postComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!message.trim() || posting) {
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const profile = await ensureUserProfile();
      const userId = profile?.id ?? currentUserId;
      if (!userId) {
        throw new Error("Please log in before posting a comment.");
      }
      const userRoleForEvent = profile?.role ?? "citizen";

      const { error: insertError } = await supabase.from("comments").insert({
        issue_id: issueId,
        user_id: userId,
        message: message.trim(),
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      await createIssueEvent(supabase, {
        issueId,
        eventType: "comment",
        message: "New comment added to discussion",
        createdBy: userRoleForEvent === "authority" || userRoleForEvent === "admin" ? "authority" : "citizen",
      });

      setMessage("");
    } catch (caughtError) {
      const safeMessage = caughtError instanceof Error ? caughtError.message : "Unable to post comment.";
      setError(safeMessage);
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="surface-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Discussion</h2>
      <p className="mt-1 text-xs text-slate-500">Comments update instantly for all viewers.</p>
      {!currentUserId ? <p className="mt-1 text-xs text-amber-700">Login to join this discussion.</p> : null}

      <form onSubmit={postComment} className="mt-4 space-y-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder={placeholder}
          className="input-base"
        />
        <button
          type="submit"
          disabled={posting || !message.trim()}
          className="btn-primary"
        >
          {posting ? "Posting..." : "Post Comment"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-slate-500">Loading comments...</p> : null}

        {!loading && comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet. Start the discussion.</p> : null}

        {comments.map((comment) => (
          <article key={comment.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">{comment.userEmail}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadge(comment.userRole)}`}>{roleLabel(comment.userRole)}</span>
              <span className="text-[11px] text-slate-500">{formatDate(comment.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{comment.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}