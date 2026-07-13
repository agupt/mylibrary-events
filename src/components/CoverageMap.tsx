import { isConterminous, projectAlbersUsa } from "@/lib/albersProjection";
import type { LibraryCoverage } from "@/lib/coverage";
import { CoverageMapClient, type NamedDot } from "./CoverageMapClient";

const WIDTH = 960;
const HEIGHT = 600;
const PADDING = 16;

interface CoverageMapProps {
  coverage: LibraryCoverage[];
}

/**
 * Server side of the coverage map: projects every library onto the SVG
 * plane once and hands compact, serializable dot data to the interactive
 * client component. Status colors are validated for both surfaces;
 * identity is never color-alone (legend + tables carry every number).
 */
export function CoverageMap({ coverage }: CoverageMapProps) {
  const projected = coverage
    .filter((entry) => isConterminous(entry.library.coordinates))
    .map((entry) => ({
      ...projectAlbersUsa(entry.library.coordinates),
      status: entry.status,
      name: `${entry.library.name} — ${entry.library.city}, ${entry.library.state}`,
    }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of projected) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const scale = Math.min(
    (WIDTH - 2 * PADDING) / (maxX - minX),
    (HEIGHT - 2 * PADDING) / (maxY - minY),
  );
  const round = (value: number) => Math.round(value * 10) / 10;
  const toSvg = (p: { x: number; y: number }) => ({
    x: round(PADDING + (p.x - minX) * scale),
    // Albers y grows northward; SVG y grows downward
    y: round(HEIGHT - PADDING - (p.y - minY) * scale),
  });

  const nonePoints: number[] = [];
  const detected: NamedDot[] = [];
  const active: NamedDot[] = [];
  for (const p of projected) {
    const { x, y } = toSvg(p);
    if (p.status === "active") active.push({ x, y, name: p.name });
    else if (p.status === "detected") detected.push({ x, y, name: p.name });
    else nonePoints.push(x, y);
  }

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
          No coverage ({(nonePoints.length / 2).toLocaleString()})
        </span>
      </figcaption>
      <CoverageMapClient
        nonePoints={nonePoints}
        detected={detected}
        active={active}
        excludedCount={coverage.length - projected.length}
      />
    </figure>
  );
}
