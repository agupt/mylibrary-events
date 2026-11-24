import { describe, expect, test } from "vitest";
import { FEEDBACK_MAX_LENGTH, scrubFeedback } from "../analytics/scrub";

describe("scrubFeedback", () => {
  test("replaces email addresses", () => {
    expect(scrubFeedback("reach me: Jane.Doe+kids@example.co.uk thanks")).toBe(
      "reach me: [email] thanks",
    );
  });

  test("replaces US phone numbers in common formats", () => {
    for (const phone of ["(510) 555-1234", "510-555-1234", "510.555.1234", "+1 510 555 1234", "5105551234"]) {
      expect(scrubFeedback(`call ${phone} please`)).toBe("call [phone] please");
    }
  });

  test("replaces 7-digit local and long international numbers", () => {
    expect(scrubFeedback("call 555-1234")).toBe("call [phone]");
    expect(scrubFeedback("uk +44 20 7946 0958 ok")).toBe("uk [phone] ok");
  });

  test("replaces long digit runs like card or ID numbers", () => {
    expect(scrubFeedback("card 4111 1111 1111 1111 x")).toBe("card [number] x");
    expect(scrubFeedback("ssn 123-45-6789")).toBe("ssn [number]");
  });

  test("stays fast on long adversarial input", () => {
    const started = performance.now();
    const result = scrubFeedback("a".repeat(100_000));
    expect(performance.now() - started).toBeLessThan(200);
    expect(result).toHaveLength(FEEDBACK_MAX_LENGTH);
  });

  test("keeps zip codes and years", () => {
    expect(scrubFeedback("zip 94110, since 2024")).toBe("zip 94110, since 2024");
  });

  test("collapses whitespace and trims", () => {
    expect(scrubFeedback("  a \n\n  b\t c  ")).toBe("a b c");
  });

  test("caps length after scrubbing", () => {
    const result = scrubFeedback("x".repeat(FEEDBACK_MAX_LENGTH + 50));
    expect(result).toHaveLength(FEEDBACK_MAX_LENGTH);
  });
});
