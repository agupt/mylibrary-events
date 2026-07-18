import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { stateDescription, stateTitle } from "@/lib/seo/copy";
import { buildBreadcrumbList, buildLibraryItemList } from "@/lib/seo/jsonLd";
import { getActiveStatePages, resolveState } from "@/lib/seo/pages";
import { stateNameFor } from "@/lib/seo/stateNames";

export const dynamicParams = false;

interface RouteParams {
  state: string;
}

export function generateStaticParams(): RouteParams[] {
  return getActiveStatePages().map((page) => ({ state: page.stateSlug }));
}

function topCityNames(state: ReturnType<typeof resolveState>): string[] {
  if (!state) return [];
  return [...state.cities]
    .sort((a, b) => b.libraries.length - a.libraries.length)
    .slice(0, 2)
    .map((city) => city.city);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state } = await params;
  const page = resolveState(state);
  if (!page) return {};
  return {
    title: stateTitle(page.stateCode, page.cities.length),
    description: stateDescription(
      page.stateCode,
      page.cities.length,
      topCityNames(page),
    ),
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      url: page.path,
      title: stateTitle(page.stateCode, page.cities.length),
      description: stateDescription(
        page.stateCode,
        page.cities.length,
        topCityNames(page),
      ),
    },
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state } = await params;
  const page = resolveState(state);
  if (!page) notFound();

  const stateName = stateNameFor(page.stateCode);
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Storytimes by state", path: "/storytimes" },
    { name: stateName },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd
        data={buildBreadcrumbList(
          breadcrumbItems.map((item) => ({
            name: item.name,
            path: item.path ?? page.path,
          })),
        )}
      />
      <JsonLd
        data={buildLibraryItemList(
          `Cities with library kids' events in ${stateName}`,
          page.cities.map((city) => ({
            name: `${city.city}, ${city.stateCode}`,
            path: city.path,
          })),
        )}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Kids&apos; Library Events Across {stateName}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
            Free storytimes, crafts, and STEM programs for children at public
            libraries in {page.cities.length}{" "}
            {page.cities.length === 1 ? "city" : "cities"} across {stateName}.
            Pick a city to see its live calendar.
          </p>
        </header>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {page.cities.map((city) => (
            <li key={city.path}>
              <Link
                href={city.path}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 text-sm backdrop-blur transition hover:border-violet-300 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-violet-700"
              >
                <span className="font-medium text-violet-700 dark:text-violet-300">
                  {city.city} storytimes
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {city.libraries.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <nav className="mt-8 text-sm">
          <Link
            href="/storytimes"
            className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
          >
            ← All states
          </Link>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
