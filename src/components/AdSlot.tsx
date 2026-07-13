"use client";

import { useEffect, useRef } from "react";

/**
 * Monetization slot. Renders a Google AdSense responsive unit when
 * NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) and a slot id are configured;
 * otherwise renders nothing in production and a dashed placeholder in
 * development so layout can be designed before the AdSense account is
 * approved.
 *
 * Note for this site: the audience is caregivers, but content is
 * child-directed adjacent — keep AdSense's "child-directed treatment"
 * tag setting on, and avoid personalized-ad categories (COPPA).
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

interface AdSlotProps {
  slot: string;
  label?: string;
}

export function AdSlot({ slot, label = "Advertisement" }: AdSlotProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!CLIENT || pushed.current) return;
    if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
      const script = document.createElement("script");
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
      pushed.current = true;
    } catch {
      // ad blocker or script not ready — fail silently
    }
  }, []);

  if (!CLIENT) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div
        aria-hidden
        className="my-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500"
      >
        Ad slot “{slot}” — set NEXT_PUBLIC_ADSENSE_CLIENT to activate
      </div>
    );
  }

  return (
    <div className="my-4">
      <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
