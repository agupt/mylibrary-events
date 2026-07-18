import { describe, expect, it } from "vitest";
import { slugify, stateSlug } from "@/lib/seo/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces and punctuation", () => {
    expect(slugify("St. Paul")).toBe("st-paul");
    expect(slugify("Coeur d'Alene")).toBe("coeur-d-alene");
    expect(slugify("Winston-Salem")).toBe("winston-salem");
    expect(slugify("Ho-Ho-Kus")).toBe("ho-ho-kus");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("López")).toBe("lopez");
    expect(slugify("Cañon City")).toBe("canon-city");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  Oakland  ")).toBe("oakland");
    expect(slugify("--x--")).toBe("x");
  });

  it("collapses runs of non-alphanumerics to a single hyphen", () => {
    expect(slugify("A & B / C")).toBe("a-b-c");
  });
});

describe("stateSlug", () => {
  it("lowercases the USPS code", () => {
    expect(stateSlug("CA")).toBe("ca");
    expect(stateSlug("ny")).toBe("ny");
  });
});
