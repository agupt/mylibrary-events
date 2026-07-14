# Event Calendar Coverage Report — 2026-07-14

Data: IMLS PLS FY2022 (16,883 library outlets, 9,234 systems), GeoNames (40,979 zips).

## Library coverage

| Status | Libraries | Share | Systems |
|---|---|---|---|
| Active (live events served) | 2,646 | 15.7% | 224 |
| Detected (vendor found, needs config) | 825 | 4.9% | 90 |
| No coverage | 13,412 | 79.4% | 8920 |

## Pipeline decision tree — where each system is stuck and who can unblock it

Every system sits on exactly one branch. "Human action" is the concrete
next step; branches marked engineering are adapter work that amortizes
across all systems on that vendor.

| Branch | Systems | Libraries | Next action |
|---|---|---|---|
| never-probed | 8,179 | 8,701 | Not yet examined (small system) — extend findDomains/detectPlatforms coverage |
| no-platform-found | 671 | 4,185 | Domain read, no known vendor fingerprint — inspect site, identify platform or scope a site scraper |
| serving | 224 | 2,646 | — (events flowing) |
| site-unreachable | 69 | 471 | Confirm the domain is right / site is up |
| feed-empty | 20 | 272 | Instance verified but feed has no items — check for a different public calendar |
| feed-unverified | 26 | 247 | Re-verify feed (possible WAF block at probe time) |
| calendar-id-needed | 24 | 201 | Open the LibCal instance, pick the events calendar, add its id to the registry |
| identity-collision | 5 | 56 | Adjudicate which system owns the instance (same-named systems in different states) |
| adapter-needed:assabet | 8 | 35 | Build assabet adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:communico | 4 | 33 | Build communico adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:localist | 1 | 22 | Build localist adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:evanced | 1 | 8 | Build evanced adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:eventkeeper | 1 | 3 | Build eventkeeper adapter (unlocks every system on it; worst case a scraper) |
| domain-unknown-probed | 1 | 3 | Slug guessing failed and official website unknown — run findDomains for this system |

Known official domains: 1054 systems (source: web search; IMLS publishes none).
Honest unknown: "never-probed" systems have NOT been checked at all — no
claim is made about whether they publish calendars.

## Vendor breakdown (event-calendar platforms)

| Vendor | Systems | Library outlets |
|---|---|---|
| libcal | 166 | 1307 |
| bibliocommons | 85 | 1218 |
| communico | 55 | 619 |
| ical | 5 | 120 |
| bklyn | 1 | 60 |
| snapshot | 1 | 94 |
| flp | 1 | 53 |

## Zip-code analysis (all 40,979 US zips)

- Nearest library has an **active** feed: **5,949 zips (14.5%)**
- Nearest library is on a **detected** platform: 2,092 (5.1%)
- Distance to nearest library: median 2.1 mi, p90 10.0 mi, p99 25.4 mi, max 1816 mi
- Every zip resolved to a nearest library: yes ✅
- Analysis runtime: 230 ms (grid-indexed)

## Active systems (224)

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
| Broward County Libraries Division (FL0012) | FL | 38 | communico |
| Fresno County Public Library (CA0040) | CA | 36 | libcal |
| Riverside County Library System (CA0199) | CA | 35 | libcal |
| Fulton County Library System (GA0022) | GA | 34 | bibliocommons |
| San Diego County Library (CA0112) | CA | 33 | bibliocommons |
| San Bernardino County Library (CA0109) | CA | 32 | ical |
| Great River Regional Library (MN0032) | MN | 32 | libcal |
| Dallas Public Library (TX0003) | TX | 30 | ical |
| Timberland Regional Library (WA0069) | WA | 29 | bibliocommons |
| Sacramento Public Library (CA0105) | CA | 28 | communico |
| Cleveland Public Library (OH0051) | OH | 28 | libcal |
| Harris County Public Library (TX0101) | TX | 28 | bibliocommons |
| Pima County Public Library (AZ0064) | AZ | 27 | bibliocommons |
| Denver Public Library (CO0034) | CO | 27 | libcal |
| Cuyahoga County Public Library (OH0052) | OH | 27 | communico |
| Contra Costa County Library (CA0028) | CA | 26 | bibliocommons |
| Boston Public Library (MA0035) | MA | 26 | bibliocommons |
| Las Vegas-Clark County Library District (NV0008) | NV | 25 | bibliocommons |
| Dekalb County Public Library (GA0017) | GA | 24 | communico |
| Sno-Isle Libraries (WA0065) | WA | 23 | bibliocommons |
| Charlotte Mecklenburg Library (NC0045) | NC | 21 | bibliocommons |
| Ocean County Library (NJ0252) | NJ | 21 | communico |
| Kent District Library (MI0182) | MI | 20 | bibliocommons |
| Dayton Metro Library (OH0063) | OH | 20 | bibliocommons |
| Pierce County Library System (WA0063) | WA | 20 | communico |
| Prince George`S County Memorial Library Syste (MD0017) | MD | 19 | communico |
| Carnegie Library Of Pittsburgh (PA0042) | PA | 19 | libcal |
| Oakland Public Library (CA0081) | CA | 18 | bibliocommons |
| Palm Beach County Library System (FL0246) | FL | 18 | bibliocommons |
| Charleston County Public Library System (SC0009) | SC | 17 | libcal |
| High Plains Library District (CO0145) | CO | 16 | libcal |
| Lake County Library System (FL0039) | FL | 16 | libcal |
| Gwinnett County Public Library System (GA0025) | GA | 16 | communico |
| Orange County Library District (FL0005) | FL | 15 | communico |
| Youngstown And Mahoning County, Pl Of (OH0248) | OH | 15 | bibliocommons |
| Jackson County Library Services (OR0041) | OR | 15 | libcal |
| Fort Vancouver Regional Library District (WA0058) | WA | 15 | bibliocommons |
| Volusia County Public Library (FL0099) | FL | 14 | libcal |
| Allen County Public Library (IN0073) | IN | 14 | communico |
| Johnson County Library (KS0134) | KS | 14 | bibliocommons |
| East Central Regional Library (MN0031) | MN | 14 | libcal |
| Omaha Public Library (NE0162) | NE | 14 | bibliocommons |
| San Mateo County Libraries (CA0120) | CA | 13 | bibliocommons |
| Capital Area District Library (MI0424) | MI | 13 | libcal |
| Lake Agassiz Regional Library (MN0034) | MN | 13 | communico |
| Saint Paul Public Library (MN0044) | MN | 13 | bibliocommons |
| Monmouth County Library (NJ0195) | NJ | 13 | libcal |
| Abbe Regional Library System (SC0002) | SC | 13 | libcal |
| Milwaukee Public Library (WI0199) | WI | 13 | communico |
| St. Tammany Parish Library (LA0049) | LA | 12 | bibliocommons |
| Calcasieu Parish Public Library (LA0053) | LA | 12 | communico |
| Norfolk Public Library (VA0054) | VA | 12 | libcal |
| Whatcom County Library System (WA0057) | WA | 12 | libcal |
| Alameda County Library (CA0001) | CA | 11 | bibliocommons |
| Jefferson County Public Library (CO0060) | CO | 11 | bibliocommons |
| Piedmont Regional Library System (GA0001) | GA | 11 | libcal |
| Athens Regional Library System (GA0011) | GA | 11 | libcal |
| Somerset County Library (NJ0275) | NJ | 11 | communico |
| Onondaga County Public Library (NY0476) | NY | 11 | libcal |
| Spokane County Library District (WA0066) | WA | 11 | libcal |
| Marin County Free Library (CA0065) | CA | 10 | bibliocommons |
| Muskegon Area District Library (MI0240) | MI | 10 | bibliocommons |
| Springfield-Greene County Library District (MO0020) | MO | 10 | communico |
| Stark County District Library (OH0039) | OH | 10 | bibliocommons |
| Lexington County Public Library System (SC0027) | SC | 10 | libcal |
| Central Rappahannock Regional Library (VA0014) | VA | 10 | bibliocommons |
| Henrico County Public Library (VA0036) | VA | 10 | libcal |
| Loudoun County Public Library (VA0044) | VA | 10 | communico |
| Pamunkey Regional Library (VA0057) | VA | 10 | libcal |
| Placer County Library (CA0009) | CA | 9 | libcal |
| Siskiyou County Free Library (CA0135) | CA | 9 | libcal |
| Solano County Library (CA0136) | CA | 9 | communico |
| Pasco County Public Library Cooperative (FL0065) | FL | 9 | communico |
| Terrebonne Parish Library (LA0048) | LA | 9 | libcal |
| Lafayette Public Library (LA0052) | LA | 9 | libcal |
| Dakota County Library (MN0039) | MN | 9 | libcal |
| Newark Public Library (NJ0122) | NJ | 9 | libcal |
| Chillicothe And Ross County Public Library (OH0048) | OH | 9 | communico |
| Mansfield-Richland County Public Library (OH0130) | OH | 9 | communico |
| Anderson County Library (SC0004) | SC | 9 | libcal |
| Richmond Public Library (VA0068) | VA | 9 | libcal |
| Kitsap Regional Library (WA0060) | WA | 9 | bibliocommons |
| Tuzzy Consortium Library (AK0094) | AK | 8 | libcal |
| Faulkner-Van Buren Regional Library System (AR0017) | AR | 8 | communico |
| Yuma County Library District (AZ0082) | AZ | 8 | bibliocommons |
| Anaheim Public Library (CA0007) | CA | 8 | libcal |
| Santa Clara County Library (CA0126) | CA | 8 | bibliocommons |
| Arapahoe Library District (CO0005) | CO | 8 | bibliocommons |
| Mesa County Public Library District (CO0082) | CO | 8 | libcal |
| Pueblo City-County Library District (CO0099) | CO | 8 | communico |
| Evansville-Vanderburgh Public Library (IN0020) | IN | 8 | communico |
| Iberville Parish Library (LA0022) | LA | 8 | libcal |
| Grand Rapids Public Library (MI0131) | MI | 8 | bibliocommons |
| Anoka County Library (MN0035) | MN | 8 | libcal |
| Scott County Library (MN0045) | MN | 8 | libcal |
| Beaufort-Hyde-Martin Regional Library (NC0004) | NC | 8 | libcal |
| Neuse Regional Library (NC0012) | NC | 8 | libcal |
| Burlington County Library (NJ0070) | NJ | 8 | bibliocommons |
| Cape May County Library (NJ0100) | NJ | 8 | communico |
| Dauphin County Library System (PA0222) | PA | 8 | libcal |
| Tacoma Public Library (WA0068) | WA | 8 | bibliocommons |
| Aurora Public Library (CO0007) | CO | 7 | bibliocommons |
| Manatee County Public Library System (FL0046) | FL | 7 | libcal |
| Clayton County Library System (GA0012) | GA | 7 | communico |
| Chattahoochee Valley Libraries (GA0036) | GA | 7 | communico |
| St. Mary Parish Library (LA0043) | LA | 7 | libcal |
| Carver County Library System (MN0038) | MN | 7 | libcal |
| Ramsey County Library (MN0043) | MN | 7 | bibliocommons |
| Durham County Library (NC0030) | NC | 7 | libcal |
| Harnett County Public Library (NC0037) | NC | 7 | libcal |
| Geauga County Public Library (OH0046) | OH | 7 | libcal |
| Wayne County Public Library (OH0245) | OH | 7 | libcal |
| Greene County Public Library (OH0247) | OH | 7 | bibliocommons |
| Lower Merion Library System (PA0448) | PA | 7 | libcal |
| Berkeley County Library System (SC0006) | SC | 7 | libcal |
| Alexandria Library (VA0001) | VA | 7 | communico |
| Massanutten Regional Library (VA0072) | VA | 7 | libcal |
| Garfield County Public Library District (CO0049) | CO | 6 | libcal |
| Osceola Library System (FL0109) | FL | 6 | libcal |
| Thomas County Public Library System (GA0045) | GA | 6 | libcal |
| Sullivan County Public Library (IN0186) | IN | 6 | libcal |
| Sussex County Library (NJ0284) | NJ | 6 | libcal |
| Williams Co Public Library (OH0032) | OH | 6 | libcal |
| Lorain Public Library (OH0125) | OH | 6 | libcal |
| Muskingum County Library System (OH0250) | OH | 6 | communico |
| Cranston Public Library (RI0010) | RI | 6 | libcal |
| Beaumont Public Library System (TX0216) | TX | 6 | libcal |
| Flagstaff City-Coconino County Public Library (AZ0169) | AZ | 5 | libcal |
| Berkeley Public Library (CA0011) | CA | 5 | communico |
| Huntington Beach Public Library (CA0046) | CA | 5 | libcal |
| Palo Alto City Library (CA0091) | CA | 5 | bibliocommons |
| Santa Monica Public Library (CA0130) | CA | 5 | bibliocommons |
| Bridgeport Public Library (CT0016) | CT | 5 | libcal |
| New Haven Free Public Library (CT0103) | CT | 5 | libcal |
| Citrus County Library System (FL0018) | FL | 5 | communico |
| Henry County Library System (GA0054) | GA | 5 | communico |
| Hall County Library System (GA0060) | GA | 5 | libcal |
| Boise Public (ID0005) | ID | 5 | libcal |
| Johnson County Public Library (IN0207) | IN | 5 | communico |
| Livingston Parish Library (LA0040) | LA | 5 | libcal |
| Worcester County Library (MD0024) | MD | 5 | libcal |
| Reynolds County Library District (MO0137) | MO | 5 | libcal |
| Brunswick County Library (NC0018) | NC | 5 | libcal |
| Braswell Memorial Public Library (NC0046) | NC | 5 | libcal |
| Carteret County Public Library System (NC0113) | NC | 5 | libcal |
| Warren County Library (NJ0306) | NJ | 5 | communico |
| Portage County District Library (OH0089) | OH | 5 | communico |
| Highland County District Library (OH0101) | OH | 5 | libcal |
| Fairfield County District Library (OH0116) | OH | 5 | communico |
| Clark County Public Library (OH0204) | OH | 5 | bibliocommons |
| Mont Co-Norristown Pub Lib (PA0336) | PA | 5 | libcal |
| Plano Public Library System (TX0228) | TX | 5 | communico |
| Morgantown Public Library (WV0023) | WV | 5 | libcal |
| Chandler Public Library (AZ0031) | AZ | 4 | bibliocommons |
| San Leandro Public Library (CA0117) | CA | 4 | libcal |
| Charlotte County Public Library (FL0258) | FL | 4 | libcal |
| Forsyth County Public Library (GA0058) | GA | 4 | communico |
| Campbell County Public Library District (KY0018) | KY | 4 | communico |
| Ascension Parish Library (LA0037) | LA | 4 | communico |
| Calvert Library (MD0005) | MD | 4 | communico |
| Charles County Public Library (MD0009) | MD | 4 | communico |
| Christian County Library (MO0110) | MO | 4 | libcal |
| Lewis And Clark Library (MT0039) | MT | 4 | libcal |
| New Hanover County Public Library (NC0047) | NC | 4 | libcal |
| Union County Public Library (NC0061) | NC | 4 | libcal |
| Alamance County Public Libraries (NC0103) | NC | 4 | libcal |
| Woodbridge Public Library (NJ0194) | NJ | 4 | libcal |
| Great Neck Library (NY0348) | NY | 4 | libcal |
| Elyria Public Library (OH0077) | OH | 4 | libcal |
| Mentor Public Library (OH0142) | OH | 4 | libcal |
| Willoughby-Eastlake Public Library (OH0242) | OH | 4 | libcal |
| Warwick Public Library (RI0046) | RI | 4 | libcal |
| Pickens County Library System (SC0034) | SC | 4 | communico |
| Montgomery-Floyd Regional Library (VA0051) | VA | 4 | libcal |
| Pend Oreille County Library District (WA0041) | WA | 4 | libcal |
| North Olympic Library System (WA0053) | WA | 4 | communico |
| Kenosha Public Library (WI0148) | WI | 4 | bibliocommons |
| Mcdowell Public Library (WV0071) | WV | 4 | libcal |
| Burbank Public Library (CA0015) | CA | 3 | communico |
| Oceanside Public Library (CA0082) | CA | 3 | libcal |
| Orange Public Library (CA0085) | CA | 3 | libcal |
| Palos Verdes Library District (CA0092) | CA | 3 | communico |
| Richmond Public Library (CA0102) | CA | 3 | libcal |
| Greenwich Library (CT0063) | CT | 3 | libcal |
| Hamden Public Library (CT0072) | CT | 3 | libcal |
| Sioux City Public Library (IA0225) | IA | 3 | libcal |
| Davenport Public Library (IA0355) | IA | 3 | libcal |
| Schaumburg Township District Library (IL0479) | IL | 3 | communico |
| Newburgh Chandler Public Library (IN0022) | IN | 3 | communico |
| Eckhart Public Library (IN0075) | IN | 3 | libcal |
| Noble County Public Library (IN0085) | IN | 3 | communico |
| Kokomo-Howard County Public Library (IN0128) | IN | 3 | communico |
| Shelby County Public Library (IN0214) | IN | 3 | communico |
| Kenton County Public Library (KY0056) | KY | 3 | bibliocommons |
| Brookline Public Library (MA0046) | MA | 3 | libcal |
| Wellesley Free Library (MA0313) | MA | 3 | libcal |
| Kent County Public Library (MD0015) | MD | 3 | libcal |
| St. Mary`S County Library (MD0019) | MD | 3 | communico |
| Caldwell County Public Library (NC0022) | NC | 3 | libcal |
| Iredell County Library (NC0040) | NC | 3 | libcal |
| Hunterdon County Library (NJ0156) | NJ | 3 | libcal |
| Northern Onondaga Public Library (NY0784) | NY | 3 | libcal |
| Western Sullivan Public Library (NY9015) | NY | 3 | libcal |
| Troy-Miami County Public Library (OH0216) | OH | 3 | libcal |
| Upper Arlington Public Library (OH0218) | OH | 3 | communico |
| South Kingstown Public Library (RI0043) | RI | 3 | libcal |
| Kershaw County Library (SC0023) | SC | 3 | libcal |
| Denton Public Library (TX0012) | TX | 3 | bibliocommons |
| Irving Public Library (TX0109) | TX | 3 | libcal |
| Mcallen Public Library (TX0549) | TX | 3 | communico |
| Newport News Public Library System (VA0053) | VA | 3 | libcal |
| Bellingham Public Library (WA0050) | WA | 3 | libcal |
| Laramie County Library System (WY0004) | WY | 3 | libcal |
| Mountain View Public Library (CA0076) | CA | 1 | libcal |

## Detected systems awaiting configuration (90)

| System | State | Outlets | Vendor |
|---|---|---|---|
| Houston Public Library (TX0099) | TX | 37 | libcal |
| San Diego Public Library (CA0113) | CA | 36 | bibliocommons |
| Mid-Continent Public Library (MO0004) | MO | 34 | bibliocommons |
| Orange County Public Libraries (CA0084) | CA | 32 | libcal |
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
| City Of St. Louis Municipal Library District (MO0030) | MO | 16 | bibliocommons |
| Sonoma County Library (CA0137) | CA | 15 | bibliocommons |
| New Orleans Public Library (LA0058) | LA | 15 | libcal |
| Sandhill Regional Library System (NC0015) | NC | 15 | libcal |
| Central Arkansas Library System (AR0001) | AR | 14 | bibliocommons |
| East Baton Rouge Parish Library (LA0055) | LA | 14 | libcal |
| St Joseph County Public Library (IN0068) | IN | 10 | bibliocommons |
| Kansas City Public Library (MO0014) | MO | 10 | bibliocommons |
| Chesterfield County Public Library (VA0018) | VA | 10 | libcal |
| Buffalo And Erie County Public Library (NY0005) | NY | 9 | libcal |
| Glendale Library, Arts & Culture (CA0042) | CA | 8 | bibliocommons |
| Riverside Public Library (CA0103) | CA | 8 | libcal |
| Marion County Public Library System (FL0001) | FL | 8 | libcal |
| Iosco-Arenac District Library (MI0171) | MI | 8 | bibliocommons |
| Greensboro Public Library (NC0035) | NC | 8 | libcal |
| Washington County Library System (UT0066) | UT | 8 | libcal |

…and 60 more.

## Human action queues (highest-leverage first)

### Adapter backlog (engineering — one adapter unlocks every system on the vendor)
- **assabet**: 8 systems / 35 libraries. E.g. White County Regional Library System (AR, 9); Worcester Public Library (MA, 7); Thomas Crane Public Library (MA, 4); Montague Public Libraries (MA, 3); Peabody Institute Library (MA, 3)
- **communico**: 4 systems / 33 libraries. E.g. Fairfax County Public Library (VA, 23); Henderson District Public Libraries (NV, 4); Aurora Public Library District (IL, 3); Aurora Public Library District (IN, 3)
- **localist**: 1 systems / 22 libraries. E.g. Enoch Pratt Free Library (MD, 22)
- **evanced**: 1 systems / 8 libraries. E.g. Lincoln City Libraries (NE, 8)
- **eventkeeper**: 1 systems / 3 libraries. E.g. Clinton-Macomb Public Library (MI, 3)

### Calendar ids needed (5-minute manual task each)
- Houston Public Library (TX0099, TX, 37 outlets)
- New Orleans Public Library (LA0058, LA, 15 outlets)
- East Baton Rouge Parish Library (LA0055, LA, 14 outlets)
- Washoe County Library System (NV0025, NV, 12 outlets)
- Santa Cruz Public Libraries (CA0127, CA, 11 outlets)
- Saint Clair County Library System (MI0321, MI, 11 outlets)
- Mercer County Library (NJ0165, NJ, 9 outlets)
- Arlington Dept. Of Libraries (VA0005, VA, 9 outlets)
- Washington County Library System (UT0066, UT, 8 outlets)
- Washington County Library (MN0046, MN, 7 outlets)
- Cass County Public Library (MO0040, MO, 7 outlets)
- Bucks County Free Library (PA0309, PA, 7 outlets)
- Arlington Public Library System (TX0068, TX, 7 outlets)
- Boone County Public Library District (KY0008, KY, 6 outlets)
- Spokane Public Library (WA0067, WA, 6 outlets)

### Identity collisions to adjudicate
- Whiteriver Public Library (AZ0048, AZ): demoted, collision: www.navajocountylibraries.org?post_type=tribe_events&ical=1&eventDisplay=list claimed by AZ0107, AZ0048
- Navajo County Library District (AZ0107, AZ): demoted, collision: www.navajocountylibraries.org?post_type=tribe_events&ical=1&eventDisplay=list claimed by AZ0107, AZ0048
- Orange County Public Libraries (CA0084, CA): demoted, collision: ocpl.libcal.com claimed by CA0084, VA0056 — needs manual confirmation
- Community Library Network (ID0120, ID): demoted, collision: communitylibrary.libcal.com claimed by ID0120, MI0310 — needs manual confirmation
- Buffalo And Erie County Public Library (NY0005, NY): demoted, collision: buffalolib.libcal.com claimed by NY0005, NY0027 — needs manual confirmation

## Largest uncovered systems (expansion targets)

| System | State | Outlets | Branch |
|---|---|---|---|
| Los Angeles Public Library (CA0063) | CA | 73 | no-platform-found |
| Queens Borough Public Library (NY0562) | NY | 62 | no-platform-found |
| Pioneerland Library System (MN0051) | MN | 32 | no-platform-found |
| North Central Regional Library (WA0062) | WA | 30 | no-platform-found |
| District Of Columbia Public Library (DC0001) | DC | 26 | no-platform-found |
| Pinellas Public Library Cooperative (FL0127) | FL | 25 | no-platform-found |
| Kern County Library (CA0051) | CA | 23 | no-platform-found |
| Pal Public Library Cooperative (FL0259) | FL | 23 | no-platform-found |
| Wake County Public Libraries (NC0063) | NC | 23 | no-platform-found |
| Fairfax County Public Library (VA0026) | VA | 23 | adapter-needed:communico |
| Enoch Pratt Free Library (MD0003) | MD | 22 | adapter-needed:localist |
| Detroit Public Library (MI0083) | MI | 22 | no-platform-found |
| Jacksonville Public Library (FL0003) | FL | 21 | no-platform-found |
| Shreve Memorial Library (LA0054) | LA | 21 | no-platform-found |
| Montgomery County Public Libraries (MD0016) | MD | 21 | no-platform-found |
| Nashville Public Library (TN0135) | TN | 21 | no-platform-found |
| West Georgia Regional Library (GA0007) | GA | 20 | no-platform-found |
| Saint Louis County Library (MO0036) | MO | 20 | no-platform-found |
| Central Mississippi Regional Library (MS0006) | MS | 20 | no-platform-found |
| Toledo-Lucas County Public Library (OH0215) | OH | 20 | site-unreachable |
