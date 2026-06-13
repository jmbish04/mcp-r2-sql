/**
 * @fileoverview AddressAutocomplete — Google Places autocomplete restricted to
 * SF addresses. On selection it parses the place's address components and calls
 * `onSelect` with the street number + street name (no suffix) + unit + coords,
 * which the vetting Address dialog uses to fill its manual fields.
 *
 * Progressive enhancement: when no Maps key is configured it renders nothing
 * and the manual street-number/street-name inputs remain the entry path.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loadGoogleMaps } from "./loader";

/** Parsed address pieces handed back on selection. */
export interface SelectedAddress {
  streetNumber: string;
  /** Street name WITHOUT the suffix (the SODA dataset stores suffix separately). */
  streetName: string;
  unit?: string;
  lat?: number;
  lng?: number;
  formatted?: string;
}

/** Common street-suffix tokens to strip so the name matches SODA's `street_name`. */
const SUFFIXES = new Set([
  "st", "street", "ave", "avenue", "blvd", "boulevard", "rd", "road", "dr", "drive",
  "ln", "lane", "ct", "court", "pl", "place", "ter", "terrace", "way", "hwy", "highway",
  "cir", "circle", "aly", "alley", "row", "plz", "plaza", "wy",
]);

/** Strip a trailing street suffix from a route string. */
function stripSuffix(route: string): string {
  const parts = route.trim().split(/\s+/);
  if (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/\./g, ""))) {
    parts.pop();
  }
  return parts.join(" ");
}

export function AddressAutocomplete({ onSelect }: { onSelect: (a: SelectedAddress) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // pending → deciding; enabled → Places attached; unavailable → no key/SDK.
  const [state, setState] = useState<"pending" | "enabled" | "unavailable">("pending");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const google = await loadGoogleMaps();
      if (cancelled) return;
      if (!google?.maps?.places || !inputRef.current) {
        setState("unavailable");
        return;
      }
      setState("enabled");

      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components", "geometry", "formatted_address"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const comps: any[] = place.address_components ?? [];
        const get = (type: string) => comps.find((c) => c.types.includes(type))?.long_name ?? "";
        const streetNumber = get("street_number");
        const route = stripSuffix(get("route"));
        const unit = get("subpremise") || undefined;
        const loc = place.geometry?.location;
        if (streetNumber && route) {
          onSelect({
            streetNumber,
            streetName: route,
            unit,
            lat: loc ? loc.lat() : undefined,
            lng: loc ? loc.lng() : undefined,
            formatted: place.formatted_address,
          });
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [onSelect]);

  // No key / SDK → render nothing; the manual street inputs remain the path.
  if (state === "unavailable") return null;

  // Keep the input mounted while pending so the effect can attach Places.
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="addr-search">Search address (Google)</Label>
      <Input
        id="addr-search"
        ref={inputRef}
        disabled={state === "pending"}
        placeholder="Start typing a San Francisco address…"
      />
      <p className="text-xs text-muted-foreground">Pick a result to auto-fill the street number and name below.</p>
    </div>
  );
}
