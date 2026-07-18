import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/jsonLd";

/**
 * Opens the marketing/landing network to crawlers, keeps JSON endpoints and
 * the ops dashboard out of the index, and points at the sitemap. Build-cached
 * Route Handler (no request-time API).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/status"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
