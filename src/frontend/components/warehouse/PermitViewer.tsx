/**
 * @fileoverview PermitViewer — a DBI-permit-tracker-style viewport for a single
 * permit, opened from a permit-number hyperlink.
 *
 * Replicates the SF DBI permit/complaint tracker layout: a header summary, a
 * full two-column prop:value table of every field on the SODA record, the
 * review/addenda timeline (warehouse sf_dbi.permit_addenda), and the
 * contractor firms on the permit (warehouse sf_dbi.permit_contractors).
 *
 * Data: GET /api/permits/detail?permit_number=...
 */

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api";

import type { PermitDetailResponse } from "./types";

/** Fields surfaced first in the prop:value table (the rest follow alphabetically). */
const PRIORITY_FIELDS = [
  "permit_number",
  "status",
  "permit_type_definition",
  "description",
  "street_number",
  "street_name",
  "street_suffix",
  "unit",
  "block",
  "lot",
  "permit_creation_date",
  "filed_date",
  "issued_date",
  "completed_date",
  "estimated_cost",
  "revised_cost",
];

/** Render a value: dates → yyyy-mm-dd, objects → compact, else string. */
function fmtValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    // SODA `location` etc. — show coordinates compactly if present.
    const o = value as Record<string, unknown>;
    if (o.latitude && o.longitude) return `${o.latitude}, ${o.longitude}`;
    if (Array.isArray((o as { coordinates?: unknown }).coordinates)) return JSON.stringify((o as { coordinates: unknown }).coordinates);
    return JSON.stringify(value);
  }
  const s = String(value);
  // Date-only normalization for ISO timestamps.
  if (/date/i.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s;
}

/** Order keys: priority fields first (those present), then the rest sorted. */
function orderedKeys(permit: Record<string, unknown>): string[] {
  const present = Object.keys(permit);
  const priority = PRIORITY_FIELDS.filter((k) => present.includes(k));
  const rest = present.filter((k) => !priority.includes(k)).sort();
  return [...priority, ...rest];
}

export function PermitViewer({
  permitNumber,
  onClose,
}: {
  permitNumber: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PermitDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!permitNumber) return;
    setData(null);
    setError(null);
    setLoading(true);
    apiGet<PermitDetailResponse>("permits/detail", { permit_number: permitNumber })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [permitNumber]);

  const permit = data?.permit ?? null;

  return (
    <Dialog open={permitNumber !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Permit {permitNumber}
            {permit?.status ? <Badge variant="outline">{String(permit.status)}</Badge> : null}
            {permit?.permit_type_definition ? (
              <span className="text-sm font-normal text-muted-foreground">
                {String(permit.permit_type_definition)}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            SF DBI permit record (live SODA) with review addenda and contractor firms from the warehouse.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !permit ? (
          <p className="text-sm text-muted-foreground">No record found for permit {permitNumber}.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Full field table — 2 column prop:value */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">Permit details</h3>
              <div className="overflow-hidden rounded-md ring-1 ring-border/40">
                <Table>
                  <TableBody>
                    {orderedKeys(permit).map((key) => (
                      <TableRow key={key}>
                        <TableCell className="w-1/3 bg-muted/30 align-top font-medium text-muted-foreground">
                          {key}
                        </TableCell>
                        <TableCell className="align-top">{fmtValue(key, permit[key])}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Contractor firms */}
            {data && data.firms.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">
                  Contractor firms <Badge variant="outline">{data.firms.length}</Badge>
                </h3>
                <div className="overflow-x-auto rounded-md ring-1 ring-border/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">firm_name</TableHead>
                        <TableHead className="text-xs">license1</TableHead>
                        <TableHead className="text-xs">role</TableHead>
                        <TableHead className="text-xs">city</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.firms.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtValue("firm_name", f.firm_name)}</TableCell>
                          <TableCell className="text-xs">{fmtValue("license1", f.license1)}</TableCell>
                          <TableCell className="text-xs">{fmtValue("role", f.role)}</TableCell>
                          <TableCell className="text-xs">{fmtValue("firm_city", f.firm_city)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}

            {/* Review / addenda timeline */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                Review addenda <Badge variant="outline">{data?.addenda.length ?? 0}</Badge>
              </h3>
              {data && data.addenda.length > 0 ? (
                <div className="max-h-[24rem] overflow-auto rounded-md ring-1 ring-border/40">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        {["addenda_number", "step", "station", "department", "addenda_status", "review_results", "start_date", "finish_date", "approved_date"].map((h) => (
                          <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.addenda.map((a, i) => (
                        <TableRow key={i}>
                          {["addenda_number", "step", "station", "department", "addenda_status", "review_results", "start_date", "finish_date", "approved_date"].map((h) => (
                            <TableCell key={h} className="whitespace-nowrap text-xs">{fmtValue(h, a[h])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No review addenda recorded in sf_dbi.permit_addenda for this permit.
                </p>
              )}
            </section>

            {data && data.errors.length > 0 ? (
              <p className="text-xs text-muted-foreground">Notes: {data.errors.join("; ")}</p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
