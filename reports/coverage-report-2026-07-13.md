# Event Calendar Coverage Report — 2026-07-13

Data: IMLS PLS FY2022 (16,883 library outlets, 9,234 systems), GeoNames (40,979 zips).

## Library coverage

| Status | Libraries | Share | Systems |
|---|---|---|---|
| Active (live events served) | 1,818 | 10.8% | 88 |
| Detected (vendor found, needs config) | 976 | 5.8% | 106 |
| No coverage | 14,089 | 83.5% | 9040 |

## Pipeline decision tree — where each system is stuck and who can unblock it

Every system sits on exactly one branch. "Human action" is the concrete
next step; branches marked engineering are adapter work that amortizes
across all systems on that vendor.

| Branch | Systems | Libraries | Next action |
|---|---|---|---|
| never-probed | 8,179 | 8,701 | Not yet examined (small system) — extend findDomains/detectPlatforms coverage |
| domain-unknown-probed | 791 | 4,061 | Slug guessing failed and official website unknown — run findDomains for this system |
| serving | 88 | 1,818 | — (events flowing) |
| no-platform-found | 61 | 1,112 | Domain read, no known vendor fingerprint — inspect site, identify platform or scope a site scraper |
| calendar-id-needed | 82 | 526 | Open the LibCal instance, pick the events calendar, add its id to the registry |
| feed-empty | 9 | 214 | Instance verified but feed has no items — check for a different public calendar |
| feed-unverified | 8 | 177 | Re-verify feed (possible WAF block at probe time) |
| site-unreachable | 8 | 142 | Confirm the domain is right / site is up |
| needs-scraper | 1 | 62 | Investigate |
| identity-collision | 5 | 25 | Adjudicate which system owns the instance (same-named systems in different states) |
| adapter-needed:communico | 1 | 23 | Build communico adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:localist | 1 | 22 | Build localist adapter (unlocks every system on it; worst case a scraper) |

Known official domains: 156 systems (source: web search; IMLS publishes none).
Honest unknown: "never-probed" systems have NOT been checked at all — no
claim is made about whether they publish calendars.

## Vendor breakdown (event-calendar platforms)

| Vendor | Systems | Library outlets |
|---|---|---|
| libcal | 130 | 1140 |
| bibliocommons | 43 | 968 |
| communico | 15 | 369 |
| ical | 3 | 110 |
| bklyn | 1 | 60 |
| snapshot | 1 | 94 |
| flp | 1 | 53 |

## Zip-code analysis (all 40,979 US zips)

- Nearest library has an **active** feed: **4,159 zips (10.1%)**
- Nearest library is on a **detected** platform: 2,428 (5.9%)
- Distance to nearest library: median 2.1 mi, p90 10.0 mi, p99 25.4 mi, max 1816 mi
- Every zip resolved to a nearest library: yes ✅
- Analysis runtime: 242 ms (grid-indexed)

## Active systems (88)

| System | State | Outlets | Vendor |
|---|---|---|---|
| New York Public Library, The Branch Libraries (NY0778) | NY | 94 | snapshot |
| La County Library (CA0062) | CA | 85 | communico |
| Chicago Public Library (IL0098) | IL | 81 | bibliocommons |
| Brooklyn Public Library (NY0004) | NY | 60 | bklyn |
| Free Library Of Philadelphia (PA0385) | PA | 53 | flp |
| Miami-Dade Public Library System (FL0025) | FL | 50 | communico |
| Hawaii State Public Library System (HI0001) | HI | 50 | ical |
| King County Library System (WA0059) | WA | 49 | bibliocommons |
| Hennepin County Library (MN0041) | MN | 41 | bibliocommons |
| Cincinnati And Hamilton County Public Library (OH0049) | OH | 41 | bibliocommons |
| Houston Public Library (TX0099) | TX | 37 | libcal |
| Riverside County Library System (CA0199) | CA | 35 | libcal |
| Fulton County Library System (GA0022) | GA | 34 | bibliocommons |
| San Diego County Library (CA0112) | CA | 33 | bibliocommons |
| Orange County Public Libraries (CA0084) | CA | 32 | libcal |
| San Bernardino County Library (CA0109) | CA | 32 | ical |
| Great River Regional Library (MN0032) | MN | 32 | libcal |
| North Central Regional Library (WA0062) | WA | 30 | libcal |
| Timberland Regional Library (WA0069) | WA | 29 | bibliocommons |
| Sacramento Public Library (CA0105) | CA | 28 | ical |
| Cleveland Public Library (OH0051) | OH | 28 | libcal |
| Harris County Public Library (TX0101) | TX | 28 | bibliocommons |
| Pima County Public Library (AZ0064) | AZ | 27 | bibliocommons |
| Denver Public Library (CO0034) | CO | 27 | libcal |
| Cuyahoga County Public Library (OH0052) | OH | 27 | communico |
| Contra Costa County Library (CA0028) | CA | 26 | bibliocommons |
| District Of Columbia Public Library (DC0001) | DC | 26 | communico |
| Boston Public Library (MA0035) | MA | 26 | bibliocommons |
| Las Vegas-Clark County Library District (NV0008) | NV | 25 | bibliocommons |
| Dekalb County Public Library (GA0017) | GA | 24 | communico |
| Sno-Isle Libraries (WA0065) | WA | 23 | bibliocommons |
| Jacksonville Public Library (FL0003) | FL | 21 | communico |
| Charlotte Mecklenburg Library (NC0045) | NC | 21 | bibliocommons |
| Ocean County Library (NJ0252) | NJ | 21 | communico |
| Kent District Library (MI0182) | MI | 20 | bibliocommons |
| Dayton Metro Library (OH0063) | OH | 20 | bibliocommons |
| Pierce County Library System (WA0063) | WA | 20 | communico |
| Prince George`S County Memorial Library Syste (MD0017) | MD | 19 | communico |
| Oakland Public Library (CA0081) | CA | 18 | bibliocommons |
| Palm Beach County Library System (FL0246) | FL | 18 | bibliocommons |
| Charleston County Public Library System (SC0009) | SC | 17 | libcal |
| Lake County Library System (FL0039) | FL | 16 | libcal |
| Gwinnett County Public Library System (GA0025) | GA | 16 | communico |
| Orange County Library District (FL0005) | FL | 15 | communico |
| Youngstown And Mahoning County, Pl Of (OH0248) | OH | 15 | bibliocommons |
| Fort Vancouver Regional Library District (WA0058) | WA | 15 | bibliocommons |
| Allen County Public Library (IN0073) | IN | 14 | communico |
| Johnson County Library (KS0134) | KS | 14 | bibliocommons |
| East Central Regional Library (MN0031) | MN | 14 | libcal |
| Omaha Public Library (NE0162) | NE | 14 | bibliocommons |
| San Mateo County Libraries (CA0120) | CA | 13 | bibliocommons |
| Capital Area District Library (MI0424) | MI | 13 | libcal |
| Lake Agassiz Regional Library (MN0034) | MN | 13 | communico |
| Saint Paul Public Library (MN0044) | MN | 13 | bibliocommons |
| Abbe Regional Library System (SC0002) | SC | 13 | libcal |
| Milwaukee Public Library (WI0199) | WI | 13 | communico |
| St. Tammany Parish Library (LA0049) | LA | 12 | bibliocommons |
| Norfolk Public Library (VA0054) | VA | 12 | libcal |
| Whatcom County Library System (WA0057) | WA | 12 | libcal |
| Alameda County Library (CA0001) | CA | 11 | bibliocommons |
| Spokane County Library District (WA0066) | WA | 11 | libcal |
| Placer County Library (CA0009) | CA | 9 | libcal |
| Yuma County Library District (AZ0082) | AZ | 8 | bibliocommons |
| Anaheim Public Library (CA0007) | CA | 8 | libcal |
| Santa Clara County Library (CA0126) | CA | 8 | bibliocommons |
| Aurora Public Library (CO0007) | CO | 7 | bibliocommons |
| Community Library Network (ID0120) | ID | 7 | libcal |
| St. Mary Parish Library (LA0043) | LA | 7 | libcal |
| Harnett County Public Library (NC0037) | NC | 7 | libcal |
| Geauga County Public Library (OH0046) | OH | 7 | libcal |
| Osceola Library System (FL0109) | FL | 6 | libcal |
| Thomas County Public Library System (GA0045) | GA | 6 | libcal |
| Cranston Public Library (RI0010) | RI | 6 | libcal |
| Berkeley Public Library (CA0011) | CA | 5 | communico |
| Huntington Beach Public Library (CA0046) | CA | 5 | libcal |
| Palo Alto City Library (CA0091) | CA | 5 | bibliocommons |
| Santa Monica Public Library (CA0130) | CA | 5 | bibliocommons |
| San Leandro Public Library (CA0117) | CA | 4 | libcal |
| Elyria Public Library (OH0077) | OH | 4 | libcal |
| Montgomery-Floyd Regional Library (VA0051) | VA | 4 | libcal |
| Pend Oreille County Library District (WA0041) | WA | 4 | libcal |
| Davenport Public Library (IA0355) | IA | 3 | libcal |
| Brookline Public Library (MA0046) | MA | 3 | libcal |
| Caldwell County Public Library (NC0022) | NC | 3 | libcal |
| Troy-Miami County Public Library (OH0216) | OH | 3 | libcal |
| Bellingham Public Library (WA0050) | WA | 3 | libcal |
| Laramie County Library System (WY0004) | WY | 3 | libcal |
| Mountain View Public Library (CA0076) | CA | 1 | libcal |

## Detected systems awaiting configuration (106)

| System | State | Outlets | Vendor |
|---|---|---|---|
| Fresno County Public Library (CA0040) | CA | 36 | libcal |
| San Diego Public Library (CA0113) | CA | 36 | bibliocommons |
| Mid-Continent Public Library (MO0004) | MO | 34 | bibliocommons |
| San Antonio Public Library (TX0263) | TX | 30 | bibliocommons |
| Hillsborough County Public Library Cooperative (FL0035) | FL | 29 | libcal |
| San Francisco Public Library (CA0114) | CA | 28 | libcal |
| Seattle Public Library (WA0064) | WA | 27 | libcal |
| San Jose Public Library (CA0115) | CA | 25 | bibliocommons |
| Indianapolis Public Library (IN0210) | IN | 24 | bibliocommons |
| Tulsa City-County Library System (OK0093) | OK | 24 | libcal |
| Columbus Metropolitan Library (OH0057) | OH | 23 | bibliocommons |
| Austin Public Library (TX0111) | TX | 22 | bibliocommons |
| Multnomah County Library (OR0063) | OR | 19 | bibliocommons |
| Carnegie Library Of Pittsburgh (PA0042) | PA | 19 | libcal |
| High Plains Library District (CO0145) | CO | 16 | libcal |
| City Of St. Louis Municipal Library District (MO0030) | MO | 16 | bibliocommons |
| Sonoma County Library (CA0137) | CA | 15 | bibliocommons |
| New Orleans Public Library (LA0058) | LA | 15 | libcal |
| Sandhill Regional Library System (NC0015) | NC | 15 | libcal |
| Jackson County Library Services (OR0041) | OR | 15 | libcal |
| Central Arkansas Library System (AR0001) | AR | 14 | bibliocommons |
| Volusia County Public Library (FL0099) | FL | 14 | libcal |
| East Baton Rouge Parish Library (LA0055) | LA | 14 | libcal |
| Monmouth County Library (NJ0195) | NJ | 13 | libcal |
| Calcasieu Parish Public Library (LA0053) | LA | 12 | libcal |
| St Joseph County Public Library (IN0068) | IN | 10 | bibliocommons |
| Muskegon Area District Library (MI0240) | MI | 10 | libcal |
| Stark County District Library (OH0039) | OH | 10 | libcal |
| Chesterfield County Public Library (VA0018) | VA | 10 | libcal |
| Pamunkey Regional Library (VA0057) | VA | 10 | libcal |

…and 76 more.

## Human action queues (highest-leverage first)

### Adapter backlog (engineering — one adapter unlocks every system on the vendor)
- **communico**: 1 systems / 23 libraries. E.g. Fairfax County Public Library (VA, 23)
- **localist**: 1 systems / 22 libraries. E.g. Enoch Pratt Free Library (MD, 22)

### Calendar ids needed (5-minute manual task each)
- Fresno County Public Library (CA0040, CA, 36 outlets)
- High Plains Library District (CO0145, CO, 16 outlets)
- New Orleans Public Library (LA0058, LA, 15 outlets)
- Volusia County Public Library (FL0099, FL, 14 outlets)
- East Baton Rouge Parish Library (LA0055, LA, 14 outlets)
- Monmouth County Library (NJ0195, NJ, 13 outlets)
- Calcasieu Parish Public Library (LA0053, LA, 12 outlets)
- Muskegon Area District Library (MI0240, MI, 10 outlets)
- Stark County District Library (OH0039, OH, 10 outlets)
- Chesterfield County Public Library (VA0018, VA, 10 outlets)
- Pamunkey Regional Library (VA0057, VA, 10 outlets)
- Siskiyou County Free Library (CA0135, CA, 9 outlets)
- Panhandle Public Library Cooperative System (FL0136, FL, 9 outlets)
- Dakota County Library (MN0039, MN, 9 outlets)
- Newark Public Library (NJ0122, NJ, 9 outlets)

### Identity collisions to adjudicate
- Richmond Public Library (CA0102, CA): demoted, collision: richmondpubliclibrary.libcal.com identity ambiguous (CA vs VA) — needs manual confirmation (richmondpubliclibrary.libcal.com)
- Houston County Public Library (GA0029, GA): demoted, collision: houstonlibrary.libcal.com is Houston TX (houstonlibrary.org) — needs manual confirmation (houstonlibrary.libcal.com)
- Community District Library (MI0310, MI): demoted, collision: communitylibrary.libcal.com is Community Library Network, ID — needs manual confirmation (communitylibrary.libcal.com)
- Orange County Public Library (VA0056, VA): demoted, collision: ocpl.libcal.com is Orange County CA (calendars named Aliso Viejo) — needs manual confirmation (ocpl.libcal.com)
- Richmond Public Library (VA0068, VA): demoted, collision: richmondpubliclibrary.libcal.com identity ambiguous (CA vs VA) — needs manual confirmation (richmondpubliclibrary.libcal.com)

## Largest uncovered systems (expansion targets)

| System | State | Outlets | Branch |
|---|---|---|---|
| Los Angeles Public Library (CA0063) | CA | 73 | no-platform-found |
| Queens Borough Public Library (NY0562) | NY | 62 | needs-scraper |
| Broward County Libraries Division (FL0012) | FL | 38 | no-platform-found |
| Pioneerland Library System (MN0051) | MN | 32 | no-platform-found |
| Dallas Public Library (TX0003) | TX | 30 | no-platform-found |
| Pinellas Public Library Cooperative (FL0127) | FL | 25 | no-platform-found |
| Kern County Library (CA0051) | CA | 23 | no-platform-found |
| Pal Public Library Cooperative (FL0259) | FL | 23 | no-platform-found |
| Wake County Public Libraries (NC0063) | NC | 23 | no-platform-found |
| Fairfax County Public Library (VA0026) | VA | 23 | adapter-needed:communico |
| Enoch Pratt Free Library (MD0003) | MD | 22 | adapter-needed:localist |
| Detroit Public Library (MI0083) | MI | 22 | no-platform-found |
| Shreve Memorial Library (LA0054) | LA | 21 | no-platform-found |
| Montgomery County Public Libraries (MD0016) | MD | 21 | no-platform-found |
| Nashville Public Library (TN0135) | TN | 21 | no-platform-found |
| West Georgia Regional Library (GA0007) | GA | 20 | no-platform-found |
| Saint Louis County Library (MO0036) | MO | 20 | no-platform-found |
| Central Mississippi Regional Library (MS0006) | MS | 20 | no-platform-found |
| Toledo-Lucas County Public Library (OH0215) | OH | 20 | site-unreachable |
| Salt Lake County Library (UT0049) | UT | 20 | site-unreachable |
