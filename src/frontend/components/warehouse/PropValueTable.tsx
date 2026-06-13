/**
 * @fileoverview PropValueTable — a two-column prop:value table for a single
 * record. The standard way to display a single entity's fields (permit details,
 * contractor track-record profile, firm record). Dates render as yyyy-mm-dd;
 * status/permit-type cells render as color-coded badges.
 */

"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

import { PermitTypeBadge, StatusBadge } from "./permit-badges";

/** Render a value: dates → yyyy-mm-dd, objects → compact, else string. */
export function fmtValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.latitude && o.longitude) return `${o.latitude}, ${o.longitude}`;
    if (Array.isArray((o as { coordinates?: unknown }).coordinates)) {
      return JSON.stringify((o as { coordinates: unknown }).coordinates);
    }
    return JSON.stringify(value);
  }
  const s = String(value);
  if (/date/i.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s;
}

export interface PropValueTableProps {
  data: Record<string, unknown>;
  /** Field order; keys not listed follow, sorted. Defaults to insertion order. */
  order?: string[];
}

export function PropValueTable({ data, order }: PropValueTableProps) {
  const present = Object.keys(data);
  const keys = order
    ? [...order.filter((k) => present.includes(k)), ...present.filter((k) => !order.includes(k)).sort()]
    : present;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border/40">
      <Table>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key}>
              <TableCell className="w-1/3 bg-muted/30 align-top text-xs font-medium text-muted-foreground">
                {key}
              </TableCell>
              <TableCell className="align-top text-xs">
                {/status$/i.test(key) ? (
                  <StatusBadge status={data[key]} />
                ) : /permit_type_definition|permit_type$/i.test(key) ? (
                  <PermitTypeBadge type={data[key]} />
                ) : (
                  fmtValue(key, data[key])
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
