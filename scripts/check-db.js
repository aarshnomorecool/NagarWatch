// Quick database state check
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wjdacyeidhhxlokuaowb.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_nxxyuz6iGFHRVfsJBrtN3A_9CJ1Xapa";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDatabaseState() {
  console.log("Checking database state...\n");

  // Get count of all issues
  const { count: totalIssues } = await supabase
    .from("issues")
    .select("*", { count: "exact", head: true });

  // Get count of resolved issues
  const { count: resolvedIssues, data: resolvedIssuesData } = await supabase
    .from("issues")
    .select("id,title,status", { count: "exact" })
    .eq("status", "resolved");

  // Get all resolutions
  const { data: resolutions, error: resError } = await supabase
    .from("resolutions")
    .select("*");

  console.log(`Total issues: ${totalIssues}`);
  console.log(`Resolved issues (status='resolved'): ${resolvedIssues}`);
  console.log(`Total resolutions in table: ${resolutions?.length ?? 0}`);
  console.log(`\nResolutions in database:`);
  resolutions?.forEach((res) => {
    console.log(`  - Issue ${res.issue_id}: proof_image=${res.proof_image ? "YES" : "NO"}`);
  });

  if (resolvedIssues > 0 && resolvedIssuesData) {
    console.log(`\nResolved issues in database:`);
    resolvedIssuesData.slice(0, 10).forEach((issue) => {
      console.log(`  - ${issue.id}: ${issue.title} (status=${issue.status})`);
    });
  }
}

checkDatabaseState().catch(console.error);
