/**
 * Library system websites, keyed by IMLS FSCSKEY (the system portion of a
 * library id, e.g. "CA0081" for "CA0081-002"). The IMLS PLS dataset carries
 * no web addresses, so this overlay is hand-maintained. URLs verified
 * 2026-07.
 */
export const SYSTEM_WEBSITES: Record<string, string> = {
  CA0001: "https://aclibrary.org",
  CA0011: "https://www.berkeleypubliclibrary.org",
  CA0028: "https://ccclib.org",
  CA0076: "https://www.mountainview.gov/our-city/departments/library",
  CA0081: "https://oaklandlibrary.org",
  CA0091: "https://library.cityofpaloalto.org",
  CA0114: "https://sfpl.org",
  CA0115: "https://www.sjpl.org",
  CA0120: "https://smcl.org",
  CA0126: "https://sccld.org",
  CA0143: "https://sunnyvale.ca.gov/library",
};

export function websiteForLibraryId(libraryId: string): string | undefined {
  return SYSTEM_WEBSITES[libraryId.split("-")[0]];
}
