"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Interactive US dot map. A client component receiving precomputed,
 * serialized dot positions — client and server render from identical
 * props, which eliminates the hydration mismatches the old server-only
 * SVG suffered from. Supports wheel/button zoom and drag pan.
 */

export interface NamedDot {
  x: number;
  y: number;
  name: string;
}

interface CoverageMapClientProps {
  /** Flat [x0, y0, x1, y1, …] for the thousands of uncovered dots. */
  nonePoints: number[];
  detected: NamedDot[];
  active: NamedDot[];
  excludedCount: number;
}

const WIDTH = 960;
const HEIGHT = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

const COLORS = { active: "#059669", detected: "#d97706", none: "#94a3b8" };

export function CoverageMapClient({
  nonePoints,
  detected,
  active,
  excludedCount,
}: CoverageMapClientProps) {
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const dragState = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const viewW = WIDTH / view.zoom;
  const viewH = HEIGHT / view.zoom;

  const clampView = useCallback((x: number, y: number, zoom: number) => {
    const w = WIDTH / zoom;
    const h = HEIGHT / zoom;
    return {
      x: Math.min(Math.max(x, 0), WIDTH - w),
      y: Math.min(Math.max(y, 0), HEIGHT - h),
      zoom,
    };
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx = WIDTH / 2, cy = HEIGHT / 2) => {
      setView((current) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
        // Keep the focal point stationary while zooming
        const worldX = current.x + (cx / WIDTH) * (WIDTH / current.zoom);
        const worldY = current.y + (cy / HEIGHT) * (HEIGHT / current.zoom);
        const newX = worldX - (cx / WIDTH) * (WIDTH / zoom);
        const newY = worldY - (cy / HEIGHT) * (HEIGHT / zoom);
        return clampView(newX, newY, zoom);
      });
    },
    [clampView],
  );

  const svgPoint = (event: React.MouseEvent | React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { cx: WIDTH / 2, cy: HEIGHT / 2 };
    return {
      cx: ((event.clientX - rect.left) / rect.width) * WIDTH,
      cy: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  // Dot radii shrink as we zoom so dense areas stay readable
  const rNone = Math.max(0.4, 1 / Math.sqrt(view.zoom));
  const rMarked = Math.max(1.2, 2.6 / Math.sqrt(view.zoom));

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        {[
          { label: "+", action: () => zoomAt(1.6) },
          { label: "−", action: () => zoomAt(1 / 1.6) },
          { label: "⟲", action: () => setView({ x: 0, y: 0, zoom: 1 }) },
        ].map((button) => (
          <button
            key={button.label}
            type="button"
            onClick={button.action}
            aria-label={
              button.label === "+" ? "Zoom in" : button.label === "−" ? "Zoom out" : "Reset zoom"
            }
            className="h-8 w-8 rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {button.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${viewW} ${viewH}`}
          role="img"
          aria-label="Zoomable map of the conterminous United States showing each public library as a dot, colored by event-calendar coverage status"
          className="h-auto w-full min-w-[320px] cursor-grab touch-none select-none active:cursor-grabbing"
          onWheel={(event) => {
            const { cx, cy } = svgPoint(event);
            zoomAt(event.deltaY < 0 ? 1.25 : 0.8, cx, cy);
          }}
          onMouseDown={(event) => {
            dragState.current = {
              startX: event.clientX,
              startY: event.clientY,
              viewX: view.x,
              viewY: view.y,
            };
          }}
          onMouseMove={(event) => {
            const drag = dragState.current;
            if (!drag || !svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const dx = ((event.clientX - drag.startX) / rect.width) * viewW;
            const dy = ((event.clientY - drag.startY) / rect.height) * viewH;
            setView((current) => clampView(drag.viewX - dx, drag.viewY - dy, current.zoom));
          }}
          onMouseUp={() => (dragState.current = null)}
          onMouseLeave={() => (dragState.current = null)}
        >
          {Array.from({ length: nonePoints.length / 2 }, (_, i) => (
            <circle
              key={i}
              cx={nonePoints[2 * i]}
              cy={nonePoints[2 * i + 1]}
              r={rNone}
              fill={COLORS.none}
              opacity={0.5}
            />
          ))}
          {detected.map((dot, i) => (
            <circle key={`d${i}`} cx={dot.x} cy={dot.y} r={rMarked * 0.9} fill={COLORS.detected}>
              <title>{`${dot.name} — vendor detected, feed not yet configured`}</title>
            </circle>
          ))}
          {active.map((dot, i) => (
            <circle key={`a${i}`} cx={dot.x} cy={dot.y} r={rMarked} fill={COLORS.active}>
              <title>{`${dot.name} — live events served`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Scroll or use +/− to zoom, drag to pan.
        {excludedCount > 0 &&
          ` ${excludedCount.toLocaleString()} libraries in AK, HI, and territories are not mapped but counted in every table.`}
      </p>
    </div>
  );
}
