import { CivicAlertsPanel } from "@/components/admin/civic-alerts-panel";

export default function AdminBroadcastPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
        Civic Emergency Broadcast
      </h1>
      <p className="text-sm text-muted">
        Publish location-based emergency alerts to citizens in affected areas. Pin the exact location
        on the map or describe the address — the system will geocode it automatically.
      </p>
      <CivicAlertsPanel />
    </section>
  );
}
