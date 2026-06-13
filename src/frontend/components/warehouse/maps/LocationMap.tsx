/**
 * @fileoverview LocationMap — drops a clustered marker on each point using the
 * shadcn Leaflet map (`@/components/ui/map`), fitting bounds to show them all.
 *
 * Keyless (OpenStreetMap/CARTO tiles) — no Google Maps key needed for display.
 * Renders nothing when there are no mappable points. Used anywhere
 * location-bearing rows appear (permit history, permit viewer, query results
 * with lat/lng or SODA `location`).
 */

"use client";

import { Map, MapMarker, MapMarkerClusterGroup, MapTileLayer } from "@/components/ui/map";

import type { MapPoint } from "./loader";

export interface LocationMapProps {
  points: MapPoint[];
  /** CSS height for the map surface. */
  height?: number;
}

export function LocationMap({ points, height = 280 }: LocationMapProps) {
  if (!points.length) return null;

  const bounds = points.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <Map bounds={bounds} height={height}>
      <MapTileLayer />
      <MapMarkerClusterGroup>
        {points.map((p, i) => (
          <MapMarker key={`${p.lat},${p.lng},${i}`} position={[p.lat, p.lng]} title={p.title} />
        ))}
      </MapMarkerClusterGroup>
    </Map>
  );
}
