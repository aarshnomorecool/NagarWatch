import type { AuthorityLevel } from "@/types/database";

export function authorityLevelLabel(level: AuthorityLevel) {
  if (level === "ward") return "Ward Authority";
  if (level === "zone") return "Zone Authority";
  if (level === "city") return "City Authority";
  return "State Authority";
}

export function escalationLevelLabel(level: AuthorityLevel) {
  if (level === "ward") return "L1";
  if (level === "zone") return "L2";
  if (level === "city") return "L3";
  return "L4";
}

export function escalatedFromLevel(targetLevel: AuthorityLevel): AuthorityLevel | null {
  if (targetLevel === "zone") return "ward";
  if (targetLevel === "city") return "zone";
  if (targetLevel === "state") return "city";
  return null;
}

export function levelTitle(level: AuthorityLevel) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
