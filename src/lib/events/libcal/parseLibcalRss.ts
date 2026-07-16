import { XMLParser } from "fast-xml-parser";

/** One event item from a LibCal rss.php?m=month feed. */
export interface LibcalRssEvent {
  id: string;
  title: string;
  link: string;
  /** Floating local wall-clock ISO (library's own timezone), e.g. "2026-07-13T10:15:00" */
  startTime: string;
  endTime: string;
  /** True when the feed item carried no start time (all-day). */
  isAllDay: boolean;
  audiences: string[];
  campus: string;
  location: string;
  categories: string[];
  description: string;
}

const MAX_DESCRIPTION_LENGTH = 280;

function stripHtml(html: string): string {
  return (
    html
      // LibCal double-encodes markup (&#x3C;p&#x3E;) — decode the angle
      // brackets first so tag stripping sees real tags.
      .replace(/&#x3C;|&lt;/gi, "<")
      .replace(/&#x3E;|&gt;/gi, ">")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;|&#x26;/gi, "&")
      .replace(/&#x?39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim()
  );
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a LibCal events RSS feed (rss.php?m=month&cid=N). Emits floating
 * local timestamps — LibCal reports wall-clock times in the library's own
 * timezone, which is what patrons care about. Malformed items are skipped.
 */
export function parseLibcalRss(xml: string): LibcalRssEvent[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const document: unknown = parser.parse(xml);
  const items = asArray(
    (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item,
  );

  const events: LibcalRssEvent[] = [];
  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const title = stripHtml(String(item.title ?? ""));
    const date = String(item["libcal:date"] ?? "");
    if (!title || !DATE_PATTERN.test(date)) {
      continue;
    }
    const start = String(item["libcal:start"] ?? "");
    const end = String(item["libcal:end"] ?? "");
    const hasStartTime = TIME_PATTERN.test(start);
    const startTime = `${date}T${hasStartTime ? start : "00:00:00"}`;
    const link = String(item.link ?? item.guid ?? "");

    events.push({
      id: String(item["libcal:eventid"] ?? link ?? `${title}:${startTime}`),
      title,
      link,
      startTime,
      endTime: `${date}T${TIME_PATTERN.test(end) ? end : start || "23:59:59"}`,
      isAllDay: !hasStartTime,
      audiences: stripHtml(String(item["libcal:audience"] ?? ""))
        .split(",")
        .map((audience) => audience.trim())
        .filter(Boolean),
      campus: stripHtml(String(item["libcal:campus"] ?? "")),
      location: stripHtml(String(item["libcal:location"] ?? "")),
      categories: asArray(item.category as string | string[]).map((category) =>
        stripHtml(String(category)),
      ),
      description: stripHtml(String(item["libcal:description"] ?? item.description ?? "")).slice(
        0,
        MAX_DESCRIPTION_LENGTH,
      ),
    });
  }
  return events;
}
