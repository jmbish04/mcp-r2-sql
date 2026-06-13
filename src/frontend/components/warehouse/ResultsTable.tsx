/**
 * @fileoverview Generic sortable + filterable results table for arbitrary
 * row sets (R2 SQL results, SODA permits, vetting profiles).
 *
 * - Column headers toggle asc/desc sort (numeric-aware comparison).
 * - A single text filter matches across all stringified cell values.
 * - Values are rendered compactly; objects are JSON-stringified and truncated.
 */

"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { LocationMap } from "./maps/LocationMap";
import { extractPoints } from "./maps/loader";

/** Render a cell value compactly (objects/arrays become truncated JSON). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const s = JSON.stringify(value);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  }
  const s = String(value);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

/** Numeric-aware comparator for mixed-type columns. */
function compare(a: unknown, b: unknown): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export interface ResultsTableProps {
  rows: Record<string, unknown>[];
  /** Cap on rendered rows (full set stays sortable/filterable). */
  maxRows?: number;
  /** Optional per-row action cell renderer (e.g. a "Vet" button). */
  rowAction?: (row: Record<string, unknown>) => React.ReactNode;
  /** Show a location map above the table when rows carry coordinates (default true). */
  showMap?: boolean;
}

export function ResultsTable({ rows, maxRows = 500, rowAction, showMap = true }: ResultsTableProps) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  // Map points (if any) — LocationMap renders nothing when empty or keyless.
  const points = useMemo(() => (showMap ? extractPoints(rows) : []), [rows, showMap]);

  const visible = useMemo(() => {
    let out = rows;
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      out = out.filter((r) => columns.some((c) => cellText(r[c]).toLowerCase().includes(q)));
    }
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const d = compare(a[sortKey], b[sortKey]);
        return sortDir === "asc" ? d : -d;
      });
    }
    return out.slice(0, maxRows);
  }, [rows, columns, filter, sortKey, sortDir, maxRows]);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No rows.</p>;
  }

  const toggleSort = (col: string) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {points.length > 0 ? <LocationMap points={points} height={240} /> : null}
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${rows.length} rows…`}
        className="max-w-xs"
      />
      <div className="max-h-[28rem] overflow-auto rounded-md ring-1 ring-border/40">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="cursor-pointer select-none whitespace-nowrap text-xs"
                  title="Click to sort"
                >
                  {col}
                  {sortKey === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </TableHead>
              ))}
              {rowAction ? <TableHead className="text-xs">actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col} className="whitespace-nowrap text-xs">
                    {cellText(row[col])}
                  </TableCell>
                ))}
                {rowAction ? <TableCell className="text-xs">{rowAction(row)}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {visible.length < rows.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {rows.length} rows{filter ? " (filtered)" : ""}.
        </p>
      ) : null}
    </div>
  );
}
