"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/container";
import { IssueList } from "@/components/issues/issue-list";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getCurrentUserRole } from "@/lib/user-profile";

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      setLoggedIn(false);
      return;
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getUser();
      setLoggedIn(Boolean(data.user));

      if (data.user) {
        const role = await getCurrentUserRole();
        if (role === "authority" || role === "admin") {
          router.replace("/admin/dashboard");
        }
      }
    };

    void loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void loadSession();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <Container className="space-y-6">
      <section className="surface-card overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--primary)" }}>Mobile-First Civic Reporting</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>Report city issues in minutes with CivicSync</h1>
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
            {!loggedIn ? (
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
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Recent Issues</h2>
        <IssueList />
      </section>
    </Container>
  );
}