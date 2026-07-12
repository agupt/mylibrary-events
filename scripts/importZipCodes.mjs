/**
 * Imports the GeoNames US postal code dataset (CC-BY 4.0) into
 * src/lib/data/generated/zips.json — nationwide zip → location lookup.
 *
 * Usage:
 *   node scripts/importZipCodes.mjs                  # download from geonames.org
 *   node scripts/importZipCodes.mjs --source US.txt  # use a local extract
 *
 * Output format: { [zip]: [latitude, longitude, city, state] }
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

const GEONAMES_URL = "https://download.geonames.org/export/zip/US.zip";
const OUTPUT_PATH = "src/lib/data/generated/zips.json";

const rowSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.string().min(1),
  z.string().length(2),
]);

async function resolveSourceFile() {
  const sourceFlag = process.argv.indexOf("--source");
  if (sourceFlag !== -1) {
    const file = process.argv[sourceFlag + 1];
    if (!file) throw new Error("--source requires a file path");
    return file;
  }
  const workDir = mkdtempSync(path.join(tmpdir(), "geonames-"));
  const zipPath = path.join(workDir, "US.zip");
  console.log(`Downloading ${GEONAMES_URL} ...`);
  const response = await fetch(GEONAMES_URL);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", workDir]);
  return path.join(workDir, "US.txt");
}

const sourceFile = await resolveSourceFile();
const zips = {};
let skipped = 0;
for (const line of readFileSync(sourceFile, "utf8").split("\n")) {
  if (!line.trim()) continue;
  // Columns: country, zip, place, state name, state code, county, ... lat(9), lng(10)
  const cols = line.split("\t");
  const zip = cols[1];
  if (!/^\d{5}$/.test(zip)) {
    skipped += 1;
    continue;
  }
  const candidate = [Number(cols[9]), Number(cols[10]), cols[2], cols[4]];
  const validated = rowSchema.safeParse(candidate);
  if (!validated.success) {
    skipped += 1;
    continue;
  }
  zips[zip] = validated.data;
}

mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(zips));
console.log(
  `Wrote ${Object.keys(zips).length} zip codes to ${OUTPUT_PATH} (skipped ${skipped})`,
);
