import { IssuesTable } from "@/components/admin/issues-table";

export default function AdminIssuesPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Manage Issues</h1>
      <p className="text-sm text-muted">Review real complaints and operational status from the database.</p>
      <IssuesTable />
    </section>
  );
}