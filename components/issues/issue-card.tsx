import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { DbIssue } from "@/types/database";

type IssueCardProps = {
  issue: DbIssue;
};

export function IssueCard({ issue }: IssueCardProps) {
  return (
    <article className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{issue.title}</h3>
          <p className="mt-1 text-sm text-muted">{issue.description}</p>
        </div>
        <span className="badge">{issue.status}</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">{issue.category} · {formatDate(issue.created_at)}</span>
        <Link href={`/issue/${issue.id}`} className="text-sm font-medium" style={{ color: "var(--primary-strong)" }}>
          View Details
        </Link>
      </div>
    </article>
  );
}