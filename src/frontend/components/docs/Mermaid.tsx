/**
 * @fileoverview Mermaid — renders a ```mermaid code block as an SVG diagram.
 *
 * Mermaid is browser-only (it touches the DOM), so it is dynamically imported
 * inside an effect and initialized once with the dark theme. On a parse error
 * the raw diagram source is shown in a <pre> rather than throwing.
 */

"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Lazy singleton mermaid init (dark theme, inherits app font). */
let initialized = false;
async function loadMermaid() {
  const mermaid = (await import("mermaid")).default;
  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily: "inherit",
      themeVariables: { fontSize: "14px" },
    });
    initialized = true;
  }
  return mermaid;
}

export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const renderSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setSvg(null);
    // Unique id per render so concurrent re-renders (rapid `chart` changes)
    // never collide in mermaid's internal cache.
    const renderId = `mmd-${reactId}-${++renderSeq.current}`;
    void loadMermaid()
      .then((mermaid) => mermaid.render(renderId, chart))
      .then(({ svg }) => { if (!cancelled) setSvg(svg); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [chart, reactId]);

  if (error) {
    return <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs">{chart}</pre>;
  }
  if (!svg) {
    return <div className="my-4 h-40 w-full animate-pulse rounded-md bg-muted/40" aria-label="Rendering diagram…" />;
  }
  return (
    <div
      className="my-4 flex justify-center overflow-x-auto rounded-md bg-card/40 p-3 ring-1 ring-border/40 [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
