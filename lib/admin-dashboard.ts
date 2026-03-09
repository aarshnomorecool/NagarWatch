import type { DbDepartment, DbEscalation, DbIssue } from "@/types/database";
import { nextAuthorityLevel } from "@/lib/authority";

export type CategoryChartDatum = {
  category: string;
  count: number;
};

export type DepartmentChartDatum = {
  name: string;
  resolution_rate: number;
  isFlagged: boolean;
};

export type EscalationChartDatum = {
  escalation_level: string;
  count: number;
};

export function pendingDurationHours(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60)));
}

export function pendingDurationDays(createdAt: string) {
  return Math.floor(pendingDurationHours(createdAt) / 24);
}

export function escalationRuleForIssue(issue: DbIssue) {
  if (issue.status === "resolved") {
    return null;
  }

  const hours = pendingDurationHours(issue.created_at);
  const currentLevel = issue.assigned_authority_level;
  const nextLevel = nextAuthorityLevel(currentLevel);
  if (!nextLevel) {
    return null;
  }

  const thresholdHoursByLevel = {
    ward: 24,
    zone: 48,
    city: 72,
    state: Number.MAX_SAFE_INTEGER,
  } as const;

  const threshold = thresholdHoursByLevel[currentLevel];
  if (hours < threshold) {
    return null;
  }

  return {
    escalation_level: issue.escalation_level + 1,
    escalated_to: `${nextLevel} authority`,
    escalated_to_level: nextLevel,
  } as const;
}

export function sortIssues(issues: DbIssue[], sortMode: "upvotes" | "pending_duration") {
  return [...issues].sort((a, b) => {
    if (sortMode === "upvotes") {
      return b.upvote_count - a.upvote_count;
    }

    return pendingDurationHours(b.created_at) - pendingDurationHours(a.created_at);
  });
}

export function categoryChartData(issues: DbIssue[]): CategoryChartDatum[] {
  const buckets = issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.category] = (acc[issue.category] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(buckets)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function escalationChartData(escalations: DbEscalation[]): EscalationChartDatum[] {
  const buckets = escalations.reduce<Record<number, number>>((acc, escalation) => {
    acc[escalation.escalation_level] = (acc[escalation.escalation_level] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(buckets)
    .map(([level, count]) => ({ escalation_level: `L${level}`, count }))
    .sort((a, b) => a.escalation_level.localeCompare(b.escalation_level));
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

export function computeDepartmentResolutionRates(issues: DbIssue[], departments: DbDepartment[]): DepartmentChartDatum[] {
  const issueBuckets = issues.reduce<Record<string, { total: number; resolved: number }>>((acc, issue) => {
    const key = normalizeKey(issue.category);
    const current = acc[key] ?? { total: 0, resolved: 0 };
    current.total += 1;
    if (issue.status === "resolved") {
      current.resolved += 1;
    }
    acc[key] = current;
    return acc;
  }, {});

  return departments.map((department) => {
    const bucket = issueBuckets[normalizeKey(department.name)] ?? { total: 0, resolved: 0 };
    const resolutionRate = bucket.total === 0 ? 0 : Number(((bucket.resolved / bucket.total) * 100).toFixed(1));

    return {
      name: department.name,
      resolution_rate: resolutionRate,
      isFlagged: resolutionRate < 50,
    };
  });
}
