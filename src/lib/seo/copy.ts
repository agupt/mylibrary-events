import { stateNameFor } from "./stateNames";

/**
 * Data-derived page copy for the landing network. Uniqueness comes from real
 * data (city/branch names, branch counts, nearby cities) rather than spun
 * prose; the small static parts rotate across a few templates keyed by a
 * stable hash of the place so no two pages are byte-identical at scale.
 *
 * Pure — no server imports; safe to unit-test.
 */

/** FNV-1a hash -> unsigned 32-bit, for stable template rotation. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick<T>(options: readonly T[], seed: number): T {
  return options[seed % options.length];
}

function branchWord(count: number): string {
  return count === 1 ? "branch" : "branches";
}

export interface FaqItem {
  question: string;
  answer: string;
}

// ---------- City hub ----------

export function cityTitle(city: string, stateCode: string): string {
  return `${city} Library Storytimes & Kids' Events (${stateCode.toUpperCase()})`;
}

export function cityDescription(
  city: string,
  stateCode: string,
  branchCount: number,
): string {
  return `Free storytimes, crafts, and STEM programs for kids at ${branchCount} public library ${branchWord(
    branchCount,
  )} in ${city}, ${stateCode.toUpperCase()}. Browse live calendars and filter by age and event type.`;
}

export function cityHeading(city: string): string {
  return `Storytimes & Free Kids' Events at ${city} Public Libraries`;
}

export function cityIntro(
  city: string,
  stateCode: string,
  branchCount: number,
): string {
  const seed = hashString(`${stateCode}/${city}`);
  const openers = [
    `${city} families have ${branchCount} public library ${branchWord(
      branchCount,
    )} running free programs for babies, toddlers, preschoolers, and school-age kids.`,
    `Across ${branchCount} public library ${branchWord(
      branchCount,
    )} in ${city}, ${stateNameFor(
      stateCode,
    )}, you'll find free storytimes, craft sessions, and STEM activities for children.`,
    `Looking for something free to do with the kids in ${city}? These ${branchCount} public library ${branchWord(
      branchCount,
    )} host storytimes, music and movement, crafts, and more.`,
  ];
  return `${pick(openers, seed)} The calendar below is live — filter by age group or event type to find the right fit near you.`;
}

export function cityFaq(
  city: string,
  stateCode: string,
  branchNames: readonly string[],
): FaqItem[] {
  const stateName = stateNameFor(stateCode);
  const branchList =
    branchNames.length <= 4
      ? branchNames.join(", ")
      : `${branchNames.slice(0, 4).join(", ")}, and more`;
  return [
    {
      question: `Are ${city} library kids' events free?`,
      answer: `Yes. Every storytime, craft, and STEM program listed for ${city}, ${stateName} public libraries is free and open to the public — no ticket or membership required.`,
    },
    {
      question: `What ages are storytimes for in ${city}?`,
      answer: `Programs span babies (0–18 months), toddlers, preschoolers (3–5 years), and school-age children (5–12). Use the age filter above to see just the events that fit your child.`,
    },
    {
      question: `Which ${city} library branches run children's programs?`,
      answer: `Branches with live kids' calendars include ${branchList}. Open any branch below for its own upcoming schedule and address.`,
    },
    {
      question: `How often are new events added?`,
      answer: `Calendars are pulled live from each library's own event feed, so new storytimes and programs appear as staff post them — usually several times a week.`,
    },
  ];
}

// ---------- Library page ----------

export function libraryTitle(
  libraryName: string,
  city: string,
  stateCode: string,
): string {
  const base = `${libraryName} Storytimes & Kids' Events`;
  // Drop the redundant city tail when the name already contains the city.
  if (libraryName.toLowerCase().includes(city.toLowerCase())) return base;
  return `${base} — ${city}, ${stateCode.toUpperCase()}`;
}

export function libraryDescription(
  libraryName: string,
  city: string,
  stateCode: string,
): string {
  return `Upcoming free storytimes, crafts, and STEM programs for babies, toddlers, and preschoolers at ${libraryName} in ${city}, ${stateCode.toUpperCase()}. See this week's live calendar and filter by age.`;
}

export function libraryHeading(libraryName: string): string {
  return `Storytimes & Kids' Events at ${libraryName}`;
}

export function libraryIntro(
  libraryName: string,
  city: string,
  stateCode: string,
  system: string,
): string {
  const seed = hashString(libraryName);
  const openers = [
    `${libraryName} runs free children's programs — storytimes, crafts, music and movement, and STEM — for families in ${city}, ${stateNameFor(
      stateCode,
    )}.`,
    `Part of the ${system}, ${libraryName} hosts free storytimes and kids' activities you can join in ${city}.`,
    `Bring the kids to ${libraryName} in ${city} for free storytimes and hands-on programs built for babies through school-age children.`,
  ];
  return `${pick(openers, seed)} The schedule below updates live from the library's own calendar.`;
}

export function libraryFaq(
  libraryName: string,
  city: string,
  stateCode: string,
): FaqItem[] {
  return [
    {
      question: `Is storytime at ${libraryName} free?`,
      answer: `Yes — storytimes and children's programs at ${libraryName} are free and open to the public. Just show up, or check the calendar below for any that ask you to register.`,
    },
    {
      question: `When is storytime at ${libraryName}?`,
      answer: `Storytime days and times vary by season and age group. The live calendar above shows every upcoming session at ${libraryName} in ${city}, ${stateNameFor(
        stateCode,
      )} — filter by age to see the right one.`,
    },
    {
      question: `What ages are the programs for?`,
      answer: `Expect programs for babies (0–18 months), toddlers, preschoolers (3–5 years), and school-age kids (5–12). Each event above is tagged with its age group.`,
    },
  ];
}

// ---------- State hub ----------

export function stateTitle(stateCode: string, cityCount: number): string {
  return `${stateNameFor(stateCode)} Library Storytimes — ${cityCount} Cities`;
}

export function stateDescription(
  stateCode: string,
  cityCount: number,
  topCities: readonly string[],
): string {
  const examples = topCities.slice(0, 2).join(" to ");
  const tail = examples ? `, from ${examples}` : "";
  return `Find free children's storytimes and events at public libraries across ${cityCount} ${stateNameFor(
    stateCode,
  )} cities${tail}. Browse live calendars by city and branch.`;
}
