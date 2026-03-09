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

  const { data: existing } = await supabase
    .from("users")
    .select("id,email,username,role,authority_level,created_at")
    .eq("id", id)
    .maybeSingle();

  if (existing) {
    const nextRole = resolvePreferredRole(existing.role, preferredRole);
    const nextAuthorityLevel = nextRole === "authority" || nextRole === "admin" ? authorityLevel : null;
    const nextUsername = preferredUsername ?? existing.username;

    if (nextRole !== existing.role || nextAuthorityLevel !== existing.authority_level || nextUsername !== existing.username) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ role: nextRole, authority_level: nextAuthorityLevel, username: nextUsername })
        .eq("id", id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      return {
        ...existing,
        role: nextRole,
        authority_level: nextAuthorityLevel,
        username: nextUsername,
      };
    }

    rememberRole(existing.role);
    rememberAuthorityLevel(existing.authority_level);
    return existing;
  }

  const payload: Database["public"]["Tables"]["users"]["Insert"] = {
    id,
    email,
    role,
    authority_level: authorityLevel,
    username,
  };

  const { error: upsertError } = await supabase.from("users").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data, error } = await supabase.from("users").select("id,email,username,role,authority_level,created_at").eq("id", id).single();
  if (error) {
    throw new Error(error.message);
  }

  rememberRole(data.role);
  rememberAuthorityLevel(data.authority_level);

  return data;
}
