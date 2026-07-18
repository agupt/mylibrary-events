import Link from "next/link";
import type { ReactElement } from "react";

/** Shared site footer used by the home page and the landing network. */
export function SiteFooter(): ReactElement {
  return (
    <footer className="border-t border-slate-200/70 bg-white/60 py-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-slate-500 dark:text-slate-400">
        <p>
          Library data:{" "}
          <a
            href="https://www.imls.gov/research-evaluation/data-collection/public-libraries-survey"
            className="underline-offset-2 hover:underline"
          >
            IMLS Public Libraries Survey
          </a>{" "}
          · Zip data: GeoNames · Events belong to their libraries.
        </p>
        <span className="flex items-center gap-4">
          <Link
            href="/storytimes"
            className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Browse by state
          </Link>
          <Link
            href="/privacy"
            className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Privacy
          </Link>
          <Link
            href="/status"
            className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Coverage status →
          </Link>
        </span>
      </div>
    </footer>
  );
}
