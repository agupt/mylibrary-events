import Link from "next/link";
import type { ReactElement } from "react";

export interface BreadcrumbItem {
  name: string;
  /** Root-relative path; omit/empty for the current (last) crumb. */
  path?: string;
}

/** Visible breadcrumb trail; mirror the path hierarchy exactly. */
export function Breadcrumbs({
  items,
}: {
  items: readonly BreadcrumbItem[];
}): ReactElement {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500 dark:text-slate-400">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.name}-${index}`} className="flex items-center gap-1.5">
              {item.path && !isLast ? (
                <Link
                  href={item.path}
                  className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-400"
                >
                  {item.name}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="text-slate-600 dark:text-slate-300">
                  {item.name}
                </span>
              )}
              {!isLast && <span aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
