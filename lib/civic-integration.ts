import { SupabaseClient } from "@supabase/supabase-js";
import type { DbIssue } from "@/types/database";
import { awardCitizenPoints } from "@/lib/citizen-leaderboard";
import { detectInfrastructureRisks } from "@/lib/infrastructure-risk";

/**
 * Handle post-resolve operations: risk detection, point awards
 */
export async function handleIssueResolved(
  supabase: SupabaseClient,
  issue: DbIssue,
  resolvedByUserId: string
): Promise<void> {
  try {
    // Award points to authority for resolution (optional - adjust point value as needed)
    // For now, we award points to citizens who contributed, not authorities
  } catch (error) {
    console.error("Error in handleIssueResolved:", error);
  }
}

/**
 * Handle post-report operations: risk detection, initial scoring
 */
export async function handleIssueReported(
  supabase: SupabaseClient,
  issue: DbIssue,
  reporterUserId: string,
  reporterUsername?: string | null
): Promise<void> {
  try {
    // Award points to citizen for reporting
    await awardCitizenPoints(supabase, reporterUserId, "reported_issue", issue.id, reporterUsername);

    // Trigger risk zone detection
    const { data: allIssues } = await supabase.from("issues").select("*");
    if (allIssues && allIssues.length > 0) {
      void detectInfrastructureRisks(supabase, allIssues);
    }
  } catch (error) {
    console.error("Error in handleIssueReported:", error);
  }
}

/**
 * Handle post-upvote operations: point awards
 */
export async function handleIssueUpvoted(
  supabase: SupabaseClient,
  issueId: string,
  userIdWhoUpvoted: string,
  userWhoUpvotedUsername?: string | null
): Promise<void> {
  try {
    // Award points to citizen for upvoting
    await awardCitizenPoints(supabase, userIdWhoUpvoted, "upvote", issueId, userWhoUpvotedUsername);
  } catch (error) {
    console.error("Error in handleIssueUpvoted:", error);
  }
}

/**
 * Handle post-verification operations: point awards, issue reopening
 */
export async function handleVerificationSubmitted(
  supabase: SupabaseClient,
  issueId: string,
  userIdWhoVerified: string,
  verdict: "fully_fixed" | "partially_fixed" | "not_fixed",
  userWhoVerifiedUsername?: string | null
): Promise<void> {
  try {
    // Award points for verification participation
    await awardCitizenPoints(supabase, userIdWhoVerified, "verification", issueId, userWhoVerifiedUsername);

    // Check if we need to trigger reopening (3+ "not_fixed" votes)
    const { data: verifications } = await supabase
      .from("issue_verifications")
      .select("verdict")
      .eq("issue_id", issueId)
      .eq("verdict", "not_fixed");

    const notFixedCount = (verifications || []).length;
    const REOPEN_THRESHOLD = 3;

    if (notFixedCount >= REOPEN_THRESHOLD) {
      // Issue should be auto-reopened by the original verification logic in issue-detail-view
      // This is just for reference - actual reopening happens in the component
    }
  } catch (error) {
    console.error("Error in handleVerificationSubmitted:", error);
  }
}

/**
 * Batch process infrastructure risk detection for all issues
 */
export async function runInfrastructureRiskDetection(supabase: SupabaseClient): Promise<void> {
  try {
    const { data: allIssues } = await supabase
      .from("issues")
      .select("*")
      .in("status", ["pending", "in_progress"]); // Only check unresolved issues

    if (allIssues && allIssues.length > 0) {
      await detectInfrastructureRisks(supabase, allIssues);
    }
  } catch (error) {
    console.error("Error in runInfrastructureRiskDetection:", error);
  }
}
