import type { AuthorityLevel, DbIssue, UserRole } from "@/types/database";

export const AUTHORITY_LEVELS: AuthorityLevel[] = ["ward", "zone", "city", "state"];

export function authorityLevelRank(level: AuthorityLevel | null | undefined) {
  if (!level) return 0;
  return AUTHORITY_LEVELS.indexOf(level) + 1;
}

export function nextAuthorityLevel(level: AuthorityLevel): AuthorityLevel | null {
  const rank = authorityLevelRank(level);
  if (rank <= 0 || rank >= AUTHORITY_LEVELS.length) {
    return null;
  }

  return AUTHORITY_LEVELS[rank] ?? null;
}

export function canManageIssueByAuthority(
  role: UserRole | null | undefined,
  actorLevel: AuthorityLevel | null | undefined,
  issue: Pick<DbIssue, "assigned_authority_level">
) {
  if (role === "admin") {
    return true;
  }

  if (role !== "authority") {
    return false;
  }

  const actorRank = authorityLevelRank(actorLevel);
  const issueRank = authorityLevelRank(issue.assigned_authority_level);
  return actorRank >= issueRank;
}
