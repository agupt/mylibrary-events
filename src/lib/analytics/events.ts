/**
 * Typed analytics event builders (Phase 0 signals — see
 * docs/growth-agent/SIGNALS.md). Pure: the browser wiring in `browser.ts`
 * only forwards what these return. Privacy rules: never raw query text,
 * never per-user identifiers; libraries are keyed by public IMLS ids.
 */
import { systemKeyOf } from "../libraryId";
import type { Library, StorytimeEvent } from "../types";
import { scrubFeedback } from "./scrub";

export type QueryKind = "zip" | "city";
export type SearchOutcome = "ok" | "ambiguous" | "not-found" | "error";
export type FeedbackContext = "no-location" | "no-feed" | "no-events";
export type LinkPlacement = "home" | "nearby";

export interface SearchPerformedEvent {
  name: "search_performed";
  properties: {
    query_kind: QueryKind;
    outcome: SearchOutcome;
    home_system?: string;
    matched_state?: string;
  };
}

export interface SearchResultsEvent {
  name: "search_results";
  properties: {
    home_system: string;
    home_has_feed: boolean;
    systems_without_feed: string[];
    zero_event_systems: string[];
    event_count: number;
    library_count: number;
    system_count: number;
    radius_miles: number;
    fetch_failed?: true;
  };
}

export interface FilterChangedEvent {
  name: "filter_changed";
  properties: { filter: string; value: string };
}

export interface OutboundClickEvent {
  name: "outbound_click";
  properties: {
    link: "library_website";
    library_id: string;
    system: string;
    placement: LinkPlacement;
  };
}

export interface FeedbackEvent {
  name: "feedback_submitted";
  properties: { message: string; context: FeedbackContext; home_system?: string };
}

export type AnalyticsEvent =
  | SearchPerformedEvent
  | SearchResultsEvent
  | FilterChangedEvent
  | OutboundClickEvent
  | FeedbackEvent;

const ZIP_PATTERN = /^\d{5}$/;

export function classifyQuery(query: string): QueryKind {
  return ZIP_PATTERN.test(query.trim()) ? "zip" : "city";
}

/** `/api/location` failure status → outcome (404 unknown, 400 ambiguous). */
export function outcomeFromHttpStatus(status: number | undefined): SearchOutcome {
  if (status === 404) return "not-found";
  if (status === 400) return "ambiguous";
  return "error";
}

interface SearchPerformedInput {
  query: string;
  outcome: SearchOutcome;
  homeLibrary?: Library;
}

/** S2 — one per submitted search. The query text itself is never sent. */
export function buildSearchPerformedEvent({
  query,
  outcome,
  homeLibrary,
}: SearchPerformedInput): SearchPerformedEvent {
  const base = { query_kind: classifyQuery(query), outcome };
  return {
    name: "search_performed",
    properties: homeLibrary
      ? { ...base, home_system: systemKeyOf(homeLibrary.id), matched_state: homeLibrary.state }
      : base,
  };
}

interface SearchResultsInput {
  homeLibrary: Library;
  scopeLibraries: readonly Library[];
  events: readonly StorytimeEvent[];
  libraryIdsWithoutFeed: readonly string[];
  radiusMiles: number;
  fetchFailed?: boolean;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * S3 + S4 — one per search, on the first events load. S3: in-scope systems
 * with no connected feed (demand naming the library to add). S4: in-scope
 * systems with a feed that returned zero kid events.
 */
export function buildSearchResultsEvent(input: SearchResultsInput): SearchResultsEvent {
  const homeSystem = systemKeyOf(input.homeLibrary.id);
  const scopeSystems = uniqueSorted(input.scopeLibraries.map((l) => systemKeyOf(l.id)));
  const scopeIds = new Set(input.scopeLibraries.map((l) => l.id));
  const withoutFeed = input.fetchFailed
    ? []
    : uniqueSorted(input.libraryIdsWithoutFeed.filter((id) => scopeIds.has(id)).map(systemKeyOf));
  const systemsWithEvents = new Set(input.events.map((e) => systemKeyOf(e.libraryId)));
  const zeroEvent = input.fetchFailed
    ? []
    : scopeSystems.filter((key) => !withoutFeed.includes(key) && !systemsWithEvents.has(key));

  return {
    name: "search_results",
    properties: {
      home_system: homeSystem,
      home_has_feed: !withoutFeed.includes(homeSystem),
      systems_without_feed: withoutFeed,
      zero_event_systems: zeroEvent,
      event_count: input.events.length,
      library_count: input.scopeLibraries.length,
      system_count: scopeSystems.length,
      radius_miles: input.radiusMiles,
      ...(input.fetchFailed ? { fetch_failed: true as const } : {}),
    },
  };
}

/** S9 — one event per filter whose value changed (cleared → ""). */
export function buildFilterChangedEvents<K extends string>(
  previous: Readonly<Record<K, string>>,
  next: Readonly<Record<K, string>>,
): FilterChangedEvent[] {
  return (Object.keys(next) as K[])
    .filter((key) => previous[key] !== next[key])
    .map((key) => ({ name: "filter_changed", properties: { filter: key, value: next[key] } }));
}

/** S9 — the "job done" moment: a click through to the library's site. */
export function buildOutboundClickEvent({
  libraryId,
  placement,
}: {
  libraryId: string;
  placement: LinkPlacement;
}): OutboundClickEvent {
  return {
    name: "outbound_click",
    properties: {
      link: "library_website",
      library_id: libraryId,
      system: systemKeyOf(libraryId),
      placement,
    },
  };
}

interface FeedbackInput {
  message: string;
  context: FeedbackContext;
  homeLibraryId?: string;
}

/** F10 — scrubbed free-text feedback; null when nothing is left to send. */
export function buildFeedbackEvent({
  message,
  context,
  homeLibraryId,
}: FeedbackInput): FeedbackEvent | null {
  const scrubbed = scrubFeedback(message);
  if (scrubbed.length === 0) return null;
  return {
    name: "feedback_submitted",
    properties: homeLibraryId
      ? { message: scrubbed, context, home_system: systemKeyOf(homeLibraryId) }
      : { message: scrubbed, context },
  };
}
