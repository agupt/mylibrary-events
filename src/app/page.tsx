import { StorytimeFinder } from "@/components/StorytimeFinder";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-14 sm:pt-20">
        <header className="mb-10 text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-4 py-1.5 text-xs font-medium text-violet-700 shadow-sm backdrop-blur dark:border-violet-800 dark:bg-slate-800/70 dark:text-violet-300">
            <span aria-hidden>📚</span> Live calendars from 1,700+ US library
            branches
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Storytime,{" "}
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
              near you
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 sm:text-lg dark:text-slate-400">
            Free storytimes, crafts, and STEM events for kids at your local
            public library. Search by city or zip code.
          </p>
        </header>
        <StorytimeFinder />
      </main>
      <footer className="border-t border-slate-200/70 bg-white/60 py-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-slate-500 dark:text-slate-400">
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
          <a
            href="/status"
            className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Coverage status →
          </a>
        </div>
      </footer>
    </div>
  );
}
