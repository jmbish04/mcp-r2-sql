/**
 * @fileoverview Docs registry — assembles all pages into an ordered category
 * tree and provides lookup helpers used by the docs routes + sidebar.
 */

import { overviewPages } from "./content/overview";
import { dataPlatformPages } from "./content/data-platform";
import { featurePages } from "./content/features";
import { referencePages } from "./content/reference";
import type { DocCategory, DocPage, DocTreeNode } from "./types";

export type { DocPage, DocCategory, DocTreeNode } from "./types";

/** Ordered sidebar categories. */
export const DOC_CATEGORIES: DocCategory[] = [
  { key: "overview", label: "Overview", order: 1 },
  { key: "data-platform", label: "Data Platform", order: 2 },
  { key: "features", label: "Features", order: 3 },
  { key: "reference", label: "Reference", order: 4 },
];

/** Every doc page (flat). */
export const DOC_PAGES: DocPage[] = [
  ...overviewPages,
  ...dataPlatformPages,
  ...featurePages,
  ...referencePages,
];

/** The category → ordered-pages tree for the sidebar. */
export const DOC_TREE: DocTreeNode[] = DOC_CATEGORIES
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((category) => ({
    category,
    pages: DOC_PAGES.filter((p) => p.category === category.key).sort((a, b) => a.order - b.order),
  }));

/** The default landing page slug (first page of the first category). */
export const DEFAULT_DOC_SLUG = DOC_TREE[0]?.pages[0]?.slug ?? "overview";

/** Look up a page by slug. */
export function getDoc(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

/** All slugs (for static path generation). */
export function allDocSlugs(): string[] {
  return DOC_PAGES.map((p) => p.slug);
}
