/**
 * @fileoverview Vetting tool island — pick a tool, fill a shadcn Dialog,
 * get live results.
 *
 * Three modes, all live (no mock data):
 *  1. Contractor / Architect / Engineer — license and/or firm name, with a
 *     role dropdown → POST /api/vetting/contractor → aggregate SF permit track
 *     record from the R2 SQL warehouse (sf_dbi.permit_contractors).
 *  2. Address → permit history — street number + name (+unit) →
 *     POST /api/permits/lookup (live SF SODA API), shown in a focused table
 *     whose permit numbers link into the DBI-style PermitViewer.
 *  3. Permit number → detail → opens the PermitViewer directly.
 *
 * NOTE: Google-Places address autocomplete (#5) and result maps (#7) are
 * pending a maps-provider decision; the address mode currently takes manual
 * street number + name.
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiSend } from "@/lib/api";
import { compactNumber } from "@/lib/format";

import { AddressAutocomplete } from "./maps/AddressAutocomplete";
import { LocationMap } from "./maps/LocationMap";
import { extractPoints } from "./maps/loader";
import { PermitViewer } from "./PermitViewer";
import { ResultsTable } from "./ResultsTable";
import type { PermitsResponse, QueryResponse, VettingResponse } from "./types";

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

/** Format an ISO-ish date string to yyyy-mm-dd (no time). */
function dateOnly(value: unknown): string {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s || "—";
}

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
                <ResultsTable rows={result.profile} />
                <h4 className="text-sm font-medium">Recent permit engagements</h4>
                <ResultsTable
                  rows={result.recentPermits}
                  rowAction={(row) =>
                    row.permit_number ? (
                      <Button size="sm" variant="ghost" onClick={() => onViewPermit(String(row.permit_number))}>
                        View
                      </Button>
                    ) : null
                  }
                />
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
// Permit-firms cross-link (vet firms recorded on a permit)
// ---------------------------------------------------------------------------

function PermitFirms({ permitNumber }: { permitNumber: string }) {
  const [busy, setBusy] = useState(false);
  const [firms, setFirms] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vetting, setVetting] = useState<VettingResponse | null>(null);

  const findFirms = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sql = `SELECT DISTINCT firm_name, license1, role FROM sf_dbi.permit_contractors WHERE permit_number = '${permitNumber.replace(/'/g, "''")}' LIMIT 50`;
      const res = await apiSend<QueryResponse>("POST", "r2/query", { sql });
      if (res.ok) setFirms(res.rows);
      else setError(res.errors[0]?.message ?? "Lookup failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [permitNumber]);

  const vet = useCallback(async (row: Record<string, unknown>) => {
    setVetting(null);
    try {
      setVetting(await apiSend<VettingResponse>("POST", "vetting/contractor", {
        license: row.license1 ? String(row.license1) : undefined,
        name: row.license1 ? undefined : String(row.firm_name ?? ""),
      }));
    } catch (err) {
      setVetting({ ok: false, profile: [], recentPermits: [], metrics: {}, sql: "", error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-3 ring-1 ring-border/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Firms on permit <code>{permitNumber}</code> (vet any against the warehouse).
        </p>
        <Button size="sm" variant="outline" onClick={() => void findFirms()} disabled={busy}>
          {busy ? "Searching…" : "Find firms"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {firms ? (
        firms.length ? (
          <ResultsTable
            rows={firms}
            rowAction={(row) => (
              <Button size="sm" variant="secondary" onClick={() => void vet(row)}>Vet</Button>
            )}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No firms recorded for this permit in the warehouse.</p>
        )
      ) : null}
      {vetting ? (
        vetting.ok ? (
          <div className="flex flex-col gap-2">
            <h5 className="text-xs font-medium">Vetting profile</h5>
            <ResultsTable rows={vetting.profile} />
          </div>
        ) : (
          <p className="text-xs text-destructive">{vetting.error}</p>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode 2: address → permit history (focused table + permit links)
// ---------------------------------------------------------------------------

/** The trimmed column set requested for the address history table. */
const ADDRESS_COLUMNS = [
  "permit_type_definition",
  "permit_creation_date",
  "block",
  "lot",
  "street_number",
  "street_name",
] as const;

function AddressDialog({ onViewPermit }: { onViewPermit: (n: string) => void }) {
  const [streetNumber, setStreetNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PermitsResponse | null>(null);
  const [firmsFor, setFirmsFor] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFirmsFor(null);
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
          Live lookup against the SF Building Permits SODA dataset. (Google-Places autocomplete is
          coming once the maps provider is set — enter the street number and name for now.)
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

      {result ? (
        result.ok ? (
          <div className="flex flex-col gap-3">
            <Badge variant="outline">{result.count} permits</Badge>
            <div className="max-h-[28rem] overflow-auto rounded-md ring-1 ring-border/40">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">permit_number</TableHead>
                    {ADDRESS_COLUMNS.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                    ))}
                    <TableHead className="text-xs">firms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, i) => {
                    const pn = row.permit_number ? String(row.permit_number) : null;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {pn ? (
                            <button
                              type="button"
                              onClick={() => onViewPermit(pn)}
                              className="font-medium text-[var(--chart-2)] underline underline-offset-2 hover:opacity-80"
                            >
                              {pn}
                            </button>
                          ) : "—"}
                        </TableCell>
                        {ADDRESS_COLUMNS.map((c) => (
                          <TableCell key={c} className="whitespace-nowrap text-xs">
                            {c === "permit_creation_date" ? dateOnly(row[c]) : String(row[c] ?? "—")}
                          </TableCell>
                        ))}
                        <TableCell className="text-xs">
                          {pn ? (
                            <Button size="sm" variant="outline" onClick={() => setFirmsFor(pn)}>Firms</Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {firmsFor ? <PermitFirms permitNumber={firmsFor} /> : null}
            <LocationMap points={extractPoints(result.rows, "permit_number")} height={260} />
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
