"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getHighRiskZones, getRiskZonesNear } from "@/lib/infrastructure-risk";
import type { DbInfrastructureRiskZone } from "@/types/database";

interface InfrastructureRiskPanelProps {
  userLat?: number;
  userLng?: number;
  radiusKm?: number;
  showAllRisks?: boolean;
}

function getRiskLevelColor(riskLevel: string) {
  switch (riskLevel) {
    case "critical":
      return { bg: "rgba(220, 38, 38, 0.15)", border: "rgba(220, 38, 38, 0.5)", text: "#dc2626" };
    case "high":
      return { bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.5)", text: "#f97316" };
    case "medium":
      return { bg: "rgba(234, 179, 8, 0.15)", border: "rgba(234, 179, 8, 0.5)", text: "#eab308" };
    default:
      return { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.5)", text: "#22c55e" };
  }
}

function getRiskTypeLabel(riskType: string) {
  const labels: Record<string, string> = {
    road_hazard: "🛣️ Road Hazard",
    drainage: "💧 Drainage Issue",
    electrical: "⚡ Electrical Hazard",
    water: "💦 Water Leak",
    other: "⚠️ Other Hazard",
  };
  return labels[riskType] || "Unknown Risk";
}

export function InfrastructureRiskPanel({
  userLat,
  userLng,
  radiusKm = 5,
  showAllRisks = false,
}: InfrastructureRiskPanelProps) {
  const [zones, setZones] = useState<DbInfrastructureRiskZone[]>([]);
  const [currentLat, setCurrentLat] = useState(userLat || 0);
  const [currentLng, setCurrentLng] = useState(userLng || 0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRiskZones = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        setLoading(false);
        return;
      }

      try {
        let lat = currentLat;
        let lng = currentLng;

        // If no coordinates provided, load all high-risk zones
        if (!userLat || !userLng) {
          const highRisks = await getHighRiskZones(supabase);
          if (active) {
            setZones(highRisks);
            setLoading(false);
          }
          return;
        }

        if (lat && lng) {
          setCurrentLat(lat);
          setCurrentLng(lng);

          if (showAllRisks) {
            const highRisks = await getHighRiskZones(supabase);
            if (active) {
              setZones(highRisks);
            }
          } else {
            const nearbyZones = await getRiskZonesNear(supabase, lat, lng, radiusKm);
            if (active) {
              setZones(nearbyZones);
            }
          }
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load risk zones");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRiskZones();

    return () => {
      active = false;
    };
  }, [userLat, userLng, radiusKm, showAllRisks]);

  if (loading) {
    return <div className="surface-card p-4 text-sm text-muted">Loading risk zones...</div>;
  }

  if (error) {
    return <div className="surface-card p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <section className="surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {showAllRisks ? "Infrastructure Risk Zones" : "Nearby Risk Zones"}
        </h2>
        <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}>
          ⚠️ {zones.length}
        </span>
      </div>

      {zones.length > 0 ? (
        <div className="mt-3 space-y-2">
          {zones.map((zone) => {
            const colors = getRiskLevelColor(zone.risk_level);
            return (
              <article
                key={zone.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: colors.border,
                  background: colors.bg,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: colors.text }}>
                      {getRiskTypeLabel(zone.risk_type)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{zone.description}</p>
                    <p className="mt-2 text-xs text-muted">
                      📍 {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)}
                      {zone.radius_meters > 0 && ` • Radius: ${(zone.radius_meters / 1000).toFixed(1)} km`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block rounded-full px-2 py-1 text-xs font-bold" style={{ background: colors.text, color: "white", opacity: 0.9 }}>
                      {zone.risk_level.toUpperCase()}
                    </span>
                    <p className="mt-2 text-xs text-muted">{zone.issue_count} reports</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed p-4 text-sm text-muted" style={{ borderColor: "var(--border)" }}>
          {showAllRisks ? "No high-risk zones detected." : "No infrastructure risk zones nearby."}
        </p>
      )}

      <div className="mt-3 text-xs text-muted">
        <p className="font-semibold mb-1">Risk Assessment Information:</p>
        <ul className="space-y-1 pl-3">
          <li>🔴 <strong>Critical:</strong> Immediate safety hazard, requires urgent attention</li>
          <li>🟠 <strong>High:</strong> Significant infrastructure risks detected in area</li>
          <li>🟡 <strong>Medium:</strong> Moderate risk level requiring monitoring</li>
          <li>🟢 <strong>Low:</strong> Minor issue with low urgency</li>
        </ul>
      </div>
    </section>
  );
}
