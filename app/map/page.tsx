import { IssueMap } from "@/components/map/IssueMap";

export default function MapPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>City Map</h1>
      <p className="text-sm text-muted">Browse active reports and identify civic hotspots by location.</p>
      <IssueMap />
    </section>
  );
}