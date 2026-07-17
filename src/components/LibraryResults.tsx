"use client";

import { useState } from "react";
import type { Library, LibraryDistance } from "@/lib/types";

interface LibraryResultsProps {
  homeLibrary: Library;
  matchedCity: string;
  matchedState: string;
  nearbyLibraries: LibraryDistance[];
  /** Currently filtered library id ("" = all). */
  selectedLibraryId: string;
  /** Toggle the events filter to a single library. */
  onSelectLibrary: (id: string) => void;
}

function WebsiteLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
    >
      Website
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17 17 7M8 7h9v9" />
      </svg>
    </a>
  );
}

function selectableRing(selected: boolean): string {
  return selected
    ? "ring-2 ring-violet-400 border-violet-300 dark:border-violet-600"
    : "hover:border-violet-300 dark:hover:border-violet-700";
}

export function LibraryResults({
  homeLibrary,
  matchedCity,
  matchedState,
  nearbyLibraries,
  selectedLibraryId,
  onSelectLibrary,
}: LibraryResultsProps) {
  const [showNearby, setShowNearby] = useState(false);
  const homeSelected = selectedLibraryId === homeLibrary.id;

  return (
    <section aria-label="Matched libraries" className="space-y-4">
      <div
        className={`relative overflow-hidden rounded-2xl border bg-white/80 shadow-lg shadow-violet-100/50 backdrop-blur transition dark:bg-slate-800/80 dark:shadow-none ${
          homeSelected ? "border-violet-400 ring-2 ring-violet-400" : "border-violet-200/80 dark:border-violet-800/60"
        }`}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
        />
        <button
          type="button"
          onClick={() => onSelectLibrary(homeLibrary.id)}
          aria-pressed={homeSelected}
          className="block w-full p-5 text-left"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            Your home library · {matchedCity}, {matchedState}
            {homeSelected && " · filtering"}
          </p>
          <h2 className="mt-1 text-xl font-bold">{homeLibrary.name}</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {homeLibrary.system} — {homeLibrary.address}, {homeLibrary.city},{" "}
            {homeLibrary.state} {homeLibrary.zipCode}
          </p>
        </button>
        {homeLibrary.websiteUrl && (
          <div className="px-5 pb-4">
            <WebsiteLink href={homeLibrary.websiteUrl} />
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowNearby((open) => !open)}
          aria-expanded={showNearby}
          className="mb-2 flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold text-slate-700 dark:text-slate-300 lg:pointer-events-none"
        >
          <span>Nearby libraries ({nearbyLibraries.length})</span>
          <span aria-hidden className={`text-slate-400 transition lg:hidden ${showNearby ? "rotate-180" : ""}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
        <p className="mb-2 hidden px-1 text-xs text-slate-400 lg:block">
          Tap a library to see just its events.
        </p>

        {nearbyLibraries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No other libraries in range — widen the distance to see more.
          </p>
        ) : (
          <ul className={`${showNearby ? "grid" : "hidden"} gap-2 lg:grid`}>
            {nearbyLibraries.map(({ library, distanceMiles }) => {
              const selected = selectedLibraryId === library.id;
              return (
                <li
                  key={library.id}
                  className={`rounded-xl border border-slate-200/80 bg-white/70 backdrop-blur transition dark:border-slate-700 dark:bg-slate-800/70 ${selectableRing(selected)}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectLibrary(library.id)}
                    aria-pressed={selected}
                    className="block w-full p-3.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">{library.name}</p>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {distanceMiles.toFixed(1)} mi
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {library.system} · {library.city}, {library.state}
                      {selected && " · filtering"}
                    </p>
                  </button>
                  {library.websiteUrl && (
                    <div className="px-3.5 pb-2.5">
                      <WebsiteLink href={library.websiteUrl} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
