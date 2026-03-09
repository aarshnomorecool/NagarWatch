import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type NotifyFollowersInput = {
  issueId: string;
  actorUserId?: string | null;
  notificationType: string;
  title: string;
  body: string;
};

type NotifyOwnerInput = {
  userId: string;
  issueId: string;
  notificationType: string;
  title: string;
  body: string;
};

export async function notifyIssueFollowers(supabase: SupabaseClient<Database>, input: NotifyFollowersInput) {
  const { data: followers, error: followError } = await supabase
    .from("issue_follows")
    .select("user_id")
    .eq("issue_id", input.issueId);

  if (followError) {
    console.error("Failed to load issue followers", followError);
    return;
  }

  const distinctUserIds = Array.from(new Set((followers ?? []).map((row) => row.user_id))).filter((userId) => userId !== input.actorUserId);
  if (distinctUserIds.length === 0) {
    return;
  }

  const rows: Database["public"]["Tables"]["notifications"]["Insert"][] = distinctUserIds.map((userId) => ({
    user_id: userId,
    issue_id: input.issueId,
    notification_type: input.notificationType,
    title: input.title,
    body: input.body,
  }));

  const { error: insertError } = await supabase.from("notifications").insert(rows);
  if (insertError) {
    console.error("Failed to insert follower notifications", insertError);
  }
}

export async function notifyIssueOwner(supabase: SupabaseClient<Database>, input: NotifyOwnerInput) {
  const row: Database["public"]["Tables"]["notifications"]["Insert"] = {
    user_id: input.userId,
    issue_id: input.issueId,
    notification_type: input.notificationType,
    title: input.title,
    body: input.body,
  };

  const { error } = await supabase.from("notifications").insert(row);
  if (error) {
    console.error("Failed to insert owner notification", error);
  }
}
