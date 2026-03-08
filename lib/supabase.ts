import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type SafeAuthUserResult = {
  user: Awaited<ReturnType<SupabaseClient<Database>["auth"]["getUser"]>>["data"]["user"] | null;
  error: Error | null;
};

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let browserClient: SupabaseClient<Database> | null = null;

function createTypedClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    return createTypedClient();
  }

  if (!browserClient) {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export function createSupabaseServerClient() {
  return createTypedClient();
}

export function getSupabaseBrowserClientOrNull() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return getSupabaseBrowserClient();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isSupabaseLockAbortError(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("Lock broken by another request with the 'steal' option") || message.includes("AbortError");
}

export async function getAuthUserSafe(): Promise<SafeAuthUserResult> {
  const supabase = getSupabaseBrowserClientOrNull();
  if (!supabase) {
    return { user: null, error: null };
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && isSupabaseLockAbortError(error)) {
      return { user: null, error: null };
    }

    return {
      user: data.user ?? null,
      error: (error as Error | null) ?? null,
    };
  } catch (error) {
    if (isSupabaseLockAbortError(error)) {
      return { user: null, error: null };
    }

    if (error instanceof Error) {
      return { user: null, error };
    }

    return { user: null, error: new Error("Unable to fetch authenticated user.") };
  }
}