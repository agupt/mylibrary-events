import { describe, expect, test } from "vitest";
import {
  classifyEventType,
  inferAgeGroupsFromText,
  mapAudiencesToAgeGroups,
} from "../events/classify";

describe("mapAudiencesToAgeGroups", () => {
  test("maps standard BiblioCommons audiences", () => {
    expect(
      mapAudiencesToAgeGroups(["Toddlers", "Preschoolers"]),
    ).toEqual(["preschool", "toddler"]);
  });

  test("expands 'Birth to 5' into baby, toddler, and preschool", () => {
    expect(mapAudiencesToAgeGroups(["Birth to 5"])).toEqual([
      "baby",
      "preschool",
      "toddler",
    ]);
  });

  test("maps Families and Grade Schoolers", () => {
    expect(mapAudiencesToAgeGroups(["Families", "Grade Schoolers"])).toEqual([
      "all-ages",
      "school-age",
    ]);
  });

  test("returns null for adult-only events so callers can drop them", () => {
    expect(mapAudiencesToAgeGroups(["Adults", "Seniors"])).toBeNull();
    expect(mapAudiencesToAgeGroups(["Teens"])).toBeNull();
  });

  test("treats events with no audience data as all-ages", () => {
    expect(mapAudiencesToAgeGroups([])).toEqual(["all-ages"]);
  });
});

describe("inferAgeGroupsFromText", () => {
  test("infers groups from title keywords", () => {
    expect(inferAgeGroupsFromText("Baby Lapsit Storytime")).toEqual(["baby"]);
    expect(inferAgeGroupsFromText("Toddler & Preschool Dance")).toEqual([
      "preschool",
      "toddler",
    ]);
    expect(inferAgeGroupsFromText("LEGO Club for Kids")).toEqual(["school-age"]);
  });

  test("returns null for clearly adult/teen-only titles", () => {
    expect(inferAgeGroupsFromText("Adults Only Trivia Night")).toBeNull();
    expect(inferAgeGroupsFromText("Teen Advisory Board")).toBeNull();
  });

  test("defaults to all-ages when nothing matches", () => {
    expect(inferAgeGroupsFromText("Gardening Workshop")).toEqual(["all-ages"]);
  });

  test("kid keywords win over adult keywords when both appear", () => {
    expect(inferAgeGroupsFromText("Kids & Adults Chess Night")).toEqual([
      "school-age",
    ]);
  });
});

describe("classifyEventType", () => {
  test("prefers category labels over the title", () => {
    expect(classifyEventType(["Storytimes"], "Ms. Kelly's Morning Fun")).toBe(
      "storytime",
    );
  });

  test("falls back to title keywords", () => {
    expect(classifyEventType([], "LEGO Robotics Lab")).toBe("stem");
    expect(classifyEventType([], "Family Dance Party")).toBe("music-movement");
    expect(classifyEventType([], "Read to a Dog")).toBe("book-club");
    expect(classifyEventType([], "Watercolor Painting for Kids")).toBe("craft");
  });

  test("returns other for unrecognized programs", () => {
    expect(classifyEventType(["Outdoor"], "Petting Zoo Visit")).toBe("other");
  });
});
