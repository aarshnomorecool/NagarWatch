import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { AuthorityLevel, Database, UserRole } from "@/types/database";

type ProvisionRoleRequest = {
  email?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  authorityLevel?: AuthorityLevel;
};

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing server env: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
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

function normalizeRole(inputRole: UserRole | undefined) {
  if (inputRole === "admin" || inputRole === "authority") {
    return inputRole;
  }

  return null;
}

function normalizeLevel(role: "admin" | "authority", level: AuthorityLevel | undefined): AuthorityLevel {
  if (role === "admin") {
    return "state";
  }

  if (level === "ward" || level === "zone" || level === "city" || level === "state") {
    return level;
  }

  return "ward";
}

async function findAuthUserIdByEmail(serviceClient: ReturnType<typeof getServiceClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match?.id) {
      return match.id;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const serviceClient = getServiceClient();
    const token = getBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing admin session token." }, { status: 401 });
    }

    const { data: requesterAuth, error: requesterAuthError } = await serviceClient.auth.getUser(token);
    if (requesterAuthError || !requesterAuth.user) {
      return NextResponse.json({ error: "Invalid session. Please login again." }, { status: 401 });
    }

    const { data: requesterProfile, error: requesterProfileError } = await serviceClient
      .from("users")
      .select("id,role")
      .eq("id", requesterAuth.user.id)
      .maybeSingle();

    if (requesterProfileError) {
      return NextResponse.json({ error: requesterProfileError.message }, { status: 500 });
    }

    if (requesterProfile?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can create role accounts." }, { status: 403 });
    }

    const body = (await request.json()) as ProvisionRoleRequest;
    const email = body.email?.trim().toLowerCase() ?? "";
    const username = body.username?.trim() ?? "";
    const password = body.password?.trim() ?? "";
    const role = normalizeRole(body.role);

    if (!email || !username || !role || password.length < 6) {
      return NextResponse.json({ error: "Email, username, role and password (min 6) are required." }, { status: 400 });
    }

    const authorityLevel = normalizeLevel(role, body.authorityLevel);

    let authUserId: string | null = null;

    const { data: createdAuthUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
      },
    });

    if (createUserError) {
      const lowerMessage = createUserError.message.toLowerCase();
      const alreadyExists = lowerMessage.includes("already") || lowerMessage.includes("registered") || lowerMessage.includes("exists");

      if (!alreadyExists) {
        return NextResponse.json({ error: createUserError.message }, { status: 500 });
      }

      const existingAuthId = await findAuthUserIdByEmail(serviceClient, email);
      if (!existingAuthId) {
        return NextResponse.json({ error: "Auth user exists but could not be resolved by email." }, { status: 500 });
      }

      const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(existingAuthId, {
        password,
        email_confirm: true,
        user_metadata: {
          username,
        },
      });

      if (updateAuthError) {
        return NextResponse.json({ error: updateAuthError.message }, { status: 500 });
      }

      authUserId = existingAuthId;
    } else {
      authUserId = createdAuthUser.user?.id ?? null;
    }

    const rolePayload: Database["public"]["Tables"]["authority_roles"]["Insert"] = {
      email,
      username,
      role,
      authority_level: authorityLevel,
      active: true,
      created_by: requesterAuth.user.id,
    };

    const { error: roleUpsertError } = await serviceClient.from("authority_roles").upsert(rolePayload, { onConflict: "email" });
    if (roleUpsertError) {
      return NextResponse.json({ error: roleUpsertError.message }, { status: 500 });
    }

    if (authUserId) {
      const userPayload: Database["public"]["Tables"]["users"]["Insert"] = {
        id: authUserId,
        email,
        role,
        authority_level: authorityLevel,
        username,
      };

      const { error: userUpsertError } = await serviceClient.from("users").upsert(userPayload, { onConflict: "id" });
      if (userUpsertError) {
        const isMissingUsername = userUpsertError.message.toLowerCase().includes("username")
          && userUpsertError.message.toLowerCase().includes("users")
          && userUpsertError.message.toLowerCase().includes("schema cache");

        if (!isMissingUsername) {
          return NextResponse.json({ error: userUpsertError.message }, { status: 500 });
        }

        const fallbackPayload = {
          id: authUserId,
          email,
          role,
          authority_level: authorityLevel,
        };

        const { error: fallbackUserUpsertError } = await serviceClient.from("users").upsert(fallbackPayload, { onConflict: "id" });
        if (fallbackUserUpsertError) {
          return NextResponse.json({ error: fallbackUserUpsertError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
