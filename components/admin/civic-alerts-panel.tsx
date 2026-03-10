"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ensureUserProfile } from "@/lib/user-profile";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { getMapboxToken } from "@/lib/mapbox";
import type { DbAlert, UserRole } from "@/types/database";

type AlertDraft = {
  title: string;
  message: string;
  address: string;
  roadName: string;
  areaName: string;
  radiusKm: string;
};

const INITIAL_DRAFT: AlertDraft = {
  title: "",
  message: "",
  address: "",
  roadName: "",
  areaName: "",
  radiusKm: "2",
};

type PinnedLocation = {
  lat: number;
  lng: number;
  displayName?: string;
};

async function geocodeAddress(query: string, token: string): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim() || !token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as { features?: Array<{ geometry: { coordinates: [number, number] } }> };
    const feature = data.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function reverseGeocodeCoords(lat: number, lng: number, token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&types=address,place,locality`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json() as { features?: Array<{ place_name?: string }> };
    return data.features?.[0]?.place_name ?? null;
  } catch {
    return null;
  }
}

export function CivicAlertsPanel() {
  const [alerts, setAlerts] = useState<DbAlert[]>([]);
  const [draft, setDraft] = useState<AlertDraft>(INITIAL_DRAFT);
  const [role, setRole] = useState<UserRole | null>(null);
  const [authorityId, setAuthorityId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geocodingBusy, setGeocodingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<PinnedLocation | null>(null);
  const [skipMap, setSkipMap] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);

  const token = getMapboxToken();
  const hasToken = Boolean(token);

  const canCreate = role === "authority" || role === "admin";

  // Load user profile + existing alerts
  useEffect(() => {
    let active = true;

    const load = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setError("Supabase is not configured yet.");
        return;
      }

      const profile = await ensureUserProfile();
      if (!active) return;

      setRole(profile?.role ?? null);
      setAuthorityId(profile?.id ?? null);

      const { data, error: alertError } = await supabase
        .from("alerts")
        .select("id,title,message,lat,lng,radius_km,authority_id,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (!active) return;

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

  // Initialize map once canCreate is known and the container is rendered
  useEffect(() => {
    if (!hasToken || skipMap || !canCreate || !mapContainerRef.current || mapRef.current) return;

    let mapInstance: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    const initMap = async () => {
      if (!mapContainerRef.current) return;

      const mapboxModule = await import("mapbox-gl");
      const mapboxgl = mapboxModule.default;
      mapboxgl.accessToken = token;

      mapInstance = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [72.8777, 19.076], // Mumbai default; flies to user location if available
        zoom: 12,
        attributionControl: false,
      });

      mapRef.current = mapInstance;
      mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      mapInstance.on("load", () => setMapReady(true));

      // Fly to user's location
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            mapInstance?.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: 14,
              essential: true,
            });
          },
          () => undefined,
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
        );
      }

      // Click on map → drop hazard marker
      mapInstance.on("click", async (e: { lngLat: { lat: number; lng: number } }) => {
        const { lng, lat } = e.lngLat;

        if (markerRef.current) {
          // Move existing marker
          markerRef.current.setLngLat([lng, lat]);
        } else {
          // Create custom hazard marker element
          const el = document.createElement("div");
          el.style.cssText = [
            "background:#f59e0b",
            "border:2.5px solid #d97706",
            "border-radius:50%",
            "width:36px",
            "height:36px",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "font-size:20px",
            "cursor:pointer",
            "box-shadow:0 2px 14px rgba(245,158,11,0.55)",
            "user-select:none",
          ].join(";");
          el.textContent = "⚠";
          el.title = "Alert location";

          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([lng, lat])
            .addTo(mapInstance!);
          markerRef.current = marker;
        }

        setPinnedLocation({ lat, lng });

        // Reverse-geocode to show human-readable location name
        if (token) {
          const name = await reverseGeocodeCoords(lat, lng, token);
          if (name) {
            setPinnedLocation({ lat, lng, displayName: name });
          }
        }
      });
    };

    void initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        setMapReady(false);
      }
    };
  // canCreate and skipMap changes trigger re-init
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, skipMap, canCreate, token]);

  const clearPin = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    setPinnedLocation(null);
  }, []);

  const createAlert = async () => {
    if (!canCreate || !authorityId || busy || geocodingBusy) return;

    const title = draft.title.trim();
    const message = draft.message.trim();
    const radiusKm = Number(draft.radiusKm);

    if (!title || !message) {
      setError("Enter a title and message for the alert.");
      return;
    }

    if (Number.isNaN(radiusKm) || radiusKm <= 0) {
      setError("Enter a valid radius (km).");
      return;
    }

    let coords: { lat: number; lng: number } | null = pinnedLocation
      ? { lat: pinnedLocation.lat, lng: pinnedLocation.lng }
      : null;

    if (!coords) {
      const addressQuery = [draft.address, draft.roadName, draft.areaName].filter(Boolean).join(", ");
      if (!addressQuery) {
        setError("Pin a location on the map, or fill in address / area fields so the location can be found.");
        return;
      }
      if (!hasToken) {
        setError("Mapbox token not set — cannot geocode address. Please add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local.");
        return;
      }
      setGeocodingBusy(true);
      coords = await geocodeAddress(addressQuery, token);
      setGeocodingBusy(false);
      if (!coords) {
        setError("Could not find that location. Try being more specific, or drop a pin on the map.");
        return;
      }
    }

    setBusy(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) throw new Error("Supabase is not configured yet.");

      const { error: insertError } = await supabase.from("alerts").insert({
        title,
        message,
        lat: coords.lat,
        lng: coords.lng,
        radius_km: radiusKm,
        authority_id: authorityId,
      });

      if (insertError) throw new Error(insertError.message);

      const { data: latestRows, error: latestError } = await supabase
        .from("alerts")
        .select("id,title,message,lat,lng,radius_km,authority_id,created_at")
        .order("created_at", { ascending: false })
        .limit(12);

      if (latestError) throw new Error(latestError.message);

      setAlerts(latestRows ?? []);
      setDraft(INITIAL_DRAFT);
      clearPin();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not publish alert.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Create broadcast form */}
      <section className="surface-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Create Emergency Broadcast</h2>
            <p className="mt-0.5 text-xs text-muted">Publish a civic alert to all citizens in the affected area.</p>
          </div>
          <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)" }}>
            ⚠ {alerts.length} active
          </span>
        </div>

        {!canCreate ? (
          <p className="text-sm text-muted">Only authority or admin accounts can publish alerts.</p>
        ) : (
          <>
            {/* Text fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={draft.title}
                onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                className="input-base"
                placeholder="Alert title  (e.g. Water pipeline burst on Link Road)"
                disabled={busy}
              />
              <textarea
                value={draft.message}
                onChange={(e) => setDraft((p) => ({ ...p, message: e.target.value }))}
                className="input-base resize-none"
                placeholder="Describe the emergency or hazard…"
                rows={2}
                disabled={busy}
              />
              <input
                value={draft.address}
                onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
                className="input-base"
                placeholder="Street / building address"
                disabled={busy}
              />
              <input
                value={draft.roadName}
                onChange={(e) => setDraft((p) => ({ ...p, roadName: e.target.value }))}
                className="input-base"
                placeholder="Road name  (e.g. MG Road, Linking Road)"
                disabled={busy}
              />
              <input
                value={draft.areaName}
                onChange={(e) => setDraft((p) => ({ ...p, areaName: e.target.value }))}
                className="input-base"
                placeholder="Area / locality / ward  (e.g. Andheri West)"
                disabled={busy}
              />
              <div className="flex items-center gap-2">
                <input
                  value={draft.radiusKm}
                  onChange={(e) => setDraft((p) => ({ ...p, radiusKm: e.target.value }))}
                  className="input-base w-28"
                  placeholder="Radius"
                  type="number"
                  min="0.1"
                  step="0.1"
                  disabled={busy}
                />
                <span className="text-sm text-muted whitespace-nowrap">km radius</span>
              </div>
            </div>

            {/* Map pinning section */}
            <div className="mt-4">
              {skipMap ? (
                <div
                  className="rounded-lg border-2 border-dashed px-4 py-3 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  Map pinning skipped — location will be geocoded from the address fields above.{" "}
                  <button
                    type="button"
                    onClick={() => setSkipMap(false)}
                    className="underline font-medium"
                    style={{ color: "var(--primary)" }}
                  >
                    Show map
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      📍 Click on the map to pin the exact alert location
                    </p>
                    <button
                      type="button"
                      onClick={() => setSkipMap(true)}
                      className="text-xs underline hover:no-underline"
                      style={{ color: "var(--muted)" }}
                    >
                      Skip map pinning
                    </button>
                  </div>

                  {!hasToken ? (
                    <div
                      className="rounded-md border p-3 text-sm text-muted"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Mapbox token not configured. Address fields will be geocoded on submit.
                    </div>
                  ) : (
                    <>
                      <div
                        ref={mapContainerRef}
                        className="overflow-hidden rounded-lg border"
                        style={{ height: "300px", borderColor: "var(--border)" }}
                      />
                      {!mapReady && (
                        <p className="mt-1 text-xs text-muted">Loading map…</p>
                      )}
                    </>
                  )}

                  {pinnedLocation && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                        ⚠ Pin set
                        {pinnedLocation.displayName
                          ? `: ${pinnedLocation.displayName}`
                          : ` at ${pinnedLocation.lat.toFixed(5)}, ${pinnedLocation.lng.toFixed(5)}`}
                      </span>
                      <button
                        type="button"
                        onClick={clearPin}
                        className="text-xs underline text-muted"
                      >
                        Clear pin
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Submit */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void createAlert()}
                className="btn-warning px-5 py-2 text-sm"
                disabled={busy || geocodingBusy}
              >
                {geocodingBusy ? "Locating address…" : busy ? "Publishing…" : "Publish Alert"}
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Active broadcasts list */}
      {alerts.length > 0 && (
        <section className="surface-card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Active Broadcasts ({alerts.length})
          </h3>
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
                  {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)} · {alert.radius_km} km radius
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
