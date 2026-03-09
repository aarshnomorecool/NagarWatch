"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { AuthorityLevel, Database } from "@/types/database";

export default function AdminBootstrapPage() {
  return (
    <Suspense fallback={<section className="mx-auto w-full max-w-md" />}>
      <AdminBootstrapPageContent />
    </Suspense>
  );
}

function AdminBootstrapPageContent() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel>("state");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [setupLocked, setSetupLocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const checkSetupState = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        if (active) {
          setMessage("Supabase is not configured.");
          setChecking(false);
        }
        return;
      }

      const { count, error } = await supabase
        .from("authority_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true);

      if (!active) {
        return;
      }

      if (!error && (count ?? 0) > 0) {
        setSetupLocked(true);
      }

      setChecking(false);
    };

    void checkSetupState();

    return () => {
      active = false;
    };
  }, []);

  const createAdminAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (setupLocked) {
      setMessage("Bootstrap is disabled because an admin already exists.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim() || normalizedEmail.split("@")[0];

      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signupError) {
        throw new Error(signupError.message);
      }

      const userId = signupData.user?.id ?? null;

      const payload: Database["public"]["Tables"]["authority_roles"]["Insert"] = {
        email: normalizedEmail,
        username: normalizedUsername,
        role: "admin",
        authority_level: authorityLevel,
        active: true,
        created_by: userId,
      };

      const { error: roleError } = await supabase.from("authority_roles").upsert(payload, { onConflict: "email" });
      if (roleError) {
        throw new Error(roleError.message);
      }

      if (signupData.session) {
        await ensureUserProfile({
          preferredRole: "admin",
          preferredAuthorityLevel: authorityLevel,
          preferredUsername: normalizedUsername,
        });

        router.push("/admin/dashboard");
        router.refresh();
        return;
      }

      setSetupLocked(true);
      setMessage("Admin account created. Confirm email from inbox, then login at /admin/login.");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Failed to create admin account.");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return <section className="mx-auto w-full max-w-md surface-card p-4 text-sm text-muted">Checking bootstrap status...</section>;
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Create First Admin Account</h1>
      <p className="text-sm text-muted">One-time setup page. It auto-disables after an active admin exists.</p>

      {setupLocked ? (
        <article className="surface-card p-4 text-sm" style={{ color: "var(--text)" }}>
          Bootstrap is disabled because an admin account already exists.
          <div className="mt-3">
            <Link href="/admin/login" className="btn-primary">Go To Admin Login</Link>
          </div>
        </article>
      ) : (
        <form onSubmit={createAdminAccount} className="surface-card space-y-3 p-4">
          <div className="space-y-1.5">
            <label htmlFor="bootstrap-email" className="text-sm font-medium" style={{ color: "var(--text)" }}>Email</label>
            <input id="bootstrap-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input-base" required />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bootstrap-password" className="text-sm font-medium" style={{ color: "var(--text)" }}>Password</label>
            <input id="bootstrap-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="input-base" minLength={6} required />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bootstrap-username" className="text-sm font-medium" style={{ color: "var(--text)" }}>Admin Name</label>
            <input id="bootstrap-username" value={username} onChange={(event) => setUsername(event.target.value)} className="input-base" placeholder="City Admin" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bootstrap-level" className="text-sm font-medium" style={{ color: "var(--text)" }}>Authority Level</label>
            <select id="bootstrap-level" value={authorityLevel} onChange={(event) => setAuthorityLevel(event.target.value as AuthorityLevel)} className="input-base">
              <option value="ward">ward</option>
              <option value="zone">zone</option>
              <option value="city">city</option>
              <option value="state">state</option>
            </select>
          </div>

          {message ? <p className="text-sm text-red-600">{message}</p> : null}

          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
            {busy ? "Creating..." : "Create Admin Account"}
          </button>
        </form>
      )}

      <p className="text-sm text-muted">
        Already have access? <Link href="/admin/login" className="font-medium underline" style={{ color: "var(--primary)" }}>Login</Link>
      </p>
    </section>
  );
}
