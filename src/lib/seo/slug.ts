/**
 * URL slug helpers for the SEO landing-page network. ONE canonical slug
 * algorithm, shared by routing, the sitemap, canonical URLs, and every
 * internal link — never recompute a slug in three places and risk drift.
 */

/**
 * Lowercase, hyphen-delimited slug: NFKD-normalise, strip diacritics, then
 * collapse any run of non-alphanumerics to a single hyphen.
 *   "St. Paul"        -> "st-paul"
 *   "Coeur d'Alene"   -> "coeur-d-alene"
 *   "Winston-Salem"   -> "winston-salem"
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** State segment is the lowercased two-letter USPS code (collision-free). */
export function stateSlug(stateCode: string): string {
  return stateCode.toLowerCase();
}
