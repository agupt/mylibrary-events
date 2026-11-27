"use client";

import { useEffect } from "react";
import { initAnalytics, installLinkTracking } from "@/lib/analytics/browser";

const IDLE_TIMEOUT_MS = 3000;

/** Schedules work for an idle moment; returns a cancel function. */
function whenIdle(work: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(work, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(work, 0);
  return () => window.clearTimeout(handle);
}

/**
 * Starts analytics after the page has loaded and the main thread is idle,
 * so it never competes with LCP or hydration. Link clicks are listened for
 * from mount (queued until PostHog loads). Renders nothing.
 */
export function AnalyticsLoader() {
  useEffect(() => {
    installLinkTracking();
    let cancelIdle: (() => void) | undefined;
    const start = () => {
      cancelIdle = whenIdle(() => void initAnalytics());
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      cancelIdle?.();
    };
  }, []);
  return null;
}
