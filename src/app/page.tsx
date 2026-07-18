import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { StorytimeFinder } from "@/components/StorytimeFinder";
import { buildWebsiteNode } from "@/lib/seo/jsonLd";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildWebsiteNode()} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-14 sm:pt-20">
        <header className="mx-auto mb-10 max-w-2xl text-center">
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

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-slate-500 dark:text-slate-400">
          Prefer to browse?{" "}
          <Link
            href="/storytimes"
            className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Explore library storytimes by state and city →
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
