"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getAuthorityRoleAssignmentByEmail } from "@/lib/user-profile";
import type { Database } from "@/types/database";

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

      if (!user?.email) {
        throw new Error("Authenticated user email not found.");
      }

      const normalizedEmail = user.email.trim().toLowerCase();

      const assignment = await getAuthorityRoleAssignmentByEmail(normalizedEmail);

      // Backward-compatible recovery: honor existing users.role admin/authority even without authority_roles rows.
      const { data: existingUser } = await supabase
        .from("users")
        .select("id,email,username,role,authority_level")
        .eq("id", user.id)
        .maybeSingle();

      const legacyRole = existingUser?.role;
      const legacyAuthorityLevel = existingUser?.authority_level ?? "state";
      const legacyUsername = existingUser?.username ?? normalizedEmail.split("@")[0];

      let resolvedAssignment = assignment;

      // Bootstrap path: if no role assignments exist yet, first successful admin login self-provisions.
      if (!resolvedAssignment) {
        const { count, error: roleCountError } = await supabase
          .from("authority_roles")
          .select("id", { count: "exact", head: true });

        const noRolesConfigured = !roleCountError && (count ?? 0) === 0;
        const rolesTableMissing = !!roleCountError && roleCountError.message.toLowerCase().includes("authority_roles");

        if (noRolesConfigured || rolesTableMissing) {
          const bootstrapPayload: Database["public"]["Tables"]["authority_roles"]["Insert"] = {
            email: normalizedEmail,
            username: legacyUsername,
            role: "admin",
            authority_level: legacyAuthorityLevel,
            active: true,
            created_by: user.id,
          };

          const { error: upsertBootstrapError } = await supabase
            .from("authority_roles")
            .upsert(bootstrapPayload, { onConflict: "email" });

          if (!upsertBootstrapError) {
            resolvedAssignment = {
              email: normalizedEmail,
              username: legacyUsername,
              role: "admin",
              authority_level: legacyAuthorityLevel,
              active: true,
            };
          }
        }
      }

      const profile = await ensureUserProfile(
        resolvedAssignment
          ? {
              preferredRole: resolvedAssignment.role,
              preferredAuthorityLevel: resolvedAssignment.authority_level,
              preferredUsername: resolvedAssignment.username,
            }
          : legacyRole === "admin" || legacyRole === "authority"
          ? {
              preferredRole: legacyRole,
              preferredAuthorityLevel: legacyAuthorityLevel,
              preferredUsername: legacyUsername,
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
