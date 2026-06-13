/**
 * @fileoverview Vetting tool island — pick a tool, fill a shadcn Dialog,
 * get live results. All permit tables use the standard {@link PermitsTable};
 * single-entity records (contractor profile) use {@link PropValueTable}.
 *
 * Modes (all live, no mock data):
 *  1. Contractor / Architect / Engineer — license and/or firm name + role
 *     dropdown → /api/vetting/contractor → prop:value track-record profile +
 *     a standard permits table of recent engagements.
 *  2. Address → permit history — Google Places autocomplete (or manual street
 *     number + name) → /api/permits/lookup → standard permits table + map.
 *  3. Permit number → opens the DBI-style PermitViewer directly.
 */

"use client";

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend } from "@/lib/api";
import { compactNumber } from "@/lib/format";

import { AddressAutocomplete } from "./maps/AddressAutocomplete";
import { PermitsTable } from "./PermitsTable";
import { PermitViewer } from "./PermitViewer";
import { PropValueTable } from "./PropValueTable";
import { TableSkeleton } from "./TableSkeleton";
import type { PermitsResponse, VettingResponse } from "./types";

/** Vetting role options for the dropdown. */
const ROLES = [
  "contractor",
  "architect",
  "structural engineer",
  "civil engineer",
  "roofer",
  "electrician",
  "hvac",
  "plumber",
  "HIS",
] as const;

// ---------------------------------------------------------------------------
// Mode 1: contractor / architect / engineer
// ---------------------------------------------------------------------------

function ContractorDialog({ onViewPermit }: { onViewPermit: (n: string) => void }) {
  const [license, setLicense] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [role, setRole] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VettingResponse | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await apiSend<VettingResponse>("POST", "vetting/contractor", {
        license: license || undefined,
        name: name || undefined,
        city: city || undefined,
        role: role || undefined,
      }));
    } catch (err) {
      setResult({ ok: false, profile: [], recentPermits: [], metrics: {}, sql: "", error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [license, name, city, role]);

  return (
    <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Vet a contractor / architect / engineer</DialogTitle>
        <DialogDescription>
          SF permit track record from the R2 SQL warehouse (sf_dbi.permit_contractors). Provide a CSLB
          license number and/or a firm name.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vet-license">CSLB license #</Label>
          <Input id="vet-license" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="e.g. 762689" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vet-name">Firm name</Label>
          <Input id="vet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="substring, case-insensitive" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vet-city">City (optional)</Label>
          <Input id="vet-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. San Francisco" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vet-role">Role (optional)</Label>
          <Select value={role} onValueChange={(v) => setRole(v ?? "")}>
            <SelectTrigger id="vet-role">
              <SelectValue placeholder="Any role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={() => void submit()} disabled={busy || (!license.trim() && !name.trim())}>
        {busy ? "Vetting…" : "Vet"}
      </Button>

      {busy ? <TableSkeleton rows={4} cols={4} /> : null}

      {result ? (
        result.ok ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{result.profile.length} firm/role matches</Badge>
              <Badge variant="outline">{compactNumber(Number(result.metrics.bytes_scanned ?? 0))}B scanned</Badge>
            </div>
            {result.profile.length ? (
              <>
                <h4 className="text-sm font-medium">Track-record profile</h4>
                <div className="flex flex-col gap-3">
                  {result.profile.map((p, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {String(p.firm_name ?? "")} · license {String(p.license1 ?? "—")} · {String(p.role ?? "")}
                      </p>
                      <PropValueTable data={p} />
                    </div>
                  ))}
                </div>
                <h4 className="text-sm font-medium">Recent permit engagements</h4>
                <PermitsTable rows={result.recentPermits} onViewPermit={onViewPermit} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No SF permit engagements found for this license/name — the firm has no record in
                the warehouse (which covers SF DBI permits, not the full CSLB registry).
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-destructive">{result.error}</p>
        )
      ) : null}
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Mode 2: address → permit history
// ---------------------------------------------------------------------------

function AddressDialog({ onViewPermit }: { onViewPermit: (n: string) => void }) {
  const [streetNumber, setStreetNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PermitsResponse | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await apiSend<PermitsResponse>("POST", "permits/lookup", {
        mode: "address", streetNumber, streetName, unit: unit || undefined,
      }));
    } catch (err) {
      setResult({ ok: false, mode: "address", count: 0, rows: [], durationMs: 0, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [streetNumber, streetName, unit]);

  return (
    <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Address → permit history</DialogTitle>
        <DialogDescription>
          Search a San Francisco address (Google Places) or enter the street number and name manually,
          then look up its permit history (live SF SODA API).
        </DialogDescription>
      </DialogHeader>
      <AddressAutocomplete
        onSelect={(a) => {
          setStreetNumber(a.streetNumber);
          setStreetName(a.streetName);
          if (a.unit) setUnit(a.unit);
        }}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-num">Street number</Label>
          <Input id="addr-num" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} placeholder="301" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-name">Street name (no suffix)</Label>
          <Input id="addr-name" value={streetName} onChange={(e) => setStreetName(e.target.value)} placeholder="Mission" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addr-unit">Unit (optional)</Label>
          <Input id="addr-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => void submit()} disabled={busy || !streetNumber.trim() || !streetName.trim()}>
        {busy ? "Searching…" : "Search permits"}
      </Button>

      {busy ? <TableSkeleton /> : null}

      {result ? (
        result.ok ? (
          <div className="flex flex-col gap-3">
            <Badge variant="outline">{result.count} permits</Badge>
            <PermitsTable rows={result.rows} onViewPermit={onViewPermit} />
          </div>
        ) : (
          <p className="text-sm text-destructive">{result.error}</p>
        )
      ) : null}
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Mode 3: permit number → detail (opens the viewer directly)
// ---------------------------------------------------------------------------

function PermitNumberDialog({ onViewPermit }: { onViewPermit: (n: string) => void }) {
  const [permitNumber, setPermitNumber] = useState("");
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Permit number → detail</DialogTitle>
        <DialogDescription>Open the full DBI-style permit record (details, firms, review addenda).</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="permit-num">Permit number</Label>
        <Input
          id="permit-num"
          value={permitNumber}
          onChange={(e) => setPermitNumber(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && permitNumber.trim()) onViewPermit(permitNumber.trim()); }}
          placeholder="e.g. 202301017890"
        />
      </div>
      <Button onClick={() => onViewPermit(permitNumber.trim())} disabled={!permitNumber.trim()}>
        Open permit
      </Button>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------------

export function VettingTool() {
  const [viewPermit, setViewPermit] = useState<string | null>(null);

  const tools = [
    {
      key: "contractor",
      icon: "🛠️",
      title: "Contractor / Architect / Engineer",
      desc: "SF permit track record by CSLB license number or firm name (R2 SQL warehouse).",
      dialog: <ContractorDialog onViewPermit={setViewPermit} />,
    },
    {
      key: "address",
      icon: "🏠",
      title: "Address → permit history",
      desc: "Every permit filed for an address, live from the SF SODA API, linked to the permit viewer.",
      dialog: <AddressDialog onViewPermit={setViewPermit} />,
    },
    {
      key: "permit",
      icon: "📄",
      title: "Permit number → detail",
      desc: "Open the full DBI-style permit record with review addenda and firms.",
      dialog: <PermitNumberDialog onViewPermit={setViewPermit} />,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {tools.map((tool) => (
          <Dialog key={tool.key}>
            <DialogTrigger
              render={
                <button type="button" className="text-left" aria-label={tool.title}>
                  <Card className="h-full transition-colors hover:ring-1 hover:ring-foreground/30">
                    <CardHeader>
                      <div className="mb-1 text-3xl">{tool.icon}</div>
                      <CardTitle className="text-base">{tool.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm">{tool.desc}</CardDescription>
                    </CardContent>
                  </Card>
                </button>
              }
            />
            {tool.dialog}
          </Dialog>
        ))}
      </div>

      {/* Permit viewport — opened from any permit-number link above. */}
      <PermitViewer permitNumber={viewPermit} onClose={() => setViewPermit(null)} />
    </>
  );
}
