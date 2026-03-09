import type { AuthorityLevel, Database, UserRole } from "@/types/database";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";

export type ProfileRow = Database["public"]["Tables"]["users"]["Row"];
type EnsureProfileOptions = {
  preferredRole?: UserRole;
  preferredAuthorityLevel?: AuthorityLevel;
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
    .select("id,email,role,authority_level,created_at")
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

export async function ensureUserProfile(options: EnsureProfileOptions = {}) {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const rememberedRole = readRememberedRole();
  const rememberedAuthorityLevel = readRememberedAuthorityLevel();
  const preferredRole = options.preferredRole ?? rememberedRole ?? undefined;
  const preferredAuthorityLevel = options.preferredAuthorityLevel ?? rememberedAuthorityLevel ?? undefined;
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

  const { data: existing } = await supabase
    .from("users")
    .select("id,email,role,authority_level,created_at")
    .eq("id", id)
    .maybeSingle();

  if (existing) {
    if ((preferredRole && existing.role !== preferredRole) || (authorityLevel !== existing.authority_level)) {
      const { error: updateError } = await supabase
        .from("users")
        .update({ role: preferredRole ?? existing.role, authority_level: authorityLevel })
        .eq("id", id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      return {
        ...existing,
        role: preferredRole ?? existing.role,
        authority_level: authorityLevel,
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
  };

  const { error: upsertError } = await supabase.from("users").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data, error } = await supabase.from("users").select("id,email,role,authority_level,created_at").eq("id", id).single();
  if (error) {
    throw new Error(error.message);
  }

  rememberRole(data.role);
  rememberAuthorityLevel(data.authority_level);

  return data;
}
