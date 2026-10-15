/**
 * Import the Thailand national GTFS feed published by the Office of Transport and
 * Traffic Policy and Planning (OTP / สนข.) via the Mobility Database (mdb-1831),
 * and convert it into small JSON files under web/data/gtfs/ that the planner
 * loads on the server. Runs at build time, never per request.
 *
 *   npm run import:gtfs            # use cached zip if present
 *   npm run import:gtfs -- --refresh
 */
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

const FEED_URL = "https://files.mobilitydatabase.org/mdb-1831/latest.zip";
const FEED_PAGE = "https://mobilitydatabase.org/feeds/gtfs/mdb-1831";
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".gtfs-cache");
const ZIP_PATH = path.join(CACHE_DIR, "feed.zip");
const OUT_DIR = path.join(ROOT, "data", "gtfs");

/** Agencies whose zone fare tables are huge (city buses); summarised per route instead. */
const SUMMARY_FARE_AGENCIES = new Set(["BMTA", "TSB"]);

type Row = Record<string, string>;

export type GtfsMode = "bts" | "mrt" | "arl" | "red" | "train" | "bus" | "coach" | "van" | "boat";

async function ensureZip(refresh: boolean): Promise<void> {
  if (!refresh && fs.existsSync(ZIP_PATH)) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Downloading ${FEED_URL} ...`);
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  fs.writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));
}

function readCsv(zip: AdmZip, name: string): Row[] {
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parse(entry.getData(), { columns: true, bom: true, skip_empty_lines: true, relax_quotes: true }) as Row[];
}

/** GTFS names in this feed are "ไทย;English". */
function splitName(raw: string): { th: string; en: string } {
  const [th, ...rest] = raw.split(";");
  const en = rest.join(";").trim();
  return { th: th.trim(), en: en || th.trim() };
}

function toSec(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function classify(route: Row): GtfsMode {
  const type = route.route_type;
  const agency = route.agency_id;
  const desc = route.route_desc ?? "";
  if (type === "4") return "boat";
  if (type === "0" || type === "1") {
    if (agency === "BTSC") return "bts";
    if (agency === "SRTET") return "red";
    return "mrt";
  }
  if (type === "2") {
    if (agency === "SRTET") return route.route_short_name === "ARL" ? "arl" : "red";
    return "train";
  }
  if (desc.startsWith("รถตู้")) return "van";
  if (desc.startsWith("รถโดยสารต่างจังหวัด")) return "coach";
  return "bus";
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  await ensureZip(refresh);
  const zip = new AdmZip(ZIP_PATH);
  console.log("Parsing feed ...");

  const feedInfo = readCsv(zip, "feed_info.txt")[0] ?? {};
  const agencies = readCsv(zip, "agency.txt");
  const routesRaw = readCsv(zip, "routes.txt");
  const tripsRaw = readCsv(zip, "trips.txt");
  const stopTimes = readCsv(zip, "stop_times.txt");
  const stopsRaw = readCsv(zip, "stops.txt");
  const freqRaw = readCsv(zip, "frequencies.txt");
  const calendar = readCsv(zip, "calendar.txt");
  const calendarDates = readCsv(zip, "calendar_dates.txt");
  const fareAttr = readCsv(zip, "fare_attributes.txt");
  const fareRules = readCsv(zip, "fare_rules.txt");

  // --- routes ---
  const routes = routesRaw.map((r) => ({
    id: r.route_id,
    agency: r.agency_id,
    short: r.route_short_name.trim(),
    name: splitName(r.route_long_name),
    type: Number(r.route_type),
    color: r.route_color ? `#${r.route_color}` : null,
    mode: classify(r),
  }));
  const routeById = new Map(routes.map((r) => [r.id, r]));

  // --- stop_times grouped per trip ---
  const stByTrip = new Map<string, Row[]>();
  for (const st of stopTimes) {
    let list = stByTrip.get(st.trip_id);
    if (!list) stByTrip.set(st.trip_id, (list = []));
    list.push(st);
  }
  const freqByTrip = new Map<string, number[][]>();
  for (const f of freqRaw) {
    let list = freqByTrip.get(f.trip_id);
    if (!list) freqByTrip.set(f.trip_id, (list = []));
    list.push([toSec(f.start_time), toSec(f.end_time), Number(f.headway_secs)]);
  }

  // --- stops (only those served by a trip) ---
  const usedStops = new Set<string>();
  for (const st of stopTimes) usedStops.add(st.stop_id);
  const stopsUsed = stopsRaw.filter((s) => usedStops.has(s.stop_id));
  const stopIndex = new Map(stopsUsed.map((s, i) => [s.stop_id, i]));
  const stopModes = new Map<number, Set<GtfsMode>>();

  // --- trips: each trip becomes a pattern with offsets relative to its first departure ---
  const trips = [] as {
    id: string; route: string; service: string; headsign: { th: string; en: string };
    stops: number[]; arr: number[]; dep: number[]; start: number; freqs: number[][];
  }[];
  for (const t of tripsRaw) {
    const sts = (stByTrip.get(t.trip_id) ?? []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (sts.length < 2 || !routeById.has(t.route_id)) continue;
    const start = toSec(sts[0].departure_time || sts[0].arrival_time);
    const stops = sts.map((s) => stopIndex.get(s.stop_id)!);
    const mode = routeById.get(t.route_id)!.mode;
    for (const si of stops) {
      let set = stopModes.get(si);
      if (!set) stopModes.set(si, (set = new Set()));
      set.add(mode);
    }
    trips.push({
      id: t.trip_id,
      route: t.route_id,
      service: t.service_id,
      headsign: splitName(t.trip_headsign || ""),
      stops,
      arr: sts.map((s) => toSec(s.arrival_time || s.departure_time) - start),
      dep: sts.map((s) => toSec(s.departure_time || s.arrival_time) - start),
      start,
      freqs: freqByTrip.get(t.trip_id) ?? [],
    });
  }

  const stops = stopsUsed.map((s, i) => ({
    id: s.stop_id,
    name: splitName(s.stop_name),
    lat: Number(Number(s.stop_lat).toFixed(6)),
    lon: Number(Number(s.stop_lon).toFixed(6)),
    zone: s.zone_id || s.stop_id,
    modes: [...(stopModes.get(i) ?? [])],
  }));

  // --- fares ---
  const fareById = new Map(fareAttr.map((f) => [f.fare_id, { price: Number(f.price), agency: f.agency_id }]));
  /** key `${agency}|${route}|${originZone}|${destZone}` (route may be empty = agency-wide) */
  const zoneFares: Record<string, number> = {};
  const routeFareSummary: Record<string, { min: number; max: number }> = {};
  for (const rule of fareRules) {
    const fare = fareById.get(rule.fare_id);
    if (!fare || !(fare.price > 0)) continue;
    const route = rule.route_id ? routeById.get(rule.route_id) : undefined;
    const agency = route?.agency ?? fare.agency;
    if (SUMMARY_FARE_AGENCIES.has(agency)) {
      if (!rule.route_id) continue;
      const s = (routeFareSummary[rule.route_id] ??= { min: fare.price, max: fare.price });
      s.min = Math.min(s.min, fare.price);
      s.max = Math.max(s.max, fare.price);
      continue;
    }
    if (!rule.origin_id || !rule.destination_id) {
      if (rule.route_id) {
        const s = (routeFareSummary[rule.route_id] ??= { min: fare.price, max: fare.price });
        s.min = Math.min(s.min, fare.price);
        s.max = Math.max(s.max, fare.price);
      }
      continue;
    }
    zoneFares[`${agency}|${rule.route_id}|${rule.origin_id}|${rule.destination_id}`] = fare.price;
  }

  // --- calendar ---
  const services: Record<string, { days: number[]; start: string; end: string; add: string[]; remove: string[] }> = {};
  for (const c of calendar) {
    services[c.service_id] = {
      days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => Number(c[d])),
      start: c.start_date,
      end: c.end_date,
      add: [],
      remove: [],
    };
  }
  for (const d of calendarDates) {
    const s = (services[d.service_id] ??= { days: [0, 0, 0, 0, 0, 0, 0], start: d.date, end: d.date, add: [], remove: [] });
    (d.exception_type === "1" ? s.add : s.remove).push(d.date);
  }

  const agencyOut = agencies.map((a) => ({ id: a.agency_id, name: splitName(a.agency_name), url: a.agency_url }));

  const meta = {
    source: "สำนักงานนโยบายและแผนการขนส่งและจราจร (สนข.) — Thailand national GTFS",
    sourceUrl: FEED_PAGE,
    downloadUrl: FEED_URL,
    publisher: feedInfo.feed_publisher_name ?? null,
    feedVersion: feedInfo.feed_version ?? null,
    feedStart: feedInfo.feed_start_date ?? null,
    feedEnd: feedInfo.feed_end_date ?? null,
    importedAt: new Date().toISOString(),
    counts: {
      agencies: agencyOut.length,
      routes: routes.length,
      trips: trips.length,
      stops: stops.length,
      stopTimes: stopTimes.length,
      zoneFares: Object.keys(zoneFares).length,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const write = (name: string, data: unknown) => {
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, JSON.stringify(data));
    console.log(`  ${name.padEnd(16)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  };
  write("meta.json", meta);
  write("agencies.json", agencyOut);
  write("routes.json", routes);
  write("stops.json", stops);
  write("trips.json", trips);
  write("fares.json", { zone: zoneFares, route: routeFareSummary });
  write("calendar.json", services);
  console.log(
    `GTFS import done: ${routes.length} routes, ${trips.length} trips, ${stops.length} stops, ${stopTimes.length} stop_times (feed ${meta.feedVersion}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
