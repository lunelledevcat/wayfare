import fs from "node:fs";
import path from "node:path";
import { GridIndex, haversineKm } from "../geo";
import type { LocalizedText, Mode, Source } from "../planner/types";

export type GtfsMode = Extract<Mode, "bts" | "mrt" | "arl" | "red" | "train" | "bus" | "coach" | "van" | "boat">;

export interface GtfsStop {
  idx: number;
  id: string;
  name: LocalizedText;
  lat: number;
  lon: number;
  zone: string;
  modes: GtfsMode[];
}

export interface GtfsRoute {
  id: string;
  agency: string;
  short: string;
  name: LocalizedText;
  type: number;
  color: string | null;
  mode: GtfsMode;
}

export interface GtfsTrip {
  idx: number;
  id: string;
  route: string;
  service: string;
  headsign: LocalizedText;
  stops: number[];
  arr: number[];
  dep: number[];
  /** seconds after midnight of the first departure (template start for frequency trips) */
  start: number;
  /** [startSec, endSec, headwaySec] windows for the first-stop departure */
  freqs: number[][];
}

interface Service {
  days: number[];
  start: string;
  end: string;
  add: string[];
  remove: string[];
}

export interface GtfsMeta {
  source: string;
  sourceUrl: string;
  feedVersion: string | null;
  importedAt: string;
  counts: Record<string, number>;
}

export interface GtfsNetwork {
  meta: GtfsMeta;
  stops: GtfsStop[];
  routes: Map<string, GtfsRoute>;
  trips: GtfsTrip[];
  agencies: Map<string, { name: LocalizedText; url: string }>;
  /** stop idx → [tripIdx, position] */
  stopTrips: [number, number][][];
  /** stop idx → [neighbour stop idx, metres] */
  transfers: [number, number][][];
  grid: GridIndex<GtfsStop>;
  isActive(service: string, date: string, weekday: number): boolean;
  fare(trip: GtfsTrip, fromPos: number, toPos: number): { amount: number; low: number; high: number; fromTable: boolean } | null;
  /** Zone fare between two stops of one agency (e.g. a BTS ride spanning two lines is charged once). */
  zoneFare(agency: string, routeId: string, fromStop: number, toStop: number): number | null;
}

const DATA_DIR = path.join(process.cwd(), "data", "gtfs");
const TRANSFER_M = 350;

let cached: GtfsNetwork | null | undefined;

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")) as T;
}

/** Load the pre-built GTFS JSON (see scripts/import-gtfs.ts). Returns null if it has not been imported. */
export function loadGtfs(): GtfsNetwork | null {
  if (cached !== undefined) return cached;
  try {
    cached = buildNetwork();
  } catch (err) {
    console.error("[gtfs] could not load data/gtfs — run `npm run import:gtfs`", err);
    cached = null;
  }
  return cached;
}

/** Test hook. */
export function setGtfsForTests(net: GtfsNetwork | null) {
  cached = net;
}

function buildNetwork(): GtfsNetwork {
  const meta = readJson<GtfsMeta>("meta.json");
  const stopsRaw = readJson<Omit<GtfsStop, "idx">[]>("stops.json");
  const routesRaw = readJson<GtfsRoute[]>("routes.json");
  const tripsRaw = readJson<Omit<GtfsTrip, "idx">[]>("trips.json");
  const agenciesRaw = readJson<{ id: string; name: LocalizedText; url: string }[]>("agencies.json");
  const fares = readJson<{ zone: Record<string, number>; route: Record<string, { min: number; max: number }> }>("fares.json");
  const calendar = readJson<Record<string, Service>>("calendar.json");

  const stops: GtfsStop[] = stopsRaw.map((s, idx) => ({ ...s, idx }));
  const trips: GtfsTrip[] = tripsRaw.map((t, idx) => ({ ...t, idx }));
  const routes = new Map(routesRaw.map((r) => [r.id, r]));
  const agencies = new Map(agenciesRaw.map((a) => [a.id, { name: a.name, url: a.url }]));

  const stopTrips: [number, number][][] = stops.map(() => []);
  for (const t of trips) t.stops.forEach((s, pos) => pos < t.stops.length - 1 && stopTrips[s].push([t.idx, pos]));

  const grid = new GridIndex(stops, 0.01);
  const transfers: [number, number][][] = stops.map((s) =>
    grid
      .near(s, TRANSFER_M / 1000)
      .filter((n) => n.item.idx !== s.idx)
      .map((n) => [n.item.idx, Math.round(n.km * 1000)] as [number, number]),
  );

  const isActive = (service: string, date: string, weekday: number) => {
    const s = calendar[service];
    if (!s) return true;
    const ymd = date.replaceAll("-", "");
    if (s.remove.includes(ymd)) return false;
    if (s.add.includes(ymd)) return true;
    // The feed's validity window ends 2026-12-31; keep weekly patterns valid beyond it.
    return s.days[weekday] === 1 && ymd >= s.start;
  };

  const fare: GtfsNetwork["fare"] = (trip, fromPos, toPos) => {
    const route = routes.get(trip.route);
    if (!route) return null;
    const o = stops[trip.stops[fromPos]].zone;
    const d = stops[trip.stops[toPos]].zone;
    const exact = fares.zone[`${route.agency}|${route.id}|${o}|${d}`] ?? fares.zone[`${route.agency}||${o}|${d}`];
    if (exact) return { amount: exact, low: exact, high: exact, fromTable: true };
    const sum = fares.route[route.id];
    if (sum) {
      // interpolate inside the route's published range by share of the route travelled
      const share = (toPos - fromPos) / Math.max(1, trip.stops.length - 1);
      const amount = Math.round(sum.min + (sum.max - sum.min) * Math.min(1, share));
      return { amount, low: sum.min, high: sum.max, fromTable: true };
    }
    return null;
  };

  const zoneFare: GtfsNetwork["zoneFare"] = (agency, routeId, fromStop, toStop) => {
    const o = stops[fromStop].zone;
    const d = stops[toStop].zone;
    return fares.zone[`${agency}|${routeId}|${o}|${d}`] ?? fares.zone[`${agency}||${o}|${d}`] ?? null;
  };

  return { meta, stops, routes, trips, agencies, stopTrips, transfers, grid, isActive, fare, zoneFare };
}

export function gtfsSource(net: GtfsNetwork | null): Source {
  return {
    id: "otp-gtfs",
    name: "สนข. GTFS (OTP Thailand national feed, Mobility Database mdb-1831)",
    url: "https://mobilitydatabase.org/feeds/gtfs/mdb-1831",
    updatedAt: net?.meta.importedAt ?? new Date(0).toISOString(),
    fallback: net === null,
  };
}

/** Find stops whose English or Thai name matches, closest to `near` first. */
export function findStopsByName(net: GtfsNetwork, re: RegExp, near?: { lat: number; lon: number }): GtfsStop[] {
  const list = net.stops.filter((s) => re.test(s.name.en) || re.test(s.name.th));
  if (near) list.sort((a, b) => haversineKm(a, near) - haversineKm(b, near));
  return list;
}
