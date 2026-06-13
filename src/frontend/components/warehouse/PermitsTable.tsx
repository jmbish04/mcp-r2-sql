/**
 * @fileoverview PermitsTable — the STANDARD permits table used everywhere
 * permit rows are shown (address history, contractor engagements, etc.).
 *
 * Columns: permit_number (links into the PermitViewer), permit_type_definition
 * (color-coded badge), permit_creation_date (yyyy-mm-dd), block, lot,
 * street_number, street_name, and a Firms action (inline cross-link that vets
 * the firms recorded on the permit). Missing columns render "—" so it works for
 * both SODA rows (have block/lot) and warehouse permit_contractors rows.
 *
 * A LocationMap of any mappable rows renders above the table.
 */

"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiSend } from "@/lib/api";

import { LocationMap } from "./maps/LocationMap";
import { extractPoints } from "./maps/loader";
import { PermitTypeBadge } from "./permit-badges";
import { PropValueTable } from "./PropValueTable";
import { ResultsTable } from "./ResultsTable";
import type { QueryResponse, VettingResponse } from "./types";

/** The standard, non-link columns of the permits table. */
const COLUMNS: { key: string; label: string; kind?: "date" | "type" }[] = [
  { key: "permit_type_definition", label: "permit_type_definition", kind: "type" },
  { key: "permit_creation_date", label: "permit_creation_date", kind: "date" },
  { key: "block", label: "block" },
  { key: "lot", label: "lot" },
  { key: "street_number", label: "street_number" },
  { key: "street_name", label: "street_name" },
];

/** Format an ISO-ish date string to yyyy-mm-dd (no time). */
function dateOnly(value: unknown): string {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s || "—";
}

export interface PermitsTableProps {
  rows: Record<string, unknown>[];
  /** Opens the DBI-style permit viewport for a permit number. */
  onViewPermit: (permitNumber: string) => void;
  /** Show the location map above the table (default true). */
  showMap?: boolean;
}

export function PermitsTable({ rows, onViewPermit, showMap = true }: PermitsTableProps) {
  const [firmsFor, setFirmsFor] = useState<string | null>(null);
  const points = showMap ? extractPoints(rows, "permit_number") : [];

  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No permits.</p>;

  return (
    <div className="flex flex-col gap-3">
      {points.length > 0 ? <LocationMap points={points} height={240} /> : null}
      <div className="max-h-[28rem] overflow-auto rounded-md ring-1 ring-border/40">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="text-xs">permit_number</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap text-xs">{c.label}</TableHead>
              ))}
              <TableHead className="text-xs">firms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
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
                  {COLUMNS.map((c) => (
                    <TableCell key={c.key} className="whitespace-nowrap text-xs">
                      {c.kind === "type" ? (
                        <PermitTypeBadge type={row[c.key]} />
                      ) : c.kind === "date" ? (
                        dateOnly(row[c.key])
                      ) : (
                        String(row[c.key] ?? "—")
                      )}
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
    </div>
  );
}

/**
 * PermitFirms — inline cross-link: list the contractor firms recorded against a
 * permit (warehouse) and vet any of them.
 */
export function PermitFirms({ permitNumber }: { permitNumber: string }) {
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
            {vetting.profile.map((p, i) => (
              <PropValueTable key={i} data={p} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-destructive">{vetting.error}</p>
        )
      ) : null}
    </div>
  );
}
