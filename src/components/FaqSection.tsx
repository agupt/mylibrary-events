import type { ReactElement } from "react";
import type { FaqItem } from "@/lib/seo/copy";

/** Visible FAQ block; pair with FAQPage JSON-LD so answers correspond. */
export function FaqSection({ items }: { items: readonly FaqItem[] }): ReactElement {
  return (
    <section aria-label="Frequently asked questions" className="space-y-3">
      <h2 className="text-lg font-bold">Good to know</h2>
      <dl className="space-y-3">
        {items.map((item) => (
          <div
            key={item.question}
            className="rounded-xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70"
          >
            <dt className="font-semibold">{item.question}</dt>
            <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
