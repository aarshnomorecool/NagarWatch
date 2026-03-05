"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [issueCount, setIssueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowserClientOrNull();
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          router.replace("/login?next=/account");
          return;
        }

        await ensureUserProfile(data.user);
        const profile = await getCurrentProfile();

        const { count, error: countError } = await supabase
          .from("issues")
          .select("id", { head: true, count: "exact" })
          .eq("created_by", data.user.id);

        if (countError) {
          throw new Error(countError.message);
        }

        if (!active) {
          return;
        }

        setEmail(profile?.email ?? data.user.email ?? null);
        setRole(profile?.role ?? "citizen");
        setIssueCount(count ?? 0);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Unable to load account.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const roleLabel = useMemo(() => {
    if (!role) return "-";
    if (role === "admin") return "Admin";
    if (role === "authority") return "Authority";
    return "Citizen";
  }, [role]);

  const logout = async () => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return <section className="surface-card mx-auto w-full max-w-md p-4 text-sm text-slate-600">Loading account...</section>;
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">My Account</h1>
      <div className="surface-card space-y-3 p-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-slate-700"><span className="font-semibold">Email:</span> {email ?? "-"}</p>
        <p className="text-sm text-slate-700"><span className="font-semibold">Role:</span> {roleLabel}</p>
        <p className="text-sm text-slate-700"><span className="font-semibold">Issues reported:</span> {issueCount}</p>
        <button type="button" onClick={() => void logout()} className="btn-secondary w-full py-2.5">Logout</button>
      </div>
    </section>
  );
}
