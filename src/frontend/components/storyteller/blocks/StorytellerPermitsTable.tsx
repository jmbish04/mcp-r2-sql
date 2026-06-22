/**
 * @fileoverview StorytellerPermitsTable — the standard permits table for the
 * storyteller (badged trade/status/neighborhood from dbi-badges, green cost
 * badge, permit_number → viewer, address-grouped sort, wrapping description,
 * search). A LocationMap of the rows renders above when coords exist.
 */

"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDbiBadges } from "@/lib/dbi-badges";
import { LocationMap } from "@/components/warehouse/maps/LocationMap";
import { extractPoints } from "@/components/warehouse/maps/loader";
import { PermitViewer } from "@/components/warehouse/PermitViewer";

export function StorytellerPermitsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const { badgeFor, formatCost } = useDbiBadges();
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<string | null>(null);

  const points = useMemo(() => extractPoints(rows, "permit_number"), [rows]);
  const visible = useMemo(() => {
    const base = [...rows].sort((a, b) => `${a.street_name ?? ""}${a.street_number ?? ""}`.localeCompare(`${b.street_name ?? ""}${b.street_number ?? ""}`));
    if (!filter.trim()) return base.slice(0, 500);
    const q = filter.toLowerCase();
    return base.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q))).slice(0, 500);
  }, [rows, filter]);

  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No permits.</p>;

  return (
    <div className="flex flex-col gap-2">
      {points.length > 0 ? <LocationMap points={points} height={240} /> : null}
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${rows.length} permits…`} className="max-w-xs" />
      <div className="max-h-[30rem] overflow-auto rounded-md ring-1 ring-border/40">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              {["permit_number", "trade", "type", "status", "address", "neighborhood", "cost", "description"].map((h) => (
                <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r, i) => {
              const pn = r.permit_number ? String(r.permit_number) : null;
              const trade = String(r.trade_category ?? "building");
              const nb = String(r.neighborhoods_analysis_boundaries ?? r.analysis_neighborhood ?? "");
              const cost = r.revised_cost ?? r.estimated_cost;
              return (
                <TableRow key={i}>
                  <TableCell className="text-xs">
                    {pn ? <button type="button" onClick={() => setView(pn)} className="font-medium text-[var(--chart-2)] underline underline-offset-2 hover:opacity-80">{pn}</button> : "—"}
                  </TableCell>
                  <TableCell className="text-xs"><Badge style={badgeFor("permit_trade_category", trade) as CSSProperties}>{trade}</Badge></TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs" title={String(r.permit_type_definition ?? "")}>{String(r.permit_type_definition ?? "—")}</TableCell>
                  <TableCell className="text-xs">{r.status ? <Badge style={badgeFor("permit_status", r.status) as CSSProperties}>{String(r.status)}</Badge> : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{String(r.street_number ?? "")} {String(r.street_name ?? "")}</TableCell>
                  <TableCell className="text-xs">{nb ? <Badge style={badgeFor("sf_neighborhood", nb) as CSSProperties}>{nb}</Badge> : "—"}</TableCell>
                  <TableCell className="text-xs">{cost ? <Badge style={{ backgroundColor: "#16a34a", color: "#fff" }}>{formatCost(cost)}</Badge> : "—"}</TableCell>
                  <TableCell className="min-w-[16rem] max-w-[28rem] text-xs"><span className="line-clamp-3 whitespace-normal">{String(r.description ?? "—")}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PermitViewer permitNumber={view} onClose={() => setView(null)} />
    </div>
  );
}
