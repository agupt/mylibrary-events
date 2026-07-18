import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { LandingEventsWidget } from "@/components/LandingEventsWidget";
import { SiteFooter } from "@/components/SiteFooter";
import {
  cityDescription,
  cityFaq,
  cityHeading,
  cityIntro,
  cityTitle,
} from "@/lib/seo/copy";
import {
  buildBreadcrumbList,
  buildFaqPage,
  buildLibraryItemList,
} from "@/lib/seo/jsonLd";
import {
  getActiveCityPages,
  nearestCities,
  resolveCity,
} from "@/lib/seo/pages";
import { stateNameFor } from "@/lib/seo/stateNames";

export const dynamicParams = false;

interface RouteParams {
  state: string;
  city: string;
}

export function generateStaticParams(): RouteParams[] {
  return getActiveCityPages().map((page) => ({
    state: page.stateSlug,
    city: page.citySlug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const page = resolveCity(state, city);
  if (!page) return {};
  return {
    title: cityTitle(page.city, page.stateCode),
    description: cityDescription(page.city, page.stateCode, page.libraries.length),
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      url: page.path,
      title: cityTitle(page.city, page.stateCode),
      description: cityDescription(
        page.city,
        page.stateCode,
        page.libraries.length,
      ),
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, city } = await params;
  const page = resolveCity(state, city);
  if (!page) notFound();

  const stateName = stateNameFor(page.stateCode);
  const branchNames = page.libraries.map((entry) => entry.library.name);
  const faq = cityFaq(page.city, page.stateCode, branchNames);
  const nearby = nearestCities(page);
  const widgetLibraries = page.libraries.map((entry) => entry.library);

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: stateName, path: `/storytimes/${page.stateSlug}` },
    { name: page.city },
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
          `Public libraries with kids' events in ${page.city}, ${page.stateCode}`,
          page.libraries.map((entry) => ({
            name: entry.library.name,
            path: entry.path,
          })),
        )}
      />
      <JsonLd data={buildFaqPage(faq)} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {cityHeading(page.city)}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
            {cityIntro(page.city, page.stateCode, page.libraries.length)}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(260px,320px)]">
          <div className="space-y-8">
            <LandingEventsWidget libraries={widgetLibraries} pagePath={page.path} />
            <FaqSection items={faq} />
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
              <h2 className="mb-2 text-sm font-bold">
                {page.city} library branches ({page.libraries.length})
              </h2>
              <ul className="space-y-1.5 text-sm">
                {page.libraries.map((entry) => (
                  <li key={entry.path}>
                    <Link
                      href={entry.path}
                      className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                    >
                      {entry.library.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {nearby.length > 0 && (
              <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
                <h2 className="mb-2 text-sm font-bold">Nearby cities</h2>
                <ul className="space-y-1.5 text-sm">
                  {nearby.map((other) => (
                    <li key={other.path}>
                      <Link
                        href={other.path}
                        className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                      >
                        Storytimes in {other.city}, {other.stateCode}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Link
              href={`/storytimes/${page.stateSlug}`}
              className="inline-block text-sm font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
            >
              ← All {stateName} cities
            </Link>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
