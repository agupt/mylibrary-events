/**
 * AdSense requires /ads.txt at the domain root listing the publisher id.
 * Served from env so the id never lives in source: set
 * ADSENSE_PUBLISHER_ID=pub-XXXXXXXXXXXXXXXX (the numeric part of the
 * NEXT_PUBLIC_ADSENSE_CLIENT ca-pub-… value). 404s until configured.
 */
export function GET() {
  const publisherId = process.env.ADSENSE_PUBLISHER_ID;
  if (!publisherId) {
    return new Response("Not configured", { status: 404 });
  }
  return new Response(
    `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`,
    { headers: { "content-type": "text/plain" } },
  );
}
