"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-md" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next");
  const roleFromQuery = searchParams?.get("role");
  const defaultRole: UserRole = roleFromQuery === "authority" || roleFromQuery === "admin" ? "authority" : "citizen";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(defaultRole);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toUserMessage = (err: unknown, fallback: string) => {
    const raw = err instanceof Error ? err.message : fallback;
    const lower = raw.toLowerCase();

    if (lower.includes("email not confirmed")) {
      return "Your email is not confirmed yet. Open the confirmation link from your inbox, then login again.";
    }

    if (lower.includes("failed to fetch")) {
      return "Network error while contacting Supabase. Please check your internet, then try again.";
    }

    return raw;
  };

  const routeAfterLogin = (role: UserRole) => {
    if (nextPath) {
      return nextPath;
    }

    return role === "authority" || role === "admin" ? "/admin/dashboard" : "/citizen/dashboard";
  };

  const loginWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }

      let resolvedRole: UserRole = selectedRole;
      try {
        const profile = await ensureUserProfile({ preferredRole: selectedRole });
        resolvedRole = profile?.role ?? selectedRole;
      } catch {
        // Do not block successful auth on profile sync issues.
      }

      router.push(routeAfterLogin(resolvedRole));
      router.refresh();
    } catch (caughtError) {
      setMessage(toUserMessage(caughtError, "Login failed."));
    } finally {
      setBusy(false);
    }
  };

  const loginWithGoogle = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/account?role=${selectedRole}`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (caughtError) {
      setMessage(toUserMessage(caughtError, "Google sign in failed."));
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Login</h1>
      <p className="text-sm text-slate-600">Sign in to use your account.</p>

      <form onSubmit={loginWithEmail} className="surface-card space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Choose dashboard</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSelectedRole("citizen")} className={`rounded-md border px-3 py-2 text-sm font-medium ${selectedRole === "citizen" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              Citizen
            </button>
            <button type="button" onClick={() => setSelectedRole("authority")} className={`rounded-md border px-3 py-2 text-sm font-medium ${selectedRole === "authority" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              Authority
            </button>
          </div>
        </div>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}

        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
          {busy ? "Signing in..." : "Login"}
        </button>

        <button type="button" onClick={() => void loginWithGoogle()} disabled={busy} className="btn-secondary w-full py-2.5">
          Continue with Google
        </button>
      </form>

      <p className="text-sm text-slate-600">
        New user? <Link href="/signup" className="font-medium text-blue-700 underline">Create an account</Link>
      </p>
    </section>
  );
}
