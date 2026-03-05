"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signupWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        throw new Error(error.message);
      }

      setMessage("Signup successful. If email confirmation is enabled, confirm then login.");
      router.push("/login");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Signup failed.");
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
          redirectTo: `${window.location.origin}/account`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Google signup failed.");
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Create Account</h1>
      <p className="text-sm text-slate-600">New users are created with citizen role by default.</p>

      <form onSubmit={signupWithEmail} className="surface-card space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" minLength={6} required />
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
