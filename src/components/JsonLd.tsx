import type { ReactElement } from "react";

/**
 * Renders a schema.org JSON-LD block as a <script type="application/ld+json">.
 * Server component — the markup lands in the initial HTML so crawlers see it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }): ReactElement {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here (no user-controlled HTML); we still
      // escape "<" to avoid any chance of breaking out of the script element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
