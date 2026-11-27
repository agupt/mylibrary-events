/**
 * S13 page manifest (docs/growth-agent/phase1-impact.md §1, S13).
 *
 * Prints the programmatic SEO pages as JSON on stdout:
 *   [{ "path": "/library/ca/oakland/…", "type": "library", "systems": ["CA0081"] }, …]
 *
 * The eligibility gate stays in `src/lib/seo/pages.ts` (its single source
 * of truth); this script only reads it, never re-implements it. State hubs
 * are left out: they aggregate whole states and are never thin on their own.
 *
 * Run from the repo root (pages.ts reads data relative to process.cwd()):
 *   npx tsx scripts/growth/sources/pageManifest.ts
 */
import { getActiveCityPages, getActiveLibraryPages } from "../../../src/lib/seo/pages";

export interface ManifestPage {
  path: string;
  type: "library" | "city";
  systems: string[];
}

const systemOf = (libraryId: string): string => libraryId.split("-")[0];

export function buildManifest(): ManifestPage[] {
  const libraryPages: ManifestPage[] = getActiveLibraryPages().map((page) => ({
    path: page.path,
    type: "library",
    systems: [systemOf(page.library.id)],
  }));
  const cityPages: ManifestPage[] = getActiveCityPages().map((page) => ({
    path: page.path,
    type: "city",
    systems: [...new Set(page.libraries.map((l) => systemOf(l.library.id)))].sort(),
  }));
  return [...libraryPages, ...cityPages];
}

process.stdout.write(JSON.stringify(buildManifest()));
