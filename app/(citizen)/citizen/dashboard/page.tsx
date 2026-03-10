import Link from "next/link";
import { IssueList } from "@/components/issues/issue-list";
import { CivicLeaderboardPanel } from "@/components/civic/leaderboard-panel";
import { InfrastructureRiskPanel } from "@/components/civic/infrastructure-risk-panel";
import { CivicAlertsFeed } from "@/components/admin/civic-alerts-feed";

export default function CitizenDashboardPage() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <header className="surface-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--primary)" }}>Citizen Dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>Your civic command center</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Report a new complaint, track nearby issues, and vote on what should be prioritized.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/report" className="btn-primary">Report New Issue</Link>
          <Link href="/citizen/reports" className="btn-secondary">My Reports</Link>
          <Link href="/map" className="btn-secondary">Open Live Map</Link>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-2">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Active Issues</h2>
          <IssueList />
        </div>
        <div className="space-y-5">
          <CivicLeaderboardPanel limit={5} showMyRank={true} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <CivicAlertsFeed />
        <InfrastructureRiskPanel showAllRisks={true} />
      </section>
    </section>
  );
}
