// Fix resolved issues status
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjdacyeidhhxlokuaowb.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixResolvedIssues() {
  console.log("Finding issues with resolutions but status != 'resolved'...\n");

  try {
    // Get all resolutions
    const { data: resolutions, error: resError } = await supabase
      .from("resolutions")
      .select("issue_id");

    if (resError) throw resError;

    const resolutionIssueIds = resolutions?.map(r => r.issue_id) ?? [];
    console.log(`Found ${resolutionIssueIds.length} resolutions`);

    if (resolutionIssueIds.length === 0) {
      console.log("No resolutions found.");
      return;
    }

    // Get issues that have resolutions but wrong status
    const { data: problemIssues, error: issueError } = await supabase
      .from("issues")
      .select("id,title,status")
      .in("id", resolutionIssueIds)
      .neq("status", "resolved");

    if (issueError) throw issueError;

    console.log(`\nFound ${problemIssues?.length ?? 0} issues with resolutions but status != 'resolved':`);
    problemIssues?.forEach((issue) => {
      console.log(`  - ${issue.id}: "${issue.title}" (current status: ${issue.status})`);
    });

    if (!problemIssues || problemIssues.length === 0) {
      console.log("\nAll issues with resolutions already have status='resolved'. Good!");
      return;
    }

    // Update these issues to resolved
    const problemIssueIds = problemIssues.map(i => i.id);
    console.log(`\nUpdating ${problemIssueIds.length} issues to status='resolved'...`);

    const { error: updateError } = await supabase
      .from("issues")
      .update({ status: "resolved" })
      .in("id", problemIssueIds);

    if (updateError) throw updateError;

    console.log("✓ Successfully updated all issues!");
    console.log("\nVerifying the fix...");

    const { data: verifyIssues } = await supabase
      .from("issues")
      .select("id,title,status")
      .in("id", problemIssueIds);

    verifyIssues?.forEach((issue) => {
      console.log(`  ✓ ${issue.id}: "${issue.title}" (status: ${issue.status})`);
    });

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixResolvedIssues().catch(console.error);
