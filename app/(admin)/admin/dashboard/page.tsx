import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { CivicAlertsPanel } from "@/components/admin/civic-alerts-panel";

export default function AdminDashboardPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>Admin Dashboard</h1>
      <p className="text-sm text-muted">Track issue operations, prioritize by citizen impact, and manage resolution workflows.</p>
      <CivicAlertsPanel />
      <AdminDashboard />
    </section>
  );
}