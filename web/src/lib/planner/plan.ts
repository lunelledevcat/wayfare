/**
 * Plan orchestration: resolve places, fetch weather, generate city / intercity
 * door-to-door candidates, apply weather rules, pair alternatives, Pareto-filter
 * and attach the 7-day price calendar.
 */
import { buffers } from "../config";
import { haversineKm } from "../geo";
import { isHolidayPeriod } from "../holidays";
import { cityById, cityOf, type City } from "../places-data";
import { TtlCache } from "../providers/cache";
import { airportsOfCity, DuffelFlightProvider } from "../providers/flights";
import type { GtfsMode } from "../providers/gtfs";
import { resolvePlace } from "../providers/places";
import { OsrmRoadProvider } from "../providers/road";
import { GtfsTransitProvider } from "../providers/transit";
import type { FlightOffer, FlightProvider, IntercityService, RoadProvider, TransitProvider, WeatherProvider } from "../providers/types";
import { OpenMeteoWeatherProvider, weatherAt } from "../providers/weather";
import { addDays, bkkHHMM, bkkTime, HOUR, MIN, todayBkk } from "../time";
import { routeCity, stopsNear, WALK_M_PER_MIN, type AccessPoint } from "./city-router";
import { MODE_LABEL } from "./labels";
import { flightLeg, intercityLeg, roadLeg, roadLegArriving, stopRef, transitLegs, waitLeg, walkLeg, weatherFor, type LegContext } from "./legs";
import { DEFAULT_PREFS, score } from "./scoring";
import { buildTrip } from "./trip";
import type { HourlyWeather, Leg, Mode, PlaceRef, PlanQuery, PlanResult, PriceDay, Source, Trip } from "./types";
import { assessLeg, flightBufferExtra } from "./weather-rules";

export interface PlanDeps {
  transit: TransitProvider;
  flights: FlightProvider;
  road: RoadProvider;
  weather: WeatherProvider;
  /** "today" for advance-purchase pricing */
  today?: string;
}

export class PlanError extends Error {
  constructor(
    public code: "from" | "to" | "same" | "date" | "time",
    message: string,
  ) {
    super(message);
  }
}

let deps: PlanDeps | null = null;
export function defaultDeps(): PlanDeps {
  return (deps ??= {
    transit: new GtfsTransitProvider(),
    flights: new DuffelFlightProvider(),
    road: new OsrmRoadProvider(),
    weather: new OpenMeteoWeatherProvider(),
  });
}

/** Plan results cached per dependency set (one set in production; tests inject fixtures). */
const planCaches = new WeakMap<PlanDeps, TtlCache<PlanResult>>();
const tripStore = new TtlCache<{ trip: Trip; query: PlanQuery }>(60 * 60_000, 3000);

const RAIL: GtfsMode[] = ["bts", "mrt", "arl", "red"];
const ALL_CITY: GtfsMode[] = ["bts", "mrt", "arl", "red", "bus", "boat"];

export function normalizeQuery(q: Partial<PlanQuery>): PlanQuery {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : todayBkk();
  const time = /^\d{2}:\d{2}$/.test(q.time ?? "") ? q.time! : "08:00";
  const pax = Math.min(9, Math.max(1, Math.round(Number(q.pax) || 1)));
  return { from: String(q.from ?? ""), to: String(q.to ?? ""), date, time, mode: q.mode === "arrive" ? "arrive" : "depart", pax };
}

export async function plan(input: Partial<PlanQuery>, d: PlanDeps = defaultDeps()): Promise<PlanResult> {
  const q = normalizeQuery(input);
  const key = JSON.stringify(q);
  let cache = planCaches.get(d);
  if (!cache) planCaches.set(d, (cache = new TtlCache<PlanResult>(10 * 60_000, 200)));
  const res = await cache.wrap(key, () => computePlan(q, d));
  for (const trip of res.trips) tripStore.set(trip.id, { trip, query: q });
  return res;
}

/** Look up a trip produced by an earlier plan; recompute the plan if this instance has not seen it. */
export async function findTrip(id: string, q?: Partial<PlanQuery>, d: PlanDeps = defaultDeps()) {
  const hit = tripStore.get(id);
  if (hit) return hit;
  if (!q) return null;
  const res = await plan(q, d);
  const trip = res.trips.find((t) => t.id === id);
  return trip ? { trip, query: res.query } : null;
}

function cityFor(p: PlaceRef): City | null {
  return cityById(p.city) ?? cityOf(p);
}

async function computePlan(q: PlanQuery, d: PlanDeps): Promise<PlanResult> {
  const started = Date.now();
  const from = resolvePlace(q.from);
  if (!from) throw new PlanError("from", "Unknown origin");
  const to = resolvePlace(q.to);
  if (!to) throw new PlanError("to", "Unknown destination");
  if (haversineKm(from, to) < 0.15) throw new PlanError("same", "Origin and destination are the same place");
  const t = bkkTime(q.date, q.time);
  if (!Number.isFinite(t)) throw new PlanError("date", "Invalid date");

  const fromCity = cityFor(from);
  const toCity = cityFor(to);
  const intercity = !!fromCity && !!toCity && fromCity.id !== toCity.id && haversineKm(from, to) > 40;
  const scope: Trip["scope"] = intercity ? "intercity" : "city";

  const span = intercity ? 30 * HOUR : 6 * HOUR;
  const [wxFrom, wxTo] = await Promise.all([
    d.weather.hourly(from, q.mode === "depart" ? t - 2 * HOUR : t - span, q.mode === "depart" ? t + span : t + HOUR),
    d.weather.hourly(to, q.mode === "depart" ? t - 2 * HOUR : t - span, q.mode === "depart" ? t + span : t + 2 * HOUR),
  ]);
  const net = d.transit.network();
  const ctx: LegContext = { pax: q.pax, net, road: d.road, wx: [wxFrom, wxTo] };
  const today = d.today ?? todayBkk();

  let trips = intercity ? await intercityTrips(ctx, d, q, from, to, fromCity!, toCity!, t, today) : await cityTrips(ctx, q, from, to, t, !!fromCity?.metro);

  trips = trips.filter((tr) => tr.legs.filter((l) => l.kind === "ride").length <= 5);
  if (q.mode === "depart") trips = trips.filter((tr) => tr.depart >= t - MIN);
  else trips = trips.filter((tr) => tr.arrive <= t + MIN);
  trips = dedupe(trips);
  applyWeather(trips);
  pairAlternatives(trips);
  trips = paretoFilter(trips);

  const sources = collectSources(trips, [wxFrom, wxTo]);
  const priceCalendar = buildPriceCalendar(trips, q, d, today);
  const betterDeparture = q.mode === "depart" ? findBetterDeparture(wxFrom, t, trips) : undefined;

  return {
    query: q,
    from: { ...from, city: fromCity?.id },
    to: { ...to, city: toCity?.id },
    scope,
    trips,
    weather: { origin: wxFrom, destination: wxTo },
    priceCalendar,
    betterDeparture,
    sources,
    generatedAt: new Date().toISOString(),
    tookMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------- city

interface TransitVariant {
  modes: GtfsMode[];
  access: "walk" | "win" | "grab";
}

async function transitTrip(ctx: LegContext, v: TransitVariant, from: PlaceRef, to: PlaceRef, departAt: number): Promise<Trip | null> {
  const net = ctx.net;
  if (!net) return null;
  const modes = new Set(v.modes);
  const accessLegs: Leg[] = [];
  if (v.access === "walk") {
    for (const n of stopsNear(net, from, 1.2, modes).slice(0, 14)) accessLegs.push(walkLeg(ctx, from, stopRef(net, n.item.idx), departAt));
  } else {
    // ride to one of the nearest rail stations that is too far to walk comfortably
    const far = stopsNear(net, from, 4, new Set(RAIL)).filter((n) => n.km > 0.6);
    const picked: typeof far = [];
    for (const n of far) {
      if (picked.length >= 3) break;
      if (picked.every((p) => haversineKm(p.item, n.item) > 0.4)) picked.push(n);
    }
    for (const n of picked) accessLegs.push(await roadLeg(ctx, v.access, from, stopRef(net, n.item.idx), departAt));
  }
  if (accessLegs.length === 0) return null;
  const points: AccessPoint[] = accessLegs.map((l, i) => ({ stop: net.stops.findIndex((s) => `s:${s.id}` === l.to.id), at: l.arrive, ref: i }));
  let egressStops = stopsNear(net, to, 1.2, modes);
  if (egressStops.length === 0) egressStops = stopsNear(net, to, 2, modes);
  const egress = new Map(egressStops.map((n) => [n.item.idx, n.km * 1300]));
  const route = routeCity(net, { modes, access: points.filter((p) => p.stop >= 0), egress });
  if (!route) return null;
  const access = accessLegs[route.accessRef];
  const middle = transitLegs(ctx, route, access.arrive);
  const last = net.stops[route.lastStop];
  const eg = walkLeg(ctx, stopRef(net, route.lastStop), to, route.arriveStop, "walk", haversineKm(last, to) * 1300);
  const legs = [access, ...middle, eg].filter((l) => !(l.mode === "walk" && l.minutes < 0.5));
  const core = middle.filter((l) => l.kind === "ride").map((l) => `${l.line?.short}:${l.from.id}>${l.to.id}`).join("|");
  return buildTrip(legs, "city", `transit:${core}`);
}

async function arriveBy(build: (dep: number) => Promise<Trip | null>, deadline: number, guessMin: number): Promise<Trip | null> {
  let dep = deadline - guessMin * MIN;
  let best: Trip | null = null;
  for (let i = 0; i < 4; i++) {
    const trip = await build(dep);
    if (!trip) return best;
    const slack = deadline - trip.arrive;
    if (slack >= 0) {
      if (!best || trip.depart > best.depart) best = trip;
      if (slack <= 3 * MIN) break;
      dep += slack - MIN;
    } else dep += slack - 3 * MIN;
  }
  return best;
}

async function cityTrips(ctx: LegContext, q: PlanQuery, from: PlaceRef, to: PlaceRef, t: number, metro: boolean): Promise<Trip[]> {
  const km = haversineKm(from, to);
  const out: Trip[] = [];
  const direct: Mode[] = ["taxi", "grab"];
  if (km <= 10) direct.push("win");
  const tasks: Promise<Trip | null>[] = [];
  if (km <= 2.5) {
    const w = q.mode === "depart" ? walkLeg(ctx, from, to, t) : walkLeg(ctx, from, to, t - (km * 1300 * MIN) / WALK_M_PER_MIN);
    out.push(buildTrip([w], "city", "direct"));
  }
  for (const m of direct) {
    tasks.push(
      (q.mode === "depart" ? roadLeg(ctx, m, from, to, t) : roadLegArriving(ctx, m, from, to, t)).then((leg) => buildTrip([leg], "city", "direct")),
    );
  }
  if (ctx.net && (metro || stopsNear(ctx.net, from, 1.5, new Set(ALL_CITY)).length > 0)) {
    const variants: TransitVariant[] = [
      { modes: RAIL, access: "walk" },
      { modes: ALL_CITY, access: "walk" },
      { modes: RAIL, access: "win" },
      { modes: RAIL, access: "grab" },
    ];
    const guess = Math.max(30, (km / 18) * 60 + 20);
    for (const v of variants) {
      tasks.push(q.mode === "depart" ? transitTrip(ctx, v, from, to, t) : arriveBy((dep) => transitTrip(ctx, v, from, to, dep), t, guess));
    }
  }
  for (const r of await Promise.all(tasks)) if (r) out.push(r);
  return out;
}

// ---------------------------------------------------------------- intercity

type Core = { kind: "flight"; offer: FlightOffer } | { kind: "ground"; svc: IntercityService };

const coreDepart = (c: Core) => (c.kind === "flight" ? c.offer.depart : c.svc.depart);
const coreArrive = (c: Core) => (c.kind === "flight" ? c.offer.arrive : c.svc.arrive);
const coreFrom = (c: Core): PlaceRef => (c.kind === "flight" ? c.offer.from : c.svc.from);
const coreTo = (c: Core): PlaceRef => (c.kind === "flight" ? c.offer.to : c.svc.to);
const coreMode = (c: Core): Mode => (c.kind === "flight" ? "flight" : c.svc.mode);
const coreFare = (c: Core) => (c.kind === "flight" ? c.offer.fare : c.svc.fare);

function shiftLegs(ctx: LegContext, legs: Leg[], delta: number): Leg[] {
  return legs.map((l) => {
    const depart = l.depart + delta;
    const arrive = l.arrive + delta;
    return { ...l, depart, arrive, weather: l.kind === "ride" || l.mode === "walk" ? weatherFor(ctx, l.from, depart, arrive) : l.weather };
  });
}

function pickCores(cores: Core[], q: PlanQuery, earliest: (c: Core) => boolean): Core[] {
  const byMode = new Map<Mode, Core[]>();
  for (const c of cores) {
    const list = byMode.get(coreMode(c)) ?? [];
    list.push(c);
    byMode.set(coreMode(c), list);
  }
  const out: Core[] = [];
  for (const [mode, list] of byMode) {
    const feasible = list.filter(earliest);
    const sorted = q.mode === "depart" ? feasible.sort((a, b) => coreDepart(a) - coreDepart(b)) : feasible.sort((a, b) => coreArrive(b) - coreArrive(a));
    const n = mode === "flight" ? 3 : mode === "van" ? 2 : 3;
    const picked = sorted.slice(0, n);
    const cheapest = feasible.slice().sort((a, b) => coreFare(a) - coreFare(b))[0];
    if (cheapest && !picked.includes(cheapest)) picked.push(cheapest);
    out.push(...picked);
  }
  return out;
}

async function intercityTrips(ctx: LegContext, d: PlanDeps, q: PlanQuery, from: PlaceRef, to: PlaceRef, fromCity: City, toCity: City, t: number, today: string): Promise<Trip[]> {
  const date = q.date;
  const [flightsToday, groundToday, groundPrev] = await Promise.all([
    d.flights.search(airportsOfCity(fromCity.id), airportsOfCity(toCity.id), date, today),
    d.transit.intercity(fromCity.id, toCity.id, date),
    q.mode === "arrive" ? d.transit.intercity(fromCity.id, toCity.id, addDays(date, -1)) : Promise.resolve([]),
  ]);
  const cores: Core[] = [...flightsToday.map((offer) => ({ kind: "flight" as const, offer })), ...[...groundToday, ...groundPrev].map((svc) => ({ kind: "ground" as const, svc }))];

  const bufferFor = (c: Core) => {
    if (c.kind === "flight") return buffers.flightDomestic + flightBufferExtra(weatherFor(ctx, c.offer.from, c.offer.depart - 2 * HOUR, c.offer.depart));
    return buffers[c.svc.mode as "train" | "coach" | "van"] ?? buffers.coach;
  };
  const deplaneMin = (c: Core) => (c.kind === "flight" ? 20 : 5);

  // quick taxi estimates per hub to decide which cores are reachable
  const hubEta = new Map<string, number>();
  const etaTo = async (hub: PlaceRef) => {
    if (!hubEta.has(hub.id)) hubEta.set(hub.id, (await roadLeg(ctx, "taxi", from, hub, t)).minutes);
    return hubEta.get(hub.id)!;
  };
  const egressEta = new Map<string, number>();
  const etaFrom = async (hub: PlaceRef) => {
    if (!egressEta.has(hub.id)) egressEta.set(hub.id, (await roadLeg(ctx, "taxi", hub, to, t)).minutes);
    return egressEta.get(hub.id)!;
  };
  const hubs = [...new Map(cores.map((c) => [coreFrom(c).id, coreFrom(c)])).values()];
  const outHubs = [...new Map(cores.map((c) => [coreTo(c).id, coreTo(c)])).values()];
  await Promise.all([...hubs.map(etaTo), ...outHubs.map(etaFrom)]);

  const picked = pickCores(cores, q, (c) =>
    q.mode === "depart"
      ? coreDepart(c) - bufferFor(c) * MIN >= t + hubEta.get(coreFrom(c).id)! * 0.9 * MIN
      : coreArrive(c) + (deplaneMin(c) + egressEta.get(coreTo(c).id)!) * MIN <= t,
  );

  // transit access/egress, computed once per hub and shifted in time
  const transitAccess = new Map<string, Trip | null>();
  const transitEgress = new Map<string, Trip | null>();
  const fromMetro = !!fromCity.metro && !!ctx.net;
  const toMetro = !!toCity.metro && !!ctx.net;
  const ref = async (map: Map<string, Trip | null>, key: string, fn: () => Promise<Trip | null>) => {
    if (!map.has(key)) map.set(key, await fn());
    return map.get(key)!;
  };

  const results: Trip[] = [];
  await Promise.all(
    picked.map(async (c) => {
      const hubIn = coreFrom(c);
      const hubOut = coreTo(c);
      const buffer = bufferFor(c);
      const readyBy = coreDepart(c) - buffer * MIN;
      const coreLeg = c.kind === "flight" ? flightLeg(ctx, c.offer) : intercityLeg(ctx, c.svc);
      const bufferLeg = waitLeg(hubIn, readyBy, coreDepart(c), "buffer", coreMode(c), false, c.kind === "flight" ? "step.bufferFlight" : "step.bufferStation");
      const afterArrive = coreArrive(c) + deplaneMin(c) * MIN;
      const deplane = waitLeg(hubOut, coreArrive(c), afterArrive, "transfer", coreMode(c), false, c.kind === "flight" ? "step.deplaneFlight" : "step.deplane");

      // access options
      const accessOpts: Leg[][] = [];
      const taxiIn = await roadLegArriving(ctx, "taxi", from, hubIn, readyBy, false);
      accessOpts.push([taxiIn]);
      if (fromMetro) {
        // computed per hub and half-hour slot (service hours matter), then shifted a few minutes to fit
        const slot = Math.round(readyBy / (30 * MIN));
        const base = await ref(transitAccess, `${hubIn.id}|${slot}`, () =>
          arriveBy((dep) => transitTrip(ctx, { modes: ALL_CITY, access: "walk" }, from, hubIn, dep), slot * 30 * MIN, 70),
        );
        if (base && Math.abs(readyBy - base.arrive) <= 20 * MIN) accessOpts.push(shiftLegs(ctx, base.legs, readyBy - base.arrive));
      }
      // egress options
      const egressOpts: Leg[][] = [];
      const pickupAirport = c.kind === "flight";
      egressOpts.push([await roadLeg(ctx, toMetro ? "taxi" : "grab", hubOut, to, afterArrive, pickupAirport)]);
      if (toMetro) {
        const slot = Math.round(afterArrive / (30 * MIN));
        const base = await ref(transitEgress, `${hubOut.id}|${slot}`, () => transitTrip(ctx, { modes: ALL_CITY, access: "walk" }, hubOut, to, slot * 30 * MIN));
        if (base && Math.abs(afterArrive - base.depart) <= 20 * MIN) egressOpts.push(shiftLegs(ctx, base.legs, afterArrive - base.depart));
      }

      for (const acc of accessOpts) {
        const accLegs = acc.slice();
        // depart mode: never leave before the requested time
        if (q.mode === "depart" && accLegs[0].depart < t - MIN) continue;
        const gap = readyBy - accLegs.at(-1)!.arrive;
        if (gap > MIN) accLegs.push(waitLeg(hubIn, accLegs.at(-1)!.arrive, readyBy, "wait", coreMode(c)));
        for (const eg of egressOpts) {
          const legs = [...accLegs, bufferLeg, coreLeg, deplane, ...eg];
          results.push(buildTrip(legs, "intercity", `core:${coreLeg.id}`));
        }
      }
    }),
  );

  // door-to-door by road
  const km = haversineKm(from, to);
  const roadModes: Mode[] = ["car"];
  if (km <= 250) roadModes.push("taxi");
  for (const m of roadModes) {
    const leg = q.mode === "depart" ? await roadLeg(ctx, m, from, to, t) : await roadLegArriving(ctx, m, from, to, t);
    results.push(buildTrip([leg], "intercity", "direct"));
  }
  return results;
}

// ---------------------------------------------------------------- post-processing

function dedupe(trips: Trip[]): Trip[] {
  const seen = new Map<string, Trip>();
  for (const t of trips) if (!seen.has(t.id)) seen.set(t.id, t);
  return [...seen.values()];
}

function applyWeather(trips: Trip[]) {
  for (const trip of trips) {
    const warnings = [];
    let risk = 0;
    let notRec = false;
    for (const leg of trip.legs) {
      const a = assessLeg(leg);
      warnings.push(...a.warnings);
      risk = Math.max(risk, a.risk);
      notRec ||= a.notRecommended;
    }
    // keep one road-slowdown note per trip
    const seenCodes = new Set<string>();
    trip.warnings = warnings.filter((w) => (w.code === "road.slow" ? !seenCodes.has(w.code) && seenCodes.add(w.code) : true));
    trip.weatherRisk = risk;
    trip.notRecommended = notRec;
  }
}

const SWAPPABLE = new Set(["win.rain", "win.heavyRain", "walk.heavyRain", "boat.wind"]);

/** For each "avoid" warning, point at the closest trip without the problem. */
function pairAlternatives(trips: Trip[]) {
  for (const trip of trips) {
    for (const w of trip.warnings) {
      if (!SWAPPABLE.has(w.code)) continue;
      const pool = trips.filter((o) => o.id !== trip.id && !o.notRecommended);
      const sameCore = pool.filter((o) => o.coreKey === trip.coreKey);
      const candidates = (sameCore.length ? sameCore : pool).slice().sort((a, b) => {
        const da = Math.abs(a.minutes - trip.minutes) + a.cost.amount / 5;
        const db = Math.abs(b.minutes - trip.minutes) + b.cost.amount / 5;
        return da - db;
      });
      const alt = candidates[0];
      if (!alt) continue;
      const altMode = alt.legs.find((l) => l.kind === "ride" && !trip.modes.includes(l.mode))?.mode ?? alt.mainMode;
      w.alternative = {
        tripId: alt.id,
        mode: altMode,
        deltaPrice: alt.cost.amount - trip.cost.amount,
        message: {
          key: w.code.startsWith("boat") ? "alt.insteadBoat" : "alt.instead",
          params: { mode: MODE_LABEL[altMode], delta: Math.abs(alt.cost.amount - trip.cost.amount), sign: alt.cost.amount >= trip.cost.amount ? "+" : "-", min: alt.minutes },
        },
      };
    }
  }
}

function dominates(a: Trip, b: Trip): boolean {
  // leaving later and arriving earlier are both better, so different departures survive
  const ka = [a.cost.amount, a.arrive / MIN, -a.depart / MIN, a.transfers, a.walkMin, a.weatherRisk, -a.comfort];
  const kb = [b.cost.amount, b.arrive / MIN, -b.depart / MIN, b.transfers, b.walkMin, b.weatherRisk, -b.comfort];
  let strict = false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] > kb[i] + (i === 1 || i === 2 ? 2 : 0)) return false;
    if (ka[i] < kb[i]) strict = true;
  }
  return strict;
}

/** Keep Pareto-optimal trips plus the best of each main mode and every alternative target. */
function paretoFilter(trips: Trip[]): Trip[] {
  const keep = new Set<string>();
  for (const t of trips) if (!trips.some((o) => o !== t && dominates(o, t))) keep.add(t.id);
  const byMode = new Map<Mode, Trip[]>();
  for (const t of trips) byMode.set(t.mainMode, [...(byMode.get(t.mainMode) ?? []), t]);
  for (const list of byMode.values()) {
    list.sort((a, b) => score(a, "value", DEFAULT_PREFS) - score(b, "value", DEFAULT_PREFS));
    list.slice(0, 2).forEach((t) => keep.add(t.id));
  }
  for (const t of trips) if (keep.has(t.id)) for (const w of t.warnings) if (w.alternative?.tripId) keep.add(w.alternative.tripId);
  return trips
    .filter((t) => keep.has(t.id))
    .sort((a, b) => score(a, "value", DEFAULT_PREFS) - score(b, "value", DEFAULT_PREFS))
    .slice(0, 30);
}

function collectSources(trips: Trip[], wx: HourlyWeather[]): Source[] {
  const m = new Map<string, Source>();
  for (const t of trips) for (const l of t.legs) if (!m.has(l.source.id)) m.set(l.source.id, l.source);
  for (const w of wx) m.set(w.source.id, w.source);
  return [...m.values()].filter((s) => s.id !== "planner");
}

function flightPriceOn(d: PlanDeps, leg: Leg, date: string, today: string): number {
  const from = leg.from as PlaceRef & { code?: string };
  const to = leg.to as PlaceRef & { code?: string };
  if (!from.code || !to.code) return leg.price.amount;
  const offer = { from: { ...from, code: from.code }, to: { ...to, code: to.code }, depart: leg.depart, fare: leg.price.amount } as FlightOffer;
  return d.flights.priceOn(offer, date, today);
}

function buildPriceCalendar(trips: Trip[], q: PlanQuery, d: PlanDeps, today: string): PlanResult["priceCalendar"] {
  const fastest = trips.filter((t) => !t.notRecommended).sort((a, b) => a.minutes - b.minutes)[0];
  const reference: Mode = fastest?.mainMode ?? "taxi";
  const days: PriceDay[] = [];
  for (let off = -3; off <= 3; off++) {
    const date = addDays(q.date, off);
    if (bkkTime(date) < bkkTime(today)) {
      days.push({ date, amount: null, cheapest: null, holiday: isHolidayPeriod(date) });
      continue;
    }
    const cost = (t: Trip) => t.legs.reduce((a, l) => a + (l.mode === "flight" ? flightPriceOn(d, l, date, today) : l.price.amount), 0);
    const all = trips.map((t) => ({ t, c: cost(t) }));
    const ref = all.filter((x) => x.t.mainMode === reference).map((x) => x.c);
    days.push({
      date,
      amount: ref.length ? Math.round(Math.min(...ref)) : null,
      cheapest: all.length ? Math.round(Math.min(...all.map((x) => x.c))) : null,
      holiday: isHolidayPeriod(date),
    });
  }
  return { reference, days };
}

function findBetterDeparture(wx: HourlyWeather, t: number, trips: Trip[]): PlanResult["betterDeparture"] {
  const now = weatherAt(wx, t);
  if (!now || now.precipProb < 60) return undefined;
  if (!trips.some((tr) => tr.weatherRisk >= 0.3)) return undefined;
  let best: { time: number; prob: number } | null = null;
  for (let dt = -3 * HOUR; dt <= 5 * HOUR; dt += HOUR / 2) {
    const at = t + dt;
    const w = weatherAt(wx, at);
    if (!w || w.precipProb >= 40) continue;
    if (!best || Math.abs(dt) < Math.abs(best.time - t)) best = { time: at, prob: w.precipProb };
  }
  if (!best) return undefined;
  return { time: bkkHHMM(best.time), precipProb: best.prob, currentProb: now.precipProb };
}


