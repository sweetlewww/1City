import { normalizeAddress } from "./address";

// Lookups against the City's own public data services, no browser needed.
// These are the same services toronto.ca's pages call, and none of them sit
// behind a CAPTCHA. Used by the zoning lookup and, in the hosted demo, by the
// garbage-day lookup.

const GEOCODER = "https://map.toronto.ca/cotgeocoder/rest/geocoder";
const COLLECTION_CALENDAR = "https://www.toronto.ca/ext/swms/collection_calendar.csv";
export const SCHEDULE_URL = "https://www.toronto.ca/services-payments/recycling-organics-garbage/houses/collection-schedule/";

export async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "1city-prototype" } });
  if (!res.ok) throw new Error(`City service answered ${res.status}`);
  return res.json();
}

type Located =
  | { found: true; address: string; lon: number; lat: number; wasteCalendar?: string }
  | { found: false; suggestions: string[] };

/** Find an address the way the City's address boxes do, and only accept an exact match. */
export async function locateAddress(address: string): Promise<Located> {
  const suggest = await getJson(
    `${GEOCODER}/suggest?f=json&matchAddress=1&matchPlaceName=1&matchPostalCode=1&addressOnly=0&retRowLimit=8&filter=5&searchString=${encodeURIComponent(address)}`,
  );
  const rows: { KEYSTRING: string; ADDRESS: string }[] = suggest?.result?.rows ?? [];
  const match = rows.find((r) => normalizeAddress(r.ADDRESS) === normalizeAddress(address));
  if (!match) return { found: false, suggestions: rows.map((r) => r.ADDRESS).slice(0, 5) };

  const cand = await getJson(
    `${GEOCODER}/findAddressCandidates?f=json&unit=%25&areaTypeCode1=RESW&keyString=${encodeURIComponent(match.KEYSTRING)}`,
  );
  const loc = cand?.result?.rows?.[0];
  if (!loc) return { found: false, suggestions: [] };
  return {
    found: true,
    address: match.ADDRESS,
    lon: loc.LONGITUDE,
    lat: loc.LATITUDE,
    // e.g. "Wednesday1": the name of the address's collection calendar
    wasteCalendar: loc.AREACURSOR1?.array?.[0]?.AREA_NAME,
  };
}

let calendarCache: { at: number; rows: string[][] } | null = null;

async function collectionCalendar() {
  if (calendarCache && Date.now() - calendarCache.at < 6 * 3600_000) return calendarCache.rows;
  const res = await fetch(COLLECTION_CALENDAR, { headers: { "User-Agent": "1city-prototype" } });
  if (!res.ok) throw new Error(`City collection calendar answered ${res.status}`);
  const rows = (await res.text())
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(",").map((c) => c.trim()));
  calendarCache = { at: Date.now(), rows };
  return rows;
}

/** Next pickups for an address, from the City's published collection calendar. */
export async function garbageScheduleFromData(address: string) {
  const loc = await locateAddress(address);
  if (!loc.found) return { error: "That address was not found exactly.", city_suggestions: loc.suggestions, source_url: SCHEDULE_URL };
  if (!loc.wasteCalendar || /no collection/i.test(loc.wasteCalendar)) {
    return { matched_address: loc.address, schedule_text: "No City curbside collection for this address.", source_url: SCHEDULE_URL };
  }

  const [header, ...rows] = await collectionCalendar();
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const [iCal, iDate] = [col("Calendar"), col("WeekStarting")];
  const items = ["GreenBin", "Garbage", "Recycling", "YardWaste", "ChristmasTree"].map((name) => ({ name, i: col(name) }));
  const labels: Record<string, string> = { GreenBin: "Green Bin", Garbage: "Garbage", Recycling: "Recycling", YardWaste: "Yard Waste", ChristmasTree: "Christmas Tree" };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }); // YYYY-MM-DD
  const upcoming = rows
    .filter((r) => r[iCal] === loc.wasteCalendar && r[iDate] >= today)
    .sort((a, b) => a[iDate].localeCompare(b[iDate]))
    .slice(0, 3)
    .map((r) => {
      const date = new Date(`${r[iDate]}T12:00:00`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const out = items.filter(({ i }) => i >= 0 && r[i] && r[i] !== "0").map(({ name }) => labels[name]);
      return `${date}: ${out.join(", ")}`;
    });

  return {
    matched_address: loc.address,
    collection_calendar: loc.wasteCalendar,
    schedule_text: upcoming.length ? `Next pickups:\n${upcoming.join("\n")}` : "No upcoming dates found in the City's calendar.",
    set_out: "Place bins at the curb before 7 a.m. on collection day and no earlier than 8 p.m. the night before.",
    source_url: SCHEDULE_URL,
  };
}
