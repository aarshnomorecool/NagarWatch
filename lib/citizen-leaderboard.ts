import { SupabaseClient } from "@supabase/supabase-js";
import type { DbCitizenScore } from "@/types/database";

const POINT_VALUES = {
  reported_issue: 10, // Citizen reports a verified issue
  upvote: 2, // Upvoting useful report
  verification: 3, // Participating in verification
  report_verified: 10, // Issue confirmed as verified by authority
};

/**
 * Award points to a citizen for an action
 */
export async function awardCitizenPoints(
  supabase: SupabaseClient,
  userId: string,
  transactionType: keyof typeof POINT_VALUES,
  referenceId?: string,
  username?: string | null
): Promise<DbCitizenScore | null> {
  const points = POINT_VALUES[transactionType];

  try {
    // Log the transaction
    await supabase.from("citizen_point_transactions").insert({
      user_id: userId,
      points,
      transaction_type: transactionType,
      reference_id: referenceId || null,
    });

    // Get or create citizen score record
    const { data: existingScore } = await supabase
      .from("citizen_scores")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existingScore) {
      // Update existing score
      const newTotal = existingScore.total_points + points;
      const updates: Record<string, any> = {
        total_points: newTotal,
        last_activity_at: new Date().toISOString(),
      };

      if (transactionType === "reported_issue") {
        updates.reports_count = (existingScore.reports_count || 0) + 1;
      } else if (transactionType === "upvote") {
        updates.upvotes_given = (existingScore.upvotes_given || 0) + 1;
      } else if (transactionType === "verification") {
        updates.verifications_given = (existingScore.verifications_given || 0) + 1;
      }

      const { data: updated } = await supabase
        .from("citizen_scores")
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single();

      return updated || null;
    } else {
      // Create new score record
      const newRecord: any = {
        user_id: userId,
        username: username || null,
        total_points: points,
        last_activity_at: new Date().toISOString(),
      };

      if (transactionType === "reported_issue") {
        newRecord.reports_count = 1;
      } else if (transactionType === "upvote") {
        newRecord.upvotes_given = 1;
      } else if (transactionType === "verification") {
        newRecord.verifications_given = 1;
      }

      const { data: created } = await supabase
        .from("citizen_scores")
        .insert(newRecord)
        .select()
        .single();

      return created || null;
    }
  } catch (error) {
    console.error("Error awarding citizen points:", error);
    return null;
  }
}

/**
 * Get citizen leaderboard ranked by points
 */
export async function getCitizenLeaderboard(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<DbCitizenScore[]> {
  try {
    const { data, error } = await supabase
      .from("citizen_scores")
      .select("*")
      .order("total_points", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching citizen leaderboard:", error);
    return [];
  }
}

/**
 * Get citizen rank and position
 */
export async function getCitizenRank(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rank: number | null; score: DbCitizenScore | null } | null> {
  try {
    const { data: allScores, error: fetchError } = await supabase
      .from("citizen_scores")
      .select("user_id, total_points")
      .order("total_points", { ascending: false });

    if (fetchError) throw fetchError;

    const rankIndex = (allScores || []).findIndex((s) => s.user_id === userId);
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;

    const { data: userScore } = await supabase
      .from("citizen_scores")
      .select("*")
      .eq("user_id", userId)
      .single();

    return {
      rank,
      score: userScore || null,
    };
  } catch (error) {
    console.error("Error fetching citizen rank:", error);
    return null;
  }
}

/**
 * Get top contributors by various metrics
 */
export async function getTopContributors(
  supabase: SupabaseClient,
  metric: "total_points" | "verified_reports_count" | "reports_count" | "verifications_given" = "total_points",
  limit: number = 10
): Promise<DbCitizenScore[]> {
  try {
    const { data, error } = await supabase
      .from("citizen_scores")
      .select("*")
      .gt(metric, 0)
      .order(metric, { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching top contributors:", error);
    return [];
  }
}
