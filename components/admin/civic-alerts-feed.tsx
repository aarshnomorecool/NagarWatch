"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import type { DbAlert } from "@/types/database";

export function CivicAlertsFeed() {
  const [alerts, setAlerts] = useState<DbAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("alerts")
        .select("id,title,message,lat,lng,radius_km,authority_id,created_at")
        .order("created_at", { ascending: false })
        .limit(6);

      if (!active) return;

      setAlerts(data ?? []);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="surface-card p-4 text-sm text-muted">Loading alerts…</div>;
  if (alerts.length === 0) return null;

  return (
    <section className="surface-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Emergency Broadcasts</h2>
        <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}>
          ⚠ {alerts.length}
        </span>
      </div>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <article
            key={alert.id}
            className="rounded-md border px-3 py-2"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, #f59e0b 10%, var(--bg))",
            }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>⚠ {alert.title}</p>
            <p className="mt-1 text-xs text-muted">{alert.message}</p>
            <p className="mt-1 text-[11px] text-muted">
              Within {alert.radius_km} km · {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
