/**
 * Turns a click on one of our links into an analytics event (WS-D). Pure:
 * the browser wiring passes the anchor's resolved href and its `data-*`
 * annotations. Only the target's page type (internal) or hostname
 * (external) is kept — never a path, query, or full URL.
 */
import { buildOutboundClickEvent, type OutboundClickEvent } from "./events";
import { buildPageContext, isOutletId, toNavSlot, type PageActionEvent } from "./pageEvents";
import { classifyPath } from "./pageType";

export interface LinkClickInput {
  href: string;
  /** The site's own origin (`location.origin`). */
  origin: string;
  /** `location.pathname` of the page the click happened on. */
  currentPath: string;
  /** `data-analytics`: "outbound" (library website) or "manual" (component tracks it). */
  kind?: string;
  /** `data-analytics-slot`: a NavSlot; anything else counts as "other". */
  slot?: string;
  /** `data-library-id` for library website links. */
  libraryId?: string;
}

const WEB_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_DOMAIN_LENGTH = 253;

/** Resolves like the browser does: relative to the current page. */
function parse(href: string, origin: string, currentPath: string): URL | null {
  try {
    return new URL(href, new URL(currentPath, origin));
  } catch {
    return null;
  }
}

function isSamePageAnchor(target: URL, origin: string, currentPath: string): boolean {
  return target.origin === origin && target.pathname === currentPath && target.hash !== "";
}

export function resolveLinkClick(input: LinkClickInput): OutboundClickEvent | PageActionEvent | null {
  if (input.kind === "manual") return null;
  const currentPath = input.currentPath.split(/[?#]/)[0] || "/";
  const target = parse(input.href, input.origin, currentPath);
  if (!target || !WEB_PROTOCOLS.has(target.protocol)) return null;
  if (isSamePageAnchor(target, input.origin, currentPath)) return null;

  const pageType = buildPageContext(currentPath).page_type;
  const slot = toNavSlot(input.slot);

  if (target.origin === input.origin) {
    return {
      name: "page_action",
      properties: {
        action: "nav_click",
        page_type: pageType,
        target_page_type: classifyPath(target.pathname).page_type,
        slot,
      },
    };
  }
  if (input.kind === "outbound" && isOutletId(input.libraryId)) {
    return buildOutboundClickEvent({ libraryId: input.libraryId, placement: "landing_library", pageType });
  }
  return {
    name: "page_action",
    properties: {
      action: "external_click",
      page_type: pageType,
      slot,
      target_domain: target.hostname.toLowerCase().slice(0, MAX_DOMAIN_LENGTH),
    },
  };
}
