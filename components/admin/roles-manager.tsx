"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentUserRole } from "@/lib/user-profile";
import type { AuthorityLevel, Database, UserRole } from "@/types/database";

type RoleAssignment = Database["public"]["Tables"]["authority_roles"]["Row"];

const AUTHORITY_LEVELS: AuthorityLevel[] = ["ward", "zone", "city", "state"];

function isMissingUsersUsernameColumnError(errorMessage: string | undefined) {
  if (!errorMessage) {
    return false;
  }

  const lower = errorMessage.toLowerCase();
  return lower.includes("username") && lower.includes("users") && lower.includes("schema cache");
}

export function RolesManager() {
  const [entries, setEntries] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"authority" | "admin">("authority");
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel>("ward");
  const effectiveAuthorityLevel: AuthorityLevel = role === "admin" ? "state" : authorityLevel;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        if (active) {
          setError("Supabase is not configured.");
          setLoading(false);
        }
        return;
      }

      const profile = await ensureUserProfile();
      const resolvedRole = profile?.role ?? (await getCurrentUserRole());
      if (!active) {
        return;
      }

      setCurrentRole(resolvedRole ?? null);

      const { data, error: listError } = await supabase
        .from("authority_roles")
        .select("id,email,username,role,authority_level,active,created_by,created_at")
        .order("created_at", { ascending: false });

      if (!active) {
        return;
      }

      if (listError) {
        setError(listError.message);
      } else {
        setEntries(data ?? []);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const createOrUpdateRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    if (!normalizedEmail || !normalizedUsername) {
      setError("Email and authority name are required.");
      return;
    }

    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: Database["public"]["Tables"]["authority_roles"]["Insert"] = {
        email: normalizedEmail,
        username: normalizedUsername,
        role,
        authority_level: effectiveAuthorityLevel,
        active: true,
        created_by: user?.id ?? null,
      };

      const { error: upsertError } = await supabase.from("authority_roles").upsert(payload, { onConflict: "email" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }

      // If the user has already signed up, immediately sync their operational role.
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingUser?.id) {
        let { error: syncError } = await supabase
          .from("users")
          .update({ role, authority_level: effectiveAuthorityLevel, username: normalizedUsername })
          .eq("id", existingUser.id);

        if (syncError && isMissingUsersUsernameColumnError(syncError.message)) {
          syncError = (
            await supabase
              .from("users")
              .update({ role, authority_level: effectiveAuthorityLevel })
              .eq("id", existingUser.id)
          ).error;
        }

        if (syncError) {
          throw new Error(syncError.message);
        }
      }

      const { data: refreshed } = await supabase
        .from("authority_roles")
        .select("id,email,username,role,authority_level,active,created_by,created_at")
        .order("created_at", { ascending: false });

      setEntries(refreshed ?? []);
      setEmail("");
      setUsername("");
      setRole("authority");
      setAuthorityLevel("ward");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save role.");
    } finally {
      setSaving(false);
    }
  };

  const setRoleActiveState = async (entry: RoleAssignment, active: boolean) => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.from("authority_roles").update({ active }).eq("id", entry.id);
      if (updateError) {
        throw new Error(updateError.message);
      }

      const { data: refreshed } = await supabase
        .from("authority_roles")
        .select("id,email,username,role,authority_level,active,created_by,created_at")
        .order("created_at", { ascending: false });

      setEntries(refreshed ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update access.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading role assignments...</div>;
  }

  if (currentRole !== "admin") {
    return <div className="surface-card p-4 text-sm text-red-600">Only admin accounts can manage roles.</div>;
  }

  return (
    <section className="space-y-4">
      <form onSubmit={createOrUpdateRole} className="surface-card space-y-3 p-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Create Or Update Authority Access</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="role-email" className="text-sm font-medium" style={{ color: "var(--text)" }}>Email</label>
            <input
              id="role-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input-base"
              placeholder="authority@gov.in"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="role-username" className="text-sm font-medium" style={{ color: "var(--text)" }}>Authority Name (Username)</label>
            <input
              id="role-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="input-base"
              placeholder="Ward Officer Asha"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="role-type" className="text-sm font-medium" style={{ color: "var(--text)" }}>Role</label>
            <select
              id="role-type"
              value={role}
              onChange={(event) => {
                const nextRole = event.target.value as "authority" | "admin";
                setRole(nextRole);
                if (nextRole === "admin") {
                  setAuthorityLevel("state");
                }
              }}
              className="input-base"
            >
              <option value="authority">Authority</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="role-level" className="text-sm font-medium" style={{ color: "var(--text)" }}>Authority Level</label>
            <select
              id="role-level"
              value={effectiveAuthorityLevel}
              onChange={(event) => setAuthorityLevel(event.target.value as AuthorityLevel)}
              className="input-base"
              disabled={role === "admin"}
            >
              {AUTHORITY_LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            {role === "admin" ? <p className="text-xs text-muted">Admin is always assigned to state level.</p> : null}
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save Access Role"}
        </button>
      </form>

      <article className="surface-card overflow-x-auto p-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Configured Roles</h2>
        <table className="mt-3 min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Email</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Level</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-2 py-2">{entry.username}</td>
                <td className="px-2 py-2">{entry.email}</td>
                <td className="px-2 py-2">{entry.role}</td>
                <td className="px-2 py-2">{entry.authority_level}</td>
                <td className="px-2 py-2">{entry.active ? "active" : "disabled"}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    className="btn-secondary px-2 py-1 text-xs"
                    disabled={saving}
                    onClick={() => void setRoleActiveState(entry, !entry.active)}
                  >
                    {entry.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-muted" colSpan={6}>No authority roles configured yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </article>
    </section>
  );
}
