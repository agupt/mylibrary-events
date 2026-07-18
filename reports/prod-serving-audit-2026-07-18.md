# Production serving audit — 2026-07-18

What each active system *actually serves from the deployed Fly origin* (not just
"is it registered"). Every active system was hit through the live user-facing
events API (`/api/events?libraryIds=<all outlets>&days=30`) and its event count
recorded. This catches the gap between "registry says active" and "a user in
that city sees events."

## Headline

| Bucket | Systems | Share |
| --- | --- | --- |
| **Serving live (>0 events)** | 735 | **86.5%** |
| Zero from Fly | 61 | 7.2% |
| Timeout/error (slow feed or cold cache during deploy) | 54 | 6.4% |
| **Total active** | 850 | |

Note: the audit ran across two deploys (browser-UA v5, ICS-UTC v6), so most of
the 54 timeouts are cold-cache/slow-feed noise, not broken systems. Re-audit
after a quiet period for a clean error count.

Zero-from-Fly by vendor: communico 21, libcal 19, ical 15, bibliocommons 3,
bklyn 1, snapshot 1, flp 1.

## Confirmed Fly-IP soft-blocks (Communico) — 17 systems

These return **HTTP 200 + an empty array** to Fly's datacenter IP, but serve a
full calendar to a normal (residential) IP. Verified: each has kid events when
fetched locally, 0 from Fly, and stays 0 after cache warming — a persistent
per-tenant WAF block on datacenter egress, not a transient timeout.

| FSCSKEY | System | Kid events (local) | Host |
| --- | --- | --- | --- |
| FL0025 | Miami-Dade Public Library System (FL) | 1226 | www.mdpls.org |
| CA0062 | LA County Library (CA) | 675 | visit.lacountylibrary.org |
| CO0131 | Clearview Library District (CO) | 127 | clearview.libnet.info |
| OH0144 | MidPointe Library System (OH) | 92 | programs.midpointelibrary.org |
| AR0017 | Faulkner-Van Buren Regional (AR) | 79 | fcl.libnet.info |
| MA0343 | Woburn Public Library (MA) | 69 | woburnpubliclibrary.libnet.info |
| UT0047 | Murray Public Library (UT) | 56 | murraylibraryut.libnet.info |
| CA0005 | Altadena Library District (CA) | 46 | altadenalibrary.libnet.info |
| NJ0190 | South Brunswick Public Library (NJ) | 41 | sbpl.libnet.info |
| IL0061 | Brookfield Library (IL) | 26 | lsfbrookfieldlibrary.libnet.info |
| TN0207 | Burch Library, Collierville (TN) | 26 | collierville.libnet.info |
| IL0471 | St. Charles Public Library District (IL) | 25 | scpld.libnet.info |
| TX0351 | Cozby Library, Coppell (TX) | 14 | coppelltx.libnet.info |
| IN0085 | Noble County Public Library (IN) | 13 | myncpl.libnet.info |
| IL0329 | Matteson Area Public Library District (IL) | 10 | mapld.libnet.info |
| MO0125 | Poplar Bluff Municipal Library (MO) | 9 | poplarbluff.libnet.info |
| OK0105 | Mabel C. Fry Public Library, Yukon (OK) | 4 | yukonlibraries.libnet.info |

The other 4 Communico zeros are **genuinely empty** (0 kid events anywhere,
e.g. Bexley OH0024) or a bad URL — correct zeros, not blocks.

## Decision (Amool, 2026-07-18): HOLD — document only

Fix is understood and viable but deferred:

- **Root cause:** Fly's datacenter IP is soft-blocked by these Communico
  tenants. NOT a User-Agent issue (bot/browser/no-UA all serve full locally).
  The v5 browser-UA change is harmless hygiene, not the fix.
- **Viable fix when we pick it up — client-side fetch:** Communico feeds send
  `access-control-allow-origin: *`, so the *user's browser* (residential IP) can
  fetch them cross-origin. When the server returns 0 for a CORS-Communico
  system, the client re-fetches + renders **display-only** (never write
  client data to the shared server cache — poisoning risk). Communico's
  `eventDataUrl`/`mapCommunicoEvent`/`classify` are already pure functions.
- **Alternative considered:** Cloudflare Worker proxy — but Worker IPs are also
  datacenter (may still be blocked) and it's all-or-nothing infra.

## Not yet classified (follow-up)

- **libcal 19 / ical 15 zeros:** mix of genuinely-empty and possibly-blocked.
  LibraryMarket iCal sends **no CORS**, so client-fetch can't rescue those —
  they'd need a proxy or acceptance. Classify locally before acting.

Audit script: `scratchpad/prod_audit.mjs` (all active systems vs live API,
concurrency 8).
