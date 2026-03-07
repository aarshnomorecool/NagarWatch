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

type ReplyMeta = {
  targetEmail: string;
  targetCommentId: string | null;
  body: string;
};

function parseReplyMeta(message: string): ReplyMeta | null {
  const match = message.match(/^Reply to\s+(.+?)(?:\s+\(ref:([^)]+)\))?:\s*([\s\S]*)$/i);
  if (!match) {
    return null;
  }

  return {
    targetEmail: match[1].trim(),
    targetCommentId: match[2]?.trim() ?? null,
    body: match[3] ?? "",
  };
}

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
  const [replyTarget, setReplyTarget] = useState<CommentWithUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStaffReply = currentUserRole === "admin" || currentUserRole === "authority";

  const placeholder = useMemo(() => {
    if (canStaffReply && replyTarget) {
      return `Reply to ${replyTarget.userEmail}...`;
    }

    if (canStaffReply) {
      return "Respond with an official update...";
    }
    return "Add a comment...";
  }, [canStaffReply, replyTarget]);

  const parsedComments = useMemo(
    () =>
      comments.map((comment) => {
        const replyMeta = parseReplyMeta(comment.message);
        return {
          comment,
          replyMeta,
          body: replyMeta ? replyMeta.body : comment.message,
        };
      }),
    [comments]
  );

  const parsedById = useMemo(() => new Map(parsedComments.map((entry) => [entry.comment.id, entry])), [parsedComments]);

  const repliesByParent = useMemo(() => {
    const map = new Map<string, typeof parsedComments>();

    for (const entry of parsedComments) {
      const parentId = entry.replyMeta?.targetCommentId;
      if (!parentId || !parsedById.has(parentId)) {
        continue;
      }

      const list = map.get(parentId) ?? [];
      list.push(entry);
      map.set(parentId, list);
    }

    return map;
  }, [parsedById, parsedComments]);

  const topLevelComments = useMemo(
    () =>
      parsedComments.filter((entry) => {
        const parentId = entry.replyMeta?.targetCommentId;
        return !parentId || !parsedById.has(parentId);
      }),
    [parsedById, parsedComments]
  );

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

      const finalMessage =
        canStaffReply && replyTarget
          ? `Reply to ${replyTarget.userEmail} (ref:${replyTarget.id}): ${message.trim()}`
          : message.trim();

      const { error: insertError } = await supabase.from("comments").insert({
        issue_id: issueId,
        user_id: userId,
        message: finalMessage,
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
      setReplyTarget(null);
    } catch (caughtError) {
      const safeMessage = caughtError instanceof Error ? caughtError.message : "Unable to post comment.";
      setError(safeMessage);
    } finally {
      setPosting(false);
    }
  };

  const renderCommentCard = (entry: (typeof parsedComments)[number], nested = false) => {
    const { comment, replyMeta, body } = entry;

    return (
      <div key={comment.id} className={`relative ${nested ? "pl-7" : ""}`}>
        {nested ? (
          <span className="absolute left-1 top-4 block h-6 w-5 border-b border-l" style={{ borderColor: "color-mix(in srgb, var(--border) 70%, transparent)" }} aria-hidden="true" />
        ) : null}
        {nested ? (
          <span className="absolute left-[22px] top-[38px] block h-0 w-0 border-y-[5px] border-y-transparent border-l-[7px]" style={{ borderLeftColor: "color-mix(in srgb, var(--primary) 70%, transparent)" }} aria-hidden="true" />
        ) : null}

        <article
          className={`rounded-md border p-3 ${nested ? "border-l-4" : ""}`}
          style={{
            borderColor: nested ? "color-mix(in srgb, var(--primary) 45%, var(--border))" : "var(--border)",
            background: "color-mix(in srgb, var(--bg) 92%, transparent)",
          }}
        >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--text)" }}>
            {comment.userEmail.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{comment.userEmail}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${roleBadge(comment.userRole)}`}>{roleLabel(comment.userRole)}</span>
          <span className="text-[11px] text-muted">{formatDate(comment.created_at)}</span>
        </div>

        {replyMeta ? (
          <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--muted)" }}>
            Replying to {replyMeta.targetEmail}
          </p>
        ) : null}

        <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{body}</p>

        {canStaffReply && comment.userRole === "citizen" ? (
          <div className="mt-2">
            <button
              type="button"
              className="btn-secondary px-2.5 py-1 text-xs"
              onClick={() => {
                setReplyTarget(comment);
                setMessage((current) => (current.trim() ? current : `@${comment.userEmail} `));
              }}
            >
              Reply
            </button>
          </div>
        ) : null}
        </article>
      </div>
    );
  };

  return (
    <section id="issue-comments" className="surface-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Discussion</h2>
      <p className="mt-1 text-xs text-muted">Comments update instantly for all viewers.</p>
      {!currentUserId ? <p className="mt-1 text-xs text-amber-700">Login to join this discussion.</p> : null}

      <form onSubmit={postComment} className="mt-4 space-y-2">
        {canStaffReply && replyTarget ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--text)" }}>
            <span>Replying to {replyTarget.userEmail}</span>
            <button type="button" className="btn-secondary px-2 py-1 text-[11px]" onClick={() => setReplyTarget(null)}>
              Cancel
            </button>
          </div>
        ) : null}
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
          {posting ? "Posting..." : canStaffReply && replyTarget ? "Post Reply" : "Post Comment"}
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {loading ? <p className="text-sm text-muted">Loading comments...</p> : null}

        {!loading && comments.length === 0 ? <p className="text-sm text-muted">No comments yet. Start the discussion.</p> : null}

        {topLevelComments.map((entry) => {
          const childReplies = repliesByParent.get(entry.comment.id) ?? [];

          return (
            <div key={entry.comment.id} className="space-y-2">
              {renderCommentCard(entry)}

              {childReplies.length > 0 ? (
                <div className="ml-8 space-y-2 border-l pl-4" style={{ borderColor: "color-mix(in srgb, var(--border) 70%, transparent)" }}>
                  {childReplies.map((reply) => renderCommentCard(reply, true))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}