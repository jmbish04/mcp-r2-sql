/**
 * @fileoverview Types for the docs site content registry.
 *
 * Docs are authored as markdown strings (with ```mermaid fences for diagrams)
 * in `content/*.ts`, grouped into ordered categories. Every page has a stable
 * slug (its dedicated URL under /docs/<slug>) and a `lastUpdated` ISO timestamp
 * that the renderer formats to Pacific 12-hour time.
 */

/** One documentation page. */
export interface DocPage {
  /** URL slug under /docs (may contain slashes, e.g. "data-platform/r2-sql"). */
  slug: string;
  /** Page title (shown as the H1 + sidebar label). */
  title: string;
  /** Category key this page belongs to (must match a DocCategory.key). */
  category: string;
  /** Sort order within the category. */
  order: number;
  /** One-line summary (sidebar tooltip / landing cards). */
  summary: string;
  /** ISO timestamp of the last content update (formatted to PT at render). */
  lastUpdated: string;
  /** Markdown body (GitHub-flavored; ```mermaid fences become diagrams). */
  content: string;
}

/** A sidebar category grouping pages. */
export interface DocCategory {
  key: string;
  label: string;
  order: number;
}

/** The category tree with its pages, ready for the sidebar. */
export interface DocTreeNode {
  category: DocCategory;
  pages: DocPage[];
}
