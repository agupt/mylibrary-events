import { EVENT_TYPES } from "../constants";
import { LIBRARIES } from "../data/libraries";
import type { AgeGroup, EventType, StorytimeEvent } from "../types";
import type { DateRange, EventProvider } from "./eventProvider";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EVENT_DURATION_MINUTES = 45;
const MIN_SLOTS_PER_LIBRARY = 3;
const SLOT_COUNT_SPREAD = 3; // libraries get 3–5 weekly slots
const EARLIEST_START_HOUR_UTC = 17; // 10am PDT
const START_HOUR_SPREAD = 8;

const AGE_GROUP_COMBOS: AgeGroup[][] = [
  ["baby"],
  ["toddler"],
  ["preschool"],
  ["school-age"],
  ["toddler", "preschool"],
  ["all-ages"],
];

const TITLES: Record<EventType, string[]> = {
  storytime: ["Baby Rhyme Time", "Toddler Storytime", "Preschool Stories"],
  craft: ["Craft Corner", "Make & Take Art", "Paper Crafts Workshop"],
  stem: ["LEGO Builders Club", "Little Scientists", "Coding for Kids"],
  "music-movement": ["Music & Movement", "Dance Party", "Sing-Along"],
  "book-club": ["Kids Book Club", "Graphic Novel Club", "Read to a Dog"],
};

/** FNV-1a string hash — stable across runs so mock data is deterministic. */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface WeeklySlot {
  dayOfWeek: number;
  startHourUtc: number;
  eventType: EventType;
  ageGroups: AgeGroup[];
  title: string;
}

function buildWeeklySlots(libraryId: string): WeeklySlot[] {
  const slotCount =
    MIN_SLOTS_PER_LIBRARY + (hashString(libraryId) % SLOT_COUNT_SPREAD);

  return Array.from({ length: slotCount }, (_, index) => {
    const seed = hashString(`${libraryId}:slot:${index}`);
    const eventType = EVENT_TYPES[seed % EVENT_TYPES.length];
    const titles = TITLES[eventType];
    return {
      dayOfWeek: seed % 7,
      startHourUtc: EARLIEST_START_HOUR_UTC + ((seed >>> 3) % START_HOUR_SPREAD),
      eventType,
      ageGroups: AGE_GROUP_COMBOS[(seed >>> 7) % AGE_GROUP_COMBOS.length],
      title: titles[(seed >>> 11) % titles.length],
    };
  });
}

function occurrencesInRange(
  libraryId: string,
  slot: WeeklySlot,
  range: DateRange,
): StorytimeEvent[] {
  const events: StorytimeEvent[] = [];
  const firstDay = new Date(range.start);
  firstDay.setUTCHours(0, 0, 0, 0);

  for (
    let day = firstDay.getTime();
    day < range.end.getTime();
    day += MS_PER_DAY
  ) {
    const date = new Date(day);
    if (date.getUTCDay() !== slot.dayOfWeek) {
      continue;
    }
    const start = new Date(day);
    start.setUTCHours(slot.startHourUtc, 0, 0, 0);
    if (start.getTime() < range.start.getTime() || start.getTime() >= range.end.getTime()) {
      continue;
    }
    const end = new Date(start.getTime() + EVENT_DURATION_MINUTES * 60 * 1000);
    events.push({
      id: `${libraryId}:${slot.title}:${start.toISOString()}`,
      libraryId,
      title: slot.title,
      eventType: slot.eventType,
      ageGroups: slot.ageGroups,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      description: `${slot.title} at the library. Free and open to the public; no registration required.`,
    });
  }
  return events;
}

const KNOWN_LIBRARY_IDS = new Set(LIBRARIES.map((library) => library.id));

/**
 * Deterministic seeded calendar: each library gets a stable set of weekly
 * recurring programs derived from a hash of its id.
 */
export const mockEventProvider: EventProvider = {
  async getEvents(libraryIds, range) {
    return libraryIds
      .filter((id) => KNOWN_LIBRARY_IDS.has(id))
      .flatMap((libraryId) =>
        buildWeeklySlots(libraryId).flatMap((slot) =>
          occurrencesInRange(libraryId, slot, range),
        ),
      )
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
  },
};
