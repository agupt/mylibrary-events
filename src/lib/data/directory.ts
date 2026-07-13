import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Library } from "../types";
import { websiteForLibraryId } from "./systemWebsites";

/**
 * Library directory generated from the IMLS Public Libraries Survey by
 * scripts/importImlsLibraries.mjs (validated with zod at import time).
 * Server-side only — loaded lazily and cached for the process lifetime.
 */

type GeneratedLibrary = Omit<Library, "websiteUrl">;

let cache: Library[] | null = null;

function loadGeneratedLibraries(): GeneratedLibrary[] {
  const filePath = path.join(
    process.cwd(),
    "src/lib/data/generated/libraries.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `Library directory at ${filePath} is empty or malformed. ` +
        "Run: npm run data:libraries",
    );
  }
  return parsed as GeneratedLibrary[];
}

/**
 * Website sources, by trust tier:
 *  1. systemWebsites.ts — hand-verified overrides (always win)
 *  2. generated/domains.json — web-searched official domains
 *     (junk-filtered, spot-checked; found by findDomains.mjs)
 * Both the UI and the coverage pipeline read the same merged view, so
 * "we know the domain" and "we show the domain" can no longer diverge.
 */
function loadSearchedDomains(): Record<string, string> {
  const filePath = path.join(
    process.cwd(),
    "src/lib/data/generated/domains.json",
  );
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<
      string,
      { domain?: string }
    >;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => typeof value.domain === "string")
        .map(([key, value]) => [key, `https://${value.domain}`]),
    );
  } catch (error: unknown) {
    console.error("Ignoring malformed domains.json", error);
    return {};
  }
}

export function getAllLibraries(): Library[] {
  if (cache === null) {
    const searched = loadSearchedDomains();
    cache = loadGeneratedLibraries().map((library) => {
      const websiteUrl =
        websiteForLibraryId(library.id) ?? searched[library.id.split("-")[0]];
      return websiteUrl ? { ...library, websiteUrl } : library;
    });
  }
  return cache;
}
