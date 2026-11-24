/**
 * IMLS system key (FSCSKEY) — the part of an outlet id before the sequence,
 * e.g. "CA0081-002" → "CA0081". Pure (no data imports) so both server
 * matching and client analytics share one definition.
 */
export function systemKeyOf(libraryId: string): string {
  return libraryId.split("-")[0];
}
