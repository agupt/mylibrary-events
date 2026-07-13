/**
 * Shared read/write access to the unified feed registry for scripts.
 * THE RULE: automation may create/update/delete only entries with
 * source:"discovered". Entries with source:"verified" (hand-checked or
 * engineered integrations like Brooklyn/NYPL) are read-only to robots.
 */
import { readFileSync, writeFileSync } from "node:fs";

const REGISTRY_PATH = "src/lib/data/feedRegistry.json";

export function readRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

export function isVerified(registry, systemKey) {
  return registry[systemKey]?.source === "verified";
}

/**
 * Applies script changes and persists. `updates` maps systemKey → entry
 * (source forced to "discovered") or → null to delete. Updates targeting
 * verified entries are ignored with a warning.
 */
export function writeDiscovered(updates) {
  const registry = readRegistry();
  let ignored = 0;
  for (const [systemKey, entry] of Object.entries(updates)) {
    if (isVerified(registry, systemKey)) {
      ignored += 1;
      continue;
    }
    if (entry === null) {
      delete registry[systemKey];
    } else {
      registry[systemKey] = { ...entry, source: "discovered" };
    }
  }
  writeFileSync(
    REGISTRY_PATH,
    JSON.stringify(Object.fromEntries(Object.entries(registry).sort()), null, 1),
  );
  if (ignored > 0) {
    console.warn(`registry: ignored ${ignored} updates targeting verified entries`);
  }
  return registry;
}
