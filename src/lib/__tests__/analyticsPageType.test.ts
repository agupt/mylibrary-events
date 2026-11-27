import { describe, expect, test } from "vitest";
import { classifyPath, PAGE_TYPES } from "../analytics/pageType";

describe("classifyPath", () => {
  test.each([
    ["/", { page_type: "home" }],
    ["", { page_type: "home" }],
    ["/storytimes", { page_type: "storytimes-index" }],
    ["/storytimes/", { page_type: "storytimes-index" }],
    ["/storytimes/ca", { page_type: "state", page_state: "CA" }],
    ["/storytimes/ca/oakland", { page_type: "city", page_state: "CA", page_city: "oakland" }],
    [
      "/library/ca/oakland/oakland-main-library",
      { page_type: "library", page_state: "CA", page_city: "oakland" },
    ],
    ["/privacy", { page_type: "privacy" }],
    ["/status", { page_type: "status" }],
  ])("classifies %s", (path, expected) => {
    expect(classifyPath(path)).toEqual(expected);
  });

  test("ignores query strings, hashes and a trailing slash", () => {
    expect(classifyPath("/storytimes/ny/brooklyn/?utm_source=x#top")).toEqual({
      page_type: "city",
      page_state: "NY",
      page_city: "brooklyn",
    });
  });

  test("accepts absolute URLs (GSC rows) and classifies by their path", () => {
    expect(classifyPath("https://mylibrary-events.com/storytimes/tx")).toEqual({
      page_type: "state",
      page_state: "TX",
    });
    expect(classifyPath("https://mylibrary-events.com/")).toEqual({ page_type: "home" });
  });

  test("treats segment case-insensitively but emits canonical values", () => {
    expect(classifyPath("/Storytimes/CA/Oakland")).toEqual({
      page_type: "city",
      page_state: "CA",
      page_city: "oakland",
    });
  });

  test.each([
    "/api/events",
    "/llms.txt",
    "/sitemap.xml",
    "/storytimes/california",
    "/storytimes/c1",
    "/storytimes/ca/oak land",
    "/storytimes/ca/oakland/extra",
    "/library/ca/oakland",
    "/library/ca/oakland/main/extra",
    "/library/ca/oakland/bad_slug!",
    "/privacy/extra",
    "/status/x",
    "not a url at all",
    "https://",
  ])("classifies %s as other, with no slug properties", (path) => {
    expect(classifyPath(path)).toEqual({ page_type: "other" });
  });

  test("never echoes an over-long slug", () => {
    const longSlug = "a".repeat(200);
    expect(classifyPath(`/storytimes/ca/${longSlug}`)).toEqual({ page_type: "other" });
  });

  test("every classification uses a declared page type", () => {
    const paths = ["/", "/storytimes", "/storytimes/ca", "/storytimes/ca/x", "/library/ca/x/y", "/privacy", "/status", "/zzz"];
    const types = new Set(paths.map((p) => classifyPath(p).page_type));
    expect([...types].every((t) => PAGE_TYPES.includes(t))).toBe(true);
    expect(types.size).toBe(PAGE_TYPES.length);
  });
});
