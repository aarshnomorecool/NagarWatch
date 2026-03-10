"use client";

import { useEffect, useState } from "react";
import { ensureUserProfile } from "@/lib/user-profile";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import type { DbAlert, UserRole } from "@/types/database";

type AlertDraft = {
  title: string;
  message: string;
  lat: string;
  lng: string;
  radiusKm: string;
};

const INITIAL_DRAFT: AlertDraft = {
  title: "",
  message: "",
  lat: "",
  lng: "",
  radiusKm: "2",
};

export function CivicAlertsPanel() {
  const [alerts, setAlerts] = useState<DbAlert[]>([]);
  const [draft, setDraft] = useState<AlertDraft>(INITIAL_DRAFT);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        return;
      }

      const profile = await ensureUserProfile();
      if (!active) {
        return;
      }

      setRole(profile?.role ?? null);
      setAuthorityId(profile?.id ?? null);

      const { data, error: alertError } = await supabase
        .from("alerts")
        .select("id,title,message,lat,lng,radius_km,authority_id,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (!active) {
        return;
      }

      if (alertError) {
        setError(alertError.message);
      } else {
        setAlerts(data ?? []);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const canCreate = role === "authority" || role === "admin";

  const createAlert = async () => {
    if (!canCreate || !authorityId || busy) {
      return;
    }

    const title = draft.title.trim();
    const message = draft.message.trim();
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    const radiusKm = Number(draft.radiusKm);

    if (!title || !message || Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusKm) || radiusKm <= 0) {
      setError("Enter title, message, coordinates, and radius.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        throw new Error("Supabase is not configured yet.");
      }

      const row = {
        title,
        message,
        lat,
        lng,
        radius_km: radiusKm,
        authority_id: authorityId,
      };

      const { error: insertError } = await supabase.from("alerts").insert(row);
      if (insertError) {
        throw new Error(insertError.message);
      }

      const { data: latestRows, error: latestError } = await supabase
        .from("alerts")
        .select("id,title,message,lat,lng,radius_km,authority_id,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (latestError) {
        throw new Error(latestError.message);
      }

      setAlerts(latestRows ?? []);
      setDraft(INITIAL_DRAFT);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create alert.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Civic Emergency Broadcast</h2>
        <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}>⚠ {alerts.length}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          className="input-base"
          placeholder="Alert title"
          disabled={!canCreate || busy}
        />
        <input
          value={draft.message}
          onChange={(event) => setDraft((prev) => ({ ...prev, message: event.target.value }))}
          className="input-base lg:col-span-2"
          placeholder="Alert message"
          disabled={!canCreate || busy}
        />
        <input
          value={draft.lat}
          onChange={(event) => setDraft((prev) => ({ ...prev, lat: event.target.value }))}
          className="input-base"
          placeholder="Lat"
          disabled={!canCreate || busy}
        />
        <input
          value={draft.lng}
          onChange={(event) => setDraft((prev) => ({ ...prev, lng: event.target.value }))}
          className="input-base"
          placeholder="Lng"
          disabled={!canCreate || busy}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={draft.radiusKm}
          onChange={(event) => setDraft((prev) => ({ ...prev, radiusKm: event.target.value }))}
          className="input-base w-24"
          placeholder="Radius"
          disabled={!canCreate || busy}
        />
        <span className="text-xs text-muted">km</span>
        <button
          type="button"
          onClick={() => void createAlert()}
          className="btn-warning px-3 py-1.5 text-xs"
          disabled={!canCreate || busy}
        >
          {busy ? "Sending..." : "Publish Alert"}
        </button>
      </div>

      {!canCreate ? <p className="mt-2 text-xs text-muted">Only authority/admin can publish alerts.</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-3 space-y-2">
        {alerts.slice(0, 6).map((alert) => (
          <article key={alert.id} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, #f59e0b 10%, var(--bg))" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>⚠ {alert.title}</p>
            <p className="mt-1 text-xs text-muted">{alert.message}</p>
            <p className="mt-1 text-[11px] text-muted">{alert.lat.toFixed(4)}, {alert.lng.toFixed(4)} · {alert.radius_km} km</p>
          </article>
        ))}
      </div>
    </section>
  );
}
