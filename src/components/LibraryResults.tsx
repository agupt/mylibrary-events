"use client";

import type { LocationMatch } from "@/lib/types";

interface LibraryResultsProps {
  match: LocationMatch;
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

export function LibraryResults({ match }: LibraryResultsProps) {
  return (
    <section aria-label="Matched libraries" className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-violet-200/80 bg-white/80 p-5 shadow-lg shadow-violet-100/50 backdrop-blur dark:border-violet-800/60 dark:bg-slate-800/80 dark:shadow-none">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
        />
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
          Your home library · {match.matchedCity}, {match.matchedState}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{match.homeLibrary.name}</h2>
          {match.homeLibrary.websiteUrl && (
            <WebsiteLink href={match.homeLibrary.websiteUrl} />
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          {match.homeLibrary.system} — {match.homeLibrary.address},{" "}
          {match.homeLibrary.city}, {match.homeLibrary.state}{" "}
          {match.homeLibrary.zipCode}
        </p>
      </div>

      {match.nearbyLibraries.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nearby libraries
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {match.nearbyLibraries.map(({ library, distanceMiles }) => (
              <li
                key={library.id}
                className="group rounded-xl border border-slate-200/80 bg-white/70 p-3.5 backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-violet-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{library.name}</p>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {distanceMiles.toFixed(1)} mi
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {library.system} · {library.city}, {library.state}
                </p>
                {library.websiteUrl && (
                  <div className="mt-1.5">
                    <WebsiteLink href={library.websiteUrl} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
