import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Library } from "../types";

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
 * Websites come from ONE store: generated/domains.json, keyed by system.
 * Trust is a field on each entry (source: "verified" hand-checked vs
 * "web-search" machine-found), not a separate file — findDomains.mjs
 * never overwrites existing keys, so verified entries are stable.
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
    const domains = loadSearchedDomains();
    cache = loadGeneratedLibraries().map((library) => {
      const websiteUrl = domains[library.id.split("-")[0]];
      return websiteUrl ? { ...library, websiteUrl } : library;
    });
  }
  return cache;
}
