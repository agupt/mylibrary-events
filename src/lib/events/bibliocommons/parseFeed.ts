import { XMLParser } from "fast-xml-parser";

/** One raw event item from a BiblioCommons events RSS feed. */
export interface BcFeedEvent {
  id: string;
  title: string;
  description: string;
  link: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;
  isCancelled: boolean;
  audiences: string[];
  categories: string[];
  locationName: string;
  locationZip: string;
}

const MAX_DESCRIPTION_LENGTH = 280;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface RawCategory {
  "#text"?: string;
  "@_domain"?: string;
}

/**
 * Parses a BiblioCommons events RSS feed (the `<bc:>` namespace) into raw
 * event records. Malformed items are skipped, never thrown.
 */
export function parseBcFeed(xml: string): BcFeedEvent[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: "__cdata",
    parseTagValue: false,
  });
  const document: unknown = parser.parse(xml);
  const items = asArray(
    (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item,
  );

  const events: BcFeedEvent[] = [];
  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const startTime = String(item["bc:start_date"] ?? "");
    const title = String(item.title ?? "").trim();
    const link = String(item.link ?? item.guid ?? "");
    if (!startTime || !title || Number.isNaN(Date.parse(startTime))) {
      continue;
    }

    const categories = asArray(item.category as RawCategory | RawCategory[]);
    const byDomain = (domain: string): string[] =>
      categories
        .filter((category) => category["@_domain"] === domain)
        .map((category) => String(category["#text"] ?? ""))
        .filter(Boolean);

    const location = (item["bc:location"] ?? {}) as Record<string, unknown>;
    const rawDescription = item.description as
      | { __cdata?: string }
      | string
      | undefined;
    const descriptionHtml =
      typeof rawDescription === "object"
        ? String(rawDescription?.__cdata ?? "")
        : String(rawDescription ?? "");

    events.push({
      id: link || `${title}:${startTime}`,
      title,
      description: stripHtml(descriptionHtml).slice(0, MAX_DESCRIPTION_LENGTH),
      link,
      startTime,
      endTime: String(item["bc:end_date"] ?? startTime),
      isCancelled: String(item["bc:is_cancelled"]) === "true",
      audiences: byDomain("Audience"),
      categories: [...byDomain("Type"), ...byDomain("Program")],
      locationName: String(location["bc:name"] ?? ""),
      locationZip: String(location["bc:zip"] ?? "").slice(0, 5),
    });
  }
  return events;
}
