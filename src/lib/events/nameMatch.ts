/**
 * Shared branch-name matching for all event adapters — one
 * implementation instead of per-provider copies.
 *
 * Folds diacritics and apostrophe-like marks so vendor spellings match
 * IMLS spellings: "Hawaiʻi State Library" ≡ "Hawaii State Library",
 * "Pāhala" ≡ "Pahala".
 */

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics (ā → a)
    .replace(/['’ʻ`]/g, "") // apostrophes/okina fold away, not to spaces
    .toLowerCase()
    .replace(/\b(library|branch|the)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when either normalized name contains the other (both non-empty). */
export function namesOverlap(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  return (
    left.length > 0 &&
    right.length > 0 &&
    (left === right || left.includes(right) || right.includes(left))
  );
}

/**
 * Street-address matching for feeds whose LOCATION is an address rather
 * than a branch name (Dallas: "1515 Young Street, Dallas, TX" vs IMLS
 * "1515 Young St"). Compares street number + first street-name token —
 * suffix variations (St/Street, Rd/Road) don't matter.
 */
function streetKey(text: string): string | null {
  const match = normalizeName(text).match(/\b(\d{1,6}) ([a-z0-9]+)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export function addressesMatch(freeText: string, address: string): boolean {
  const left = streetKey(freeText);
  const right = streetKey(address);
  return left !== null && right !== null && left === right;
}
