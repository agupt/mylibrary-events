/** Longest feedback message we send, after scrubbing. */
export const FEEDBACK_MAX_LENGTH = 500;

/**
 * Input is truncated to this before any regex runs, so scrubbing cost is
 * bounded no matter who calls it (the textarea's maxLength is client-only).
 * Slack beyond the output cap lets replacements shorten the text first.
 */
const SCRUB_INPUT_CAP = FEEDBACK_MAX_LENGTH * 4;

// Each pattern starts at a token boundary (lookbehind), so a failed match is
// not retried from every character inside a long run.
const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  // Emails.
  [/(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // Card-like runs: 13–19 digits with optional single space/dash separators.
  [/(?<![\d-])\d(?:[\s-]?\d){12,18}(?![\d-])/g, "[number]"],
  // US SSN shape.
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[number]"],
  // US phones: optional +1, (area) or area, ./-/space separators, or 10 bare digits.
  [/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]"],
  // International: +CC followed by 7–15 digits with separators.
  [/\+\d{1,3}(?:[\s.-]?\d){7,15}\b/g, "[phone]"],
  // 7-digit local numbers (555-1234). Zip codes (5 digits) and years stay.
  [/\b\d{3}[\s.-]\d{4}\b/g, "[phone]"],
];

/**
 * Strips contact and ID-like details (emails, phone numbers, long digit
 * runs) from free-text feedback, normalizes whitespace, and caps the length.
 * Best-effort: names and street addresses are not detected, which is why the
 * UI asks people not to include personal details. Runs in the browser before
 * the text is sent anywhere.
 */
export function scrubFeedback(text: string): string {
  const redacted = REDACTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text.slice(0, SCRUB_INPUT_CAP),
  );
  return redacted.replace(/\s+/g, " ").trim().slice(0, FEEDBACK_MAX_LENGTH);
}
