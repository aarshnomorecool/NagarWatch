import type { User } from "@supabase/supabase-js";
import type { Database, UserRole } from "@/types/database";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentProfile() {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,created_at")
    .eq("id", authData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function requireCurrentUser() {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw new Error("Please log in.");
  }

  return data.user;
}

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

export async function ensureUserProfile(user: User) {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return null;
  }

  const email = user.email ?? `${user.id}@civicsync.local`;
  const role: UserRole = "citizen";

  const payload: Database["public"]["Tables"]["profiles"]["Insert"] = {
    id: user.id,
    email,
    role,
  };

  const { error: upsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { data, error } = await supabase.from("profiles").select("id,email,role,created_at").eq("id", user.id).single();
  if (error) {
    throw new Error(error.message);
  }

  return data;
}
