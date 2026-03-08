"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

export default function SignupPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-md" />}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

    if (lower.includes("failed to fetch")) {
      return "Network error while contacting Supabase. Please check your internet, then try again.";
    }

    return raw;
  };

  const signupWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data: signupData, error: signupError } = await supabase.auth.signUp({ email, password });
      if (signupError) {
        throw new Error(signupError.message);
      }

      if (!signupData.session) {
        setMessage("Account created. Please confirm your email using the link sent to your inbox, then login.");
        router.push(`/login?role=${selectedRole}`);
        return;
      }

      let resolvedRole: UserRole = selectedRole;
      try {
        const profile = await ensureUserProfile({ preferredRole: selectedRole });
        resolvedRole = profile?.role ?? selectedRole;
      } catch {
        // Do not block successful auth on profile sync issues.
      }

      router.push(resolvedRole === "authority" || resolvedRole === "admin" ? "/admin/dashboard" : "/citizen/dashboard");
      router.refresh();
    } catch (caughtError) {
      setMessage(toUserMessage(caughtError, "Signup failed."));
    } finally {
      setBusy(false);
    }
  };

  const signupWithGoogle = async () => {
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
      setMessage(toUserMessage(caughtError, "Google signup failed."));
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Create Account</h1>
      <p className="text-sm text-slate-600">Create a new account and start using NagarWatch.</p>

      <form onSubmit={signupWithEmail} className="surface-card space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" minLength={6} required />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Choose dashboard</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSelectedRole("citizen")} className={`btn-choice ${selectedRole === "citizen" ? "btn-choice-active" : ""}`}>
              Citizen
            </button>
            <button type="button" onClick={() => setSelectedRole("authority")} className={`btn-choice ${selectedRole === "authority" ? "btn-choice-active" : ""}`}>
              Authority
            </button>
          </div>
        </div>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
          {busy ? "Creating account..." : "Sign Up"}
        </button>

        <button type="button" onClick={() => void signupWithGoogle()} disabled={busy} className="btn-secondary w-full py-2.5">
          Continue with Google
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-medium text-blue-700 underline">Login</Link>
      </p>
    </section>
  );
}
