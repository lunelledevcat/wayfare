import flights from "../../../data/flights.json";
import { isHolidayPeriod } from "../holidays";
import { currencyRates } from "../config";
import { bkkTime, bkkWeekday, DAY, hhmmToMin, MIN } from "../time";
import type { LocalizedText, Source } from "../planner/types";
import { fetchJson, TtlCache } from "./cache";
import type { FlightOffer, FlightProvider } from "./types";

type AirportCode = keyof typeof flights.airports;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const duffelCache = new TtlCache<FlightOffer[]>(30 * 60_000, 200);

export function airport(code: string) {
  const a = flights.airports[code as AirportCode];
  if (!a) return null;
  return { id: `air:${code}`, code, name: a.name as LocalizedText, lat: a.lat, lon: a.lon, city: a.city };
}

export function airportsOfCity(city: string): string[] {
  return Object.entries(flights.airports)
    .filter(([, a]) => a.city === city)
    .map(([code]) => code);
}

function factorFor(list: { from: string; to: string; factor: number }[], minOfDay: number) {
  return list.find((f) => minOfDay >= hhmmToMin(f.from) && minOfDay <= hhmmToMin(f.to))?.factor ?? 1;
}

/** base × dayFactor × advanceFactor × timeFactor (see about-data page). */
export function modelFare(base: number, date: string, departHHMM: string, searchDate: string): number {
  const day = isHolidayPeriod(date) ? flights.dayFactor.holiday : flights.dayFactor[DAY_KEYS[bkkWeekday(bkkTime(date))]];
  const daysAhead = Math.max(0, Math.round((bkkTime(date) - bkkTime(searchDate)) / DAY));
  const adv = [...flights.advanceFactor].reverse().find((a) => daysAhead >= a.minDays)?.factor ?? 1;
  const time = factorFor(flights.timeFactor, hhmmToMin(departHHMM));
  return Math.round((base * day * adv * time) / 10) * 10 - 1;
}

const staticSource = (): Source => ({
  id: "flights-static",
  name: "Wayfare domestic schedule model (data/flights.json) — ราคาโดยประมาณ",
  url: "/about-data#flights",
  updatedAt: flights.checkedAt,
  fallback: true,
  estimate: true,
});

function staticSearch(fromCodes: string[], toCodes: string[], date: string, searchDate: string): FlightOffer[] {
  const out: FlightOffer[] = [];
  for (const r of flights.routes) {
    for (const dir of ["out", "back"] as const) {
      const from = dir === "out" ? r.from : r.to;
      const to = dir === "out" ? r.to : r.from;
      if (!fromCodes.includes(from) || !toCodes.includes(to)) continue;
      const deps = dir === "out" ? r.departures : r.returnDepartures;
      deps.forEach((hhmm, i) => {
        const depart = bkkTime(date, hhmm);
        const fare = modelFare(r.base, date, hhmm, searchDate);
        out.push({
          carrier: flights.carriers.SK.name,
          operator: flights.carriers.SK.operator,
          flightNo: `SK${r.flightNo + i * 2 + (dir === "back" ? 1 : 0)}`,
          from: airport(from)!,
          to: airport(to)!,
          depart,
          arrive: depart + r.minutes * MIN,
          fare,
          fareLow: Math.round(fare * flights.fareBand.lowPct),
          fareHigh: Math.round(fare * flights.fareBand.highPct),
          source: staticSource(),
        });
      });
    }
  }
  return out;
}

interface DuffelOffer {
  total_amount: string;
  total_currency: string;
  owner: { name: string };
  slices: { segments: { departing_at: string; arriving_at: string; marketing_carrier: { iata_code: string; name: string }; marketing_carrier_flight_number: string; origin: { iata_code: string }; destination: { iata_code: string } }[] }[];
}

async function duffelSearch(token: string, from: string, to: string, date: string): Promise<FlightOffer[]> {
  const res = await fetchJson<{ data: { offers: DuffelOffer[] } }>("https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=8000", {
    method: "POST",
    timeoutMs: 9000,
    headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ data: { slices: [{ origin: from, destination: to, departure_date: date }], passengers: [{ type: "adult" }], cabin_class: "economy", max_connections: 0 } }),
  });
  const offers: FlightOffer[] = [];
  for (const o of res.data.offers.slice(0, 30)) {
    const seg = o.slices[0]?.segments[0];
    if (!seg || o.slices[0].segments.length !== 1) continue;
    const rate = currencyRates[o.total_currency as keyof typeof currencyRates];
    if (!rate) continue;
    const fare = Math.round(Number(o.total_amount) / rate);
    offers.push({
      carrier: seg.marketing_carrier.name,
      operator: flights.carriers.SK.operator,
      flightNo: `${seg.marketing_carrier.iata_code}${seg.marketing_carrier_flight_number}`,
      from: airport(seg.origin.iata_code) ?? airport(from)!,
      to: airport(seg.destination.iata_code) ?? airport(to)!,
      depart: bkkTime(seg.departing_at.slice(0, 10), seg.departing_at.slice(11, 16)),
      arrive: bkkTime(seg.arriving_at.slice(0, 10), seg.arriving_at.slice(11, 16)),
      fare,
      fareLow: fare,
      fareHigh: fare,
      source: { id: "duffel", name: "Duffel API (test mode)", url: "https://duffel.com/docs", updatedAt: new Date().toISOString() },
    });
  }
  // keep the cheapest offer per departure time
  const best = new Map<string, FlightOffer>();
  for (const o of offers) {
    const k = `${o.flightNo}|${o.depart}`;
    if (!best.has(k) || best.get(k)!.fare > o.fare) best.set(k, o);
  }
  return [...best.values()];
}

export class DuffelFlightProvider implements FlightProvider {
  async search(fromCodes: string[], toCodes: string[], date: string, searchDate: string): Promise<FlightOffer[]> {
    const token = process.env.DUFFEL_TEST_TOKEN;
    if (token) {
      try {
        const key = `${fromCodes.join(",")}>${toCodes.join(",")}|${date}`;
        const offers = await duffelCache.wrap(key, async () => {
          const all = await Promise.all(fromCodes.flatMap((f) => toCodes.map((t) => duffelSearch(token, f, t, date).catch(() => []))));
          return all.flat();
        });
        if (offers.length > 0) return offers;
      } catch {
        /* fall through to the schedule model */
      }
    }
    return staticSearch(fromCodes, toCodes, date, searchDate);
  }

  priceOn(offer: FlightOffer, date: string, searchDate: string): number {
    const route = flights.routes.find(
      (r) => (r.from === offer.from.code && r.to === offer.to.code) || (r.to === offer.from.code && r.from === offer.to.code),
    );
    const hhmm = new Date(offer.depart + 7 * 3600_000).toISOString().slice(11, 16);
    if (!route) return offer.fare;
    return modelFare(route.base, date, hhmm, searchDate);
  }
}
