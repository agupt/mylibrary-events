"use client";

import { useState } from "react";
import { track } from "@/lib/analytics/browser";
import { buildFeedbackEvent, type FeedbackContext } from "@/lib/analytics/events";
import { FEEDBACK_MAX_LENGTH } from "@/lib/analytics/scrub";

interface FeedbackBoxProps {
  context: FeedbackContext;
  homeLibraryId?: string;
}

const PROMPTS: Record<FeedbackContext, string> = {
  "no-location": "Which city or library were you looking for?",
  "no-feed": "Tell us which library you'd like added.",
  "no-events": "What were you hoping to find?",
};

/**
 * Signal F10: "Didn't find what you needed?" Shown on no-location, no-feed
 * and no-events states. Sent anonymously as an analytics event after
 * client-side PII scrubbing (see src/lib/analytics/scrub.ts).
 */
export function FeedbackBox({ context, homeLibraryId }: FeedbackBoxProps) {
  const [message, setMessage] = useState("");
  const [isSent, setIsSent] = useState(false);

  if (isSent) {
    return (
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        Thanks — we read every note and use them to decide which libraries to add next.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const feedback = buildFeedbackEvent({ message, context, homeLibraryId });
        if (!feedback) return;
        track(feedback);
        setIsSent(true);
      }}
      className="space-y-2 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <label className="block text-sm font-semibold" htmlFor={`feedback-${context}`}>
        Didn&rsquo;t find what you needed?
        <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
          {PROMPTS[context]}
        </span>
      </label>
      <textarea
        id={`feedback-${context}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={FEEDBACK_MAX_LENGTH}
        rows={2}
        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Sent without your name or IP address. Please don&rsquo;t include personal details.
        </p>
        <button
          type="submit"
          disabled={message.trim().length === 0}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
