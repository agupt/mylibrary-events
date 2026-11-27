/**
 * Browser analytics wiring (excluded from unit coverage — exercised in the
 * live app). posthog-js is dynamically imported after the page is
 * interactive so it never sits in the initial bundle. Events tracked before
 * it loads are queued and flushed on init. Every event carries the page
 * context (`page_type` + URL/IMLS ids) of the page it happened on.
 */
import type { CaptureResult, PostHog } from "posthog-js";
import { analyticsConfig } from "./config";
import type { AnalyticsEvent } from "./events";
import { resolveLinkClick } from "./linkClicks";
import { buildPageContext, withPageContext, type PageContext } from "./pageEvents";

const MAX_QUEUED_EVENTS = 50;
/** Rendered by library pages: `<main data-page-library=… data-page-path=…>`. */
const LIBRARY_MARKER_SELECTOR = "[data-page-library]";

const config = analyticsConfig({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
});

interface QueuedEvent {
  name: string;
  properties: object;
}

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
let queue: readonly QueuedEvent[] = [];
let clicksInstalled = false;

function currentPageContext(): PageContext {
  const marker = document.querySelector<HTMLElement>(LIBRARY_MARKER_SELECTOR);
  const libraryId = marker?.dataset.pageLibrary;
  const path = marker?.dataset.pagePath;
  return buildPageContext(
    window.location.pathname,
    libraryId && path ? { libraryId, path } : undefined,
  );
}

/** Adds page context to PostHog's own events ($pageview) at send time. */
function addPageContext(result: CaptureResult | null): CaptureResult | null {
  if (!result || "page_type" in result.properties) return result;
  try {
    return { ...result, properties: { ...currentPageContext(), ...result.properties } };
  } catch {
    return result;
  }
}

function send(posthog: PostHog, event: QueuedEvent): void {
  try {
    posthog.capture(event.name, { ...event.properties });
  } catch {
    // Analytics must never break the page (callers sit in try blocks and
    // event handlers); a dropped event is the acceptable failure.
  }
}

/** Loads and initializes PostHog once. No-op outside production. */
export function initAnalytics(): Promise<void> {
  if (!config.isEnabled || typeof window === "undefined") return Promise.resolve();
  loading ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(config.token, {
        api_host: config.host,
        // Privacy decisions (PLAN §5, 2026-11-23): no cookies or storage,
        // no autocapture, no replay, no person profiles, no remote config.
        cookieless_mode: "always",
        person_profiles: "never",
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        disable_external_dependency_loading: true,
        capture_pageview: "history_change",
        capture_pageleave: false,
        before_send: addPageContext,
      });
      client = posthog;
      const pending = queue;
      queue = [];
      pending.forEach((event) => send(posthog, event));
    })
    .catch((error: unknown) => {
      // Analytics must never break the page; report once and stay disabled.
      console.warn("[analytics] failed to load", error);
    });
  return loading;
}

/**
 * Records one event, stamped with the context of the page it happened on
 * (not the page it is flushed from); queued until PostHog loads. Never throws.
 */
export function track(event: AnalyticsEvent | null): void {
  if (!event || !config.isEnabled) return;
  try {
    const stamped = withPageContext(event, currentPageContext());
    if (client) {
      send(client, stamped);
      return;
    }
    if (queue.length < MAX_QUEUED_EVENTS) queue = [...queue, stamped];
  } catch {
    // See send(): never break the page for analytics.
  }
}

function handleClick(event: MouseEvent): void {
  try {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLElement>("a[href]");
    // The attribute, not `.href` (an SVGAnimatedString on SVG anchors);
    // resolveLinkClick resolves it against the current page.
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) return;
    track(
      resolveLinkClick({
        href,
        origin: window.location.origin,
        currentPath: window.location.pathname,
        kind: anchor.dataset.analytics,
        slot: anchor.dataset.analyticsSlot,
        libraryId: anchor.dataset.libraryId,
      }),
    );
  } catch {
    // Never interfere with navigation.
  }
}

function handleMiddleClick(event: MouseEvent): void {
  if (event.button === 1) handleClick(event);
}

/**
 * One delegated, passive listener for every link on every page (capture
 * phase, so it runs before client-side navigation swaps the page). Links
 * opt into a slot / library id with `data-analytics-*` attributes; links a
 * component already tracks carry `data-analytics="manual"`.
 */
export function installLinkTracking(): void {
  if (!config.isEnabled || clicksInstalled || typeof document === "undefined") return;
  clicksInstalled = true;
  document.addEventListener("click", handleClick, { capture: true, passive: true });
  // auxclick also fires for right-click (context menu); count middle-click only.
  document.addEventListener("auxclick", handleMiddleClick, { capture: true, passive: true });
}
