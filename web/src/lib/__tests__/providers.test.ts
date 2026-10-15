import { afterEach, describe, expect, it, vi } from "vitest";
import { DuffelFlightProvider, modelFare } from "../providers/flights";
import { loadGtfs } from "../providers/gtfs";
import { resolvePlace, searchLocal, searchNominatim } from "../providers/places";
import { OsrmRoadProvider, roadPrice, taxiMeter } from "../providers/road";
import { GtfsTransitProvider } from "../providers/transit";
import { OpenMeteoWeatherProvider, seasonalHours } from "../providers/weather";
import { isHolidayPeriod } from "../holidays";
import { bkkTime } from "../time";

describe("GTFS import (สนข.)", () => {
  const net = loadGtfs()!;
  it("has routes, trips, stops and stop times for every mode", () => {
    expect(net).not.toBeNull();
    expect(net.meta.counts.routes).toBeGreaterThan(2000);
    expect(net.trips.length).toBeGreaterThan(4000);
    expect(net.stops.length).toBeGreaterThan(10000);
    const modes = new Set([...net.routes.values()].map((r) => r.mode));
    for (const m of ["bts", "mrt", "arl", "red", "train", "bus", "coach", "van", "boat"]) expect(modes.has(m as never)).toBe(true);
  });
  it("prices a BTS ride from the published fare table", () => {
    const asok = net.stops.find((s) => s.name.en === "BTS Asok")!;
    const siam = net.stops.find((s) => s.name.en === "BTS Siam")!;
    expect(net.zoneFare("BTSC", "", asok.idx, siam.idx)).toBeGreaterThan(15);
  });
  it("finds real coach and train services Bangkok → Chiang Mai", async () => {
    const list = await new GtfsTransitProvider().intercity("bangkok", "chiangmai", "2026-10-16");
    expect(list.some((s) => s.mode === "coach" && s.source.id === "otp-gtfs")).toBe(true);
    expect(list.filter((s) => s.mode === "train").length).toBeGreaterThanOrEqual(4);
  });
});

describe("flights", () => {
  it("falls back to the schedule model without a Duffel token", async () => {
    delete process.env.DUFFEL_TEST_TOKEN;
    const offers = await new DuffelFlightProvider().search(["DMK", "BKK"], ["CNX"], "2026-10-16", "2026-10-15");
    expect(offers.length).toBeGreaterThan(5);
    expect(offers.every((o) => o.source.fallback && o.source.estimate)).toBe(true);
  });
  it("prices weekends, holidays and last-minute higher", () => {
    expect(modelFare(1290, "2026-10-23", "08:35", "2026-10-01")).toBeGreaterThan(modelFare(1290, "2026-10-21", "08:35", "2026-10-01"));
    expect(modelFare(1290, "2026-10-21", "08:35", "2026-10-20")).toBeGreaterThan(modelFare(1290, "2026-10-21", "08:35", "2026-09-01"));
    expect(isHolidayPeriod("2026-10-24")).toBe(true);
  });
});

describe("road", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("falls back to a straight-line estimate when OSRM is down", async () => {
    const r = await new OsrmRoadProvider().route({ lat: 13.7372, lon: 100.5606 }, { lat: 13.69, lon: 100.7501 });
    expect(r.source.fallback).toBe(true);
    expect(r.km).toBeGreaterThan(20);
  });
  it("uses the Bangkok taxi meter formula", () => {
    expect(taxiMeter(1, 3, 3)).toBe(35);
    expect(taxiMeter(10, 20, 20)).toBeCloseTo(35 + 9 * 6.5);
    expect(roadPrice("win", 1.5, 5, 5, bkkTime("2026-10-16", "12:00")).amount).toBe(25);
  });
});

describe("weather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WEATHER_OFFLINE = "1";
  });
  it("uses seasonal averages when Open-Meteo is unreachable", async () => {
    delete process.env.WEATHER_OFFLINE;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const t = Date.now() + 3600_000;
    const w = await new OpenMeteoWeatherProvider().hourly({ id: "x", name: { th: "x", en: "x" }, lat: 13.7, lon: 100.5 }, t, t + 6 * 3600_000);
    expect(w.forecastAvailable).toBe(false);
    expect(w.source.fallback).toBe(true);
    expect(w.hours.length).toBeGreaterThan(5);
  });
  it("parses an Open-Meteo response", async () => {
    delete process.env.WEATHER_OFFLINE;
    const now = new Date(Date.now() + 7 * 3600_000);
    const day = now.toISOString().slice(0, 10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("air-quality")
            ? { hourly: { time: [`${day}T17:00`], pm2_5: [62] } }
            : { hourly: { time: [`${day}T17:00`], precipitation_probability: [80], precipitation: [2], temperature_2m: [29], apparent_temperature: [35], weather_code: [63], wind_speed_10m: [10], wind_gusts_10m: [30] } },
      })),
    );
    const w = await new OpenMeteoWeatherProvider().hourly({ id: "y", name: { th: "y", en: "y" }, lat: 14.1, lon: 100.9 }, bkkTime(day, "17:00"), bkkTime(day, "17:30"));
    expect(w.forecastAvailable).toBe(true);
    expect(w.hours[0]).toMatchObject({ precipProb: 80, pm25: 62, code: 63 });
  });
  it("seasonal model is wetter in the October evening than the January morning", () => {
    const p = { lat: 13.75, lon: 100.5 };
    const oct = seasonalHours(p, bkkTime("2026-10-20", "17:00"), bkkTime("2026-10-20", "17:00"))[0];
    const jan = seasonalHours(p, bkkTime("2027-01-20", "08:00"), bkkTime("2027-01-20", "08:00"))[0];
    expect(oct.precipProb).toBeGreaterThan(jan.precipProb);
  });
});

describe("places", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("resolves tokens and autocompletes stations in Thai and English", () => {
    expect(resolvePlace("p:asok")?.name.th).toBe("อโศก");
    expect(resolvePlace("air:DMK")?.city).toBe("bangkok");
    expect(resolvePlace("g:13.7,100.5,Home")?.name.en).toBe("Home");
    expect(searchLocal("สยาม").length).toBeGreaterThan(0);
    expect(searchLocal("chiang mai")[0].name.en).toMatch(/Chiang Mai/);
  });
  it("Nominatim failure returns no results instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await searchNominatim("some street", "th")).toEqual([]);
  });
});
