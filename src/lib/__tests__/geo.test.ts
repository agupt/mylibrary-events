import { describe, expect, test } from "vitest";
import { haversineMiles } from "../geo";

describe("haversineMiles", () => {
  test("returns 0 for identical points", () => {
    // Arrange
    const sf = { latitude: 37.7793, longitude: -122.4157 };

    // Act
    const distance = haversineMiles(sf, sf);

    // Assert
    expect(distance).toBe(0);
  });

  test("returns known distance between SF and Oakland main libraries", () => {
    // Arrange
    const sfMain = { latitude: 37.7793, longitude: -122.4157 };
    const oaklandMain = { latitude: 37.8014, longitude: -122.2727 };

    // Act
    const distance = haversineMiles(sfMain, oaklandMain);

    // Assert — straight-line distance is roughly 8 miles
    expect(distance).toBeGreaterThan(7);
    expect(distance).toBeLessThan(9);
  });

  test("is symmetric", () => {
    // Arrange
    const a = { latitude: 37.7793, longitude: -122.4157 };
    const b = { latitude: 37.3352, longitude: -121.8852 };

    // Act & Assert
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 10);
  });
});
