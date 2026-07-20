# Event Calendar Coverage Report — 2026-07-20

Data: IMLS PLS FY2022 (16,883 library outlets, 9,234 systems), GeoNames (40,979 zips).

## Library coverage

| Status | Libraries | Share | Systems |
|---|---|---|---|
| Active (live events served) | 5,166 | 30.6% | 818 |
| Detected (vendor found, needs config) | 536 | 3.2% | 71 |
| No coverage | 11,181 | 66.2% | 8345 |

## Pipeline decision tree — where each system is stuck and who can unblock it

Every system sits on exactly one branch. "Human action" is the concrete
next step; branches marked engineering are adapter work that amortizes
across all systems on that vendor.

| Branch | Systems | Libraries | Next action |
|---|---|---|---|
| never-probed | 7,778 | 8,147 | Not yet examined (small system) — extend findDomains/detectPlatforms coverage |
| serving | 818 | 5,166 | — (events flowing) |
| no-platform-found | 508 | 2,699 | Domain read, no known vendor fingerprint — inspect site, identify platform or scope a site scraper |
| site-unreachable | 65 | 359 | Confirm the domain is right / site is up |
| identity-collision | 29 | 214 | Adjudicate which system owns the instance (same-named systems in different states) |
| feed-empty | 7 | 129 | Instance verified but feed has no items — check for a different public calendar |
| feed-unverified | 11 | 66 | Re-verify feed (possible WAF block at probe time) |
| calendar-id-needed | 8 | 42 | Open the LibCal instance, pick the events calendar, add its id to the registry |
| adapter-needed:assabet | 7 | 28 | Build assabet adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:localist | 1 | 22 | Build localist adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:evanced | 1 | 8 | Build evanced adapter (unlocks every system on it; worst case a scraper) |
| adapter-needed:communico | 1 | 3 | Build communico adapter (unlocks every system on it; worst case a scraper) |

Known official domains: 1154 systems (source: web search; IMLS publishes none).
Honest unknown: "never-probed" systems have NOT been checked at all — no
claim is made about whether they publish calendars.

## Vendor breakdown (event-calendar platforms)

| Vendor | Systems | Library outlets |
|---|---|---|
| ical | 398 | 1663 |
| libcal | 210 | 1447 |
| communico | 195 | 1215 |
| bibliocommons | 74 | 1023 |
| civicplus | 2 | 7 |
| mylibrarydigital | 1 | 3 |
| lapl | 1 | 73 |
| opencities | 1 | 2 |
| govcal | 1 | 16 |
| sfpl | 1 | 28 |
| eventscalendar | 1 | 17 |
| bklyn | 1 | 60 |
| snapshot | 1 | 94 |
| flp | 1 | 53 |
| whofi | 1 | 1 |

## Zip-code analysis (all 40,979 US zips)

- Nearest library has an **active** feed: **12,859 zips (31.4%)**
- Nearest library is on a **detected** platform: 1,321 (3.2%)
- Distance to nearest library: median 2.1 mi, p90 10.0 mi, p99 25.4 mi, max 1816 mi
- Every zip resolved to a nearest library: yes ✅
- Analysis runtime: 689 ms (grid-indexed)

## Active systems (818)

| System | State | Outlets | Vendor |
|---|---|---|---|
| New York Public Library, The Branch Libraries (NY0778) | NY | 94 | snapshot |
| La County Library (CA0062) | CA | 85 | communico |
| Chicago Public Library (IL0098) | IL | 81 | bibliocommons |
| Los Angeles Public Library (CA0063) | CA | 73 | lapl |
| Brooklyn Public Library (NY0004) | NY | 60 | bklyn |
| Free Library Of Philadelphia (PA0385) | PA | 53 | flp |
| Miami-Dade Public Library System (FL0025) | FL | 50 | communico |
| Hawaii State Public Library System (HI0001) | HI | 50 | ical |
| King County Library System (WA0059) | WA | 49 | bibliocommons |
| Hennepin County Library (MN0041) | MN | 41 | bibliocommons |
| Cincinnati And Hamilton County Public Library (OH0049) | OH | 41 | bibliocommons |
| Broward County Libraries Division (FL0012) | FL | 38 | communico |
| Houston Public Library (TX0099) | TX | 37 | libcal |
| Fresno County Public Library (CA0040) | CA | 36 | libcal |
| Riverside County Library System (CA0199) | CA | 35 | libcal |
| Fulton County Library System (GA0022) | GA | 34 | bibliocommons |
| San Diego County Library (CA0112) | CA | 33 | bibliocommons |
| San Bernardino County Library (CA0109) | CA | 32 | ical |
| Great River Regional Library (MN0032) | MN | 32 | libcal |
| Dallas Public Library (TX0003) | TX | 30 | ical |
| North Central Regional Library (WA0062) | WA | 30 | libcal |
| Hillsborough County Public Library Cooperative (FL0035) | FL | 29 | communico |
| Timberland Regional Library (WA0069) | WA | 29 | bibliocommons |
| Sacramento Public Library (CA0105) | CA | 28 | communico |
| San Francisco Public Library (CA0114) | CA | 28 | sfpl |
| Cleveland Public Library (OH0051) | OH | 28 | libcal |
| Harris County Public Library (TX0101) | TX | 28 | bibliocommons |
| Pima County Public Library (AZ0064) | AZ | 27 | bibliocommons |
| Denver Public Library (CO0034) | CO | 27 | libcal |
| Cuyahoga County Public Library (OH0052) | OH | 27 | communico |
| Contra Costa County Library (CA0028) | CA | 26 | bibliocommons |
| District Of Columbia Public Library (DC0001) | DC | 26 | communico |
| Boston Public Library (MA0035) | MA | 26 | bibliocommons |
| San Jose Public Library (CA0115) | CA | 25 | bibliocommons |
| Pinellas Public Library Cooperative (FL0127) | FL | 25 | ical |
| Las Vegas-Clark County Library District (NV0008) | NV | 25 | communico |
| Dekalb County Public Library (GA0017) | GA | 24 | communico |
| Indianapolis Public Library (IN0210) | IN | 24 | communico |
| Tulsa City-County Library System (OK0093) | OK | 24 | communico |
| Columbus Metropolitan Library (OH0057) | OH | 23 | communico |
| Fairfax County Public Library (VA0026) | VA | 23 | libcal |
| Sno-Isle Libraries (WA0065) | WA | 23 | bibliocommons |
| Jacksonville Public Library (FL0003) | FL | 21 | communico |
| Montgomery County Public Libraries (MD0016) | MD | 21 | communico |
| Charlotte Mecklenburg Library (NC0045) | NC | 21 | bibliocommons |
| Ocean County Library (NJ0252) | NJ | 21 | communico |
| Nashville Public Library (TN0135) | TN | 21 | ical |
| West Georgia Regional Library (GA0007) | GA | 20 | ical |
| Kent District Library (MI0182) | MI | 20 | bibliocommons |
| Dayton Metro Library (OH0063) | OH | 20 | bibliocommons |
| Salt Lake County Library (UT0049) | UT | 20 | communico |
| Pierce County Library System (WA0063) | WA | 20 | communico |
| Baltimore County Public Library (MD0004) | MD | 19 | communico |
| Prince George`S County Memorial Library Syste (MD0017) | MD | 19 | communico |
| Akron-Summit Cnty Public Library (OH0002) | OH | 19 | communico |
| Metropolitan Library System (OK0074) | OK | 19 | ical |
| Multnomah County Library (OR0063) | OR | 19 | communico |
| Carnegie Library Of Pittsburgh (PA0042) | PA | 19 | libcal |
| Knox County Public Library System (TN0133) | TN | 19 | ical |
| Oakland Public Library (CA0081) | CA | 18 | bibliocommons |
| Palm Beach County Library System (FL0246) | FL | 18 | bibliocommons |
| Albuquerque/Bernalillo County Library System (NM0002) | NM | 18 | libcal |
| Memphis Public Library And Information Center (TN0134) | TN | 18 | ical |
| Fort Worth Public Library (TX0050) | TX | 18 | libcal |
| Phoenix Public Library (AZ0035) | AZ | 17 | libcal |
| Tulare County Free Library (CA0148) | CA | 17 | eventscalendar |
| Charleston County Public Library System (SC0009) | SC | 17 | libcal |
| Monterey County Free Libraries (CA0073) | CA | 16 | govcal |
| High Plains Library District (CO0145) | CO | 16 | libcal |
| Lake County Library System (FL0039) | FL | 16 | libcal |
| Live Oak Public Libraries (GA0008) | GA | 16 | libcal |
| Gwinnett County Public Library System (GA0025) | GA | 16 | communico |
| Jefferson Parish Library (LA0057) | LA | 16 | ical |
| Anne Arundel County Public Library (MD0002) | MD | 16 | ical |
| Monroe County Library System (MI0233) | MI | 16 | ical |
| Southeast Oklahoma Library System (OK0062) | OK | 16 | ical |
| Yavapai County Free Library District (AZ0067) | AZ | 15 | ical |
| Sonoma County Library (CA0137) | CA | 15 | ical |
| Pikes Peak Library District (CO0096) | CO | 15 | ical |
| Orange County Library District (FL0005) | FL | 15 | communico |
| New Orleans Public Library (LA0058) | LA | 15 | communico |
| Youngstown And Mahoning County, Pl Of (OH0248) | OH | 15 | bibliocommons |
| Eastern Oklahoma Library System (OK0066) | OK | 15 | ical |
| Jackson County Library Services (OR0041) | OR | 15 | libcal |
| Fort Vancouver Regional Library District (WA0058) | WA | 15 | bibliocommons |
| Central Arkansas Library System (AR0001) | AR | 14 | communico |
| Lee County Library System (FL0042) | FL | 14 | ical |
| Volusia County Public Library (FL0099) | FL | 14 | libcal |
| Allen County Public Library (IN0073) | IN | 14 | communico |
| Johnson County Library (KS0134) | KS | 14 | bibliocommons |
| East Central Regional Library (MN0031) | MN | 14 | libcal |
| Jackson/Hinds Library System (MS0021) | MS | 14 | ical |
| Omaha Public Library (NE0162) | NE | 14 | bibliocommons |
| San Mateo County Libraries (CA0120) | CA | 13 | bibliocommons |
| Ventura County Library (CA0152) | CA | 13 | ical |
| Capital Area District Library (MI0424) | MI | 13 | libcal |
| Lake Agassiz Regional Library (MN0034) | MN | 13 | communico |
| Saint Paul Public Library (MN0044) | MN | 13 | bibliocommons |
| Northwestern Regional Library (NC0013) | NC | 13 | libcal |
| Monmouth County Library (NJ0195) | NJ | 13 | libcal |
| Abbe Regional Library System (SC0002) | SC | 13 | libcal |
| Fort Bend County Libraries (TX0247) | TX | 13 | ical |
| Milwaukee Public Library (WI0199) | WI | 13 | communico |
| St. Tammany Parish Library (LA0049) | LA | 12 | bibliocommons |
| Calcasieu Parish Public Library (LA0053) | LA | 12 | communico |
| Buncombe County Public Libraries (NC0019) | NC | 12 | ical |
| Washoe County Library System (NV0025) | NV | 12 | libcal |
| Norfolk Public Library (VA0054) | VA | 12 | libcal |
| Prince William Public Libraries (VA0064) | VA | 12 | communico |
| Whatcom County Library System (WA0057) | WA | 12 | libcal |
| Alameda County Library (CA0001) | CA | 11 | bibliocommons |
| Santa Cruz Public Libraries (CA0127) | CA | 11 | communico |
| Jefferson County Public Library (CO0060) | CO | 11 | bibliocommons |
| Piedmont Regional Library System (GA0001) | GA | 11 | libcal |
| Athens Regional Library System (GA0011) | GA | 11 | libcal |
| Harford County Public Library (MD0013) | MD | 11 | communico |
| Saint Charles City-County Library District (MO0035) | MO | 11 | ical |
| Somerset County Library (NJ0275) | NJ | 11 | communico |
| Onondaga County Public Library (NY0476) | NY | 11 | libcal |
| Spokane County Library District (WA0066) | WA | 11 | libcal |
| Montgomery City-County Public Library (AL0187) | AL | 10 | ical |
| Southeast Arkansas Regional Library (AR0014) | AR | 10 | ical |
| Marin County Free Library (CA0065) | CA | 10 | bibliocommons |
| Three Rivers Regional Library System (GA0023) | GA | 10 | ical |
| St Joseph County Public Library (IN0068) | IN | 10 | communico |
| Muskegon Area District Library (MI0240) | MI | 10 | bibliocommons |
| Springfield-Greene County Library District (MO0020) | MO | 10 | communico |
| Forsyth County Public Library (NC0032) | NC | 10 | ical |
| Gaston County Public Library (NC0105) | NC | 10 | libcal |
| Jersey City Free Public Library (NJ0149) | NJ | 10 | libcal |
| Stark County District Library (OH0039) | OH | 10 | bibliocommons |
| Lexington County Public Library System (SC0027) | SC | 10 | libcal |
| Central Rappahannock Regional Library (VA0014) | VA | 10 | bibliocommons |
| Henrico County Public Library (VA0036) | VA | 10 | libcal |
| Loudoun County Public Library (VA0044) | VA | 10 | communico |
| Pamunkey Regional Library (VA0057) | VA | 10 | libcal |
| Virginia Beach Public Library (VA0082) | VA | 10 | ical |
| Kanawha County Public Library (WV0009) | WV | 10 | ical |
| Mobile Public Library (AL0186) | AL | 9 | ical |
| Placer County Library (CA0009) | CA | 9 | libcal |
| Siskiyou County Free Library (CA0135) | CA | 9 | libcal |
| Solano County Library (CA0136) | CA | 9 | communico |
| Pasco County Public Library Cooperative (FL0065) | FL | 9 | communico |
| Panhandle Public Library Cooperative System (FL0136) | FL | 9 | ical |
| Lafourche Parish Public Library (LA0047) | LA | 9 | ical |
| Terrebonne Parish Library (LA0048) | LA | 9 | libcal |
| Lafayette Public Library (LA0052) | LA | 9 | libcal |
| Springfield City Library (MA0278) | MA | 9 | ical |
| Frederick County Public Libraries (MD0011) | MD | 9 | ical |
| Dakota County Library (MN0039) | MN | 9 | libcal |
| Waseca-Le Sueur Regional Library (MN0107) | MN | 9 | ical |
| Kitchigami Regional Library (MN0145) | MN | 9 | ical |
| Scenic Regional Library (MO0065) | MO | 9 | ical |
| Atlantic County Library (NJ0001) | NJ | 9 | ical |
| Newark Public Library (NJ0122) | NJ | 9 | libcal |
| Mercer County Library (NJ0165) | NJ | 9 | libcal |
| Schenectady County Public Library (NY0327) | NY | 9 | ical |
| Chillicothe And Ross County Public Library (OH0048) | OH | 9 | communico |
| Preble County District Library (OH0075) | OH | 9 | ical |
| Mansfield-Richland County Public Library (OH0130) | OH | 9 | communico |
| York Sys Admin Unit (PA0188) | PA | 9 | ical |
| Providence Community Library (RI0053) | RI | 9 | ical |
| Richmond Public Library (VA0068) | VA | 9 | libcal |
| Kitsap Regional Library (WA0060) | WA | 9 | bibliocommons |
| Brown County Library (WI0121) | WI | 9 | ical |
| Tuzzy Consortium Library (AK0094) | AK | 8 | libcal |
| Faulkner-Van Buren Regional Library System (AR0017) | AR | 8 | communico |
| Yuma County Library District (AZ0082) | AZ | 8 | bibliocommons |
| Anaheim Public Library (CA0007) | CA | 8 | libcal |
| Glendale Library, Arts & Culture (CA0042) | CA | 8 | communico |
| Santa Clara County Library (CA0126) | CA | 8 | bibliocommons |
| Arapahoe Library District (CO0005) | CO | 8 | bibliocommons |
| Mesa County Public Library District (CO0082) | CO | 8 | libcal |
| Pueblo City-County Library District (CO0099) | CO | 8 | communico |
| Evansville-Vanderburgh Public Library (IN0020) | IN | 8 | communico |
| Iberville Parish Library (LA0022) | LA | 8 | libcal |
| Carroll County Public Library (MD0007) | MD | 8 | ical |
| Grand Rapids Public Library (MI0131) | MI | 8 | bibliocommons |
| Anoka County Library (MN0035) | MN | 8 | libcal |
| Scott County Library (MN0045) | MN | 8 | libcal |
| Trails Regional Library (MO0045) | MO | 8 | ical |
| Beaufort-Hyde-Martin Regional Library (NC0004) | NC | 8 | libcal |
| Neuse Regional Library (NC0012) | NC | 8 | libcal |
| Cumberland County Public Library (NC0026) | NC | 8 | ical |
| Burlington County Library (NJ0070) | NJ | 8 | bibliocommons |
| Cape May County Library (NJ0100) | NJ | 8 | communico |
| Dauphin County Library System (PA0222) | PA | 8 | libcal |
| Salt Lake City Public Library System (UT0048) | UT | 8 | communico |
| Washington County Library System (UT0066) | UT | 8 | libcal |
| Appomattox Regional Library System (VA0004) | VA | 8 | ical |
| Tacoma Public Library (WA0068) | WA | 8 | bibliocommons |
| Carroll And Madison Library System (AR0049) | AR | 7 | ical |
| Yolo County Library (CA0157) | CA | 7 | libcal |
| Rangeview Library District (CO0001) | CO | 7 | communico |
| Aurora Public Library (CO0007) | CO | 7 | bibliocommons |
| Douglas County Libraries (CO0037) | CO | 7 | communico |
| Hartford Public Library (CT0073) | CT | 7 | communico |
| Northwest Regional Library System (FL0004) | FL | 7 | ical |
| Manatee County Public Library System (FL0046) | FL | 7 | libcal |
| Clayton County Library System (GA0012) | GA | 7 | communico |
| Chattahoochee Valley Libraries (GA0036) | GA | 7 | communico |
| Latah County District (ID0060) | ID | 7 | ical |
| La Porte County Public Library (IN0037) | IN | 7 | ical |
| Wichita Public Library (KS0226) | KS | 7 | communico |
| St. Mary Parish Library (LA0043) | LA | 7 | libcal |
| Bossier Parish Library (LA0046) | LA | 7 | ical |
| Cambridge Public Library (MA0049) | MA | 7 | libcal |
| Worcester Public Library (MA0344) | MA | 7 | communico |
| Lapeer District Library (MI0190) | MI | 7 | ical |
| Carver County Library System (MN0038) | MN | 7 | libcal |
| Ramsey County Library (MN0043) | MN | 7 | bibliocommons |
| Washington County Library (MN0046) | MN | 7 | libcal |
| Cass County Public Library (MO0040) | MO | 7 | libcal |
| Missoula Public Library (MT0051) | MT | 7 | ical |
| Durham County Library (NC0030) | NC | 7 | libcal |
| Harnett County Public Library (NC0037) | NC | 7 | libcal |
| Albany Public Library (NY0697) | NY | 7 | ical |
| Geauga County Public Library (OH0046) | OH | 7 | libcal |
| Wayne County Public Library (OH0245) | OH | 7 | libcal |
| Greene County Public Library (OH0247) | OH | 7 | bibliocommons |
| Bucks County Free Library (PA0309) | PA | 7 | libcal |
| Lower Merion Library System (PA0448) | PA | 7 | libcal |
| Berkeley County Library System (SC0006) | SC | 7 | libcal |
| Davis County Library (UT0019) | UT | 7 | ical |
| Alexandria Library (VA0001) | VA | 7 | communico |
| Chesapeake Public Library (VA0017) | VA | 7 | communico |
| Massanutten Regional Library (VA0072) | VA | 7 | libcal |
| Fayette County Public Library (WV0078) | WV | 7 | ical |
| Butte County Library (CA0017) | CA | 6 | ical |
| Nevada County Library (CA0079) | CA | 6 | libcal |
| Garfield County Public Library District (CO0049) | CO | 6 | libcal |
| Martin County Library System (FL0047) | FL | 6 | communico |
| Osceola Library System (FL0109) | FL | 6 | libcal |
| Santa Rosa County Library System (FL0255) | FL | 6 | ical |
| Okaloosa County Public Library Cooperative (FL8003) | FL | 6 | ical |
| Ocmulgee Regional Library System (GA0018) | GA | 6 | ical |
| Augusta-Richmond County Public Library System (GA0039) | GA | 6 | ical |
| Lake Blackshear Regional Library System (GA0043) | GA | 6 | ical |
| Thomas County Public Library System (GA0045) | GA | 6 | libcal |
| Des Moines Public Library (IA0027) | IA | 6 | ical |
| Illinois Prairie District Public Library (IL0253) | IL | 6 | ical |
| Sullivan County Public Library (IN0186) | IN | 6 | libcal |
| Morgan County Public Library (IN0212) | IN | 6 | ical |
| Coffey County Library (KS0274) | KS | 6 | ical |
| Boone County Public Library District (KY0008) | KY | 6 | communico |
| Lexington Public Library (KY0031) | KY | 6 | communico |
| Pike County Public Library District (KY0093) | KY | 6 | communico |
| Cameron Parish Library (LA0012) | LA | 6 | ical |
| St. Charles Parish Library (LA0027) | LA | 6 | ical |
| Allegany County Library System (MD0001) | MD | 6 | ical |
| Cecil County Public Library (MD0008) | MD | 6 | ical |
| Howard County Library System (MD0014) | MD | 6 | ical |
| Camden County Library (MO0095) | MO | 6 | ical |
| Riverside Regional Library (MO0128) | MO | 6 | ical |
| Henderson County Public Library (NC0039) | NC | 6 | libcal |
| Sussex County Library (NJ0284) | NJ | 6 | libcal |
| Williams Co Public Library (OH0032) | OH | 6 | libcal |
| Lorain Public Library (OH0125) | OH | 6 | libcal |
| Medina County District Library (OH0141) | OH | 6 | ical |
| Perry County District Library (OH0158) | OH | 6 | ical |
| Licking County Library (OH0163) | OH | 6 | ical |
| Shelby County Libraries - Amos Memorial (OH0203) | OH | 6 | ical |
| Muskingum County Library System (OH0250) | OH | 6 | communico |
| Deschutes Public Library District (OR0091) | OR | 6 | communico |
| Adams Sys Admin Unit (PA0176) | PA | 6 | ical |
| Cranston Public Library (RI0010) | RI | 6 | libcal |
| Florence County Library System (SC0019) | SC | 6 | ical |
| Rutherford County Library System (TN0062) | TN | 6 | ical |
| Beaumont Public Library System (TX0216) | TX | 6 | libcal |
| Bedford Public Library System (VA0007) | VA | 6 | ical |
| Spokane Public Library (WA0067) | WA | 6 | communico |
| Shawano County Library (WI0291) | WI | 6 | ical |
| Flagstaff City-Coconino County Public Library (AZ0169) | AZ | 5 | libcal |
| Berkeley Public Library (CA0011) | CA | 5 | communico |
| Huntington Beach Public Library (CA0046) | CA | 5 | libcal |
| Palo Alto City Library (CA0091) | CA | 5 | bibliocommons |
| Santa Monica Public Library (CA0130) | CA | 5 | bibliocommons |
| Boulder Public Library (CO0012) | CO | 5 | libcal |
| Grand County Library District (CO0051) | CO | 5 | ical |
| Delta County Public Library District (CO0144) | CO | 5 | ical |
| Bridgeport Public Library (CT0016) | CT | 5 | libcal |
| New Haven Free Public Library (CT0103) | CT | 5 | libcal |
| Citrus County Library System (FL0018) | FL | 5 | communico |
| Seminole County Public Library System (FL0095) | FL | 5 | ical |
| Sumter County Library System (FL0146) | FL | 5 | ical |
| Nassau County Public Library System (FL8005) | FL | 5 | ical |
| Henry County Library System (GA0054) | GA | 5 | communico |
| Hall County Library System (GA0060) | GA | 5 | libcal |
| Dubuque County Library (IA0148) | IA | 5 | ical |
| Boise Public (ID0005) | ID | 5 | libcal |
| Peoria Public Library (IL0423) | IL | 5 | ical |
| Porter County Public Library System (IN0043) | IN | 5 | ical |
| Elkhart Public Library (IN0050) | IN | 5 | ical |
| Johnson County Public Library (IN0207) | IN | 5 | communico |
| Kansas City, Kansas Public Library (KS0133) | KS | 5 | ical |
| Bullitt County Library District (KY0014) | KY | 5 | ical |
| Pulaski County Public Library (KY0095) | KY | 5 | ical |
| Beauregard Parish Library (LA0020) | LA | 5 | ical |
| Livingston Parish Library (LA0040) | LA | 5 | libcal |
| New Bedford Free Public Library (MA0198) | MA | 5 | libcal |
| Worcester County Library (MD0024) | MD | 5 | libcal |
| Chippewa River District Library System (MI0348) | MI | 5 | ical |
| Northeast Missouri Library Service (MO0059) | MO | 5 | ical |
| Mexico-Audrain County Library District (MO0091) | MO | 5 | ical |
| Reynolds County Library District (MO0137) | MO | 5 | libcal |
| Hancock County Library (MS0014) | MS | 5 | ical |
| Brunswick County Library (NC0018) | NC | 5 | libcal |
| Braswell Memorial Public Library (NC0046) | NC | 5 | libcal |
| Carteret County Public Library System (NC0113) | NC | 5 | libcal |
| Gloucester County Library (NJ0130) | NJ | 5 | ical |
| Warren County Library (NJ0306) | NJ | 5 | communico |
| Chemung County Library District (NY0794) | NY | 5 | ical |
| Portage County District Library (OH0089) | OH | 5 | communico |
| Highland County District Library (OH0101) | OH | 5 | libcal |
| Fairfield County District Library (OH0116) | OH | 5 | communico |
| Midpointe Library System (OH0144) | OH | 5 | communico |
| Portsmouth Public Library (OH0189) | OH | 5 | ical |
| Clark County Public Library (OH0204) | OH | 5 | bibliocommons |
| Mont Co-Norristown Pub Lib (PA0336) | PA | 5 | libcal |
| Erie County Public Library (PA0423) | PA | 5 | libcal |
| Cheltenham Twnshp Lib System (PA0447) | PA | 5 | libcal |
| Allendale Hampton Jasper Regional Library (SC0003) | SC | 5 | ical |
| Beaufort County Library (SC0005) | SC | 5 | ical |
| Union County Library System (SC0038) | SC | 5 | ical |
| York County Library System (SC0040) | SC | 5 | ical |
| Sullivan County Public Library (TN0125) | TN | 5 | ical |
| Chattanooga Public Library (TN0132) | TN | 5 | ical |
| Plano Public Library System (TX0228) | TX | 5 | communico |
| Washington County Public Library (VA0084) | VA | 5 | ical |
| Virgin Islands Division Of Libraries, Archives And Museums (VI0002) | VI | 5 | ical |
| Morgantown Public Library (WV0023) | WV | 5 | libcal |
| Autauga - Prattville Public Library (AL0192) | AL | 4 | ical |
| Fort Smith Public Library (AR0011) | AR | 4 | ical |
| Pope County Library System (AR0021) | AR | 4 | ical |
| Chandler Public Library (AZ0031) | AZ | 4 | bibliocommons |
| Glendale Public Library (AZ0033) | AZ | 4 | ical |
| Napa County Library (CA0077) | CA | 4 | communico |
| Redwood City Public Library (CA0101) | CA | 4 | civicplus |
| San Leandro Public Library (CA0117) | CA | 4 | libcal |
| Park County Public Library (CO0094) | CO | 4 | ical |
| Ferguson Library (CT0151) | CT | 4 | ical |
| Walton County Public Library System (FL0101) | FL | 4 | ical |
| Hernando County Public Library System (FL0106) | FL | 4 | ical |
| Wilderness Coast Public Libraries (FL0135) | FL | 4 | libcal |
| Charlotte County Public Library (FL0258) | FL | 4 | libcal |
| Washington County Public Library (FL8009) | FL | 4 | ical |
| Forsyth County Public Library (GA0058) | GA | 4 | communico |
| Meridian District (ID0061) | ID | 4 | ical |
| Robinson Public Library District (IL0457) | IL | 4 | ical |
| Rockford Public Library (IL0462) | IL | 4 | communico |
| Warren County Public Library District (IL0555) | IL | 4 | ical |
| Muncie-Center Township Public Library (IN0138) | IN | 4 | ical |
| New Albany-Floyd County Public Library (IN0223) | IN | 4 | libcal |
| Campbell County Public Library District (KY0018) | KY | 4 | communico |
| St. John The Baptist Parish Library (LA0021) | LA | 4 | ical |
| Ascension Parish Library (LA0037) | LA | 4 | communico |
| Calvert Library (MD0005) | MD | 4 | communico |
| Charles County Public Library (MD0009) | MD | 4 | communico |
| Portland Public Library (ME0174) | ME | 4 | ical |
| Bay County Library System (MI0021) | MI | 4 | ical |
| Public Libraries Of Saginaw (MI0299) | MI | 4 | ical |
| Daniel Boone Regional Library (MO0034) | MO | 4 | communico |
| Boonslick Regional Library (MO0039) | MO | 4 | ical |
| Christian County Library (MO0110) | MO | 4 | libcal |
| Texas County Library (MO0116) | MO | 4 | ical |
| Saint Joseph Public Library (MO0227) | MO | 4 | ical |
| Lincoln-Lawrence-Franklin Regional Library (MS0026) | MS | 4 | ical |
| Lewis And Clark Library (MT0039) | MT | 4 | libcal |
| Imagineif Kalispell (MT0043) | MT | 4 | ical |
| New Hanover County Public Library (NC0047) | NC | 4 | libcal |
| Union County Public Library (NC0061) | NC | 4 | libcal |
| Alamance County Public Libraries (NC0103) | NC | 4 | libcal |
| East Orange Public Library (NJ0114) | NJ | 4 | libcal |
| Woodbridge Public Library (NJ0194) | NJ | 4 | libcal |
| Paterson Free Public Library (NJ0262) | NJ | 4 | ical |
| Elizabeth Free Public Library (NJ0289) | NJ | 4 | libcal |
| Henderson District Public Libraries (NV0012) | NV | 4 | communico |
| Great Neck Library (NY0348) | NY | 4 | libcal |
| Smithtown Special Library District (NY0689) | NY | 4 | ical |
| Delaware County District Library (OH0065) | OH | 4 | communico |
| Elyria Public Library (OH0077) | OH | 4 | libcal |
| Mentor Public Library (OH0142) | OH | 4 | libcal |
| Willoughby-Eastlake Public Library (OH0242) | OH | 4 | libcal |
| Corvallis-Benton County Public Library (OR0119) | OR | 4 | ical |
| Snyder County Libraries, Inc. (PA0237) | PA | 4 | ical |
| Osterhout Free Library (PA0269) | PA | 4 | ical |
| BayamóN Municipal Library (Dra. Pilar Barbosa) (PR0042) | PR | 4 | ical |
| Warwick Public Library (RI0046) | RI | 4 | libcal |
| Georgetown County Library (SC0020) | SC | 4 | ical |
| Pickens County Library System (SC0034) | SC | 4 | communico |
| Putnam County Library (TN0108) | TN | 4 | ical |
| Laredo Public Library (TX0141) | TX | 4 | ical |
| Lubbock Public Library (TX0155) | TX | 4 | ical |
| Waco-Mclennan County Library (TX0317) | TX | 4 | libcal |
| Montgomery-Floyd Regional Library (VA0051) | VA | 4 | libcal |
| Portsmouth Public Library (VA0062) | VA | 4 | ical |
| Pend Oreille County Library District (WA0041) | WA | 4 | libcal |
| North Olympic Library System (WA0053) | WA | 4 | communico |
| Kenosha Public Library (WI0148) | WI | 4 | bibliocommons |
| Mcdowell Public Library (WV0071) | WV | 4 | libcal |
| Dothan Houston County Library System (AL0158) | AL | 3 | ical |
| Tuscaloosa Public Library (AL0196) | AL | 3 | ical |
| Mesa Public Library (AZ0034) | AZ | 3 | ical |
| Alameda Free Library (CA0002) | CA | 3 | mylibrarydigital |
| Burbank Public Library (CA0015) | CA | 3 | communico |
| Orange Public Library (CA0085) | CA | 3 | libcal |
| Palos Verdes Library District (CA0092) | CA | 3 | communico |
| Richmond Public Library (CA0102) | CA | 3 | libcal |
| Santa Clara City Library (CA0125) | CA | 3 | civicplus |
| Shasta Public Libraries (CA0133) | CA | 3 | ical |
| Santa Clarita Public Library (CA0210) | CA | 3 | ical |
| Baca County Library (CO0008) | CO | 3 | ical |
| Poudre River Public Library District (CO0046) | CO | 3 | ical |
| Montrose Regional Library District (CO0085) | CO | 3 | ical |
| Summit County Library (CO0115) | CO | 3 | ical |
| Clear Creek County Library District (CO0143) | CO | 3 | ical |
| Greenwich Library (CT0063) | CT | 3 | libcal |
| Hamden Public Library (CT0072) | CT | 3 | libcal |
| Mansfield Public Library (CT0087) | CT | 3 | ical |
| West Hartford Public Library (CT0171) | CT | 3 | ical |
| New River Public Library Cooperative (FL0149) | FL | 3 | ical |
| Houston County Public Library (GA0029) | GA | 3 | libcal |
| Troup-Harris Regional Library (GA0048) | GA | 3 | ical |
| Northwest Georgia Regional Library System (GA0050) | GA | 3 | ical |
| Sioux City Public Library (IA0225) | IA | 3 | libcal |
| Davenport Public Library (IA0355) | IA | 3 | libcal |
| Idaho Falls Public (ID0046) | ID | 3 | ical |
| Aurora Public Library District (IL0029) | IL | 3 | communico |
| Hayner Public Library District (IL0234) | IL | 3 | ical |
| Naperville Public Library (IL0368) | IL | 3 | ical |
| Oak Park Public Library (IL0392) | IL | 3 | ical |
| Palatine Public Library District (IL0408) | IL | 3 | ical |
| Schaumburg Township District Library (IL0479) | IL | 3 | communico |
| Newburgh Chandler Public Library (IN0022) | IN | 3 | communico |
| Mishawaka-Penn-Harris Public Library (IN0069) | IN | 3 | ical |
| Eckhart Public Library (IN0075) | IN | 3 | libcal |
| La Grange County Public Library (IN0083) | IN | 3 | ical |
| Noble County Public Library (IN0085) | IN | 3 | communico |
| Kokomo-Howard County Public Library (IN0128) | IN | 3 | communico |
| Shelby County Public Library (IN0214) | IN | 3 | communico |
| Lowell Public Library (IN0241) | IN | 3 | ical |
| Boyd County Public Library (KY0010) | KY | 3 | ical |
| Kenton County Public Library (KY0056) | KY | 3 | bibliocommons |
| Marshall County Public Library (KY0072) | KY | 3 | ical |
| Nelson County Public Library (KY0085) | KY | 3 | ical |
| Vernon Parish Library (LA0038) | LA | 3 | ical |
| Brookline Public Library (MA0046) | MA | 3 | libcal |
| Wellesley Free Library (MA0313) | MA | 3 | libcal |
| Caroline County Public Library (MD0006) | MD | 3 | ical |
| Kent County Public Library (MD0015) | MD | 3 | libcal |
| St. Mary`S County Library (MD0019) | MD | 3 | communico |
| Wicomico County Free Library (MD0023) | MD | 3 | ical |
| Grosse Pointe Public Library (MI0134) | MI | 3 | ical |
| Otsego County Library (MI0258) | MI | 3 | ical |
| Traverse Area District Library (MI0342) | MI | 3 | ical |
| Clinton-Macomb Public Library (MI0397) | MI | 3 | communico |
| Jackson County Library (MN0055) | MN | 3 | ical |
| Marshall-Lyon County Library (MN0057) | MN | 3 | ical |
| Blue Earth County Library (MN0106) | MN | 3 | ical |
| Stone County Library (MO0043) | MO | 3 | ical |
| Carter County Library (MO0143) | MO | 3 | ical |
| Barton County Library (MO0173) | MO | 3 | ical |
| Pulaski County Library (MO0199) | MO | 3 | ical |
| Lincoln County Public Libraries (MT0046) | MT | 3 | ical |
| Caldwell County Public Library (NC0022) | NC | 3 | libcal |
| Iredell County Library (NC0040) | NC | 3 | libcal |
| Hunterdon County Library (NJ0156) | NJ | 3 | libcal |
| Edison Township Free Public Library (NJ0175) | NJ | 3 | communico |
| Santa Fe Public Library (NM0033) | NM | 3 | ical |
| Greater Poughkeepsie Library District (NY0230) | NY | 3 | ical |
| Canton Free Library (NY0457) | NY | 3 | ical |
| Yonkers Public Library (NY0761) | NY | 3 | ical |
| Northern Onondaga Public Library (NY0784) | NY | 3 | libcal |
| Western Sullivan Public Library (NY9015) | NY | 3 | libcal |
| Washington-Centerville Public Library (OH0045) | OH | 3 | libcal |
| Lane Public Library (OH0100) | OH | 3 | ical |
| Troy-Miami County Public Library (OH0216) | OH | 3 | libcal |
| Upper Arlington Public Library (OH0218) | OH | 3 | communico |
| Eugene Public Library (OR0005) | OR | 3 | ical |
| Hood River County Library District (OR0144) | OR | 3 | ical |
| Eastern Monroe Public Library (PA0288) | PA | 3 | ical |
| East Providence Public Library (RI0013) | RI | 3 | ical |
| South Kingstown Public Library (RI0043) | RI | 3 | libcal |
| Chester County Library (SC0011) | SC | 3 | ical |
| Kershaw County Library (SC0023) | SC | 3 | libcal |
| Greenwood County Library System (SC8004) | SC | 3 | ical |
| Denton Public Library (TX0012) | TX | 3 | bibliocommons |
| Irving Public Library (TX0109) | TX | 3 | libcal |
| Abilene Public Library (TX0110) | TX | 3 | ical |
| Mcallen Public Library (TX0549) | TX | 3 | communico |
| Summit County Library (UT0051) | UT | 3 | libcal |
| Handley Regional Library (VA0035) | VA | 3 | ical |
| Newport News Public Library System (VA0053) | VA | 3 | libcal |
| Suffolk Public Library System (VA0080) | VA | 3 | libcal |
| Asotin County Library (WA0033) | WA | 3 | ical |
| Bellingham Public Library (WA0050) | WA | 3 | libcal |
| La Crosse Public Library (WI0159) | WI | 3 | ical |
| Superior Public Library (WI0315) | WI | 3 | ical |
| Parkersburg/Wood Co. Public Library (WV0020) | WV | 3 | ical |
| Hamlin-Lincoln County Public Library (WV0088) | WV | 3 | ical |
| Laramie County Library System (WY0004) | WY | 3 | libcal |
| North Shelby Library (AL0137) | AL | 2 | ical |
| Sedona Public Library (AZ0155) | AZ | 2 | libcal |
| Altadena Library District (CA0005) | CA | 2 | communico |
| Hayward Public Library (CA0044) | CA | 2 | ical |
| Menlo Park Public Library (CA0067) | CA | 2 | opencities |
| Thousand Oaks Library (CA0169) | CA | 2 | libcal |
| Fairfield Public Library (CT0055) | CT | 2 | ical |
| North Branford Library Department (CT0109) | CT | 2 | ical |
| West Haven Public Library (CT0172) | CT | 2 | libcal |
| Willimantic Public Library (CT0180) | CT | 2 | ical |
| Windsor Public Library (CT0182) | CT | 2 | ical |
| Flagler County Public Library (FL0029) | FL | 2 | ical |
| Lost Rivers District (ID0003) | ID | 2 | ical |
| Clearwater District (ID0075) | ID | 2 | ical |
| Algonquin Area Public Library District (IL0006) | IL | 2 | communico |
| Champaign Public Library (IL0091) | IL | 2 | communico |
| Cook Memorial Public Library District (IL0116) | IL | 2 | communico |
| Evanston Public Library (IL0172) | IL | 2 | bibliocommons |
| Indian Trails Public Library District (IL0255) | IL | 2 | communico |
| Joliet Public Library (IL0261) | IL | 2 | communico |
| Mount Prospect Public Library (IL0360) | IL | 2 | communico |
| North Suburban Public Library District (IL0387) | IL | 2 | ical |
| Three Rivers Public Library District (IL0524) | IL | 2 | communico |
| Waukegan Public Library (IL0564) | IL | 2 | communico |
| Nappanee Public Library (IN0052) | IN | 2 | ical |
| Kendallville Public Library (IN0086) | IN | 2 | communico |
| Delphi Public Library (IN0100) | IN | 2 | ical |
| Tipton County Public Library (IN0132) | IN | 2 | ical |
| Anderson Public Library (IN0158) | IN | 2 | libcal |
| Monroe County Public Library (IN0180) | IN | 2 | communico |
| Vigo County Public Library (IN0189) | IN | 2 | ical |
| Carmel Clay Public Library (IN0195) | IN | 2 | communico |
| Hamilton East Public Library (IN0197) | IN | 2 | communico |
| Bartholomew County Public Library (IN0215) | IN | 2 | communico |
| Lawrenceburg Public Library District (IN0220) | IN | 2 | ical |
| Olathe Public Library (KS0130) | KS | 2 | ical |
| Madison County Public Library (KY0069) | KY | 2 | ical |
| Muhlenberg County Public Libraries (KY0119) | KY | 2 | communico |
| Dedham Public Library (MA0073) | MA | 2 | communico |
| Westwood Public Library (MA0331) | MA | 2 | libcal |
| Farmington Community Library (MI0105) | MI | 2 | ical |
| Herrick District Library (MI0150) | MI | 2 | bibliocommons |
| Orion Township Public Library (MI0255) | MI | 2 | ical |
| Willard Public Library (MI0371) | MI | 2 | communico |
| Poplar Bluff Municipal Library District (MO0125) | MO | 2 | communico |
| Rolling Hills Consolidated (MO0206) | MO | 2 | communico |
| Pender County Public Library (NC0049) | NC | 2 | libcal |
| Hickory Public Library (NC0079) | NC | 2 | ical |
| Orange County Public Library (NC0108) | NC | 2 | ical |
| Maplewood Memorial Library (NJ0119) | NJ | 2 | communico |
| Hoboken Public Library (NJ0148) | NJ | 2 | communico |
| North Bergen Free Public Library (NJ0151) | NJ | 2 | communico |
| Piscataway Public Library (NJ0186) | NJ | 2 | ical |
| Haverstraw Kings Daughters Public Library (NY0583) | NY | 2 | ical |
| Huntington Public Library (NY0669) | NY | 2 | communico |
| Patchogue-Medford Library (NY0678) | NY | 2 | communico |
| New Rochelle Public Library (NY0745) | NY | 2 | ical |
| Marysville Public Library (OH0134) | OH | 2 | communico |
| Pickerington Public Library (OH0184) | OH | 2 | communico |
| Cooper-Siegel Community Library (PA0040) | PA | 2 | ical |
| Bethlehem Area Public Library (PA0291) | PA | 2 | ical |
| Easton Area Public Library (PA0292) | PA | 2 | libcal |
| Butt-Holdsworth Memorial Library (TX0125) | TX | 2 | ical |
| New Braunfels Public Library (TX0199) | TX | 2 | libcal |
| Frisco Public Library (TX0538) | TX | 2 | bibliocommons |
| Hedberg Public Library (WI0142) | WI | 2 | ical |
| Campbell County Public Library System (WY0002) | WY | 2 | ical |
| Teton County Library (WY0020) | WY | 2 | ical |
| Opelika Public Library (AL0053) | AL | 1 | ical |
| Homewood Public Library (AL0097) | AL | 1 | communico |
| Hoover Public Library (AL0098) | AL | 1 | communico |
| Irondale Public Library (AL0100) | AL | 1 | libcal |
| Trussville Public Library (AL0105) | AL | 1 | communico |
| Bentonville Public Library (AR0038) | AR | 1 | communico |
| Fayetteville Public Library (AR0066) | AR | 1 | communico |
| Tempe Public Library (AZ0038) | AZ | 1 | communico |
| Tolleson Public Library (AZ0039) | AZ | 1 | communico |
| Desert Foothills Library (AZ0086) | AZ | 1 | ical |
| Mountain View Public Library (CA0076) | CA | 1 | libcal |
| Sunnyvale Public Library (CA0143) | CA | 1 | libcal |
| Coronado Public Library (CA0160) | CA | 1 | ical |
| Benicia Public Library (CA0163) | CA | 1 | ical |
| Belvedere-Tiburon Library (CA0197) | CA | 1 | communico |
| Pleasanton Public Library (CA0206) | CA | 1 | bibliocommons |
| Durango Public Library (CO0038) | CO | 1 | communico |
| Lyons Regional Library District (CO0077) | CO | 1 | ical |
| Lone Cone Library District (Norwood) (CO0087) | CO | 1 | ical |
| Pitkin County Library (CO0098) | CO | 1 | ical |
| James Blackstone Memorial Library (CT0014) | CT | 1 | ical |
| Brookfield Library (CT0019) | CT | 1 | ical |
| Essex Library Association (CT0053) | CT | 1 | ical |
| Welles-Turner Memorial Library (CT0059) | CT | 1 | ical |
| Mystic & Noank Library (CT0069) | CT | 1 | ical |
| E.C. Scranton Memorial Library (CT0085) | CT | 1 | ical |
| Meriden Public Library (CT0089) | CT | 1 | ical |
| North Haven Memorial Library (CT0111) | CT | 1 | ical |
| Case Memorial Library (CT0119) | CT | 1 | ical |
| Ridgefield Library (CT0134) | CT | 1 | ical |
| Simsbury Public Library (CT0144) | CT | 1 | ical |
| South Windsor Public Library (CT0148) | CT | 1 | libcal |
| Wallingford Public Library (CT0164) | CT | 1 | ical |
| Beardsley & Memorial Library (CT0178) | CT | 1 | ical |
| Doreen Gauthier Lighthouse Point Library (FL0013) | FL | 1 | ical |
| North Miami Beach Public Library (FL0024) | FL | 1 | communico |
| Sanibel Public Library (FL0043) | FL | 1 | ical |
| New Port Richey Public Library (FL0064) | FL | 1 | ical |
| Ames Public Library (IA0041) | IA | 1 | ical |
| Coralville Public Library (IA0053) | IA | 1 | communico |
| Carnegie-Stout Public Library (IA0147) | IA | 1 | ical |
| Ankeny Kirkendall Public Library (IA0150) | IA | 1 | ical |
| Altoona Public Library (IA0154) | IA | 1 | ical |
| Grimes Public Library (IA0155) | IA | 1 | ical |
| Marshalltown Public Library (IA0160) | IA | 1 | ical |
| Sioux Center Public Library (IA0184) | IA | 1 | ical |
| Indianola Public Library (IA0378) | IA | 1 | ical |
| Lied Public Library-Clarinda (IA0432) | IA | 1 | ical |
| Council Bluffs Public Library (IA0453) | IA | 1 | ical |
| Hiawatha Public Library (IA0458) | IA | 1 | communico |
| Johnston Public Library (IA0547) | IA | 1 | ical |
| Barrington Public Library District (IL0032) | IL | 1 | ical |
| Batavia Public Library District (IL0035) | IL | 1 | ical |
| Bloomington Public Library (IL0050) | IL | 1 | ical |
| Linda Sokol Francis Brookfield Library (IL0061) | IL | 1 | communico |
| Carol Stream Public Library (IL0078) | IL | 1 | ical |
| Cary Area Public Library District (IL0083) | IL | 1 | ical |
| Chicago Ridge Public Library (IL0100) | IL | 1 | communico |
| Coal City Public Library District (IL0111) | IL | 1 | ical |
| Crystal Lake Public Library (IL0125) | IL | 1 | ical |
| Deerfield Public Library (IL0134) | IL | 1 | communico |
| Des Plaines Public Library (IL0138) | IL | 1 | communico |
| Downers Grove Public Library (IL0145) | IL | 1 | communico |
| East Moline Public Library (IL0153) | IL | 1 | ical |
| Ela Area Public Library District (IL0158) | IL | 1 | communico |
| Elk Grove Village Public Library (IL0162) | IL | 1 | communico |
| Elmwood Park Public Library (IL0168) | IL | 1 | ical |
| Frankfort Public Library District (IL0192) | IL | 1 | ical |
| Geneva Public Library District (IL0202) | IL | 1 | communico |
| Glen Ellyn Public Library (IL0209) | IL | 1 | ical |
| Glenview Public Library (IL0212) | IL | 1 | bibliocommons |
| Grayslake Area Public Library District (IL0219) | IL | 1 | ical |
| Highland Park Public Library (IL0242) | IL | 1 | communico |
| Hinsdale Public Library (IL0246) | IL | 1 | communico |
| Homer Township Public Library District (IL0249) | IL | 1 | ical |
| Itasca Community Library (IL0256) | IL | 1 | ical |
| Lagrange Public Library (IL0273) | IL | 1 | ical |
| Lake Bluff Public Library (IL0276) | IL | 1 | libcal |
| Lake Villa Public Library District (IL0278) | IL | 1 | communico |
| Lansing Public Library (IL0282) | IL | 1 | ical |
| Lemont Public Library District (IL0286) | IL | 1 | communico |
| Mchenry Public Library District (IL0301) | IL | 1 | ical |
| Matteson Area Public Library District (IL0329) | IL | 1 | communico |
| Morton Grove Public Library (IL0353) | IL | 1 | ical |
| Niles-Maine District Library (IL0379) | IL | 1 | communico |
| Northbrook Public Library (IL0388) | IL | 1 | communico |
| Orland Park Public Library (IL0405) | IL | 1 | ical |
| Reddick Public Library District (IL0407) | IL | 1 | communico |
| Palos Heights Public Library (IL0410) | IL | 1 | ical |
| Park Ridge Public Library (IL0415) | IL | 1 | communico |
| Prairie Trails Public Library District (IL0439) | IL | 1 | ical |
| Quincy Public Library (IL0445) | IL | 1 | ical |
| Rolling Meadows Library (IL0463) | IL | 1 | communico |
| Round Lake Area Public Library District (IL0467) | IL | 1 | communico |
| Shorewood-Troy Public Library District (IL0491) | IL | 1 | communico |
| Tinley Park Public Library (IL0525) | IL | 1 | communico |
| Urbana Free Library (IL0538) | IL | 1 | communico |
| Vernon Area Public Library District (IL0545) | IL | 1 | ical |
| Villa Park Public Library (IL0549) | IL | 1 | ical |
| Warren-Newport Public Library District (IL0556) | IL | 1 | communico |
| Warrenville Public Library District (IL0557) | IL | 1 | communico |
| Westchester Public Library (IL0573) | IL | 1 | libcal |
| Thomas Ford Memorial Library (IL0575) | IL | 1 | ical |
| Wheaton Public Library (IL0578) | IL | 1 | ical |
| Wilmette Public Library District (IL0584) | IL | 1 | communico |
| Wood Dale Public Library District (IL0592) | IL | 1 | communico |
| Woodstock Public Library (IL0595) | IL | 1 | ical |
| Zion-Benton Public Library District (IL0602) | IL | 1 | communico |
| Huntley Area Public Library District (IL0636) | IL | 1 | communico |
| Carnegie Public Library Of Steuben County (IN0088) | IN | 1 | communico |
| New Castle-Henry County Public Library (IN0150) | IN | 1 | ical |
| Pendleton Community Public Library (IN0159) | IN | 1 | communico |
| Thorntown Public Library (IN0190) | IN | 1 | ical |
| Mooresville Public Library (IN0213) | IN | 1 | ical |
| Jennings County Public Library (IN0228) | IN | 1 | ical |
| Manhattan Public Library (KS0091) | KS | 1 | ical |
| Leavenworth Public Library (KS0129) | KS | 1 | ical |
| Lawrence Public Library (KS0131) | KS | 1 | bibliocommons |
| Topeka And Shawnee County Public Library (KS0132) | KS | 1 | communico |
| Mason County Public Library (KY0074) | KY | 1 | ical |
| Scott County Public Library (KY0100) | KY | 1 | ical |
| Memorial Hall Library (MA0009) | MA | 1 | communico |
| Ashland Public Library (MA0014) | MA | 1 | ical |
| Athol Public Library (MA0015) | MA | 1 | ical |
| Eastham Public Library (MA0086) | MA | 1 | libcal |
| Marlborough Public Library (MA0169) | MA | 1 | ical |
| Middleborough Public Library (MA0181) | MA | 1 | ical |
| Milton Public Library (MA0188) | MA | 1 | libcal |
| Nantucket Atheneum (MA0195) | MA | 1 | ical |
| Reading Public Library (MA0243) | MA | 1 | communico |
| Wilmington Memorial Library (MA0338) | MA | 1 | communico |
| Woburn Public Library (MA0343) | MA | 1 | communico |
| Rice Public Library (ME0117) | ME | 1 | ical |
| York Public Library (ME0238) | ME | 1 | ical |
| Canton Public Library (MI0052) | MI | 1 | bibliocommons |
| Charlevoix Public Library (MI0060) | MI | 1 | ical |
| East Lansing Public Library (MI0093) | MI | 1 | bibliocommons |
| Dewitt District Library (MI0106) | MI | 1 | ical |
| Grace A. Dow Memorial Library (MI0129) | MI | 1 | ical |
| Plymouth District Library (MI0273) | MI | 1 | ical |
| Portage District Library (MI0277) | MI | 1 | communico |
| Troy Public Library (MI0343) | MI | 1 | ical |
| Allendale Township Library (MI0411) | MI | 1 | ical |
| Northfield Public Library (MN0084) | MN | 1 | libcal |
| Billings Public Library (MT0006) | MT | 1 | ical |
| Bozeman Public Library (MT0008) | MT | 1 | communico |
| Bitterroot Public Library (MT0034) | MT | 1 | ical |
| North Valley Public Library (MT0066) | MT | 1 | ical |
| Chapel Hill Public Library (NC0071) | NC | 1 | ical |
| George H. And Laura E. Brown Public Library (NC0099) | NC | 1 | libcal |
| Morton Mandan Public Library (ND0064) | ND | 1 | ical |
| Peterborough Town Library (NH0075) | NH | 1 | communico |
| Baker Free Library (NH0142) | NH | 1 | ical |
| Mahwah Free Public Library (NJ0038) | NJ | 1 | ical |
| Haddonfield Public Library (NJ0092) | NJ | 1 | ical |
| Ocean City Free Public Library (NJ0102) | NJ | 1 | bibliocommons |
| Ruth L. Rockwood Memorial Library (NJ0118) | NJ | 1 | ical |
| Princeton Public Library (NJ0169) | NJ | 1 | communico |
| South Plainfield Free Public Library (NJ0191) | NJ | 1 | ical |
| Chathams Joint Free Public Library (NJ0224) | NJ | 1 | ical |
| Dover Free Public Library (NJ0227) | NJ | 1 | communico |
| Montville Township Public Library (NJ0237) | NJ | 1 | ical |
| Roxbury Public Library (NJ0249) | NJ | 1 | communico |
| Clark Public Library (NJ0287) | NJ | 1 | ical |
| Plainfield Free Public Library (NJ0297) | NJ | 1 | ical |
| Farmington Public Library (NM0014) | NM | 1 | libcal |
| Magdalena Public Library (NM0087) | NM | 1 | libcal |
| Boulder City Library District (NV0003) | NV | 1 | communico |
| Carson City Library (NV0019) | NV | 1 | libcal |
| Bethpage Public Library (NY0337) | NY | 1 | communico |
| Farmingdale Public Library (NY0342) | NY | 1 | ical |
| Freeport Memorial Library (NY0345) | NY | 1 | libcal |
| Manhasset Public Library (NY0362) | NY | 1 | ical |
| Plainview-Old Bethpage Public Library (NY0373) | NY | 1 | ical |
| Port Washington Public Library (NY0374) | NY | 1 | ical |
| Syosset Public Library (NY0380) | NY | 1 | ical |
| Baldwinsville Public Library (NY0477) | NY | 1 | ical |
| Liverpool Public Library (NY0488) | NY | 1 | libcal |
| Irondequoit Public Library (NY0518) | NY | 1 | libcal |
| Wood Library Association (NY0529) | NY | 1 | ical |
| New City Free Library (NY0585) | NY | 1 | ical |
| Valley Cottage Free Library (NY0597) | NY | 1 | ical |
| Clifton Park-Halfmoon Public Library (NY0616) | NY | 1 | communico |
| Saratoga Springs Public Library (NY0620) | NY | 1 | libcal |
| South Country Library (NY0645) | NY | 1 | ical |
| Bayport-Blue Point Public Library (NY0646) | NY | 1 | communico |
| Brentwood Public Library (NY0648) | NY | 1 | ical |
| Central Islip Public Library (NY0655) | NY | 1 | ical |
| Cold Spring Harbor Village Improvement Society Library (NY0656) | NY | 1 | ical |
| Copiague Memorial Public Library (NY0658) | NY | 1 | ical |
| Cutchogue New Suffolk Free Library (NY0659) | NY | 1 | ical |
| Hampton Bays Public Library (NY0667) | NY | 1 | ical |
| Sachem Public Library (NY0668) | NY | 1 | ical |
| South Huntington Public Library (NY0670) | NY | 1 | ical |
| Lindenhurst Memorial Library (NY0672) | NY | 1 | ical |
| Mattituck-Laurel Library (NY0673) | NY | 1 | ical |
| Quogue Library (NY0681) | NY | 1 | ical |
| Riverhead Free Library (NY0682) | NY | 1 | ical |
| Rogers Memorial Library (NY0690) | NY | 1 | ical |
| Southold Free Library (NY0691) | NY | 1 | ical |
| West Babylon Public Library (NY0692) | NY | 1 | ical |
| West Islip Public Library (NY0693) | NY | 1 | communico |
| Bethlehem Public Library (NY0702) | NY | 1 | ical |
| Guilderland Public Library (NY0703) | NY | 1 | ical |
| Eastchester Public Library (NY0734) | NY | 1 | libcal |
| Greenburgh Public Library (NY0735) | NY | 1 | libcal |
| Larchmont Public Library (NY0740) | NY | 1 | ical |
| Ossining Public Library (NY0747) | NY | 1 | ical |
| Town Of Pelham Public Library (NY0749) | NY | 1 | ical |
| Warner Library (NY0758) | NY | 1 | ical |
| White Plains Public Library (NY0760) | NY | 1 | communico |
| Hauppauge Public Library (NY9016) | NY | 1 | communico |
| Bexley Public Library (OH0024) | OH | 1 | communico |
| Cuyahoga Falls Library (OH0062) | OH | 1 | communico |
| Grandview Heights Public Library (OH0095) | OH | 1 | communico |
| Granville Public Library (OH0096) | OH | 1 | communico |
| Plain City Public Library (OH0186) | OH | 1 | communico |
| Reed Memorial Library (OH0190) | OH | 1 | communico |
| Westerville Public Library (OH0237) | OH | 1 | bibliocommons |
| Porter Public Library (OH0238) | OH | 1 | communico |
| Chetco Community Public Library (OR0107) | OR | 1 | ical |
| Coos Bay Public Library (OR0114) | OR | 1 | ical |
| Sewickley Public Library (PA0053) | PA | 1 | ical |
| Cranberry Public Library (PA0418) | PA | 1 | ical |
| Rapid City Public Library (SD0112) | SD | 1 | communico |
| Oak Ridge Public Library (TN0066) | TN | 1 | libcal |
| Euless Public Library (TX0037) | TX | 1 | ical |
| Keller Public Library (TX0120) | TX | 1 | whofi |
| Helen Hall Library (TX0142) | TX | 1 | ical |
| Round Rock Public Library System (TX0259) | TX | 1 | libcal |
| Victoria Public Library (TX0315) | TX | 1 | ical |
| Cozby Library And Community Commons (TX0351) | TX | 1 | communico |
| Flower Mound Public Library (TX0395) | TX | 1 | communico |
| Brigham City Library (UT0006) | UT | 1 | communico |
| Murray Public Library (UT0047) | UT | 1 | communico |
| Provo City Library (UT0062) | UT | 1 | communico |
| Mary Riley Styles Public Library (VA0047) | VA | 1 | ical |
| Powhatan County Public Library (VA0063) | VA | 1 | ical |
| Salem Public Library (VA0074) | VA | 1 | libcal |
| Waynesboro Public Library (VA0085) | VA | 1 | ical |
| San Juan Island Library District (WA0031) | WA | 1 | ical |
| Central Skagit Library District (WA0076) | WA | 1 | ical |
| Burlington Public Library (WI0045) | WI | 1 | ical |
| Columbus Public Library (WI0066) | WI | 1 | ical |
| L.E. Phillips Memorial Public Library (WI0090) | WI | 1 | ical |
| Ruth Culver Community Library (WI0263) | WI | 1 | ical |
| Reedsburg Public Library (WI0272) | WI | 1 | ical |
| Waukesha Public Library (WI0337) | WI | 1 | ical |
| Mukwonago Community Library (WI0396) | WI | 1 | ical |

## Detected systems awaiting configuration (71)

| System | State | Outlets | Vendor |
|---|---|---|---|
| San Diego Public Library (CA0113) | CA | 36 | bibliocommons |
| Mid-Continent Public Library (MO0004) | MO | 34 | bibliocommons |
| Orange County Public Libraries (CA0084) | CA | 32 | libcal |
| San Antonio Public Library (TX0263) | TX | 30 | bibliocommons |
| Seattle Public Library (WA0064) | WA | 27 | ical |
| Austin Public Library (TX0111) | TX | 22 | bibliocommons |
| Sandhill Regional Library System (NC0015) | NC | 15 | libcal |
| East Baton Rouge Parish Library (LA0055) | LA | 14 | libcal |
| Saint Clair County Library System (MI0321) | MI | 11 | libcal |
| Mohave County Library District (AZ0042) | AZ | 10 | ical |
| Kansas City Public Library (MO0014) | MO | 10 | bibliocommons |
| Chesterfield County Public Library (VA0018) | VA | 10 | libcal |
| Buffalo And Erie County Public Library (NY0005) | NY | 9 | libcal |
| Anderson County Library (SC0004) | SC | 9 | libcal |
| Spartanburg County Public Library System (SC0036) | SC | 9 | ical |
| Riverside Public Library (CA0103) | CA | 8 | libcal |
| Marion County Public Library System (FL0001) | FL | 8 | libcal |
| Iosco-Arenac District Library (MI0171) | MI | 8 | bibliocommons |
| Greensboro Public Library (NC0035) | NC | 8 | libcal |
| Southern Oklahoma Library System (OK0007) | OK | 8 | ical |
| Jefferson-Madison Regional Library (VA0040) | VA | 8 | libcal |
| Door County Library (WI0312) | WI | 8 | bibliocommons |
| Heartland Library Cooperative (FL0150) | FL | 7 | ical |
| Northeast Georgia Regional Library System (GA0026) | GA | 7 | ical |
| Community Library Network (ID0120) | ID | 7 | libcal |
| Community District Library (MI0310) | MI | 7 | libcal |
| Robeson County Public Library (NC0053) | NC | 7 | ical |
| Stevens County Rural Library District (WA0072) | WA | 7 | ical |
| Marinette County Consolidated Public Library Service (WI0394) | WI | 7 | bibliocommons |
| Satilla Regional Library System (GA0014) | GA | 6 | ical |

…and 41 more.

## Human action queues (highest-leverage first)

### Adapter backlog (engineering — one adapter unlocks every system on the vendor)
- **assabet**: 7 systems / 28 libraries. E.g. White County Regional Library System (AR, 9); Thomas Crane Public Library (MA, 4); Montague Public Libraries (MA, 3); Peabody Institute Library (MA, 3); Somerville Public Library (MA, 3)
- **localist**: 1 systems / 22 libraries. E.g. Enoch Pratt Free Library (MD, 22)
- **evanced**: 1 systems / 8 libraries. E.g. Lincoln City Libraries (NE, 8)
- **communico**: 1 systems / 3 libraries. E.g. Aurora Public Library District (IN, 3)

### Calendar ids needed (5-minute manual task each)
- East Baton Rouge Parish Library (LA0055, LA, 14 outlets)
- Saint Clair County Library System (MI0321, MI, 11 outlets)
- Santa Barbara Public Library (CA0124, CA, 4 outlets)
- Birchard Public Library Of Sandusky County (OH0086, OH, 4 outlets)
- Sussex County Dept. Of Libraries (DE0030, DE, 3 outlets)
- San Diego County Public Law Library (CA0248, CA, 2 outlets)
- Gunnison County Library District (CO0052, CO, 2 outlets)
- Wilmington Institute Library (DE0022, DE, 2 outlets)

### Identity collisions to adjudicate
- Lonoke County Library System (AR0041, AR): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Mohave County Library District (AZ0042, AZ): demoted, collision: www.trumba.com claimed by AZ0042, SC0036, WA0064
- Whiteriver Public Library (AZ0048, AZ): demoted, collision: www.navajocountylibraries.org?post_type=tribe_events&ical=1&eventDisplay=list claimed by AZ0048, AZ0107
- Navajo County Library District (AZ0107, AZ): demoted, collision: www.navajocountylibraries.org?post_type=tribe_events&ical=1&eventDisplay=list claimed by AZ0048, AZ0107
- Oceanside Public Library (CA0082, CA): demoted, collision: oceansidelibrary.libcal.com claimed by CA0082, NY0370 — needs manual confirmation
- Orange County Public Libraries (CA0084, CA): demoted, collision: ocpl.libcal.com claimed by CA0084, VA0056 — needs manual confirmation
- Riverside Public Library (CA0103, CA): demoted, collision: riversidelibrary.libcal.com claimed by CA0103, CA0244 — needs manual confirmation
- Willows Public Library (CA0155, CA): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Rio Grande County Library District (CO0146, CO): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Heartland Library Cooperative (FL0150, FL): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Satilla Regional Library System (GA0014, GA): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Northeast Georgia Regional Library System (GA0026, GA): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Community Library Network (ID0120, ID): demoted, collision: communitylibrary.libcal.com claimed by ID0120, MI0310 — needs manual confirmation
- Harrison County Public Library (IN0224, IN): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Starkville-Oktibbeha County Public Library System (MS0038, MS): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Robeson County Public Library (NC0053, NC): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Buffalo And Erie County Public Library (NY0005, NY): demoted, collision: buffalolib.libcal.com claimed by NY0005, NY0027 — needs manual confirmation
- Oceanside Library (NY0370, NY): demoted, collision: oceansidelibrary.libcal.com claimed by CA0082, NY0370 — needs manual confirmation
- Belmont County District Library (OH0133, OH): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Southern Oklahoma Library System (OK0007, OK): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Anderson County Library (SC0004, SC): demoted, collision: andersonlibrary.libcal.com?m=month&cid=18832 claimed by IN0158, SC0004
- Spartanburg County Public Library System (SC0036, SC): demoted, collision: www.trumba.com claimed by AZ0042, SC0036, WA0064
- Giles County Public Library (TN0001, TN): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Tom Green County Library System (TX0262, TX): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Chesterfield County Public Library (VA0018, VA): demoted, collision: chesterfield.libcal.com claimed by SC0012, VA0018 — needs manual confirmation
- Seattle Public Library (WA0064, WA): demoted, collision: www.trumba.com claimed by AZ0042, SC0036, WA0064
- Stevens County Rural Library District (WA0072, WA): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Putnam County Library (WV0007, WV): demoted, collision: calendar.google.com claimed by AR0041, CA0155, CO0146, FL0150, GA0014, GA0026, IN0224, MS0038, NC0053, OH0133, OK0007, TN0001, TX0262, WA0072, WV0007
- Marion County Public Library (WV0075, WV): demoted, collision: mcpls.libcal.com claimed by FL0001, WV0075 — needs manual confirmation

## Largest uncovered systems (expansion targets)

| System | State | Outlets | Branch |
|---|---|---|---|
| Queens Borough Public Library (NY0562) | NY | 62 | no-platform-found |
| Pioneerland Library System (MN0051) | MN | 32 | no-platform-found |
| Kern County Library (CA0051) | CA | 23 | no-platform-found |
| Pal Public Library Cooperative (FL0259) | FL | 23 | no-platform-found |
| Wake County Public Libraries (NC0063) | NC | 23 | no-platform-found |
| Enoch Pratt Free Library (MD0003) | MD | 22 | adapter-needed:localist |
| Detroit Public Library (MI0083) | MI | 22 | no-platform-found |
| Shreve Memorial Library (LA0054) | LA | 21 | no-platform-found |
| Saint Louis County Library (MO0036) | MO | 20 | no-platform-found |
| Central Mississippi Regional Library (MS0006) | MS | 20 | no-platform-found |
| Toledo-Lucas County Public Library (OH0215) | OH | 20 | no-platform-found |
| Genesee District Library (MI0123) | MI | 19 | no-platform-found |
| Birmingham Public Library (AL0108) | AL | 18 | site-unreachable |
| Maricopa County Library District Office (AZ0028) | AZ | 18 | no-platform-found |
| Polk County Library Cooperative (FL8001) | FL | 18 | no-platform-found |
| Brevard County Library System (FL0011) | FL | 17 | no-platform-found |
| Middle Georgia Regional Library System (GA0004) | GA | 17 | no-platform-found |
| Louisville Free Public Library (KY0053) | KY | 17 | site-unreachable |
| Stockton-San Joaquin County Public Library (CA0142) | CA | 16 | no-platform-found |
| City Of St. Louis Municipal Library District (MO0030) | MO | 16 | no-platform-found |
