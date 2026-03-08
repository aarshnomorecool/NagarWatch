import type { DbIssue } from "@/types/database";

const CATEGORY_SLA_HOURS: Record<string, number> = {
  streetlight: 48,
  pothole: 72,
  garbage: 24,
  water: 24,
  other: 96,
};

export function getIssueSlaHours(issue: Pick<DbIssue, "category" | "sla_target_hours">) {
  return issue.sla_target_hours ?? CATEGORY_SLA_HOURS[issue.category] ?? 72;
}

export function getIssueAgeHours(createdAt: string) {
  const created = new Date(createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60)));
}

export function getSlaRemainingHours(issue: Pick<DbIssue, "created_at" | "category" | "sla_target_hours">) {
  return getIssueSlaHours(issue) - getIssueAgeHours(issue.created_at);
}

export function getSlaState(issue: Pick<DbIssue, "created_at" | "category" | "sla_target_hours">) {
  const remaining = getSlaRemainingHours(issue);
  if (remaining < 0) {
    return { label: `Overdue by ${Math.abs(remaining)}h`, isOverdue: true };
  }

  return { label: `${remaining}h remaining`, isOverdue: false };
}
