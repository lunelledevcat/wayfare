import { keccak256, stringToHex } from "viem";
import fallbackFares from "../../../data/fares/fallback.json";
import { carRunningCost, CAR_SEATS, perPassenger, type CarOptions } from "../car";
import { OPERATOR_BY_MODE, refundPolicy } from "../config";
import { haversineKm, type LatLon } from "../geo";
import { RENTAL_PICKUP_MIN, rentalPrice, rentalSource } from "../rental";
import type { GtfsNetwork, GtfsStop } from "../providers/gtfs";
import { isRushHour, roadFareSource, roadMinutes, roadPrice } from "../providers/road";
import type { FlightOffer, IntercityService, RoadProvider } from "../providers/types";
import { worstWeather } from "../providers/weather";
import { HOUR, MIN } from "../time";
import { WALK_M_PER_MIN, type CityRoute } from "./city-router";
import { MODE_LABEL } from "./labels";
import { legId } from "./trip";
import type { HourlyWeather, Leg, Mode, PlaceRef, Source, TimeKind, WeatherAt } from "./types";
import { roadSlowdown } from "./weather-rules";

export interface LegContext {
  pax: number;
  net: GtfsNetwork | null;
  road: RoadProvider;
  wx: HourlyWeather[];
  car: CarOptions;
}

/** Worst forecast hour during [from, to] at the forecast point nearest to `p`. */
export function weatherFor(ctx: LegContext, p: LatLon, from: number, to: number): WeatherAt | undefined {
  let best: HourlyWeather | undefined;
  let bestKm = Infinity;
  for (const w of ctx.wx) {
    const d = haversineKm(p, w.place);
    if (d < bestKm) {
      bestKm = d;
      best = w;
    }
  }
  return bestKm < 120 ? worstWeather(best, from, to) : undefined;
}

const VEHICLE_CAPACITY: Partial<Record<Mode, number>> = { taxi: 4, grab: 4, car: CAR_SEATS, rental: CAR_SEATS, win: 1 };

const WALK_SOURCE: Source = { id: "walk", name: "Walking time at 4.8 km/h (straight line × 1.3)", url: "/about-data#road", updatedAt: "2026-10-15", estimate: true };

export function stopRef(net: GtfsNetwork, idx: number): PlaceRef {
  const s: GtfsStop = net.stops[idx];
  return { id: `s:${s.id}`, name: { th: s.name.th, en: s.name.en }, lat: s.lat, lon: s.lon };
}

export function walkLeg(ctx: LegContext, a: PlaceRef, b: PlaceRef, depart: number, kind: TimeKind = "walk", meters?: number): Leg {
  const m = meters ?? haversineKm(a, b) * 1300;
  const minutes = Math.max(1, m / WALK_M_PER_MIN);
  const arrive = depart + minutes * MIN;
  const leg: Leg = {
    id: legId("walk", a, b, depart),
    mode: "walk",
    kind,
    from: a,
    to: b,
    depart,
    arrive,
    minutes,
    distanceKm: m / 1000,
    price: { amount: 0, low: 0, high: 0, estimate: false },
    payOnSite: false,
    reliability: { level: "high", plusMinusMin: 1 },
    instruction: { key: kind === "transfer" ? "step.transferWalk" : "step.walk", params: { to: b.name, min: Math.round(minutes), m: Math.round(m / 10) * 10 } },
    path: [
      [a.lat, a.lon],
      [b.lat, b.lon],
    ],
    source: WALK_SOURCE,
    outdoor: true,
    seated: false,
    aircon: false,
  };
  leg.weather = weatherFor(ctx, a, depart, arrive);
  return leg;
}

export function waitLeg(at: PlaceRef, from: number, to: number, kind: TimeKind, mode: Mode, outdoor = false, reason?: string): Leg {
  const minutes = Math.max(0, (to - from) / MIN);
  return {
    id: legId(`wait-${kind}`, at, at, from),
    mode,
    kind,
    from: at,
    to: at,
    depart: from,
    arrive: to,
    minutes,
    price: { amount: 0, low: 0, high: 0, estimate: false },
    payOnSite: false,
    reliability: { level: "high", plusMinusMin: 0 },
    instruction: {
      key: reason ?? (kind === "buffer" ? "step.buffer" : kind === "transfer" ? "step.transferWait" : "step.wait"),
      params: { place: at.name, min: Math.round(minutes), mode: MODE_LABEL[mode] },
    },
    path: [[at.lat, at.lon]],
    source: { id: "planner", name: "Wayfare planner", url: "/about-data#planner", updatedAt: "2026-10-15" },
    outdoor,
    seated: kind === "buffer",
    aircon: kind === "buffer",
  };
}

/** Road leg (taxi / grab / win / car) departing at `depart`. */
export async function roadLeg(ctx: LegContext, mode: Mode, a: PlaceRef, b: PlaceRef, depart: number, pickupAirport = false): Promise<Leg> {
  const route = await ctx.road.route(a, b);
  const wxGuess = weatherFor(ctx, a, depart, depart + route.minutes * MIN);
  const slow = roadSlowdown(mode, wxGuess);
  const minutes = Math.max(2, roadMinutes(mode, route, depart, slow));
  const arrive = depart + minutes * MIN;
  const isCar = mode === "car" || mode === "rental";
  const vehicle = isCar ? { amount: 0, low: 0, high: 0, estimate: true } : roadPrice(mode, route.km, minutes, route.minutes, depart, pickupAirport);
  const share = Math.max(1, Math.min(ctx.pax, VEHICLE_CAPACITY[mode] ?? 1));
  // vehicle price is shared by passengers in the same car; each extra car is charged again
  const cars = Math.ceil(ctx.pax / (VEHICLE_CAPACITY[mode] ?? 1));
  const perPax = (x: number) => Math.round((x * cars) / Math.max(ctx.pax, share));
  // own / rental car: fuel + tolls + parking from the user's settings, split between the passengers
  let carCost: { fuel: number; toll: number; parking: number } | null = null;
  if (isCar) {
    const run = carRunningCost(route.km, ctx.car);
    carCost = { fuel: Math.round(perPassenger(run.fuel, ctx.pax)), toll: Math.round(perPassenger(run.toll, ctx.pax)), parking: Math.round(perPassenger(run.parking, ctx.pax)) };
  }
  const carSum = carCost ? carCost.fuel + carCost.toll + carCost.parking : 0;
  const rush = isRushHour(depart) && mode !== "win";
  const longRoad = route.km > 80;
  return {
    id: legId(mode, a, b, depart),
    mode,
    kind: "ride",
    from: a,
    to: b,
    depart,
    arrive,
    minutes,
    distanceKm: route.km,
    price: carCost ? { amount: carSum, low: Math.round(carSum * 0.9), high: Math.round(carSum * 1.15), estimate: true } : { amount: perPax(vehicle.amount), low: perPax(vehicle.low), high: perPax(vehicle.high), estimate: true },
    payOnSite: true,
    reliability:
      mode === "win"
        ? { level: "medium", plusMinusMin: 4 }
        : rush || slow > 1
          ? { level: "low", plusMinusMin: Math.round(Math.max(10, minutes * 0.35)) }
          : { level: "medium", plusMinusMin: Math.round(Math.max(5, minutes * (longRoad ? 0.12 : 0.2))) },
    instruction: carCost
      ? { key: carCost.toll > 0 ? `step.${mode}` : `step.${mode}NoToll`, params: { to: b.name, min: Math.round(minutes), km: Number(route.km.toFixed(1)), ...carCost } }
      : { key: `step.${mode}`, params: { to: b.name, min: Math.round(minutes), km: Number(route.km.toFixed(1)) } },
    path: route.path,
    source: carCost
      ? { id: `fare-${mode}`, name: `${route.source.name} · fuel, tolls and parking from your settings`, url: "/about-data#road", updatedAt: route.source.updatedAt, estimate: true, fallback: route.source.fallback }
      : { ...roadFareSource(mode), name: `${route.source.name} · ${roadFareSource(mode).name}`, fallback: route.source.fallback },
    weather: weatherFor(ctx, a, depart, arrive),
    weatherSlowdown: slow,
    outdoor: mode === "win",
    seated: true,
    aircon: mode !== "win",
  };
}

/** Collecting a hire car: paperwork and key hand-over (counted as buffer time), paying the day rate. */
export function rentalPickupLeg(ctx: LegContext, at: PlaceRef, start: number, cityId: string | undefined): Leg {
  const rent = rentalPrice(cityId, ctx.car.rentDays);
  const share = (x: number) => Math.round(perPassenger(x, ctx.pax));
  const end = start + RENTAL_PICKUP_MIN * MIN;
  return {
    id: legId("rental-pickup", at, at, start),
    mode: "rental",
    kind: "buffer",
    from: at,
    to: at,
    depart: start,
    arrive: end,
    minutes: RENTAL_PICKUP_MIN,
    price: { amount: share(rent.amount), low: share(rent.low), high: share(rent.high), estimate: true },
    payOnSite: true,
    reliability: { level: "medium", plusMinusMin: 10 },
    instruction: { key: "step.rentalPickup", params: { place: at.name, min: RENTAL_PICKUP_MIN, rent: share(rent.amount), days: ctx.car.rentDays } },
    path: [[at.lat, at.lon]],
    source: rentalSource,
    outdoor: false,
    seated: true,
    aircon: true,
  };
}

/** Same road leg, timed to arrive by `arriveBy`. */
export async function roadLegArriving(ctx: LegContext, mode: Mode, a: PlaceRef, b: PlaceRef, arriveBy: number, pickupAirport = false): Promise<Leg> {
  let leg = await roadLeg(ctx, mode, a, b, arriveBy - 30 * MIN, pickupAirport);
  for (let i = 0; i < 2; i++) leg = await roadLeg(ctx, mode, a, b, arriveBy - leg.minutes * MIN, pickupAirport);
  // traffic factors change with the start time; pin the leg so it ends exactly at arriveBy
  const shift = arriveBy - leg.arrive;
  return { ...leg, depart: leg.depart + shift, arrive: arriveBy };
}

const AC_MODES = new Set<Mode>(["bts", "mrt", "arl", "red", "flight", "coach", "van"]);

function fallbackFare(mode: Mode, stops: number): number {
  const f = fallbackFares.modes[mode as keyof typeof fallbackFares.modes];
  if (!f) return 0;
  return Math.min(f.max, Math.round(f.base + f.perStop * stops));
}

/** Legs for a city transit route (walk/wait/ride/transfer), starting after `access`. */
export function transitLegs(ctx: LegContext, route: CityRoute, readyAt: number): Leg[] {
  const net = ctx.net!;
  const legs: Leg[] = [];
  let firstRide = true;
  let t = 0;
  // fare once per contiguous ride group of the same agency (BTS lines share one fare table)
  const rides = route.segments.filter((s) => s.kind === "ride");
  const groupFare = new Map<number, { amount: number; low: number; high: number; table: boolean }>();
  for (let i = 0; i < rides.length; ) {
    const s0 = rides[i] as Extract<typeof rides[number], { kind: "ride" }>;
    const agency = net.routes.get(s0.trip.route)!.agency;
    let j = i;
    while (j + 1 < rides.length && net.routes.get((rides[j + 1] as typeof s0).trip.route)!.agency === agency && (agency === "BTSC" || agency === "BEM")) j++;
    const last = rides[j] as typeof s0;
    let fare: { amount: number; low: number; high: number; table: boolean } | null = null;
    if (j > i) {
      const z = net.zoneFare(agency, "", s0.trip.stops[s0.fromPos], last.trip.stops[last.toPos]);
      if (z) fare = { amount: z, low: z, high: z, table: true };
    }
    if (!fare) {
      // per-ride fares
      for (let k = i; k <= j; k++) {
        const r = rides[k] as typeof s0;
        const f = net.fare(r.trip, r.fromPos, r.toPos);
        const mode = net.routes.get(r.trip.route)!.mode;
        const amount = f?.amount ?? fallbackFare(mode, r.toPos - r.fromPos);
        groupFare.set(k, { amount, low: f?.low ?? amount, high: f?.high ?? amount, table: !!f });
      }
    } else {
      groupFare.set(i, fare);
      for (let k = i + 1; k <= j; k++) groupFare.set(k, { amount: 0, low: 0, high: 0, table: true });
    }
    i = j + 1;
  }

  let rideIdx = 0;
  for (const seg of route.segments) {
    if (seg.kind === "walk") {
      legs.push(walkLeg(ctx, stopRef(net, seg.fromStop), stopRef(net, seg.toStop), seg.start, "transfer", seg.meters));
      t = legs.at(-1)!.arrive;
      continue;
    }
    const r = net.routes.get(seg.trip.route)!;
    const fromIdx = seg.trip.stops[seg.fromPos];
    const toIdx = seg.trip.stops[seg.toPos];
    const from = stopRef(net, fromIdx);
    const to = stopRef(net, toIdx);
    const prevEnd = legs.length ? legs.at(-1)!.arrive : readyAt;
    t = prevEnd;
    if (seg.board - t > 30_000) {
      legs.push(waitLeg(from, t, seg.board, firstRide ? "wait" : "transfer", r.mode, r.mode === "bus" || r.mode === "boat"));
    }
    const fare = groupFare.get(rideIdx) ?? { amount: 0, low: 0, high: 0, table: false };
    const minutes = (seg.alight - seg.board) / MIN;
    const agency = net.agencies.get(r.agency);
    const path: [number, number][] = [];
    for (let k = seg.fromPos; k <= seg.toPos; k++) {
      const s = net.stops[seg.trip.stops[k]];
      path.push([s.lat, s.lon]);
    }
    const frequent = seg.trip.freqs.length > 0;
    const ride: Leg = {
      id: legId(r.mode, from, to, seg.board),
      mode: r.mode,
      kind: "ride",
      from,
      to,
      depart: seg.board,
      arrive: seg.alight,
      minutes,
      distanceKm: path.slice(1).reduce((a, p, i) => a + haversineKm({ lat: p[0], lon: p[1] }, { lat: path[i][0], lon: path[i][1] }), 0),
      price: { amount: fare.amount, low: fare.low, high: fare.high, estimate: !fare.table },
      payOnSite: true,
      line: {
        name: r.name,
        short: r.short,
        color: r.color,
        headsign: seg.trip.headsign.en ? seg.trip.headsign : undefined,
        stops: seg.toPos - seg.fromPos,
        agency: agency?.name.en,
      },
      reliability:
        r.mode === "bus" ? { level: "medium", plusMinusMin: Math.round(Math.max(5, minutes * 0.3)) } : r.mode === "boat" ? { level: "medium", plusMinusMin: 5 } : { level: "high", plusMinusMin: frequent ? 2 : 3 },
      instruction: {
        key: "step.ride",
        params: {
          mode: MODE_LABEL[r.mode],
          line: r.name,
          headsign: seg.trip.headsign.en ? seg.trip.headsign : to.name,
          stops: seg.toPos - seg.fromPos,
          from: from.name,
          to: to.name,
          min: Math.round(minutes),
          price: fare.amount,
        },
      },
      path,
      source: {
        id: "otp-gtfs",
        name: fare.table ? "สนข. GTFS (timetable + fare table)" : `สนข. GTFS timetable · ${fallbackFares.modes[r.mode as keyof typeof fallbackFares.modes]?.label ?? "fare estimate"}`,
        url: "https://mobilitydatabase.org/feeds/gtfs/mdb-1831",
        updatedAt: net.meta.importedAt,
        estimate: !fare.table,
      },
      weather: weatherFor(ctx, from, seg.board, seg.alight),
      outdoor: false,
      seated: r.mode === "arl" || r.mode === "red" || r.mode === "boat" ? true : minutes > 20 ? false : true,
      aircon: AC_MODES.has(r.mode) || r.agency === "TSB",
    };
    legs.push(ride);
    firstRide = false;
    rideIdx++;
  }
  return legs;
}

function serviceId(operator: string, serviceNo: string, depart: number): `0x${string}` {
  return keccak256(stringToHex(`${operator}|${serviceNo}|${depart}`));
}

const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

export function flightLeg(ctx: LegContext, f: FlightOffer): Leg {
  const minutes = (f.arrive - f.depart) / MIN;
  const policy = refundPolicy.flight;
  return {
    id: legId("flight", f.from, f.to, f.depart),
    mode: "flight",
    kind: "ride",
    from: f.from,
    to: f.to,
    depart: f.depart,
    arrive: f.arrive,
    minutes,
    distanceKm: haversineKm(f.from, f.to),
    price: { amount: f.fare, low: f.fareLow, high: f.fareHigh, estimate: f.source.estimate ?? false },
    payOnSite: false,
    bookable: {
      operator: f.operator,
      serviceNo: f.flightNo,
      serviceId: serviceId(f.operator, f.flightNo, f.depart),
      refundDeadline: f.depart - policy.deadlineHours * HOUR,
      cancelFeeBps: policy.feeBps,
      label: ascii(`${f.from.code} -> ${f.to.code} · ${f.operator} ${f.flightNo}`),
    },
    line: { name: { th: `${f.carrier} ${f.flightNo}`, en: `${f.carrier} ${f.flightNo}` }, short: f.flightNo, agency: f.carrier },
    reliability: { level: "medium", plusMinusMin: 20 },
    instruction: { key: "step.flight", params: { carrier: f.carrier, flightNo: f.flightNo, from: f.from.name, to: f.to.name, min: Math.round(minutes) } },
    path: [
      [f.from.lat, f.from.lon],
      [f.to.lat, f.to.lon],
    ],
    source: f.source,
    weather: weatherFor(ctx, f.from, f.depart - HOUR, f.depart),
    outdoor: false,
    seated: true,
    aircon: true,
  };
}

export function intercityLeg(ctx: LegContext, s: IntercityService): Leg {
  const minutes = (s.arrive - s.depart) / MIN;
  const policy = refundPolicy[s.mode as keyof typeof refundPolicy] ?? refundPolicy.coach;
  const operator = s.operator || OPERATOR_BY_MODE[s.mode as keyof typeof OPERATOR_BY_MODE] || "NorthStar Bus";
  const longTrip = minutes > 300;
  return {
    id: legId(s.mode, s.from, s.to, s.depart),
    mode: s.mode,
    kind: "ride",
    from: s.from,
    to: s.to,
    depart: s.depart,
    arrive: s.arrive,
    minutes,
    distanceKm: haversineKm(s.from, s.to) * 1.25,
    price: { amount: s.fare, low: s.fare, high: s.fareHigh, estimate: s.source.estimate ?? false },
    payOnSite: false,
    bookable: {
      operator,
      serviceNo: s.serviceNo,
      serviceId: serviceId(operator, s.serviceNo, s.depart),
      refundDeadline: s.depart - policy.deadlineHours * HOUR,
      cancelFeeBps: policy.feeBps,
      label: ascii(`${s.from.name.en} -> ${s.to.name.en} · ${operator} ${s.serviceNo}`).slice(0, 90),
    },
    line: { name: s.name, short: s.serviceNo.split("-")[0], classLabel: s.classLabel, stops: s.stops, agency: operator },
    reliability: s.mode === "train" ? { level: "medium", plusMinusMin: longTrip ? 40 : 15 } : { level: "medium", plusMinusMin: longTrip ? 45 : 20 },
    instruction: {
      key: s.mode === "train" ? "step.train" : "step.coach",
      params: { name: s.name, cls: s.classLabel ?? s.name, from: s.from.name, to: s.to.name, min: Math.round(minutes), mode: MODE_LABEL[s.mode] },
    },
    path: [
      [s.from.lat, s.from.lon],
      [s.to.lat, s.to.lon],
    ],
    source: s.source,
    weather: weatherFor(ctx, s.from, s.depart, s.depart + HOUR),
    outdoor: false,
    seated: true,
    aircon: s.mode !== "train" || !(s.classLabel?.en.includes("fan") ?? false),
  };
}
