"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { defaultMapCenter, getMapboxToken } from "@/lib/mapbox";

export function CityMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: MapboxMap | null = null;
    const token = getMapboxToken();

    if (!token || !mapContainerRef.current) {
      return;
    }

    const initialize = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({
        container: mapContainerRef.current as HTMLDivElement,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [defaultMapCenter.longitude, defaultMapCenter.latitude],
        zoom: 11,
      });

      map.on("load", () => {
        setReady(true);
      });
    };

    void initialize();

    return () => {
      map?.remove();
    };
  }, []);

  const tokenMissing = !getMapboxToken();

  return (
    <div className="space-y-2">
      <div
        ref={mapContainerRef}
        className="h-[55vh] min-h-[320px] w-full overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--surface) 72%, var(--bg))" }}
      />
      <p className="text-xs text-muted">
        {tokenMissing
          ? "Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to render the live city map."
          : ready
            ? "Live map loaded."
            : "Loading map..."}
      </p>
    </div>
  );
}