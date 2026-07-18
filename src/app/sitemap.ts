import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/jsonLd";
import {
  getActiveCityPages,
  getActiveLibraryPages,
  getActiveStatePages,
} from "@/lib/seo/pages";

/**
 * Programmatic sitemap listing ONLY gate-eligible pages (active-feed cities
 * and libraries), derived from the SAME `@/lib/seo/pages` source the routes
 * use — the sitemap can never advertise a URL the routes would 404.
 *
 * ~6.6k URLs total: comfortably under Google's 50,000-per-file limit, so a
 * single file (no `generateSitemaps` sharding needed yet). Build-cached Route
 * Handler — reads committed data via fs, no request-time API.
 */

// One deploy-scoped timestamp: the SEO copy only changes on redeploy, so we
// don't fake per-page daily churn (Google discounts sitemaps that cry wolf).
const LAST_MODIFIED = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/storytimes"),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const stateEntries: MetadataRoute.Sitemap = getActiveStatePages().map(
    (state) => ({
      url: absoluteUrl(state.path),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  const cityEntries: MetadataRoute.Sitemap = getActiveCityPages().map(
    (city) => ({
      url: absoluteUrl(city.path),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  const libraryEntries: MetadataRoute.Sitemap = getActiveLibraryPages().map(
    (page) => ({
      url: absoluteUrl(page.path),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.6,
    }),
  );

  return [
    ...staticEntries,
    ...stateEntries,
    ...cityEntries,
    ...libraryEntries,
  ];
}
