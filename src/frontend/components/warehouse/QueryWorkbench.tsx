/**
 * @fileoverview Query workbench island — SQL editor → run → results table,
 * with Workers-AI actions (Interpret / Anomalies / Suggest) and NL→SQL.
 *
 * Live wiring:
 *  - POST /api/r2/query      — execute (guarded; shows rewrites + metrics)
 *  - POST /api/ai/nl2sql     — natural-language → SQL draft into the editor
 *  - POST /api/ai/interpret  — plain-language reading of the current result
 *  - POST /api/ai/anomalies  — anomaly scan of the current result
 *  - POST /api/ai/suggest    — follow-up query chips (click → editor)
 *
 * Cross-island context (with AssistantPanel on the same page):
 *  - listens for `warehouse:run-sql` (agent ran/drafted a query → populate
 *    editor and optionally auto-run)
 *  - "Ask agent" button dispatches `warehouse:ask-agent` with the current SQL.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { compactNumber } from "@/lib/format";

import { ResultsTable } from "./ResultsTable";
import {
  WAREHOUSE_EVENTS,
  type AnomaliesResponse,
  type InterpretResponse,
  type Nl2SqlResponse,
  type QueryResponse,
  type SuggestResponse,
} from "./types";

const DEFAULT_SQL = "SELECT permit_type_definition, status, COUNT(*) AS n\nFROM sf_dbi.building_permits\nGROUP BY permit_type_definition, status\nORDER BY n DESC\nLIMIT 25";

export function QueryWorkbench() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  const [interpret, setInterpret] = useState<InterpretResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomaliesResponse | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestResponse | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);

  /** Execute the current SQL through the guarded API. */
  const run = useCallback(async (sqlOverride?: string) => {
    const statement = sqlOverride ?? sql;
    setRunning(true);
    setRunError(null);
    setInterpret(null);
    setAnomalies(null);
    setSuggestions(null);
    try {
      const res = await apiSend<QueryResponse>("POST", "r2/query", { sql: statement });
      setResult(res);
      if (!res.ok) setRunError(res.errors[0]?.message ?? "Query failed.");
    } catch (err) {
      setResult(null);
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [sql]);

  /** NL→SQL: draft into the editor (never auto-runs — user reviews first). */
  const draft = useCallback(async () => {
    if (!question.trim()) return;
    setDrafting(true);
    setRationale(null);
    try {
      const res = await apiSend<Nl2SqlResponse>("POST", "ai/nl2sql", { question });
      if (res.sql) {
        setSql(res.sql);
        setRationale(res.rationale);
      }
      if (!res.ok) setRunError(res.error ?? "NL→SQL drafting failed.");
      else setRunError(null);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  }, [question]);

  /** One of the three AI result actions. */
  const aiAction = useCallback(async (kind: "interpret" | "anomalies" | "suggest") => {
    if (!result?.ok) return;
    setAiBusy(kind);
    try {
      if (kind === "interpret") {
        setInterpret(await apiSend<InterpretResponse>("POST", "ai/interpret", {
          sql: result.sql, rows: result.rows.slice(0, 100), metrics: result.metrics,
        }));
      } else if (kind === "anomalies") {
        setAnomalies(await apiSend<AnomaliesResponse>("POST", "ai/anomalies", {
          sql: result.sql, rows: result.rows.slice(0, 500), metrics: result.metrics,
        }));
      } else {
        setSuggestions(await apiSend<SuggestResponse>("POST", "ai/suggest", {
          sql: result.sql,
          columns: result.rows.length ? Object.keys(result.rows[0]) : [],
          rowCount: result.rows.length,
        }));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (kind === "interpret") setInterpret({ ok: false, error });
      else if (kind === "anomalies") setAnomalies({ ok: false, error });
      else setSuggestions({ ok: false, error });
    } finally {
      setAiBusy(null);
    }
  }, [result]);

  // Cross-island bridge: the assistant panel pushes SQL into the workbench.
  useEffect(() => {
    const onRunSql = (e: Event) => {
      const detail = (e as CustomEvent<{ sql?: string; autoRun?: boolean }>).detail;
      if (!detail?.sql) return;
      setSql(detail.sql);
      if (detail.autoRun) void run(detail.sql);
    };
    window.addEventListener(WAREHOUSE_EVENTS.runSql, onRunSql);
    return () => window.removeEventListener(WAREHOUSE_EVENTS.runSql, onRunSql);
  }, [run]);

  const askAgent = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(WAREHOUSE_EVENTS.askAgent, {
        detail: { text: `Run this query and interpret the results:\n\`\`\`sql\n${sql}\n\`\`\`` },
      }),
    );
  }, [sql]);

  return (
    <div className="flex flex-col gap-4">
      {/* NL→SQL bar */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void draft(); }}
          placeholder="Ask in plain English — e.g. top neighborhoods by permit count since 2024"
          className="flex-1"
        />
        <Button onClick={() => void draft()} disabled={drafting || !question.trim()} variant="secondary">
          {drafting ? "Drafting…" : "Draft SQL"}
        </Button>
      </div>
      {rationale ? <p className="text-xs text-muted-foreground">NL→SQL rationale: {rationale}</p> : null}

      {/* Editor */}
      <Textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        spellCheck={false}
        className="font-mono text-xs"
        placeholder="SELECT … FROM sf_dbi.<table> … LIMIT 500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void run()} disabled={running || !sql.trim()}>
          {running ? "Running…" : "Run query"}
        </Button>
        <Button variant="outline" onClick={askAgent}>Ask agent</Button>
        {result?.ok ? (
          <>
            <Button variant="secondary" disabled={aiBusy !== null} onClick={() => void aiAction("interpret")}>
              {aiBusy === "interpret" ? "Interpreting…" : "Interpret"}
            </Button>
            <Button variant="secondary" disabled={aiBusy !== null} onClick={() => void aiAction("anomalies")}>
              {aiBusy === "anomalies" ? "Scanning…" : "Find anomalies"}
            </Button>
            <Button variant="secondary" disabled={aiBusy !== null} onClick={() => void aiAction("suggest")}>
              {aiBusy === "suggest" ? "Thinking…" : "Suggest next"}
            </Button>
          </>
        ) : null}
      </div>

      {/* Metrics strip */}
      {result ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={result.ok ? "default" : "destructive"}>{result.ok ? "ok" : "error"}</Badge>
          <Badge variant="outline">{result.rows.length} rows</Badge>
          <Badge variant="outline">{compactNumber(result.metrics.bytes_scanned ?? 0)}B scanned</Badge>
          <Badge variant="outline">{result.metrics.files_scanned ?? 0} files</Badge>
          <Badge variant="outline">{result.durationMs}ms</Badge>
          {result.rewrites.map((r) => (
            <Badge key={r} variant="outline">{r}</Badge>
          ))}
          {result.requestId ? <span className="text-muted-foreground">req: {result.requestId}</span> : null}
        </div>
      ) : null}
      {runError ? <p className="text-sm text-destructive">{runError}</p> : null}

      {/* Results */}
      {result?.ok ? <ResultsTable rows={result.rows} /> : null}

      {/* AI panels */}
      {interpret ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Interpretation</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {interpret.ok ? (
              <>
                <p>{interpret.summary}</p>
                {interpret.highlights?.length ? (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {interpret.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-destructive">{interpret.error}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {anomalies ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Anomalies</CardTitle>
            <CardDescription>statistical + operational + semantic scan</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {anomalies.ok ? (
              anomalies.anomalies?.length ? (
                <ul className="flex flex-col gap-1">
                  {anomalies.anomalies.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant={a.severity === "high" ? "destructive" : "outline"} className="mt-0.5 shrink-0">
                        {a.severity}
                      </Badge>
                      <span>{a.column ? <code className="text-xs">{a.column}</code> : null} {a.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No anomalies detected.</p>
              )
            ) : (
              <p className="text-destructive">{anomalies.error}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {suggestions ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Suggested next queries</CardTitle>
            <CardDescription>click a chip to load it into the editor</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {suggestions.ok ? (
              suggestions.suggestions?.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setSql(s.sql); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="rounded-md bg-muted/40 px-3 py-2 text-left text-xs ring-1 ring-border/40 transition-colors hover:ring-foreground/30"
                >
                  <span className="block font-medium">{s.rationale}</span>
                  <code className="mt-1 block whitespace-pre-wrap text-muted-foreground">{s.sql}</code>
                </button>
              ))
            ) : (
              <p className="text-sm text-destructive">{suggestions.error}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
