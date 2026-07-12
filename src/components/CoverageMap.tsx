import { isConterminous, projectAlbersUsa } from "@/lib/albersProjection";
import type { LibraryCoverage } from "@/lib/coverage";

const WIDTH = 960;
const HEIGHT = 600;
const PADDING = 16;

/**
 * Status colors (validated for both surfaces): active=green, detected=
 * amber, none=muted gray. Identity is never color-alone — the legend
 * carries labels + counts and the state table repeats every number.
 */
const LIGHT = { active: "#059669", detected: "#d97706", none: "#94a3b8" };

interface CoverageMapProps {
  coverage: LibraryCoverage[];
}

export function CoverageMap({ coverage }: CoverageMapProps) {
  const projected = coverage
    .filter((entry) => isConterminous(entry.library.coordinates))
    .map((entry) => ({
      ...projectAlbersUsa(entry.library.coordinates),
      status: entry.status,
      name: `${entry.library.name} — ${entry.library.city}, ${entry.library.state}`,
    }));

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (WIDTH - 2 * PADDING) / (maxX - minX),
    (HEIGHT - 2 * PADDING) / (maxY - minY),
  );
  const toSvg = (p: { x: number; y: number }) => ({
    // Albers y grows northward; SVG y grows downward
    cx: PADDING + (p.x - minX) * scale,
    cy: HEIGHT - PADDING - (p.y - minY) * scale,
  });

  const none = projected.filter((p) => p.status === "none");
  const detected = projected.filter((p) => p.status === "detected");
  const active = projected.filter((p) => p.status === "active");
  const excluded = coverage.length - projected.length;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
        <span className="font-semibold">
          US public libraries by event-calendar coverage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600 dark:bg-emerald-500" />
          Active ({active.length.toLocaleString()})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600 dark:bg-amber-500" />
          Detected ({detected.length.toLocaleString()})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
          No coverage ({none.length.toLocaleString()})
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Map of the conterminous United States showing each public library as a dot, colored by event-calendar coverage status"
          className="h-auto w-full min-w-[640px]"
        >
          {none.map((p, index) => {
            const { cx, cy } = toSvg(p);
            return (
              <circle
                key={index}
                cx={cx.toFixed(1)}
                cy={cy.toFixed(1)}
                r={1}
                fill={LIGHT.none}
                opacity={0.5}
              />
            );
          })}
          {detected.map((p, index) => {
            const { cx, cy } = toSvg(p);
            return (
              <circle key={index} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.4} fill={LIGHT.detected}>
                <title>{p.name} — vendor detected, feed not yet configured</title>
              </circle>
            );
          })}
          {active.map((p, index) => {
            const { cx, cy } = toSvg(p);
            return (
              <circle key={index} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={2.8} fill={LIGHT.active}>
                <title>{p.name} — live events served</title>
              </circle>
            );
          })}
        </svg>
      </div>
      {excluded > 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {excluded.toLocaleString()} libraries in AK, HI, and territories are
          not shown on the map but are counted in every table.
        </p>
      )}
    </figure>
  );
}
