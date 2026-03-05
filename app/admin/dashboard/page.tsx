import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default function AdminDashboardPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin Dashboard</h1>
      <p className="text-sm text-slate-600">Track issue operations, prioritize by citizen impact, and manage resolution workflows.</p>
      <AdminDashboard />
    </section>
  );
}