import type { AgeGroup, EventType } from "../../types";

/**
 * Maps BiblioCommons audience labels (e.g. "Toddlers", "Grade Schoolers",
 * "Birth to 5") to the app's age groups.
 *
 * Returns null when the event is exclusively for teens/adults — callers
 * should drop it (this is a kids' events app). Events with no audience
 * data at all are treated as all-ages.
 */
export function mapAudiencesToAgeGroups(audiences: string[]): AgeGroup[] | null {
  if (audiences.length === 0) {
    return ["all-ages"];
  }

  const groups = new Set<AgeGroup>();
  for (const raw of audiences) {
    const audience = raw.toLowerCase();
    if (/\bbab(y|ies)\b|\binfant/.test(audience)) {
      groups.add("baby");
    } else if (/toddler/.test(audience)) {
      groups.add("toddler");
    } else if (/preschool|pre-school|pre-k/.test(audience)) {
      groups.add("preschool");
    } else if (/grade school|school age|school-age|\bkids?\b|tween|children/.test(audience)) {
      groups.add("school-age");
    } else if (/famil|all ages|everyone/.test(audience)) {
      groups.add("all-ages");
    } else if (/birth to 5|birth-5|ages 0-5|under 5/.test(audience)) {
      groups.add("baby");
      groups.add("toddler");
      groups.add("preschool");
    }
    // teens, adults, seniors: intentionally unmapped
  }

  return groups.size > 0 ? [...groups].sort() : null;
}

const TYPE_RULES: Array<{ pattern: RegExp; eventType: EventType }> = [
  { pattern: /story ?time|stories|rhyme|lapsit|read.?aloud/, eventType: "storytime" },
  { pattern: /book club|book group|book discussion|read to a/, eventType: "book-club" },
  { pattern: /craft|\bart\b|arts|maker|drawing|painting|origami|diy/, eventType: "craft" },
  { pattern: /stem|steam|science|lego|robot|cod(e|ing)|math|engineer/, eventType: "stem" },
  { pattern: /music|dance|movement|sing|concert|rhythm/, eventType: "music-movement" },
];

/**
 * Classifies an event using its BiblioCommons category labels first, then
 * the title; anything unrecognized is "other".
 */
export function classifyEventType(categories: string[], title: string): EventType {
  for (const haystack of [categories.join(" ").toLowerCase(), title.toLowerCase()]) {
    for (const rule of TYPE_RULES) {
      if (rule.pattern.test(haystack)) {
        return rule.eventType;
      }
    }
  }
  return "other";
}
