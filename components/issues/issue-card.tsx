import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { DbIssue } from "@/types/database";

type IssueCardProps = {
  issue: DbIssue;
};

export function IssueCard({ issue }: IssueCardProps) {
  const statusLabel = issue.status.replace("_", " ");

  return (
    <article className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Complaint Post</p>
          <p className="text-xs text-muted">{issue.category} · {formatDate(issue.created_at)}</p>
        </div>
        <span className="badge">{statusLabel}</span>
      </div>

      <div className="px-4 pt-4">
        <h3 className="text-xl font-semibold leading-tight" style={{ color: "var(--text)" }}>{issue.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-muted">{issue.description}</p>
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
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>{issue.upvote_count} affected</span>
          <span>#{issue.id.slice(0, 8)}</span>
        </div>
        <Link href={`/issue/${issue.id}`} className="btn-secondary px-3 py-1.5 text-sm">
          View Full Post
        </Link>
      </div>
    </article>
  );
}