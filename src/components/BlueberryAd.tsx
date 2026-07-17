"use client";

import { useState } from "react";

/**
 * First-party house ad for MyBlueBerry (the team's own baby-tracking app).
 * Pinned to a fixed bottom bar so it is visible before a search, after
 * results render, and while the user scrolls. The creatives are the
 * pre-approved, self-contained HTML units from the app's marketing kit
 * (no external requests, no third-party tracking), embedded via iframe per
 * their README. Dismissible per visit (resets on reload).
 *
 * The spacer reserves equal height in normal flow so the fixed bar never
 * hides the page footer when scrolled to the bottom.
 */

const AD_TITLE = "MyBlueBerry — a private baby tracker";

export function BlueberryAd() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <>
      <div aria-hidden className="h-[120px] md:h-[112px]" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-3 py-2 sm:gap-3">
          <span className="hidden shrink-0 rotate-180 text-[9px] font-semibold uppercase tracking-wider text-slate-400 [writing-mode:vertical-rl] sm:block">
            Sponsored
          </span>
          <iframe
            src="/ads/ad-320x100.html"
            width={320}
            height={100}
            scrolling="no"
            title={AD_TITLE}
            className="block max-w-full rounded-2xl border-0 shadow-sm md:hidden"
          />
          <iframe
            src="/ads/ad-728x90.html"
            width={728}
            height={90}
            scrolling="no"
            title={AD_TITLE}
            className="hidden max-w-full rounded-2xl border-0 shadow-sm md:block"
          />
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss advertisement"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
