import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { escalationRuleForIssue } from "@/lib/admin-dashboard";
import { authorityLevelLabel } from "@/lib/authority-display";
import type { Database, DbIssue } from "@/types/database";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server env: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getBearerToken(authHeader: string | null) {
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

async function isAdminByAccessToken(serviceClient: ReturnType<typeof getServiceClient>, token: string) {
  const { data: requesterAuth, error: requesterAuthError } = await serviceClient.auth.getUser(token);
  if (requesterAuthError || !requesterAuth.user) {
    return false;
  }

  const { data: requesterProfile, error: requesterProfileError } = await serviceClient
    .from("users")
    .select("id,role")
    .eq("id", requesterAuth.user.id)
    .maybeSingle();

  if (requesterProfileError) {
    throw new Error(requesterProfileError.message);
  }

  return requesterProfile?.role === "admin";
}

async function runEscalations() {
  const serviceClient = getServiceClient();

  const [{ data: issues, error: issuesError }, { data: escalations, error: escalationsError }] = await Promise.all([
    serviceClient
      .from("issues")
      .select("id,title,created_by,status,created_at,assigned_authority_level,escalation_level")
      .neq("status", "resolved"),
    serviceClient.from("escalations").select("issue_id,escalation_level"),
  ]);

  if (issuesError || escalationsError) {
    throw new Error(issuesError?.message || escalationsError?.message || "Failed to load issues/escalations.");
  }

  const escalationMaxByIssue = (escalations ?? []).reduce<Record<string, number>>((acc, escalation) => {
    const current = acc[escalation.issue_id] ?? 0;
    acc[escalation.issue_id] = Math.max(current, escalation.escalation_level);
    return acc;
  }, {});

  const escalationInserts = ((issues ?? []) as Pick<DbIssue, "id" | "title" | "created_by" | "status" | "created_at" | "assigned_authority_level" | "escalation_level">[])
    .reduce<Database["public"]["Tables"]["escalations"]["Insert"][]>((acc, issue) => {
      const rule = escalationRuleForIssue(issue as DbIssue);
      if (!rule) {
        return acc;
      }

      const existingLevel = escalationMaxByIssue[issue.id] ?? 0;
      if (existingLevel >= rule.escalation_level) {
        return acc;
      }

      acc.push({
        issue_id: issue.id,
        escalation_level: rule.escalation_level,
        escalated_to: rule.escalated_to,
        escalated_to_level: rule.escalated_to_level,
      });

      return acc;
    }, []);

  if (escalationInserts.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const { error: insertEscalationError } = await serviceClient
    .from("escalations")
    .upsert(escalationInserts, { onConflict: "issue_id,escalation_level" });

  if (insertEscalationError) {
    throw new Error(insertEscalationError.message);
  }

  const updateResults = await Promise.all(
    escalationInserts.map((entry) =>
      serviceClient
        .from("issues")
        .update({
          assigned_authority_level: entry.escalated_to_level,
          escalation_level: entry.escalation_level,
          last_escalated_at: new Date().toISOString(),
        })
        .eq("id", entry.issue_id),
    ),
  );

  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) {
    throw new Error(updateError.message);
  }

  const issueMap = new Map((issues ?? []).map((issue) => [issue.id, issue]));
  const notificationRows: Database["public"]["Tables"]["notifications"]["Insert"][] = escalationInserts
    .map((entry) => {
      const issue = issueMap.get(entry.issue_id);
      if (!issue) {
        return null;
      }

      return {
        user_id: issue.created_by,
        issue_id: issue.id,
        notification_type: "issue_escalated",
        title: "Issue escalated",
        body: `Your issue \"${issue.title}\" has been escalated to ${authorityLevelLabel(entry.escalated_to_level)}.`,
      };
    })
    .filter(Boolean) as Database["public"]["Tables"]["notifications"]["Insert"][];

  if (notificationRows.length > 0) {
    const { error: notificationError } = await serviceClient.from("notifications").insert(notificationRows);
    if (notificationError) {
      throw new Error(notificationError.message);
    }
  }

  return { inserted: escalationInserts.length, updated: escalationInserts.length };
}

async function handleRun(request: Request) {
  try {
    const token = getBearerToken(request.headers.get("authorization"));
    const cronSecret = process.env.CRON_SECRET;

    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    // Permit Vercel Cron bearer secret, or authenticated admin session token.
    if (!cronSecret || token !== cronSecret) {
      const serviceClient = getServiceClient();
      const admin = await isAdminByAccessToken(serviceClient, token);
      if (!admin) {
        return NextResponse.json({ error: "Only admins can trigger escalations." }, { status: 403 });
      }
    }

    const result = await runEscalations();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Escalation run failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleRun(request);
}

export async function GET(request: Request) {
  return handleRun(request);
}
