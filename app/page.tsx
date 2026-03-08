"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/container";
import { IssueList } from "@/components/issues/issue-list";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getCurrentUserRole } from "@/lib/user-profile";

export default function HomePage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "guest" | "citizen" | "authority">("checking");
  const [issueFilter, setIssueFilter] = useState<"latest" | "pending" | "in_progress" | "resolved">("latest");

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setAuthState("guest");
      return;
    }

    const loadSession = async () => {
      const { user, error } = await getAuthUserSafe();
      if (!active) {
        return;
      }

      if (error) {
        setAuthState("guest");
        return;
      }

      if (!user) {
        setAuthState("guest");
        return;
      }

      const role = await getCurrentUserRole();
      if (!active) {
        return;
      }

      if (role === "authority" || role === "admin") {
        setAuthState("authority");
        router.replace("/admin/dashboard");
        return;
      }

      setAuthState("citizen");
    };

    void loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void loadSession();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  if (authState === "checking" || authState === "authority") {
    return (
      <Container>
        <section className="surface-card p-5 text-sm text-muted">Loading your dashboard...</section>
      </Container>
    );
  }

  const isGuest = authState === "guest";

  return (
    <Container className="space-y-6">
      <section className="surface-card overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--primary)" }}>Mobile-First Civic Reporting</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>Report city issues in minutes with NagarWatch</h1>
            <p className="mt-3 text-sm sm:text-base" style={{ color: "var(--muted)" }}>
              Citizens can report potholes, garbage, and broken streetlights instantly, while authorities track and resolve them from a central dashboard.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/report" className="btn-primary">
                Report Issue
              </Link>
              <Link href="/map" className="btn-secondary">
                View Map
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            {isGuest ? (
              <article className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--primary)" }}>Launch as Citizen</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text)" }}>Track civic issues, post complaints, and vote on ongoing problems.</p>
                <div className="mt-3 flex gap-2">
                  <Link href="/login?role=citizen" className="btn-primary px-3 py-1.5 text-xs">Login</Link>
                  <Link href="/signup?role=citizen" className="btn-secondary px-3 py-1.5 text-xs">Create Account</Link>
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Recent Issues</h2>
          <select
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value as "latest" | "pending" | "in_progress" | "resolved")}
            className="input-base w-auto min-w-44"
            aria-label="Filter recent issues by status"
          >
            <option value="latest">Latest Issues</option>
            <option value="pending">Pending</option>
            <option value="in_progress">Under Process</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <IssueList statusFilter={issueFilter} />
      </section>
    </Container>
  );
}