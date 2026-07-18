import { AGE_GROUP_LABELS, EVENT_TYPE_LABELS } from "../constants";
import type { AgeGroup, Library, StorytimeEvent } from "../types";

/**
 * Pure schema.org JSON-LD builders. No server-only imports, so both the
 * server-rendered pages AND the client events widget can call them (the
 * widget emits Event markup that corresponds to the events it actually
 * renders — Google's structured-data policy requires that correspondence).
 *
 * Every @id / url MUST be an absolute https URL; callers pass SITE_URL.
 */

export const SITE_URL = "https://mylibrary-events.com";

type JsonLd = Record<string, unknown>;

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** WebSite node for the home page. No SearchAction until a GET /search exists. */
export function buildWebsiteNode(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `${SITE_URL}/`,
    name: "Library Storytime",
    description:
      "Free kids' storytimes and events at US public libraries, with live calendars.",
  };
}

export interface Crumb {
  name: string;
  /** Root-relative path or absolute URL. */
  path: string;
}

export function buildBreadcrumbList(crumbs: readonly Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

function postalAddress(library: Library): JsonLd {
  return {
    "@type": "PostalAddress",
    streetAddress: library.address,
    addressLocality: library.city,
    addressRegion: library.state,
    postalCode: library.zipCode,
    addressCountry: "US",
  };
}

/**
 * schema.org Library (a LocalBusiness subtype). @id is the page URL + #library
 * so Event.location and the breadcrumb can reference the same node.
 */
export function buildLibraryNode(library: Library, pagePath: string): JsonLd {
  const pageUrl = absoluteUrl(pagePath);
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Library",
    "@id": `${pageUrl}#library`,
    name: library.name,
    parentOrganization: {
      "@type": "GovernmentOrganization",
      name: library.system,
    },
    address: postalAddress(library),
    geo: {
      "@type": "GeoCoordinates",
      latitude: library.coordinates.latitude,
      longitude: library.coordinates.longitude,
    },
    mainEntityOfPage: pageUrl,
    isAccessibleForFree: true,
  };
  // Only emit url when we actually have the library's own website — never
  // guess a URL or emit url:null.
  if (library.websiteUrl) {
    node.url = library.websiteUrl;
  }
  return node;
}

/** Summary ItemList of library pages (used on city hubs). URL-only items. */
export function buildLibraryItemList(
  name: string,
  items: ReadonlyArray<{ name: string; path: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
    })),
  };
}

const AGE_BOUNDS: Record<AgeGroup, { min?: number; max?: number }> = {
  baby: { min: 0, max: 1 },
  toddler: { min: 1, max: 3 },
  preschool: { min: 3, max: 5 },
  "school-age": { min: 5, max: 12 },
  "all-ages": {},
};

function audienceFor(ageGroups: readonly AgeGroup[]): JsonLd | undefined {
  if (ageGroups.length === 0) return undefined;
  const mins = ageGroups
    .map((group) => AGE_BOUNDS[group].min)
    .filter((value): value is number => typeof value === "number");
  const maxes = ageGroups
    .map((group) => AGE_BOUNDS[group].max)
    .filter((value): value is number => typeof value === "number");
  const audience: JsonLd = {
    "@type": "PeopleAudience",
    audienceType: ageGroups.map((group) => AGE_GROUP_LABELS[group]).join(", "),
  };
  if (mins.length > 0) audience.suggestedMinAge = Math.min(...mins);
  if (maxes.length > 0) audience.suggestedMaxAge = Math.max(...maxes);
  return audience;
}

/**
 * One schema.org Event node for a rendered event. startDate/endDate carry the
 * library's floating local wall-clock (types.ts) with NO offset — accepted by
 * Google as local time. We deliberately do not fabricate a UTC offset (a wrong
 * offset shows wrong times); attaching a real IANA zone is a future task.
 */
export function buildEventNode(
  event: StorytimeEvent,
  library: Library | undefined,
  pagePath: string,
): JsonLd {
  const pageUrl = absoluteUrl(pagePath);
  const location: JsonLd = library
    ? { "@type": "Place", name: library.name, address: postalAddress(library) }
    : { "@type": "Place", name: event.libraryId };
  const node: JsonLd = {
    "@type": "Event",
    name: event.title,
    startDate: event.startTime,
    endDate: event.endTime,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    description: event.description || `${EVENT_TYPE_LABELS[event.eventType]} for kids.`,
    keywords: [
      EVENT_TYPE_LABELS[event.eventType],
      ...event.ageGroups.map((group) => AGE_GROUP_LABELS[group]),
    ].join(", "),
    location,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: pageUrl,
    },
  };
  if (library) {
    node.organizer = {
      "@type": "Organization",
      name: library.system,
      ...(library.websiteUrl ? { url: library.websiteUrl } : {}),
    };
  }
  const audience = audienceFor(event.ageGroups);
  if (audience) node.audience = audience;
  return node;
}

/** FAQPage node — only emit where the answers are genuinely on the page. */
export function buildFaqPage(
  items: ReadonlyArray<{ question: string; answer: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** ItemList wrapper of Event nodes, capped for a reasonable payload. */
export function buildEventItemList(
  events: readonly StorytimeEvent[],
  librariesById: ReadonlyMap<string, Library>,
  pagePath: string,
  cap = 20,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: events.slice(0, cap).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: buildEventNode(event, librariesById.get(event.libraryId), pagePath),
    })),
  };
}
