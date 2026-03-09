"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getAuthorityRoleAssignmentByEmail } from "@/lib/user-profile";

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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const assignment = user?.email ? await getAuthorityRoleAssignmentByEmail(user.email) : null;

      const profile = await ensureUserProfile(
        assignment
          ? {
              preferredRole: assignment.role,
              preferredAuthorityLevel: assignment.authority_level,
              preferredUsername: assignment.username,
            }
          : undefined,
      );

      if (profile?.role !== "admin" && profile?.role !== "authority") {
        await supabase.auth.signOut();
        throw new Error("Access not provisioned. Ask an admin to add your account in Roles.");
      }

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
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Admin Login</h1>
      <p className="text-sm text-muted">Only admin-provisioned authority accounts can access this portal.</p>

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
        Need authority access? Ask an admin to add your role from <Link href="/admin/roles" className="font-medium underline" style={{ color: "var(--primary)" }}>Roles</Link>.
      </p>
    </section>
  );
}
