import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { buildBreadcrumbList, buildLibraryItemList } from "@/lib/seo/jsonLd";
import { getActiveCityPages, getActiveStatePages } from "@/lib/seo/pages";
import { stateNameFor } from "@/lib/seo/stateNames";

export const metadata: Metadata = {
  title: "Free Library Storytimes & Kids' Events Near You",
  description:
    "Browse free children's storytimes, crafts, and STEM events at US public libraries by state and city. Live calendars from hundreds of library systems.",
  alternates: { canonical: "/storytimes" },
  openGraph: {
    type: "website",
    url: "/storytimes",
    title: "Free Library Storytimes & Kids' Events Near You",
    description:
      "Browse free children's storytimes and events at US public libraries by state and city.",
  },
};

export default function StorytimesIndexPage() {
  const states = getActiveStatePages();
  const totalCities = getActiveCityPages().length;
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Storytimes by state" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd
        data={buildBreadcrumbList(
          breadcrumbItems.map((item) => ({
            name: item.name,
            path: item.path ?? "/storytimes",
          })),
        )}
      />
      <JsonLd
        data={buildLibraryItemList(
          "US states with public library kids' events",
          states.map((state) => ({
            name: stateNameFor(state.stateCode),
            path: state.path,
          })),
        )}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Free Library Storytimes &amp; Kids&apos; Events Near You
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
            Live calendars of free storytimes, crafts, and STEM programs for
            kids at public libraries in {totalCities} cities across{" "}
            {states.length} states. Choose a state to get started.
          </p>
        </header>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {states.map((state) => (
            <li key={state.path}>
              <Link
                href={state.path}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm backdrop-blur transition hover:border-violet-300 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-violet-700"
              >
                <span className="font-medium text-violet-700 dark:text-violet-300">
                  {stateNameFor(state.stateCode)}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {state.cities.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
