import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type FeedVendor =
  | "bibliocommons"
  | "libcal"
  | "ical"
  | "communico"
  | "bklyn"
  | "flp"
  | "sfpl"
  | "civicplus"
  | "opencities"
  | "mylibrarydigital"
  | "snapshot";

export interface FeedEntry {
  vendor: FeedVendor;
  /**
   * active   — feed URL verified, events are being served
   * detected — vendor platform identified but the feed needs manual
   *            configuration (e.g. a LibCal calendar id)
   */
  status: "active" | "detected";
  /**
   * verified   — confirmed by a human (or an engineered integration like
   *              the Brooklyn adapter / NYPL snapshot); automation must
   *              NEVER modify or delete these entries
   * discovered — written by the discovery/activation scripts, which may
   *              freely update them on later runs
   */
  source: "verified" | "discovered";
  url?: string;
  note?: string;
  verifiedAt?: string;
}

let registryCache: Record<string, FeedEntry> | null = null;

/**
 * The single feed registry (src/lib/data/feedRegistry.json), keyed by
 * IMLS system key (FSCSKEY). One store per fact: trust is the `source`
 * field on each entry, not a file boundary. Humans and scripts write the
 * same file; scripts only touch source:"discovered" entries.
 */
export function getFeedRegistry(): Record<string, FeedEntry> {
  if (registryCache === null) {
    const filePath = path.join(process.cwd(), "src/lib/data/feedRegistry.json");
    if (!existsSync(filePath)) {
      console.error(`Feed registry missing at ${filePath}`);
      registryCache = {};
    } else {
      try {
        registryCache = JSON.parse(readFileSync(filePath, "utf8"));
      } catch (error: unknown) {
        console.error("Malformed feedRegistry.json", error);
        registryCache = {};
      }
    }
  }
  return registryCache ?? {};
}

export function getFeedEntry(systemKey: string): FeedEntry | undefined {
  return getFeedRegistry()[systemKey];
}

/** Feed URLs for one vendor, active entries only. */
export function activeFeedsByVendor(vendor: FeedVendor): Record<string, string> {
  return Object.fromEntries(
    Object.entries(getFeedRegistry())
      .filter(
        (entry): entry is [string, FeedEntry & { url: string }] =>
          entry[1].vendor === vendor &&
          entry[1].status === "active" &&
          typeof entry[1].url === "string",
      )
      .map(([systemKey, entry]) => [systemKey, entry.url]),
  );
}
