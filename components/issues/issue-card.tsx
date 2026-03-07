"use client";

import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { DbIssue } from "@/types/database";

type IssueCardProps = {
  issue: DbIssue;
  commentCount: number;
  userVote: "upvote" | null;
  voteBusy: boolean;
  onVote: (issueId: string) => void;
  loginRequired: boolean;
  canVote: boolean;
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

export function IssueCard({ issue, commentCount, userVote, voteBusy, onVote, loginRequired, canVote }: IssueCardProps) {
  const statusLabel = issue.status.replace("_", " ");

  return (
    <article className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Complaint Post</p>
          <p className="text-xs text-muted">{issue.category} · {formatDate(issue.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{statusLabel}</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        <h3 className="text-xl font-semibold leading-tight" style={{ color: "var(--text)" }}>{issue.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-muted">{issue.description}</p>
        {issue.area_name || issue.road_name || issue.landmark ? (
          <p className="mt-2 text-xs text-muted">
            {[issue.area_name, issue.road_name, issue.landmark ? `Near ${issue.landmark}` : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="px-4 pt-4">
        {issue.image_url ? (
          <img
            src={issue.image_url}
            alt={`Complaint image for ${issue.title}`}
            className="h-72 w-full rounded-xl border object-cover sm:h-96"
            style={{ borderColor: "var(--border)" }}
          />
        ) : (
          <div
            className="flex h-72 w-full items-center justify-center rounded-xl border text-sm font-medium sm:h-96"
            style={{ borderColor: "var(--border)", color: "var(--muted)", background: "color-mix(in srgb, var(--surface) 70%, transparent)" }}
          >
            Image of the complaint
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-sm text-muted">
          {canVote ? (
            <>
              <button
                type="button"
                onClick={() => onVote(issue.id)}
                disabled={voteBusy}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition"
                style={
                  userVote === "upvote"
                    ? { borderColor: "#16a34a", background: "rgba(22, 163, 74, 0.15)", color: "#16a34a" }
                    : { borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }
                }
                aria-label={userVote === "upvote" ? "Remove upvote" : "Upvote"}
              >
                <UpvoteIcon /> {issue.upvote_count}
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}>
                <UpvoteIcon /> {issue.upvote_count}
              </span>
            </>
          )}
          <Link
            href={`/issue/${issue.id}#issue-comments`}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition"
            style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}
            aria-label="Open comments"
          >
            <CommentIcon /> {commentCount}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!canVote ? <span className="hidden text-xs text-muted sm:inline">Admins cannot vote</span> : null}
          {canVote && loginRequired ? <span className="hidden text-xs text-muted sm:inline">Login to vote</span> : null}
          <Link href={`/issue/${issue.id}`} className="btn-secondary px-3 py-1.5 text-sm">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}