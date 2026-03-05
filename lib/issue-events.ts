import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IssueEventActor, IssueEventType } from "@/types/database";

type CreateIssueEventInput = {
  issueId: string;
  eventType: IssueEventType;
  message: string;
  createdBy: IssueEventActor;
};

export async function createIssueEvent(supabase: SupabaseClient<Database>, input: CreateIssueEventInput) {
  const { error } = await supabase.from("issue_events").insert({
    issue_id: input.issueId,
    event_type: input.eventType,
    message: input.message,
    created_by: input.createdBy,
  });

  if (error) {
    console.error("Failed to create issue event", error);
  }
}
