import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FaqSection } from "@/components/FaqSection";
import { JsonLd } from "@/components/JsonLd";
import { LandingEventsWidget } from "@/components/LandingEventsWidget";
import { SiteFooter } from "@/components/SiteFooter";
import {
  libraryDescription,
  libraryFaq,
  libraryHeading,
  libraryIntro,
  libraryTitle,
} from "@/lib/seo/copy";
import {
  buildBreadcrumbList,
  buildFaqPage,
  buildLibraryNode,
} from "@/lib/seo/jsonLd";
import {
  getActiveLibraryPages,
  resolveCity,
  resolveLibrary,
  siblingBranches,
} from "@/lib/seo/pages";
import { stateNameFor } from "@/lib/seo/stateNames";

// Fully static: every URL is prerendered from committed data; unknown params
// 404 rather than minting a thin page for a guessed URL.
export const dynamicParams = false;

interface RouteParams {
  state: string;
  city: string;
  slug: string;
}

export function generateStaticParams(): RouteParams[] {
  return getActiveLibraryPages().map((page) => ({
    state: page.stateSlug,
    city: page.citySlug,
    slug: page.librarySlug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { state, city, slug } = await params;
  const page = resolveLibrary(state, city, slug);
  if (!page) return {};
  const { library } = page;
  return {
    title: libraryTitle(library.name, library.city, library.state),
    description: libraryDescription(library.name, library.city, library.state),
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      url: page.path,
      title: `${library.name} — kids' storytimes & events`,
      description: libraryDescription(
        library.name,
        library.city,
        library.state,
      ),
    },
  };
}

export default async function LibraryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { state, city, slug } = await params;
  const page = resolveLibrary(state, city, slug);
  if (!page) notFound();

  const { library } = page;
  const cityPage = resolveCity(page.stateSlug, page.citySlug);
  const siblings = siblingBranches(page);
  const stateName = stateNameFor(library.state);
  const faq = libraryFaq(library.name, library.city, library.state);

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: stateName, path: `/storytimes/${page.stateSlug}` },
    { name: library.city, path: cityPage?.path ?? `/storytimes/${page.stateSlug}/${page.citySlug}` },
    { name: library.name },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd data={buildLibraryNode(library, page.path)} />
      <JsonLd
        data={buildBreadcrumbList(
          breadcrumbItems.map((item) => ({
            name: item.name,
            path: item.path ?? page.path,
          })),
        )}
      />
      <JsonLd data={buildFaqPage(faq)} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">
        <Breadcrumbs items={breadcrumbItems} />

        <header className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {libraryHeading(library.name)}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
            {libraryIntro(library.name, library.city, library.state, library.system)}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-violet-200/80 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-violet-800/60 dark:bg-slate-800/80">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                {library.city}, {library.state}
              </p>
              <h2 className="mt-1 text-lg font-bold">{library.name}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {library.system}
              </p>
              <address className="mt-2 not-italic text-sm text-slate-600 dark:text-slate-400">
                {library.address}
                <br />
                {library.city}, {library.state} {library.zipCode}
              </address>
              {library.websiteUrl && (
                <a
                  href={library.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                >
                  Visit library website
                  <span aria-hidden>↗</span>
                </a>
              )}
            </section>

            {siblings.length > 0 && (
              <section className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
                <h2 className="mb-2 text-sm font-bold">
                  Other {library.city} branches
                </h2>
                <ul className="space-y-1.5 text-sm">
                  {siblings.map((sibling) => (
                    <li key={sibling.path}>
                      <Link
                        href={sibling.path}
                        className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                      >
                        {sibling.library.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {cityPage && (
                  <Link
                    href={cityPage.path}
                    className="mt-3 inline-block text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
                  >
                    All {library.city} storytimes →
                  </Link>
                )}
              </section>
            )}
          </aside>

          <div className="space-y-8">
            <LandingEventsWidget libraries={[library]} pagePath={page.path} />
            <FaqSection items={faq} />
            <nav className="text-sm text-slate-500 dark:text-slate-400">
              <Link
                href={`/storytimes/${page.stateSlug}`}
                className="text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
              >
                ← Library storytimes across {stateName}
              </Link>
            </nav>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
