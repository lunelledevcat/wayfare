import roadFares from "../../../data/road-fares.json";
import { haversineKm, type LatLon } from "../geo";
import type { Mode, Price, Source } from "../planner/types";
import { bkkSecOfDay } from "../time";
import { fetchJson, TtlCache } from "./cache";
import type { RoadProvider, RoadRoute } from "./types";

const OSRM_URL = process.env.OSRM_URL || "https://router.project-osrm.org";
const routeCache = new TtlCache<RoadRoute>(24 * 3600_000, 5000);
/** After an OSRM failure, skip it for a while so searches stay fast. */
let osrmDownUntil = 0;

const round3 = (n: number) => n.toFixed(3);

function fallbackRoute(a: LatLon, b: LatLon): RoadRoute {
  const km = haversineKm(a, b) * roadFares.detourFactor;
  const speed = km > 60 ? roadFares.speedsKmh.highway : roadFares.speedsKmh.taxi;
  return {
    km,
    minutes: Math.max(3, (km / speed) * 60),
    path: [
      [a.lat, a.lon],
      [b.lat, b.lon],
    ],
    source: {
      id: "road-estimate",
      name: "Straight-line distance × 1.35 (OSRM unavailable)",
      url: "https://project-osrm.org/",
      updatedAt: new Date().toISOString(),
      fallback: true,
      estimate: true,
    },
  };
}

interface OsrmResponse {
  code: string;
  routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

export class OsrmRoadProvider implements RoadProvider {
  async route(a: LatLon, b: LatLon): Promise<RoadRoute> {
    const key = `${round3(a.lat)},${round3(a.lon)};${round3(b.lat)},${round3(b.lon)}`;
    return routeCache.wrap(key, async () => {
      if (Date.now() < osrmDownUntil || process.env.OSRM_DISABLED === "1") return fallbackRoute(a, b);
      try {
        const url = `${OSRM_URL}/route/v1/driving/${round3(a.lon)},${round3(a.lat)};${round3(b.lon)},${round3(b.lat)}?overview=simplified&geometries=geojson`;
        const res = await fetchJson<OsrmResponse>(url, { timeoutMs: 1500, headers: { "User-Agent": "Wayfare/1.0 (hackathon demo)" } });
        const r = res.routes?.[0];
        if (res.code !== "Ok" || !r) throw new Error(`OSRM ${res.code}`);
        return {
          km: r.distance / 1000,
          minutes: r.duration / 60,
          path: r.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]),
          source: { id: "osrm", name: "OSRM (OpenStreetMap road network)", url: "https://project-osrm.org/", updatedAt: new Date().toISOString(), estimate: true },
        };
      } catch {
        osrmDownUntil = Date.now() + 5 * 60_000;
        return fallbackRoute(a, b);
      }
    });
  }
}

/** Rush-hour multiplier (Bangkok-local time). */
export function trafficFactor(epoch: number, km: number): number {
  if (km > 80) return 1.1; // mostly highway
  const min = bkkSecOfDay(epoch) / 60;
  for (const r of roadFares.rushHours) {
    const [fh, fm] = r.from.split(":").map(Number);
    const [th, tm] = r.to.split(":").map(Number);
    if (min >= fh * 60 + fm && min < th * 60 + tm) return r.factor;
  }
  return 1;
}

export function isRushHour(epoch: number): boolean {
  return trafficFactor(epoch, 1) > 1;
}

/** Minutes a road mode takes, given free-flow OSRM time. Walk and win ignore car traffic. */
export function roadMinutes(mode: Mode, route: RoadRoute, epoch: number, weatherSlowdown = 1): number {
  if (mode === "walk") return (route.km / roadFares.speedsKmh.walk) * 60;
  if (mode === "win") return Math.max(3, (route.km / roadFares.speedsKmh.win) * 60 * Math.sqrt(weatherSlowdown));
  return route.minutes * trafficFactor(epoch, route.km) * weatherSlowdown;
}

const pct = (amount: number, p: number): Price => ({
  amount: Math.round(amount),
  low: Math.round(amount * (1 - p)),
  high: Math.round(amount * (1 + p)),
  estimate: true,
});

export function taxiMeter(km: number, minutes: number, freeFlowMinutes: number): number {
  const t = roadFares.taxi;
  let fare = t.flagFall;
  let prev = t.flagFallKm;
  for (const tier of t.tiers) {
    if (km <= prev) break;
    const seg = Math.min(km, tier.upToKm) - prev;
    if (seg > 0) fare += seg * tier.perKm;
    prev = tier.upToKm;
  }
  // meter charges ฿3/min when crawling; approximate by the extra time over free-flow
  fare += Math.max(0, minutes - freeFlowMinutes) * t.waitPerMin * 0.6;
  return fare;
}

/** Per-vehicle price for a road leg (THB). `pickupAirport` adds the official airport surcharge. */
export function roadPrice(mode: Mode, km: number, minutes: number, freeFlowMinutes: number, epoch: number, pickupAirport = false): Price {
  switch (mode) {
    case "walk":
      return { amount: 0, low: 0, high: 0, estimate: false };
    case "taxi": {
      let fare = taxiMeter(km, minutes, freeFlowMinutes);
      if (pickupAirport) fare += roadFares.taxi.airportPickupSurcharge;
      if (km > roadFares.taxi.expresswayTollOverKm) fare += roadFares.taxi.expresswayToll;
      return pct(fare, roadFares.taxi.rangePct);
    }
    case "grab": {
      const g = roadFares.grab;
      let fare = g.base + km * g.perKm + minutes * g.perMin + g.bookingFee;
      if (isRushHour(epoch)) fare *= g.peakMultiplier;
      return pct(fare, g.rangePct);
    }
    case "win": {
      const w = roadFares.win;
      let fare = w.firstFare;
      if (km > w.firstKm) fare += (Math.min(km, 5) - w.firstKm) * w.perKmTo5;
      if (km > 5) fare += (km - 5) * w.perKmOver5;
      return pct(Math.ceil(fare / 5) * 5, w.rangePct);
    }
    default:
      return { amount: 0, low: 0, high: 0, estimate: true };
  }
}

export const roadLimits = {
  walkKm: 2.5,
  winKm: roadFares.win.maxKm,
  taxiKm: roadFares.taxi.maxKm,
};

export function roadFareSource(mode: Mode): Source {
  const entry = mode === "grab" ? roadFares.grab : mode === "win" ? roadFares.win : roadFares.taxi;
  return { id: `fare-${mode}`, name: entry.label, url: entry.sourceUrl, updatedAt: roadFares.checkedAt, estimate: true };
}
