/**
 * @fileoverview LocationMap — a Google Map that drops a marker on each point,
 * fitting bounds to show them all, with optional clustering when there are
 * many. Renders nothing when no key is configured or no points are mappable
 * (progressive enhancement).
 *
 * Used anywhere location-bearing rows are shown (permit history, permit
 * viewer, query results with lat/lng or SODA `location`).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useRef, useState } from "react";

import { loadGoogleMaps, type MapPoint } from "./loader";

export interface LocationMapProps {
  points: MapPoint[];
  /** CSS height for the map surface. */
  height?: number;
  /** Cluster markers when the count exceeds this (default 20). */
  clusterThreshold?: number;
}

export function LocationMap({ points, height = 280, clusterThreshold = 20 }: LocationMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "disabled">("loading");

  useEffect(() => {
    let cancelled = false;
    if (!points.length) {
      setStatus("disabled");
      return;
    }
    void (async () => {
      const google = await loadGoogleMaps();
      if (cancelled) return;
      if (!google?.maps || !ref.current) {
        setStatus("disabled");
        return;
      }
      try {
        const map = new google.maps.Map(ref.current, {
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: false,
          clickableIcons: false,
          colorScheme: "DARK",
        });
        const bounds = new google.maps.LatLngBounds();
        const markers = points.map((p) => {
          const position = { lat: p.lat, lng: p.lng };
          bounds.extend(position);
          return new google.maps.marker.AdvancedMarkerElement({ position, title: p.title, map });
        });
        map.fitBounds(bounds);
        if (points.length === 1) map.setZoom(16);

        // Optional clustering for dense sets, loaded from CDN on demand.
        if (markers.length > clusterThreshold) {
          try {
            // URL kept in a variable so TS/Vite don't try to resolve it at build.
            const clustererUrl = "https://unpkg.com/@googlemaps/markerclusterer@2/dist/index.esm.js";
            const mod: any = await import(/* @vite-ignore */ clustererUrl);
            if (!cancelled && mod?.MarkerClusterer) {
              new mod.MarkerClusterer({ map, markers });
            }
          } catch {
            /* markers already on the map; clustering is best-effort */
          }
        }
        setStatus("ready");
      } catch {
        setStatus("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, clusterThreshold]);

  if (status === "disabled" && !points.length) return null;

  return (
    <div className="relative overflow-hidden rounded-md ring-1 ring-border/40">
      <div ref={ref} style={{ height }} className="w-full" />
      {status !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {status === "loading" ? "Loading map…" : "Map unavailable (set GOOGLE_MAPS_API_KEY to enable)."}
        </div>
      ) : null}
    </div>
  );
}
