/**
 * @fileoverview shadcn-style Leaflet map primitives.
 *
 * API (as requested): `<Map>` wraps `<MapTileLayer />`, `<MapMarker />`, and
 * `<MapMarkerClusterGroup>` (which clusters its `<MapMarker>` children). Built
 * on vanilla Leaflet + leaflet.markercluster so it is independent of
 * react-leaflet's React-version constraints.
 *
 * SSR-safe for Astro + Cloudflare Workers: Leaflet (which touches `window` at
 * import) is loaded via a dynamic `import()` inside an effect — never at module
 * top-level — so the server build never evaluates it. Children read the live
 * Leaflet `map`/`L` from context and imperatively manage their own layers,
 * rendering `null` until the map is ready.
 *
 * Tiles default to CARTO dark to match the Monolith dark theme; OSM keyless.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type * as L from "leaflet";

import { cn } from "@/lib/utils";

/** Leaflet runtime + the live map instance, provided to child layers. */
interface MapCtx {
  L: typeof L;
  map: L.Map;
}
const MapContext = createContext<MapCtx | null>(null);

/** A marker cluster group, provided to descendant markers when present. */
const ClusterContext = createContext<L.MarkerClusterGroup | null>(null);

const CARTO_DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export interface MapProps {
  center?: L.LatLngExpression;
  zoom?: number;
  /** When provided (and non-empty), the map fits these points instead of center/zoom. */
  bounds?: L.LatLngExpression[];
  className?: string;
  /** Pixel height of the map surface (default 280). */
  height?: number;
  children?: ReactNode;
}

/**
 * Root map. Creates the Leaflet map on mount (client only) and provides it to
 * child layers via context.
 */
export function Map({ center = [37.7749, -122.4194], zoom = 12, bounds, className, height = 280, children }: MapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ctx, setCtx] = useState<MapCtx | null>(null);

  useEffect(() => {
    let map: L.Map | undefined;
    let cancelled = false;
    void (async () => {
      const leaflet = (await import("leaflet")).default ?? (await import("leaflet"));
      await import("leaflet.markercluster");
      await import("leaflet/dist/leaflet.css");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      if (cancelled || !ref.current) return;

      // Default marker icon assets (Leaflet can't resolve them under a bundler).
      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      map = leaflet.map(ref.current, { scrollWheelZoom: false });
      if (bounds && bounds.length > 0) {
        map.fitBounds(leaflet.latLngBounds(bounds), { padding: [28, 28], maxZoom: 16 });
      } else {
        map.setView(center, zoom);
      }
      setCtx({ L: leaflet as typeof L, map });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("overflow-hidden rounded-md ring-1 ring-border/40", className)}>
      <div ref={ref} style={{ height }} className="w-full [&_.leaflet-container]:bg-muted" />
      {ctx ? <MapContext.Provider value={ctx}>{children}</MapContext.Provider> : null}
    </div>
  );
}

/** OpenStreetMap/CARTO tile layer (keyless). Dark tiles by default. */
export function MapTileLayer({ url = CARTO_DARK_URL, attribution = CARTO_ATTRIBUTION }: { url?: string; attribution?: string }) {
  const ctx = useContext(MapContext);
  useEffect(() => {
    if (!ctx) return;
    const layer = ctx.L.tileLayer(url, { attribution, maxZoom: 19 }).addTo(ctx.map);
    return () => {
      layer.remove();
    };
  }, [ctx, url, attribution]);
  return null;
}

/** A marker cluster group; clusters its `<MapMarker>` children. */
export function MapMarkerClusterGroup({ children }: { children?: ReactNode }) {
  const ctx = useContext(MapContext);
  const [group, setGroup] = useState<L.MarkerClusterGroup | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const g = (ctx.L as any).markerClusterGroup({ chunkedLoading: true });
    ctx.map.addLayer(g);
    setGroup(g);
    return () => {
      ctx.map.removeLayer(g);
      setGroup(null);
    };
  }, [ctx]);
  if (!group) return null;
  return <ClusterContext.Provider value={group}>{children}</ClusterContext.Provider>;
}

/** A single marker. Joins the nearest cluster group if present, else the map. */
export function MapMarker({ position, title }: { position: L.LatLngExpression; title?: string }) {
  const ctx = useContext(MapContext);
  const cluster = useContext(ClusterContext);
  useEffect(() => {
    if (!ctx) return;
    const marker = ctx.L.marker(position, { title });
    if (title) marker.bindPopup(title);
    const target = cluster ?? ctx.map;
    target.addLayer(marker);
    return () => {
      target.removeLayer(marker);
    };
  }, [ctx, cluster, position, title]);
  return null;
}
