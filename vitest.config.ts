import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/__tests__/fixtures/**",
        "src/lib/types.ts",
        // Network/runtime wiring — exercised by the live app, not unit tests
        "src/lib/events/index.ts",
        "src/lib/events/calendarFeeds.ts",
        "src/lib/apiResponse.ts",
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
