import { describe, expect, it } from "vitest";
import {
  cityDescription,
  cityFaq,
  cityHeading,
  cityIntro,
  cityTitle,
  hashString,
  libraryDescription,
  libraryFaq,
  libraryHeading,
  libraryIntro,
  libraryTitle,
  stateDescription,
  stateTitle,
} from "@/lib/seo/copy";

describe("hashString", () => {
  it("is deterministic and unsigned", () => {
    expect(hashString("oakland")).toBe(hashString("oakland"));
    expect(hashString("oakland")).toBeGreaterThanOrEqual(0);
  });

  it("differs for different inputs", () => {
    expect(hashString("ca/oakland")).not.toBe(hashString("or/portland"));
  });
});

describe("city copy", () => {
  it("builds a title with the state code", () => {
    expect(cityTitle("Oakland", "ca")).toBe(
      "Oakland Library Storytimes & Kids' Events (CA)",
    );
  });

  it("interpolates branch count and pluralizes correctly", () => {
    expect(cityDescription("Oakland", "ca", 1)).toContain("1 public library branch ");
    expect(cityDescription("Oakland", "ca", 18)).toContain(
      "18 public library branches ",
    );
  });

  it("varies the intro by place but stays stable per place", () => {
    const a = cityIntro("Oakland", "ca", 18);
    expect(a).toBe(cityIntro("Oakland", "ca", 18));
    expect(a).toContain("18");
    expect(cityHeading("Oakland")).toContain("Oakland");
  });

  it("produces a data-derived FAQ referencing the city and branches", () => {
    const faq = cityFaq("Oakland", "ca", ["Main Library", "Rockridge Branch"]);
    expect(faq.length).toBeGreaterThanOrEqual(3);
    expect(faq[0].question).toContain("Oakland");
    expect(faq[2].answer).toContain("Main Library");
  });
});

describe("library copy", () => {
  it("drops the redundant city tail when the name contains the city", () => {
    expect(libraryTitle("Oakland Main Library", "Oakland", "ca")).toBe(
      "Oakland Main Library Storytimes & Kids' Events",
    );
  });

  it("appends city/state when the name lacks the city", () => {
    expect(libraryTitle("Rockridge Branch", "Oakland", "ca")).toBe(
      "Rockridge Branch Storytimes & Kids' Events — Oakland, CA",
    );
  });

  it("builds description, heading, intro and FAQ", () => {
    expect(libraryDescription("Rockridge Branch", "Oakland", "ca")).toContain(
      "Rockridge Branch",
    );
    expect(libraryHeading("Rockridge Branch")).toContain("Rockridge Branch");
    expect(
      libraryIntro("Rockridge Branch", "Oakland", "ca", "Oakland Public Library"),
    ).toContain("Rockridge Branch");
    const faq = libraryFaq("Rockridge Branch", "Oakland", "ca");
    expect(faq[0].question).toContain("Rockridge Branch");
  });
});

describe("state copy", () => {
  it("builds title and description with city counts and examples", () => {
    expect(stateTitle("ca", 42)).toBe("California Library Storytimes — 42 Cities");
    const desc = stateDescription("ca", 42, ["Los Angeles", "Oakland"]);
    expect(desc).toContain("42 California cities");
    expect(desc).toContain("Los Angeles to Oakland");
  });

  it("omits the examples clause when no cities are given", () => {
    expect(stateDescription("ca", 1, [])).not.toContain(" from ");
  });
});
