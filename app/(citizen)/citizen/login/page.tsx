"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";

export default function CitizenLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      await ensureUserProfile({ preferredRole: "citizen" });
      router.push(nextPath || "/citizen/dashboard");
      router.refresh();
    } catch (caughtError) {
      setMessage(toUserMessage(caughtError, "Login failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Citizen Login</h1>
      <p className="text-sm text-muted">Sign in to report and track civic issues.</p>

      <form onSubmit={loginWithEmail} className="surface-card space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--text)" }}>Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--text)" }}>Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" required />
        </div>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}

        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
          {busy ? "Signing in..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-muted">
        New user? <Link href="/signup?role=citizen" className="font-medium underline" style={{ color: "var(--primary)" }}>Create an account</Link>
      </p>
    </section>
  );
}
