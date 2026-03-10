"use client";

import Link from "next/link";
import { CivicLeaderboardPanel } from "@/components/civic/leaderboard-panel";

export default function LeaderboardPage() {
  return (
    <section className="mx-auto w-full max-w-4xl">
      <header className="surface-card mb-6 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--primary)" }}>Citizen Rankings</p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>Civic Leaderboard</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Citizens who actively participate in civic engagement by reporting issues, voting, and verifying resolutions.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/account" className="btn-secondary">Back to Account</Link>
          <Link href="/citizen/dashboard" className="btn-secondary">Dashboard</Link>
        </div>
      </header>

      <div className="surface-card p-5 sm:p-6">
        <CivicLeaderboardPanel limit={100} showMyRank={true} />
      </div>
    </section>
  );
}
