/**
 * Page-level analytics (WS-D, docs/growth-agent/phase1-impact.md §1a): the
 * page context attached to every event and the `page_action` builders. Pure.
 * Privacy: enums, counts, and ids derived from our own URLs / IMLS data only.
 */
import { classifyPath, type PageClassification, type PageType } from "./pageType";

/** Where on the page an internal (or non-library external) link sits. */
export const NAV_SLOTS = [
  "breadcrumb",
  "sibling",
  "branch",
  "nearby_city",
  "city",
  "state",
  "state_list",
  "finder",
  "footer",
  "other",
] as const;

export type NavSlot = (typeof NAV_SLOTS)[number];

export type WidgetOutcome = "ready" | "empty" | "error";

export interface PageContext extends PageClassification {
  /** IMLS outlet id, library pages only. */
  page_library?: string;
}

/** The library page's own outlet id, rendered into the page (see wiring). */
export interface LibraryMarker {
  path: string;
  libraryId: string;
}

export interface WidgetLoadedProperties {
  action: "widget_loaded";
  page_type: PageType;
  outcome: WidgetOutcome;
  event_count: number;
  library_count: number;
}

export interface NavClickProperties {
  action: "nav_click";
  page_type: PageType;
  target_page_type: PageType;
  slot: NavSlot;
}

export interface ExternalClickProperties {
  action: "external_click";
  page_type: PageType;
  slot: NavSlot;
  /** Hostname of a link we rendered; never the path or query. */
  target_domain: string;
}

export interface PageActionEvent {
  name: "page_action";
  properties: WidgetLoadedProperties | NavClickProperties | ExternalClickProperties;
}

const OUTLET_ID = /^[A-Z]{2}[0-9A-Z]{4}-\d{3}$/;

export function isOutletId(value: string | undefined): value is string {
  return typeof value === "string" && OUTLET_ID.test(value);
}

export function toNavSlot(value: string | undefined): NavSlot {
  return (NAV_SLOTS as readonly string[]).includes(value ?? "") ? (value as NavSlot) : "other";
}

function pathOnly(path: string): string {
  return path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/**
 * Context for the page being viewed. The outlet id comes from a marker the
 * library page renders; it is used only when the marker belongs to the
 * current path (a client-side navigation can leave a stale one behind).
 */
export function buildPageContext(pathname: string, marker?: LibraryMarker): PageContext {
  const classification = classifyPath(pathname);
  const markerMatches =
    marker !== undefined &&
    classification.page_type === "library" &&
    pathOnly(marker.path) === pathOnly(pathname) &&
    isOutletId(marker.libraryId);
  return markerMatches ? { ...classification, page_library: marker.libraryId } : classification;
}

interface NamedEvent {
  name: string;
  properties: object;
}

/** New event with the page context underneath the event's own properties. */
export function withPageContext<E extends NamedEvent>(
  event: E,
  context: PageContext,
): { name: E["name"]; properties: PageContext & E["properties"] } {
  return { name: event.name, properties: { ...context, ...event.properties } };
}

interface WidgetLoadedInput {
  pagePath: string;
  status: "ready" | "error";
  eventCount: number;
  libraryCount: number;
}

/** Landing widget finished loading (once per load; refetches re-emit). */
export function buildWidgetLoadedEvent({
  pagePath,
  status,
  eventCount,
  libraryCount,
}: WidgetLoadedInput): PageActionEvent {
  const outcome: WidgetOutcome = status === "error" ? "error" : eventCount > 0 ? "ready" : "empty";
  return {
    name: "page_action",
    properties: {
      action: "widget_loaded",
      page_type: classifyPath(pagePath).page_type,
      outcome,
      event_count: eventCount,
      library_count: libraryCount,
    },
  };
}
