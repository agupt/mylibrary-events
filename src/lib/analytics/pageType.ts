/**
 * Page-type classification (WS-D, docs/growth-agent/phase1-impact.md §1a).
 * ONE classifier for browser `$pageview`s, pre-deploy events (`$pathname`)
 * and GSC page URLs, so every reading groups pages the same way. Pure: path
 * shape only, no data lookups (the IMLS outlet id of a library page is not
 * in its URL and is attached separately by the browser wiring).
 */

export const PAGE_TYPES = [
  "home",
  "storytimes-index",
  "state",
  "city",
  "library",
  "privacy",
  "status",
  "other",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export interface PageClassification {
  page_type: PageType;
  /** Two-letter USPS code, uppercase (matches `matched_state`). */
  page_state?: string;
  /** Our own city URL slug, e.g. "oakland". */
  page_city?: string;
}

const STATE_SEGMENT = /^[a-z]{2}$/;
/** `slugify()` output shape; length-capped so junk URLs are never echoed. */
const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;
const OTHER: PageClassification = { page_type: "other" };

const FIXED_PAGES: Readonly<Record<string, PageType>> = {
  "": "home",
  storytimes: "storytimes-index",
  privacy: "privacy",
  status: "status",
};

function isSlug(segment: string): boolean {
  return segment.length <= MAX_SLUG_LENGTH && SLUG_SEGMENT.test(segment);
}

/** Path of a pathname or absolute URL, without query/hash; null if unparseable. */
function pathOf(input: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) return input.split(/[?#]/)[0];
  try {
    return new URL(input).pathname;
  } catch {
    return null;
  }
}

function segmentsOf(input: string): string[] | null {
  const path = pathOf(input.trim());
  if (path === null || (path !== "" && !path.startsWith("/"))) return null;
  return path
    .toLowerCase()
    .split("/")
    .filter((segment) => segment.length > 0);
}

function classifyStorytimes(rest: readonly string[]): PageClassification {
  const [state, city] = rest;
  if (!STATE_SEGMENT.test(state)) return OTHER;
  if (rest.length === 1) return { page_type: "state", page_state: state.toUpperCase() };
  if (rest.length === 2 && isSlug(city)) {
    return { page_type: "city", page_state: state.toUpperCase(), page_city: city };
  }
  return OTHER;
}

function classifyLibrary(rest: readonly string[]): PageClassification {
  const [state, city, slug] = rest;
  if (rest.length !== 3 || !STATE_SEGMENT.test(state) || !isSlug(city) || !isSlug(slug)) {
    return OTHER;
  }
  return { page_type: "library", page_state: state.toUpperCase(), page_city: city };
}

/** Classifies a pathname (or absolute URL) into a page type plus URL ids. */
export function classifyPath(input: string): PageClassification {
  const segments = segmentsOf(input);
  if (segments === null) return OTHER;
  const [root = "", ...rest] = segments;
  if (rest.length === 0 && root in FIXED_PAGES) return { page_type: FIXED_PAGES[root] };
  if (root === "storytimes") return classifyStorytimes(rest);
  if (root === "library") return classifyLibrary(rest);
  return OTHER;
}
