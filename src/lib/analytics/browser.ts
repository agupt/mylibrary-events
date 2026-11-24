/**
 * Browser analytics wiring (excluded from unit coverage — exercised in the
 * live app). posthog-js is dynamically imported after the page is
 * interactive so it never sits in the initial bundle. Events tracked before
 * it loads are queued and flushed on init.
 */
import type { PostHog } from "posthog-js";
import { analyticsConfig } from "./config";
import type { AnalyticsEvent } from "./events";

const MAX_QUEUED_EVENTS = 50;

const config = analyticsConfig({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_POSTHOG_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
});

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
let queue: readonly AnalyticsEvent[] = [];

function send(posthog: PostHog, event: AnalyticsEvent): void {
  try {
    posthog.capture(event.name, event.properties);
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

/** Records one event; queued until PostHog loads. Never throws. */
export function track(event: AnalyticsEvent | null): void {
  if (!event || !config.isEnabled) return;
  if (client) {
    send(client, event);
    return;
  }
  if (queue.length < MAX_QUEUED_EVENTS) queue = [...queue, event];
}
