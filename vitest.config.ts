import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      // Growth observer (docs/growth-agent/phase1-impact.md §2). Must stay
      // offline: data-refresh runs `npm test` weekly.
      "scripts/growth/**/*.test.{ts,mjs}",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      // Growth observer: pure lib/ only (sources/ is network wiring).
      include: ["src/lib/**/*.ts", "scripts/growth/lib/**/*.{ts,mjs}"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/__tests__/fixtures/**",
        "src/lib/types.ts",
        // Network/runtime wiring — exercised by the live app, not unit tests
        "src/lib/events/index.ts",
        "src/lib/events/calendarFeeds.ts",
        "src/lib/apiResponse.ts",
        "src/lib/analytics/browser.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
