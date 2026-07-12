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
      className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
    >
      Visit website ↗
    </a>
  );
}

export function LibraryResults({ match }: LibraryResultsProps) {
  return (
    <section aria-label="Matched libraries" className="space-y-3">
      <div className="rounded-xl border-2 border-indigo-500 bg-indigo-50 p-4 dark:bg-indigo-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          Your home library · {match.matchedCity}, {match.matchedState}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {match.homeLibrary.name}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {match.homeLibrary.system} — {match.homeLibrary.address},{" "}
          {match.homeLibrary.city}, {match.homeLibrary.state}{" "}
          {match.homeLibrary.zipCode}
        </p>
        {match.homeLibrary.websiteUrl && (
          <div className="mt-2">
            <WebsiteLink href={match.homeLibrary.websiteUrl} />
          </div>
        )}
      </div>

      {match.nearbyLibraries.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nearby libraries
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {match.nearbyLibraries.map(({ library, distanceMiles }) => (
              <li
                key={library.id}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {library.name}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {library.system} · {library.city}, {library.state} ·{" "}
                  {distanceMiles.toFixed(1)} mi
                </p>
                {library.websiteUrl && <WebsiteLink href={library.websiteUrl} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
