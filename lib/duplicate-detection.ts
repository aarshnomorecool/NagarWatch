import type { DbIssue } from "@/types/database";

export type DuplicateCandidate = {
  issue: DbIssue;
  distanceMeters: number;
  textSimilarity: number;
  score: number;
};

export type DuplicateDetectionInput = {
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMetersBetweenPoints(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(fromLat) * Math.cos(toLat);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function jaccardSimilarity(leftText: string, rightText: string) {
  const leftWords = new Set(normalizeWords(leftText));
  const rightWords = new Set(normalizeWords(rightText));

  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftWords.forEach((word) => {
    if (rightWords.has(word)) {
      intersection += 1;
    }
  });

  const unionSize = new Set([...leftWords, ...rightWords]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

function similarityScore(params: {
  distanceMeters: number;
  textSimilarity: number;
  sameCategory: boolean;
  maxDistanceMeters: number;
}) {
  const distanceScore = Math.max(0, 1 - params.distanceMeters / params.maxDistanceMeters);
  const categoryBonus = params.sameCategory ? 0.15 : 0;

  return params.textSimilarity * 0.6 + distanceScore * 0.4 + categoryBonus;
}

export function findPotentialDuplicates(
  input: DuplicateDetectionInput,
  existingIssues: DbIssue[],
  options?: {
    maxDistanceMeters?: number;
    minTextSimilarity?: number;
    minScore?: number;
    maxResults?: number;
  }
) {
  const maxDistanceMeters = options?.maxDistanceMeters ?? 250;
  const minTextSimilarity = options?.minTextSimilarity ?? 0.2;
  const minScore = options?.minScore ?? 0.45;
  const maxResults = options?.maxResults ?? 5;

  const normalizedInputText = `${input.title} ${input.description}`;

  const candidates: DuplicateCandidate[] = existingIssues
    .filter((issue) => issue.status !== "resolved")
    .map((issue) => {
      const distanceMeters = distanceMetersBetweenPoints(
        { latitude: input.latitude, longitude: input.longitude },
        { latitude: issue.latitude, longitude: issue.longitude }
      );

      const textSimilarity = jaccardSimilarity(normalizedInputText, `${issue.title} ${issue.description}`);
      const sameCategory = issue.category.toLowerCase() === input.category.toLowerCase();
      const score = similarityScore({
        distanceMeters,
        textSimilarity,
        sameCategory,
        maxDistanceMeters,
      });

      return {
        issue,
        distanceMeters,
        textSimilarity,
        score,
      };
    })
    .filter((candidate) => candidate.distanceMeters <= maxDistanceMeters)
    .filter((candidate) => candidate.textSimilarity >= minTextSimilarity || candidate.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);

  return candidates;
}
