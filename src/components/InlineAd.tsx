"use client";

import { AdSlot } from "./AdSlot";

/**
 * A single in-content ad, rendered inside the event list (after the first day
 * group) so it only appears alongside real content — never on the bare home
 * page. This keeps Google's "ads need publisher content" policy satisfied and
 * reads as part of the flow rather than a sticky bar.
 *
 * Until AdSense is actually approved and serving, this slot cross-promotes
 * the team's own app (MyBlueBerry, a self-contained no-tracking creative).
 * Flip NEXT_PUBLIC_ADSENSE_ACTIVE=1 once AdSense is live to serve its unit —
 * a separate flag from NEXT_PUBLIC_ADSENSE_CLIENT (which is set for ads.txt
 * verification long before ads actually serve, so it can't be the trigger).
 */

const ADSENSE_ACTIVE = process.env.NEXT_PUBLIC_ADSENSE_ACTIVE === "1";
const HOUSE_AD_TITLE = "MyBlueBerry — a private baby tracker";

export function InlineAd() {
  if (ADSENSE_ACTIVE) {
    return (
      <div className="my-2">
        <AdSlot slot="finder-inline" />
      </div>
    );
  }

  return (
    <div className="my-2 flex flex-col items-center gap-1">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">
        Sponsored
      </p>
      <iframe
        src="/ads/ad-728x90-v2.html"
        width={728}
        height={90}
        scrolling="no"
        title={HOUSE_AD_TITLE}
        className="hidden max-w-full rounded-2xl border-0 shadow-sm sm:block"
      />
      <iframe
        src="/ads/ad-320x100.html"
        width={320}
        height={100}
        scrolling="no"
        title={HOUSE_AD_TITLE}
        className="block max-w-full rounded-2xl border-0 shadow-sm sm:hidden"
      />
    </div>
  );
}
