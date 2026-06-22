/**
 * @fileoverview SignalSections — collapsible detail tables for each non-empty
 * watched dataset (Notices of Violation, complaints, fire permits, planning
 * review, fire inspections, permit contacts, review + issuance metrics).
 *
 * Each dataset gets a curated column set (falling back to the row's own keys);
 * date-like values are shown ISO date-only, met-SLA / status values get badges.
 */

"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { SignalsResponse } from "./types";

/** Curated columns per dataset key (header label → field). Fallback = first keys. */
const COLUMNS: Record<string, [string, string][]> = {
  notices_of_violation: [["Complaint", "complaint_number"], ["Seq", "item_sequence_number"], ["Category", "nov_category_description"], ["Item", "nov_item_description"], ["Filed", "date_filed"], ["Status", "status"]],
  dbi_complaints: [["Complaint", "complaint_number"], ["Filed", "date_filed"], ["Status", "status"], ["Division", "receiving_division"], ["Description", "description"]],
  fire_permits: [["Permit", "permit_number"], ["Type", "permit_type"], ["Status", "status"], ["Address", "permit_address"], ["Approved", "approved_date"]],
  planning_review: [["Parcel", "parcel_number"], ["Type", "record_type"], ["Address", "address"], ["Status", "status"], ["Filed", "date_opened"]],
  fire_inspections: [["Inspection", "inspection_number"], ["Type", "inspection_type_description"], ["Start", "inspection_start_date"], ["Status", "inspection_status"], ["Disposition", "return_date"]],
  permit_contacts: [["Firm", "firm_name"], ["License", "license_number"], ["Permit", "permit_number"], ["Street #", "street_number"], ["Street", "street_name"]],
  review_metrics: [["BPA", "bpa"], ["Station", "station"], ["Review", "review_type"], ["Days", "calendar_days"], ["Met SLA", "met_cal_sla"], ["Result", "review_results"]],
  issuance_metrics: [["BPA", "bpa"], ["Type", "permit_type"], ["OTC/IH", "otc_ih"], ["Status", "status"], ["Days", "calendar_days"]],
};

const DATE_FIELDS = /date|_at$|^arrive|finish|start|approved|issued|filed/i;

function fmt(field: string, value: unknown): React.ReactNode {
  if (value == null || value === "") return "—";
  if (field === "met_cal_sla") {
    const met = value === true || value === "true";
    return <Badge style={{ backgroundColor: met ? "#16a34a" : "var(--chart-4)", color: "#fff" }}>{met ? "met" : "missed"}</Badge>;
  }
  const s = String(value);
  if (DATE_FIELDS.test(field) && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function columnsFor(key: string, rows: Record<string, unknown>[]): [string, string][] {
  if (COLUMNS[key]) return COLUMNS[key];
  const first = rows[0] ?? {};
  return Object.keys(first).filter((k) => !/^(:@|data_|location|point_)/.test(k)).slice(0, 6).map((k) => [k, k]);
}

export function SignalSections({ signals }: { signals: SignalsResponse | null }) {
  if (!signals) return null;
  const nonEmpty = Object.entries(signals.datasets).filter(([, v]) => v.ok && v.count > 0);
  if (!nonEmpty.length) {
    return <p className="rounded-md bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border/40">No records found for this property across the watched datasets — a clean slate.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {nonEmpty.map(([key, ds]) => <Section key={key} dataKey={key} label={ds.label} rows={ds.rows} />)}
    </div>
  );
}

function Section({ dataKey, label, rows }: { dataKey: string; label: string; rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(rows.length <= 10);
  const cols = columnsFor(dataKey, rows);
  const visible = open ? rows : rows.slice(0, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between text-left">
          <CardTitle className="flex items-center gap-2 text-base">
            {label}
            <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </button>
      </CardHeader>
      {open ? (
        <CardContent>
          <div className="max-h-[26rem] overflow-auto rounded-md ring-1 ring-border/40">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>{cols.map(([h]) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r, i) => (
                  <TableRow key={i}>
                    {cols.map(([, field]) => (
                      <TableCell key={field} className="max-w-[20rem] truncate text-xs" title={String(r[field] ?? "")}>{fmt(field, r[field])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
