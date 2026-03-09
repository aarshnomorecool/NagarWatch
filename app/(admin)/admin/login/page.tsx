"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { AuthorityLevel, UserRole } from "@/types/database";

const authorityLevels: Array<{ value: AuthorityLevel; label: string }> = [
  { value: "ward", label: "Ward Officer" },
  { value: "zone", label: "Zone Officer" },
  { value: "city", label: "City Commissioner" },
  { value: "state", label: "State Authority" },
];

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-md" />}>
      <AdminLoginPageContent />
    </Suspense>
  );
}

function AdminLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams?.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("authority");
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel>("ward");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

      await ensureUserProfile({
        preferredRole: selectedRole,
        preferredAuthorityLevel: authorityLevel,
      });

      router.push(nextPath || "/admin/dashboard");
      router.refresh();
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error ? caughtError.message : "Login failed.";
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Authority Login</h1>
      <p className="text-sm text-muted">Sign in to manage, escalate, and resolve field complaints.</p>

      <form onSubmit={loginWithEmail} className="surface-card space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--text)" }}>Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--text)" }}>Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" required />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="role" className="text-sm font-medium" style={{ color: "var(--text)" }}>Access Role</label>
          <select
            id="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as UserRole)}
            className="input-base"
          >
            <option value="authority">Authority</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="authority-level" className="text-sm font-medium" style={{ color: "var(--text)" }}>Authority Level</label>
          <select
            id="authority-level"
            value={authorityLevel}
            onChange={(event) => setAuthorityLevel(event.target.value as AuthorityLevel)}
            className="input-base"
          >
            {authorityLevels.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
        </div>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}

        <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
          {busy ? "Signing in..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-muted">
        New authority user? <Link href="/signup?role=authority" className="font-medium underline" style={{ color: "var(--primary)" }}>Create access</Link>
      </p>
    </section>
  );
}
