import busData from "../../../data/intercity-bus.json";
import railData from "../../../data/intercity-rail.json";
import { OPERATOR_BY_MODE } from "../config";
import { haversineKm } from "../geo";
import { cities, cityOf } from "../places-data";
import type { LocalizedText, Mode, PlaceRef, Source } from "../planner/types";
import { bkkTime, bkkWeekday, DAY, hhmmToMin, MIN } from "../time";
import { findStopsByName, gtfsSource, loadGtfs, type GtfsNetwork, type GtfsStop } from "./gtfs";
import type { IntercityService, TransitProvider } from "./types";

const railSource = (fromGtfs: boolean): Source => ({
  id: "srt-timetable",
  name: fromGtfs ? "SRT timetable — departure from สนข. GTFS, journey time & fare from SRT (estimate)" : "SRT timetable (estimate)",
  url: railData.sourceUrl,
  updatedAt: railData.checkedAt,
  estimate: true,
});
const busFallbackSource = (): Source => ({
  id: "intercity-bus-static",
  name: "Terminal timetables (data/intercity-bus.json) — ราคาโดยประมาณ",
  url: busData.sourceUrl,
  updatedAt: busData.checkedAt,
  fallback: true,
  estimate: true,
});

const stopPlace = (s: GtfsStop, city?: string): PlaceRef => ({
  id: `s:${s.id}`,
  name: { th: s.name.th, en: s.name.en },
  lat: s.lat,
  lon: s.lon,
  city,
});

let stopCityCache: (string | null)[] | null = null;
function stopCities(net: GtfsNetwork): (string | null)[] {
  if (!stopCityCache) stopCityCache = net.stops.map((s) => cityOf(s)?.id ?? null);
  return stopCityCache;
}

/** Departures (seconds after midnight) of a GTFS trip's first stop. */
function tripStarts(trip: { start: number; freqs: number[][] }): number[] {
  if (trip.freqs.length === 0) return [trip.start];
  const out: number[] = [];
  for (const [s, e, h] of trip.freqs) {
    if (h <= 0) out.push(s);
    else for (let t = s; t <= e && out.length < 200; t += h) out.push(t);
  }
  return out;
}

function gtfsCoaches(net: GtfsNetwork, fromCity: string, toCity: string, date: string): IntercityService[] {
  const sc = stopCities(net);
  const day0 = bkkTime(date);
  const weekday = bkkWeekday(day0);
  const prevDate = new Date(day0 - DAY + 7 * 3600_000).toISOString().slice(0, 10);
  const out: IntercityService[] = [];
  const src = gtfsSource(net);
  for (const trip of net.trips) {
    const route = net.routes.get(trip.route);
    if (!route || (route.mode !== "coach" && route.mode !== "van")) continue;
    const i = trip.stops.findIndex((s) => sc[s] === fromCity);
    if (i < 0) continue;
    let j = -1;
    for (let k = trip.stops.length - 1; k > i; k--) if (sc[trip.stops[k]] === toCity) j = k;
    if (j < 0) continue;
    const minutes = (trip.arr[j] - trip.dep[i]) / 60;
    if (minutes < 30) continue;
    const fare = net.fare(trip, i, j);
    const agency = net.agencies.get(route.agency);
    for (const [base, svcDate] of [
      [day0, date],
      [day0 - DAY, prevDate],
    ] as const) {
      if (!net.isActive(trip.service, svcDate, svcDate === date ? weekday : (weekday + 6) % 7)) continue;
      for (const start of tripStarts(trip)) {
        const depart = base + (start + trip.dep[i]) * 1000;
        if (depart < day0 || depart >= day0 + DAY) continue;
        const from = net.stops[trip.stops[i]];
        const to = net.stops[trip.stops[j]];
        const amount = fare?.amount ?? Math.round(haversineKm(from, to) * 0.9);
        out.push({
          mode: route.mode as Mode,
          operator: route.mode === "van" ? OPERATOR_BY_MODE.van : OPERATOR_BY_MODE.coach,
          serviceNo: `${route.short || route.id}-${trip.id}`,
          name: { th: route.name.th, en: route.name.en },
          classLabel: agency ? { th: agency.name.th, en: agency.name.en } : undefined,
          from: stopPlace(from, fromCity),
          to: stopPlace(to, toCity),
          depart,
          arrive: depart + minutes * MIN,
          fare: amount,
          fareHigh: fare?.high ?? amount,
          comfort: route.mode === "van" ? 1 : 2,
          stops: j - i,
          source: { ...src, estimate: !fare },
        });
      }
    }
  }
  // de-duplicate (several agencies run identical patterns): keep the cheapest per departure minute
  const best = new Map<string, IntercityService>();
  for (const s of out) {
    const k = `${s.mode}|${Math.round(s.depart / MIN)}`;
    if (!best.has(k) || best.get(k)!.fare > s.fare) best.set(k, s);
  }
  return [...best.values()];
}

function rail(net: GtfsNetwork | null, fromCity: string, toCity: string, date: string): IntercityService[] {
  const out: IntercityService[] = [];
  const dir = fromCity === "bangkok" ? "out" : toCity === "bangkok" ? "in" : null;
  if (!dir) return out;
  const other = dir === "out" ? toCity : fromCity;
  const day0 = bkkTime(date);
  const bkkStation = net ? findStopsByName(net, /^SRT Bangkok \(Krung Thep Aphiwat\)$/)[0] : undefined;
  const bkkPlace: PlaceRef = bkkStation
    ? stopPlace(bkkStation, "bangkok")
    : { id: "p:kta", name: { th: "สถานีกลางกรุงเทพอภิวัฒน์", en: "Krung Thep Aphiwat Central Terminal" }, lat: 13.8047, lon: 100.5418, city: "bangkok" };

  for (const t of railData.trains) {
    if (t.dir !== dir || t.city !== other) continue;
    const cityInfo = cities.find((c) => c.id === other)!;
    const stationStop = net ? findStopsByName(net, new RegExp(`^${t.station.replace(/[()]/g, "\\$&")}$`), cityInfo)[0] : undefined;
    const station: PlaceRef = stationStop
      ? stopPlace(stationStop, other)
      : { id: `p:${other}-station`, name: { th: t.station, en: t.station }, lat: cityInfo.lat, lon: cityInfo.lon, city: other };
    let bangkokPlace = bkkPlace;
    if ("fromStation" in t && t.fromStation && net) {
      const s = findStopsByName(net, new RegExp(`^${t.fromStation}$`))[0];
      if (s) bangkokPlace = stopPlace(s, "bangkok");
    }

    // prefer the Bangkok-side time from GTFS (the feed covers that segment of the train)
    let gtfsSec: number | null = null;
    if (net) {
      for (const trip of net.trips) {
        const route = net.routes.get(trip.route);
        if (!route || route.mode !== "train" || route.short.split(" ")[0] !== t.no) continue;
        const first = net.stops[trip.stops[0]];
        const last = net.stops[trip.stops.at(-1)!];
        if (trip.start < 3600 && trip.arr.at(-1)! < 1800) continue; // placeholder timings in the feed
        if (dir === "out" && /Krung Thep Aphiwat|^SRT Bangkok$/.test(first.name.en)) gtfsSec = trip.start;
        if (dir === "in" && /Krung Thep Aphiwat|^SRT Bangkok$/.test(last.name.en)) gtfsSec = trip.start + trip.arr.at(-1)!;
      }
    }
    const minutes = t.minutes;
    let depart: number;
    if (dir === "out") depart = day0 + (gtfsSec !== null ? gtfsSec * 1000 : hhmmToMin(t.depart!) * MIN);
    else {
      const arriveSec = gtfsSec !== null ? gtfsSec : hhmmToMin(t.arrive!) * 60;
      // the train departs on `date`; its arrival time-of-day may be next morning
      let dep = day0 + arriveSec * 1000 - minutes * MIN;
      while (dep < day0) dep += DAY;
      while (dep >= day0 + DAY) dep -= DAY;
      depart = dep;
    }
    const kindName: Record<string, LocalizedText> = {
      special_express: { th: "รถด่วนพิเศษ", en: "Special Express" },
      express: { th: "รถด่วน", en: "Express" },
      rapid: { th: "รถเร็ว", en: "Rapid" },
      ordinary: { th: "รถธรรมดา", en: "Ordinary" },
    };
    const k = kindName[t.kind];
    out.push({
      mode: "train",
      operator: railData.operator,
      serviceNo: t.no,
      name: { th: `${k.th} ${t.no}`, en: `${k.en} ${t.no}` },
      classLabel: t.class,
      from: dir === "out" ? bangkokPlace : station,
      to: dir === "out" ? station : bangkokPlace,
      depart,
      arrive: depart + minutes * MIN,
      fare: t.fare,
      fareHigh: t.fareHigh,
      comfort: t.comfort,
      source: railSource(gtfsSec !== null),
    });
  }
  return out;
}

function busFallback(fromCity: string, toCity: string, date: string): IntercityService[] {
  const day0 = bkkTime(date);
  return busData.services
    .filter((s) => s.from === fromCity && s.to === toCity)
    .flatMap((s) =>
      s.departures.map((hhmm) => {
        const depart = day0 + hhmmToMin(hhmm) * MIN;
        return {
          mode: s.mode as Mode,
          operator: s.operator,
          serviceNo: `${s.mode === "van" ? "EV" : "NS"}${hhmm.replace(":", "")}`,
          name: { th: `${s.fromStop.th} → ${s.toStop.th}`, en: `${s.fromStop.en} → ${s.toStop.en}` },
          classLabel: s.class,
          from: { id: `g:${s.fromStop.lat},${s.fromStop.lon}`, name: { th: s.fromStop.th, en: s.fromStop.en }, lat: s.fromStop.lat, lon: s.fromStop.lon, city: fromCity },
          to: { id: `g:${s.toStop.lat},${s.toStop.lon}`, name: { th: s.toStop.th, en: s.toStop.en }, lat: s.toStop.lat, lon: s.toStop.lon, city: toCity },
          depart,
          arrive: depart + s.minutes * MIN,
          fare: s.fare,
          fareHigh: s.fareHigh,
          comfort: s.comfort,
          source: busFallbackSource(),
        };
      }),
    );
}

export class GtfsTransitProvider implements TransitProvider {
  source(): Source {
    return gtfsSource(loadGtfs());
  }
  network() {
    return loadGtfs();
  }
  async intercity(fromCity: string, toCity: string, date: string): Promise<IntercityService[]> {
    const net = loadGtfs();
    const trains = rail(net, fromCity, toCity, date);
    let buses = net ? gtfsCoaches(net, fromCity, toCity, date) : [];
    const fallback = busFallback(fromCity, toCity, date);
    // GTFS has coaches: keep a varied subset; vans from the fallback only if GTFS has none
    if (buses.length > 0) {
      const hasVan = buses.some((b) => b.mode === "van");
      buses = buses.concat(fallback.filter((f) => f.mode === "van" && !hasVan));
    } else buses = fallback;
    return [...trains, ...buses];
  }
}
