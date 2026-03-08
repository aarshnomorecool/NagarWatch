import type { Database, UserRole } from "@/types/database";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";

export type ProfileRow = Database["public"]["Tables"]["users"]["Row"];
type EnsureProfileOptions = {
  preferredRole?: UserRole;
};

const ROLE_STORAGE_KEY = "nagarwatch_preferred_role";

function rememberRole(role: UserRole) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
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
    .select("id,email,role,created_at")
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
  const preferredRole = options.preferredRole ?? rememberedRole ?? undefined;
  if (preferredRole) {
    rememberRole(preferredRole);
  }

  const { user: authUser, error: authError } = await getAuthUserSafe();
  if (authError || !authUser) {
    return null;
  }

  const id = authUser.id;
  const email = authUser.email ?? `${id}@nagarwatch.local`;
  const role: UserRole = preferredRole ?? "citizen";

  const { data: existing } = await supabase
    .from("users")
    .select("id,email,role,created_at")
    .eq("id", id)
    .maybeSingle();

  if (existing) {
    if (preferredRole && existing.role !== preferredRole) {
      const { error: updateError } = await supabase.from("users").update({ role: preferredRole }).eq("id", id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      return {
        ...existing,
        role: preferredRole,
      };
    }

    rememberRole(existing.role);
    return existing;
  }

  const payload: Database["public"]["Tables"]["users"]["Insert"] = {
    id,
    email,
    role,
  };

  const { error: upsertError } = await supabase.from("users").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data, error } = await supabase.from("users").select("id,email,role,created_at").eq("id", id).single();
  if (error) {
    throw new Error(error.message);
  }

  rememberRole(data.role);

  return data;
}
