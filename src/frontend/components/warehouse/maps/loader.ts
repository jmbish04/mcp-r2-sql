/**
 * @fileoverview Google Maps JavaScript API loader (singleton) + helpers.
 *
 * Fetches the browser Maps key from GET /api/config/maps (server-resolved from
 * the GOOGLE_MAPS_API_KEY Secrets Store binding) and injects the Maps JS SDK
 * once, with the `places` + `marker` libraries. All map/autocomplete islands
 * await {@link loadGoogleMaps}; when the key is not configured it resolves to
 * `null` and callers fall back to manual entry (no maps) — progressive
 * enhancement, never a hard failure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { apiGet } from "@/lib/api";

/** Minimal shape of the parts of the `google` global we touch. */
export type GoogleNS = any;

let loadPromise: Promise<GoogleNS | null> | null = null;

/** Response of GET /api/config/maps. */
interface MapsConfig {
  enabled: boolean;
  key?: string;
}

/**
 * Load (once) the Google Maps JS SDK. Resolves to the `google` namespace, or
 * `null` when no key is configured or loading fails.
 */
export function loadGoogleMaps(): Promise<GoogleNS | null> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof window === "undefined") return null;
    if ((window as any).google?.maps) return (window as any).google;

    let cfg: MapsConfig;
    try {
      cfg = await apiGet<MapsConfig>("maps/config");
    } catch {
      return null;
    }
    if (!cfg.enabled || !cfg.key) return null;

    return new Promise<GoogleNS | null>((resolve) => {
      const cbName = "__initGoogleMaps__";
      (window as any)[cbName] = () => resolve((window as any).google ?? null);
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.key!)}&libraries=places,marker&loading=async&callback=${cbName}`;
      script.async = true;
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  })();
  return loadPromise;
}

/** A geographic point extracted from a data row. */
export interface MapPoint {
  lat: number;
  lng: number;
  title?: string;
}

/**
 * Best-effort extraction of a lat/lng point from an arbitrary row, covering the
 * shapes SF data uses: SODA `location` ({latitude,longitude} or GeoJSON
 * {coordinates:[lng,lat]}), a `point` GeoJSON column, or flat lat/lng columns.
 */
export function extractPoint(row: Record<string, unknown>, title?: string): MapPoint | null {
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // SODA `location` object.
  const loc = row.location as any;
  if (loc && typeof loc === "object") {
    const lat = num(loc.latitude);
    const lng = num(loc.longitude);
    if (lat !== null && lng !== null) return { lat, lng, title };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      const [lng2, lat2] = loc.coordinates.map(Number);
      if (Number.isFinite(lat2) && Number.isFinite(lng2)) return { lat: lat2, lng: lng2, title };
    }
  }

  // GeoJSON `point` object.
  const point = row.point as any;
  if (point && typeof point === "object" && Array.isArray(point.coordinates)) {
    const [lng2, lat2] = point.coordinates.map(Number);
    if (Number.isFinite(lat2) && Number.isFinite(lng2)) return { lat: lat2, lng: lng2, title };
  }

  // Flat columns.
  for (const [latKey, lngKey] of [["latitude", "longitude"], ["lat", "lng"], ["lat", "lon"], ["y", "x"]]) {
    const lat = num(row[latKey]);
    const lng = num(row[lngKey]);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, title };
    }
  }
  return null;
}

/** Extract all mappable points from a row set, labeling by a title field. */
export function extractPoints(rows: Record<string, unknown>[], titleKey?: string): MapPoint[] {
  const out: MapPoint[] = [];
  for (const row of rows) {
    const title = titleKey ? String(row[titleKey] ?? "") : undefined;
    const p = extractPoint(row, title);
    if (p) out.push(p);
  }
  return out;
}
