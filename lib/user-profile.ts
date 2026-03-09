import type { AuthorityLevel, Database, UserRole } from "@/types/database";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";

export type ProfileRow = Database["public"]["Tables"]["users"]["Row"];
type EnsureProfileOptions = {
  preferredRole?: UserRole;
  preferredAuthorityLevel?: AuthorityLevel;
  preferredUsername?: string;
};

const ROLE_STORAGE_KEY = "nagarwatch_preferred_role";
const AUTHORITY_LEVEL_STORAGE_KEY = "nagarwatch_authority_level";

function isMissingUsersUsernameColumnError(errorMessage: string | undefined) {
  if (!errorMessage) {
    return false;
  }

  const lower = errorMessage.toLowerCase();
  return lower.includes("username") && lower.includes("users") && lower.includes("schema cache");
}

function rememberRole(role: UserRole) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
}

function rememberAuthorityLevel(level: AuthorityLevel | null | undefined) {
  if (typeof window === "undefined") {
    return;
  }

  if (!level) {
    window.localStorage.removeItem(AUTHORITY_LEVEL_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTHORITY_LEVEL_STORAGE_KEY, level);
}

function readRememberedRole(): UserRole | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
  if (stored === "authority" || stored === "admin" || stored === "citizen") {
    return stored;
  }

  return null;
}

export function readRememberedAuthorityLevel(): AuthorityLevel | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(AUTHORITY_LEVEL_STORAGE_KEY);
  if (stored === "ward" || stored === "zone" || stored === "city" || stored === "state") {
    return stored;
  }

  return null;
}

export async function getCurrentProfile() {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const { user, error: authError } = await getAuthUserSafe();
  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id,email,username,role,authority_level,created_at")
    .eq("id", user.id)
    .single();

  if (error && isMissingUsersUsernameColumnError(error.message)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("users")
      .select("id,email,role,authority_level,created_at")
      .eq("id", user.id)
      .single();

    if (fallbackError) {
      return null;
    }

    return {
      ...fallbackData,
      username: null,
    };
  }

  if (error) {
    return null;
  }

  return data;
}

export async function requireCurrentUser() {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { user, error } = await getAuthUserSafe();
  if (error || !user) {
    throw new Error("Please log in.");
  }

  return user;
}

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const profile = await getCurrentProfile();
  if (profile?.role) {
    rememberRole(profile.role);
    return profile.role;
  }

  return readRememberedRole();
}

export async function getAuthorityRoleAssignmentByEmail(email: string) {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from("authority_roles")
    .select("email,username,role,authority_level,active")
    .eq("email", normalizedEmail)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (!data || (data.role !== "authority" && data.role !== "admin")) {
    return null;
  }

  return data;
}

function resolvePreferredRole(existingRole: UserRole, preferredRole?: UserRole): UserRole {
  if (!preferredRole) {
    return existingRole;
  }

  // Never downgrade admin/authority to citizen from client route preference.
  if (preferredRole === "citizen" && (existingRole === "admin" || existingRole === "authority")) {
    return existingRole;
  }

  return preferredRole;
}

export async function ensureUserProfile(options: EnsureProfileOptions = {}) {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const rememberedRole = readRememberedRole();
  const rememberedAuthorityLevel = readRememberedAuthorityLevel();
  const preferredRole = options.preferredRole ?? rememberedRole ?? undefined;
  const preferredAuthorityLevel = options.preferredAuthorityLevel ?? rememberedAuthorityLevel ?? undefined;
  const preferredUsername = options.preferredUsername?.trim() || undefined;
  if (preferredRole) {
    rememberRole(preferredRole);
  }
  rememberAuthorityLevel(preferredAuthorityLevel ?? null);

  const { user: authUser, error: authError } = await getAuthUserSafe();
  if (authError || !authUser) {
    return null;
  }

  const id = authUser.id;
  const email = authUser.email ?? `${id}@nagarwatch.local`;
  const role: UserRole = preferredRole ?? "citizen";
  const authorityLevel: AuthorityLevel | null = role === "authority" || role === "admin" ? preferredAuthorityLevel ?? "ward" : null;
  const username = preferredUsername ?? null;

  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id,email,username,role,authority_level,created_at")
    .eq("id", id)
    .maybeSingle();

  const usersHasUsernameColumn = !existingError || !isMissingUsersUsernameColumnError(existingError.message);

  const existingResolved = existingError && isMissingUsersUsernameColumnError(existingError.message)
    ? await (async () => {
        const { data: fallbackExisting } = await supabase
          .from("users")
          .select("id,email,role,authority_level,created_at")
          .eq("id", id)
          .maybeSingle();

        return fallbackExisting
          ? {
              ...fallbackExisting,
              username: null,
            }
          : null;
      })()
    : existing;

  if (existingResolved) {
    const nextRole = resolvePreferredRole(existingResolved.role, preferredRole);
    const nextAuthorityLevel = nextRole === "authority" || nextRole === "admin" ? authorityLevel : null;
    const nextUsername = preferredUsername ?? existingResolved.username;

    if (nextRole !== existingResolved.role || nextAuthorityLevel !== existingResolved.authority_level || nextUsername !== existingResolved.username) {
      const updatePayload: Database["public"]["Tables"]["users"]["Update"] = {
        role: nextRole,
        authority_level: nextAuthorityLevel,
      };

      if (usersHasUsernameColumn) {
        updatePayload.username = nextUsername;
      }

      const { error: updateError } = await supabase.from("users").update(updatePayload).eq("id", id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      return {
        ...existingResolved,
        role: nextRole,
        authority_level: nextAuthorityLevel,
        username: nextUsername,
      };
    }

    rememberRole(existingResolved.role);
    rememberAuthorityLevel(existingResolved.authority_level);
    return existingResolved;
  }

  const payload: Database["public"]["Tables"]["users"]["Insert"] = {
    id,
    email,
    role,
    authority_level: authorityLevel,
  };

  if (usersHasUsernameColumn) {
    payload.username = username;
  }

  const { error: upsertError } = await supabase.from("users").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const normalizedData = usersHasUsernameColumn
    ? await (async () => {
        const { data, error } = await supabase
          .from("users")
          .select("id,email,username,role,authority_level,created_at")
          .eq("id", id)
          .single();

        if (error || !data) {
          throw new Error(error?.message || "Failed to read user profile.");
        }

        return data;
      })()
    : await (async () => {
        const { data, error } = await supabase
          .from("users")
          .select("id,email,role,authority_level,created_at")
          .eq("id", id)
          .single();

        if (error || !data) {
          throw new Error(error?.message || "Failed to read user profile.");
        }

        return {
          ...data,
          username: null,
        };
      })();

  rememberRole(normalizedData.role);
  rememberAuthorityLevel(normalizedData.authority_level);

  return normalizedData;
}
