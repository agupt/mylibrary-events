import type { FeedEntry, FeedVendor } from "./events/calendarFeeds";
import type { Library } from "./types";

export type CoverageStatus = "active" | "detected" | "none";

export interface LibraryCoverage {
  library: Library;
  systemKey: string;
  status: CoverageStatus;
  vendor?: FeedVendor;
}

export interface SystemInfo {
  systemKey: string;
  system: string;
  state: string;
  outlets: number;
  status: CoverageStatus;
  vendor?: FeedVendor;
}

export interface StateCoverage {
  state: string;
  libraries: number;
  active: number;
  detected: number;
}

export interface CoverageSummary {
  libraries: { total: number; active: number; detected: number; none: number };
  systems: { total: number; active: number; detected: number; none: number };
  byVendor: Record<string, { systems: number; libraries: number }>;
  byState: StateCoverage[];
  topUncoveredSystems: SystemInfo[];
}

const TOP_UNCOVERED_LIMIT = 15;

export function coverageForLibrary(
  library: Library,
  registry: Record<string, FeedEntry>,
): LibraryCoverage {
  const systemKey = library.id.split("-")[0];
  const entry = registry[systemKey];
  return {
    library,
    systemKey,
    status: entry?.status ?? "none",
    vendor: entry?.vendor,
  };
}

export function computeCoverage(
  libraries: Library[],
  registry: Record<string, FeedEntry>,
): { perLibrary: LibraryCoverage[]; summary: CoverageSummary } {
  const perLibrary = libraries.map((library) =>
    coverageForLibrary(library, registry),
  );

  const systems = new Map<string, SystemInfo>();
  const byState = new Map<string, StateCoverage>();
  const byVendor: Record<string, { systems: number; libraries: number }> = {};
  const counts = { active: 0, detected: 0, none: 0 };

  for (const coverage of perLibrary) {
    counts[coverage.status] += 1;

    const existing = systems.get(coverage.systemKey);
    systems.set(coverage.systemKey, {
      systemKey: coverage.systemKey,
      system: coverage.library.system,
      state: coverage.library.state,
      outlets: (existing?.outlets ?? 0) + 1,
      status: coverage.status,
      vendor: coverage.vendor,
    });

    const state = byState.get(coverage.library.state) ?? {
      state: coverage.library.state,
      libraries: 0,
      active: 0,
      detected: 0,
    };
    byState.set(coverage.library.state, {
      ...state,
      libraries: state.libraries + 1,
      active: state.active + (coverage.status === "active" ? 1 : 0),
      detected: state.detected + (coverage.status === "detected" ? 1 : 0),
    });

    if (coverage.vendor) {
      const vendor = byVendor[coverage.vendor] ?? { systems: 0, libraries: 0 };
      byVendor[coverage.vendor] = {
        ...vendor,
        libraries: vendor.libraries + 1,
      };
    }
  }

  const systemList = [...systems.values()];
  for (const system of systemList) {
    if (system.vendor) {
      const vendor = byVendor[system.vendor] ?? { systems: 0, libraries: 0 };
      byVendor[system.vendor] = { ...vendor, systems: vendor.systems + 1 };
    }
  }

  const summary: CoverageSummary = {
    libraries: { total: perLibrary.length, ...counts },
    systems: {
      total: systemList.length,
      active: systemList.filter((s) => s.status === "active").length,
      detected: systemList.filter((s) => s.status === "detected").length,
      none: systemList.filter((s) => s.status === "none").length,
    },
    byVendor,
    byState: [...byState.values()].sort((a, b) =>
      a.state.localeCompare(b.state),
    ),
    topUncoveredSystems: systemList
      .filter((s) => s.status === "none")
      .sort((a, b) => b.outlets - a.outlets)
      .slice(0, TOP_UNCOVERED_LIMIT),
  };

  return { perLibrary, summary };
}
