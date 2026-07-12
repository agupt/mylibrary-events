import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { CoverageMap } from "@/components/CoverageMap";
import { computeCoverage } from "@/lib/coverage";
import { getAllLibraries } from "@/lib/data/directory";
import { getFeedRegistry } from "@/lib/events/calendarFeeds";

export const dynamic = "force-dynamic";

interface ZipStats {
  generatedAt: string;
  zipAnalysis: {
    total: number;
    nearestIsActive: number;
    nearestIsDetected: number;
    nearestDistanceMiles: { median: number; p90: number };
  };
  byState?: Array<{ state: string; zips: number; zipsNearActive: number }>;
}

function loadZipStats(): ZipStats | null {
  const filePath = path.join(
    process.cwd(),
    "src/lib/data/generated/coverageStats.json",
  );
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function StatTile({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "active" | "detected";
}) {
  const valueClass =
    tone === "active"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "detected"
        ? "text-amber-700 dark:text-amber-400"
        : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {detail && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
      )}
    </div>
  );
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(1)}%`;

export default function StatusPage() {
  const libraries = getAllLibraries();
  const registry = getFeedRegistry();
  const { perLibrary, summary } = computeCoverage(libraries, registry);
  const zipStats = loadZipStats();

  const vendors = Object.entries(summary.byVendor).sort(
    (a, b) => b[1].systems - a[1].systems,
  );
  const states = [...summary.byState].sort((a, b) => b.active - a.active);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <header className="mb-6">
        <p className="text-sm">
          <Link
            href="/"
            className="text-indigo-600 hover:underline dark:text-indigo-400"
          >
            ← Library Storytime
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Event Calendar Coverage
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Every US public library outlet (IMLS PLS FY2022) against the feed
          registry.
          {zipStats && ` Zip analysis generated ${zipStats.generatedAt.slice(0, 16).replace("T", " ")} UTC.`}
        </p>
      </header>

      <section
        aria-label="Coverage totals"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <StatTile
          label="Libraries"
          value={summary.libraries.total.toLocaleString()}
          detail={`${summary.systems.total.toLocaleString()} systems`}
        />
        <StatTile
          label="Active coverage"
          value={summary.libraries.active.toLocaleString()}
          detail={`${pct(summary.libraries.active, summary.libraries.total)} of libraries · ${summary.systems.active} systems`}
          tone="active"
        />
        <StatTile
          label="Vendor detected"
          value={summary.libraries.detected.toLocaleString()}
          detail={`${pct(summary.libraries.detected, summary.libraries.total)} · ${summary.systems.detected} systems`}
          tone="detected"
        />
        <StatTile
          label="No coverage"
          value={summary.libraries.none.toLocaleString()}
          detail={`${pct(summary.libraries.none, summary.libraries.total)} · ${summary.systems.none} systems`}
        />
        <StatTile
          label="Zips near active"
          value={
            zipStats
              ? pct(zipStats.zipAnalysis.nearestIsActive, zipStats.zipAnalysis.total)
              : "—"
          }
          detail={
            zipStats
              ? `${zipStats.zipAnalysis.nearestIsActive.toLocaleString()} of ${zipStats.zipAnalysis.total.toLocaleString()} zips`
              : "run: npm run coverage"
          }
          tone="active"
        />
        <StatTile
          label="Median distance"
          value={
            zipStats
              ? `${zipStats.zipAnalysis.nearestDistanceMiles.median.toFixed(1)} mi`
              : "—"
          }
          detail={
            zipStats
              ? `p90 ${zipStats.zipAnalysis.nearestDistanceMiles.p90.toFixed(1)} mi to nearest library`
              : undefined
          }
        />
      </section>

      <div className="mb-6">
        <CoverageMap coverage={perLibrary} />
      </div>

      <section aria-label="Vendors" className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Event-calendar platforms in the registry
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full bg-white text-sm dark:bg-slate-800">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2 text-right">Systems</th>
                <th className="px-3 py-2 text-right">Library outlets</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(([vendor, counts]) => (
                <tr
                  key={vendor}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-700/50"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {vendor}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {counts.systems}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {counts.libraries.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Coverage by state" className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Coverage by state (sorted by active libraries)
        </h2>
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full bg-white text-sm dark:bg-slate-800">
            <thead className="sticky top-0 bg-white dark:bg-slate-800">
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Libraries</th>
                <th className="px-3 py-2 text-right">Active</th>
                <th className="px-3 py-2 text-right">Detected</th>
                <th className="px-3 py-2 text-right">Active %</th>
              </tr>
            </thead>
            <tbody>
              {states.map((state) => (
                <tr
                  key={state.state}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-700/50"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {state.state}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {state.libraries.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {state.active.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                    {state.detected.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {pct(state.active, state.libraries)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Expansion targets">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Largest uncovered systems (expansion targets)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full bg-white text-sm dark:bg-slate-800">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="px-3 py-2">System</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Outlets</th>
              </tr>
            </thead>
            <tbody>
              {summary.topUncoveredSystems.map((system) => (
                <tr
                  key={system.systemKey}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-700/50"
                >
                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                    {system.system}{" "}
                    <span className="text-xs text-slate-400">({system.systemKey})</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {system.state}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {system.outlets}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
