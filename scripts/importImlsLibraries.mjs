/**
 * Imports the IMLS Public Libraries Survey (PLS) outlet file into
 * src/lib/data/generated/libraries.json — the app's library directory.
 *
 * Usage:
 *   node scripts/importImlsLibraries.mjs                 # download from imls.gov
 *   node scripts/importImlsLibraries.mjs --source <dir>  # use extracted CSVs in <dir>
 *
 * Keeps central (CE) and branch (BR) outlets with valid coordinates;
 * joins the Administrative Entity file for the system name.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { parse } from "csv-parse/sync";

const PLS_ZIP_URL =
  "https://www.imls.gov/sites/default/files/2024-06/pls_fy2022_csv.zip";
const OUTPUT_PATH = "src/lib/data/generated/libraries.json";
const KEPT_OUTLET_TYPES = new Set(["CE", "BR"]);

const librarySchema = z.object({
  id: z.string().regex(/^[A-Z0-9]+-[0-9]+$/),
  name: z.string().min(1),
  system: z.string().min(1),
  address: z.string(),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}$/),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});

function findCsv(dir, pattern) {
  const match = readdirSync(dir, { recursive: true }).find(
    (file) => pattern.test(String(file)),
  );
  if (!match) {
    throw new Error(`No file matching ${pattern} under ${dir}`);
  }
  return path.join(dir, String(match));
}

async function resolveSourceDir() {
  const sourceFlag = process.argv.indexOf("--source");
  if (sourceFlag !== -1) {
    const dir = process.argv[sourceFlag + 1];
    if (!dir) throw new Error("--source requires a directory path");
    return dir;
  }
  const workDir = mkdtempSync(path.join(tmpdir(), "imls-pls-"));
  const zipPath = path.join(workDir, "pls.zip");
  console.log(`Downloading ${PLS_ZIP_URL} ...`);
  const response = await fetch(PLS_ZIP_URL);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", workDir]);
  return workDir;
}

function titleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bMlk\b/g, "MLK")
    .trim();
}

function readCsvRecords(filePath) {
  return parse(readFileSync(filePath, "latin1"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

const sourceDir = await resolveSourceDir();
const outletCsv = findCsv(sourceDir, /outlet.*\.csv$/i);
const aeCsv = findCsv(sourceDir, /_ae_.*\.csv$/i);
console.log(`Outlet file: ${outletCsv}`);
console.log(`AE file:     ${aeCsv}`);

const systemNameByKey = new Map(
  readCsvRecords(aeCsv).map((row) => [row.FSCSKEY, titleCase(row.LIBNAME)]),
);

const skipped = { type: 0, coords: 0, invalid: 0 };
const libraries = [];
for (const row of readCsvRecords(outletCsv)) {
  if (!KEPT_OUTLET_TYPES.has(row.C_OUT_TY)) {
    skipped.type += 1;
    continue;
  }
  const latitude = Number(row.LATITUDE);
  const longitude = Number(row.LONGITUD);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0) {
    skipped.coords += 1;
    continue;
  }
  const candidate = {
    id: `${row.FSCSKEY}-${row.FSCS_SEQ}`,
    name: titleCase(row.LIBNAME),
    system: systemNameByKey.get(row.FSCSKEY) ?? titleCase(row.LIBNAME),
    address: titleCase(row.ADDRESS ?? ""),
    city: titleCase(row.CITY ?? ""),
    state: row.STABR,
    zipCode: String(row.ZIP ?? "").slice(0, 5),
    coordinates: { latitude, longitude },
  };
  const validated = librarySchema.safeParse(candidate);
  if (!validated.success) {
    skipped.invalid += 1;
    continue;
  }
  libraries.push(validated.data);
}

libraries.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(libraries));
console.log(
  `Wrote ${libraries.length} libraries to ${OUTPUT_PATH} ` +
    `(skipped: ${skipped.type} non-CE/BR, ${skipped.coords} bad coords, ${skipped.invalid} invalid)`,
);
