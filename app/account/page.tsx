"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

export default function AccountPage() {
  return (
    <Suspense fallback={<section className="surface-card mx-auto w-full max-w-md p-4 text-sm text-slate-600">Loading account...</section>}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [issueCount, setIssueCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
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

        const roleQuery = searchParams?.get("role");
        const preferredRole: UserRole | undefined = roleQuery === "authority" || roleQuery === "admin" ? "authority" : roleQuery === "citizen" ? "citizen" : undefined;

        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          router.replace("/login");
          return;
        }

        const ensuredProfile = await ensureUserProfile({ preferredRole });
        const profile = await getCurrentProfile();
        const currentId = profile?.id ?? ensuredProfile?.id ?? authData.user.id;

        const [{ count: registeredCount, error: countError }, { count: resolvedTotal, error: resolvedError }] = await Promise.all([
          supabase.from("issues").select("id", { head: true, count: "exact" }).eq("created_by", currentId),
          supabase.from("resolutions").select("id", { head: true, count: "exact" }).eq("resolved_by", currentId),
        ]);

        if (countError || resolvedError) {
          throw new Error(countError?.message ?? resolvedError?.message ?? "Unable to load account stats.");
        }

        if (!active) {
          return;
        }

      setEmail(profile?.email ?? ensuredProfile?.email ?? authData.user.email ?? null);
      setRole(profile?.role ?? "citizen");
      setIssueCount(registeredCount ?? 0);
      setResolvedCount(resolvedTotal ?? 0);
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
  }, [router, searchParams]);

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
    router.push("/");
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
        <p className="text-sm text-slate-700"><span className="font-semibold">Complaints registered:</span> {issueCount}</p>
        <p className="text-sm text-slate-700"><span className="font-semibold">Complaints resolved:</span> {resolvedCount}</p>
        <button type="button" onClick={() => void logout()} className="btn-secondary w-full py-2.5">Logout</button>
      </div>
    </section>
  );
}
