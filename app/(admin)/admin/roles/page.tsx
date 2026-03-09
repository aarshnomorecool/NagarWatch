import { RolesManager } from "@/components/admin/roles-manager";

export default function AdminRolesPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>Roles</h1>
      <p className="text-sm text-muted">Create and manage authority access levels from one place.</p>
      <RolesManager />
    </section>
  );
}
