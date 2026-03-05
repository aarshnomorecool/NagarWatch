"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MapboxMap, MapLayerMouseEvent } from "mapbox-gl";
import { defaultMapCenter, getMapboxToken } from "@/lib/mapbox";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import type { DbIssue } from "@/types/database";

type MapboxModule = typeof import("mapbox-gl");

const statusColorMap: Record<DbIssue["status"], string> = {
  pending: "#dc2626",
  in_progress: "#eab308",
  resolved: "#16a34a",
};

function statusLabel(status: DbIssue["status"]) {
  if (status === "in_progress") return "In Progress";
  if (status === "resolved") return "Resolved";
  return "Unresolved";
}

function setLayerVisibility(map: MapboxMap, layerId: string, visibility: "visible" | "none") {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visibility);
  }
}

export function IssueMap() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxModuleRef = useRef<MapboxModule | null>(null);

  const [issues, setIssues] = useState<DbIssue[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"marker" | "heatmap">("marker");

  const token = useMemo(() => getMapboxToken(), []);
  const tokenMissing = !token;

  useEffect(() => {
    if (tokenMissing) return;

    let isUnmounted = false;

    const loadIssues = async () => {
      setIsLoadingIssues(true);
      setIssuesError(null);

      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setIssuesError("Supabase is not configured yet.");
        setIsLoadingIssues(false);
        return;
      }

      const { data, error } = await supabase
        .from("issues")
        .select("id,title,description,category,latitude,longitude,image_url,status,created_by,created_at,upvote_count")
        .order("created_at", { ascending: false });

      if (isUnmounted) return;

      if (error) {
        setIssuesError(error.message);
      } else {
        setIssues(data ?? []);
      }

      setIsLoadingIssues(false);
    };

    void loadIssues();

    return () => {
      isUnmounted = true;
    };
  }, [tokenMissing]);

  useEffect(() => {
    if (tokenMissing || !mapContainerRef.current || mapRef.current) return;

    const initialize = async () => {
      const mapboxModule = await import("mapbox-gl");
      mapboxModuleRef.current = mapboxModule;

      const mapboxgl = mapboxModule.default;
      mapboxgl.accessToken = token;

      const mapInstance = new mapboxgl.Map({
        container: mapContainerRef.current as HTMLDivElement,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [defaultMapCenter.longitude, defaultMapCenter.latitude],
        zoom: 12,
        attributionControl: false,
      });

      mapRef.current = mapInstance;
      mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

      mapInstance.on("load", () => {
        setIsMapReady(true);
      });

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            mapInstance.flyTo({
              center: [position.coords.longitude, position.coords.latitude],
              zoom: 14,
              essential: true,
            });
          },
          () => {
            return;
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000,
          }
        );
      }
    };

    void initialize();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [token, tokenMissing]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !mapboxModuleRef.current) return;

    const map = mapRef.current;
    const mapboxgl = mapboxModuleRef.current.default;

    const features = issues.map((issue) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [issue.longitude, issue.latitude] as [number, number],
      },
      properties: {
        issue_id: issue.id,
        category: issue.category,
        upvote_count: issue.upvote_count,
        heat_intensity: 1 + Math.min(issue.upvote_count / 10, 8),
        status: issue.status,
        status_label: statusLabel(issue.status),
      },
    }));

    const sourceData = {
      type: "FeatureCollection" as const,
      features,
    };

    if (!map.getSource("issues")) {
      map.addSource("issues", {
        type: "geojson",
        data: sourceData,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "issues",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1d4ed8",
          "circle-radius": ["step", ["get", "point_count"], 18, 20, 24, 50, 30],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "issue-heatmap",
        type: "heatmap",
        source: "issues",
        maxzoom: 16,
        paint: {
          "heatmap-weight": ["coalesce", ["get", "heat_intensity"], 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 12, 1.4, 16, 2],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(59,130,246,0)",
            0.2,
            "#60a5fa",
            0.4,
            "#facc15",
            0.7,
            "#f97316",
            1,
            "#dc2626",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 18, 12, 30, 16, 44],
          "heatmap-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "issues",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "unclustered-issues",
        type: "circle",
        source: "issues",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "status"],
            "pending",
            statusColorMap.pending,
            "in_progress",
            statusColorMap.in_progress,
            "resolved",
            statusColorMap.resolved,
            statusColorMap.pending,
          ],
          "circle-radius": 8,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "unclustered-labels",
        type: "symbol",
        source: "issues",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": [
            "concat",
            ["get", "category"],
            "\n▲ ",
            ["to-string", ["get", "upvote_count"]],
            " · ",
            ["get", "status_label"],
          ],
          "text-size": 10,
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.2,
        },
      });

      map.on("click", "clusters", (event: MapLayerMouseEvent) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
        const clusterId = feature?.properties?.cluster_id as number | undefined;

        if (clusterId === undefined || !feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = feature.geometry.coordinates;

        const source = map.getSource("issues") as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error || zoom === null || zoom === undefined) return;

          map.easeTo({
            center: coordinates as [number, number],
            zoom,
            duration: 400,
          });
        });
      });

      map.on("click", "unclustered-issues", (event: MapLayerMouseEvent) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ["unclustered-issues"] })[0];
        const issueId = feature?.properties?.issue_id as string | undefined;
        if (issueId) {
          router.push(`/issue/${issueId}`);
        }
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "unclustered-issues", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "unclustered-issues", () => {
        map.getCanvas().style.cursor = "";
      });

      setLayerVisibility(map, "issue-heatmap", mapMode === "heatmap" ? "visible" : "none");
      setLayerVisibility(map, "clusters", mapMode === "marker" ? "visible" : "none");
      setLayerVisibility(map, "cluster-count", mapMode === "marker" ? "visible" : "none");
      setLayerVisibility(map, "unclustered-issues", mapMode === "marker" ? "visible" : "none");
      setLayerVisibility(map, "unclustered-labels", mapMode === "marker" ? "visible" : "none");
    } else {
      (map.getSource("issues") as GeoJSONSource).setData(sourceData);
    }

    if (issues.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      issues.forEach((issue) => {
        bounds.extend([issue.longitude, issue.latitude]);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
        });
      }
    }
  }, [issues, isMapReady, mapMode, router]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
      return;
    }

    const map = mapRef.current;

    setLayerVisibility(map, "issue-heatmap", mapMode === "heatmap" ? "visible" : "none");
    setLayerVisibility(map, "clusters", mapMode === "marker" ? "visible" : "none");
    setLayerVisibility(map, "cluster-count", mapMode === "marker" ? "visible" : "none");
    setLayerVisibility(map, "unclustered-issues", mapMode === "marker" ? "visible" : "none");
    setLayerVisibility(map, "unclustered-labels", mapMode === "marker" ? "visible" : "none");
  }, [isMapReady, mapMode]);

  const statusText = (() => {
    if (tokenMissing) return "Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to render the city map.";
    if (!isMapReady) return "Loading map...";
    if (isLoadingIssues) return "Loading issues...";
    if (issuesError) return `Could not load issues: ${issuesError}`;
    return mapMode === "heatmap"
      ? `${issues.length} issue${issues.length === 1 ? "" : "s"} shown as civic hotspot heat zones.`
      : `${issues.length} issue${issues.length === 1 ? "" : "s"} loaded in marker mode.`;
  })();

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border border-slate-300 bg-white p-1 text-xs font-medium text-slate-700">
        <button
          type="button"
          onClick={() => setMapMode("marker")}
          className={`rounded px-3 py-1.5 ${mapMode === "marker" ? "bg-slate-900 text-white" : "text-slate-700"}`}
        >
          Marker Mode
        </button>
        <button
          type="button"
          onClick={() => setMapMode("heatmap")}
          className={`rounded px-3 py-1.5 ${mapMode === "heatmap" ? "bg-slate-900 text-white" : "text-slate-700"}`}
        >
          Heatmap Mode
        </button>
      </div>

      <div
        ref={mapContainerRef}
        className="h-[65vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        style={{ touchAction: "pan-x pan-y" }}
      />
      <p className="text-xs text-slate-500">{statusText}</p>
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-red-100 px-2 py-1">Red: Unresolved</span>
        <span className="rounded-full bg-yellow-100 px-2 py-1">Yellow: In Progress</span>
        <span className="rounded-full bg-green-100 px-2 py-1">Green: Resolved</span>
      </div>
    </div>
  );
}
