"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getCitizenLeaderboard, getCitizenRank } from "@/lib/citizen-leaderboard";
import { ensureUserProfile } from "@/lib/user-profile";
import type { DbCitizenScore } from "@/types/database";

interface CivicLeaderboardPanelProps {
  limit?: number;
  showMyRank?: boolean;
}

export function CivicLeaderboardPanel({ limit = 10, showMyRank = true }: CivicLeaderboardPanelProps) {
  const [leaderboard, setLeaderboard] = useState<DbCitizenScore[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number | null; score: DbCitizenScore | null } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadLeaderboard = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        setLoading(false);
        return;
      }

      try {
        const profile = await ensureUserProfile();
        if (active && profile?.id) {
          setCurrentUserId(profile.id);

          if (showMyRank) {
            const rank = await getCitizenRank(supabase, profile.id);
            if (active) {
              setMyRank(rank);
            }
          }
        }

        const data = await getCitizenLeaderboard(supabase, limit);
        if (active) {
          setLeaderboard(data);
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load leaderboard");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, [limit, showMyRank]);

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading leaderboard...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <section className="surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top Civic Contributors</h2>
        <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}>⭐ Leaderboard</span>
      </div>

      {showMyRank && myRank && myRank.rank && myRank.score && (
        <div className="mt-3 rounded-lg border-2" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, var(--surface))" }}>
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>
                #{myRank.rank}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  Your Rank
                </p>
                <p className="text-xs text-muted">{myRank.score.username || "Citizen"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold" style={{ color: "var(--text)" }}>{myRank.score.total_points}</p>
              <p className="text-xs text-muted">points</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {leaderboard.map((citizen, index) => (
          <article
            key={citizen.user_id}
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
              citizen.user_id === currentUserId ? "border-accent bg-accent bg-opacity-10" : ""
            }`}
            style={{
              borderColor: citizen.user_id === currentUserId ? "var(--accent)" : "var(--border)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-sm" style={{ background: "color-mix(in srgb, var(--accent) 30%, transparent)" }}>
                #{index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {citizen.username || "Anonymous Citizen"}
                </p>
                <p className="text-xs text-muted">
                  {citizen.reports_count} reports • {citizen.verifications_given} verifications
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold" style={{ color: "var(--text)" }}>
                {citizen.total_points}
              </p>
              <p className="text-xs text-muted">points</p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
        <p className="text-xs text-muted">
          <strong>Reporting verified issue:</strong> +10 points
        </p>
        <p className="text-xs text-muted">
          <strong>Upvoting useful report:</strong> +2 points
        </p>
        <p className="text-xs text-muted">
          <strong>Verification participation:</strong> +3 points
        </p>
      </div>

      {leaderboard.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed p-4 text-sm text-muted" style={{ borderColor: "var(--border)" }}>
          No civic contributors yet. Be the first to report and verify issues!
        </p>
      )}
    </section>
  );
}
