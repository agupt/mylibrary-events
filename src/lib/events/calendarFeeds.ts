import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type FeedVendor =
  | "bibliocommons"
  | "libcal"
  | "ical"
  | "communico"
  | "bklyn";

export interface FeedEntry {
  vendor: FeedVendor;
  /**
   * active   — feed URL verified, events are being served
   * detected — vendor platform identified but the feed needs manual
   *            configuration (e.g. a LibCal calendar id)
   */
  status: "active" | "detected";
  url?: string;
  note?: string;
}

let registryCache: Record<string, FeedEntry> | null = null;

function readJsonIfPresent(filePath: string): Record<string, FeedEntry> {
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error: unknown) {
    console.error(`Ignoring malformed feed registry file ${filePath}`, error);
    return {};
  }
}

/**
 * Full feed registry keyed by IMLS system key (FSCSKEY):
 * hand-verified entries (src/lib/data/staticFeeds.json) merged with
 * auto-discovered ones from scripts/discoverFeeds.mjs — static wins.
 * BiblioCommons feeds cover every branch in a system; LibCal URLs are
 * ical_subscribe.php exports for a specific calendar id.
 */
export function getFeedRegistry(): Record<string, FeedEntry> {
  if (registryCache === null) {
    const staticFeeds = readJsonIfPresent(
      path.join(process.cwd(), "src/lib/data/staticFeeds.json"),
    );
    const discovered = readJsonIfPresent(
      path.join(process.cwd(), "src/lib/data/generated/discoveredFeeds.json"),
    );
    registryCache = { ...discovered, ...staticFeeds };
  }
  return registryCache;
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
