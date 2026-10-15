import { describe, expect, it } from "vitest";
import { buffers } from "../config";
import { plan } from "../planner/plan";
import { bestByPriority, DEFAULT_PREFS, rankTrips, score } from "../planner/scoring";
import type { Preferences, Trip } from "../planner/types";
import { bkkTime, MIN } from "../time";
import { fixedWeather, testDeps } from "./fixtures";

const dry = testDeps(fixedWeather({ precipProb: 10 }));
const rainy = testDeps(fixedWeather({ precipProb: 80, precipMm: 2.5, code: 63 }));
const prefs = (p: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFS, ...p });
const byId = (trips: Trip[], id?: string) => trips.find((t) => t.id === id)!;

describe("Bangkok (Asok) → Chiang Mai", async () => {
  const res = await plan({ from: "p:asok", to: "c:chiangmai", date: "2026-10-16", time: "07:00", mode: "depart", pax: 1 }, dry);

  it("is an intercity search with flight, train and coach options", () => {
    expect(res.scope).toBe("intercity");
    const modes = new Set(res.trips.map((t) => t.mainMode));
    expect(modes.has("flight")).toBe(true);
    expect(modes.has("train")).toBe(true);
    expect(modes.has("coach")).toBe(true);
    const flight = res.trips.find((t) => t.mainMode === "flight")!;
    const airport = flight.legs.find((l) => l.mode === "flight")!.from.id;
    expect(["air:DMK", "air:BKK"]).toContain(airport);
  });

  it("labels fastest and cheapest correctly", () => {
    const best = bestByPriority(res.trips, prefs());
    const pool = res.trips.filter((t) => !t.notRecommended);
    const fastest = byId(res.trips, best.fastest);
    const cheapest = byId(res.trips, best.cheapest);
    expect(fastest.mainMode).toBe("flight");
    expect(fastest.minutes).toBe(Math.min(...pool.map((t) => t.minutes)));
    expect(cheapest.cost.amount).toBe(Math.min(...pool.map((t) => t.cost.amount)));
    expect(["train", "coach"]).toContain(cheapest.mainMode);
  });

  it("every trip is door-to-door, contiguous and itemised", () => {
    for (const t of res.trips) {
      for (let i = 1; i < t.legs.length; i++) expect(t.legs[i].depart).toBeGreaterThanOrEqual(t.legs[i - 1].arrive - MIN);
      const sum = Object.values(t.breakdown).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - t.minutes)).toBeLessThanOrEqual(3);
    }
  });

  it("keeps the minimum buffers before flights and trains", () => {
    for (const t of res.trips) {
      const core = t.legs.findIndex((l) => l.bookable);
      if (core < 0) continue;
      const buf = t.legs[core - 1];
      expect(buf.kind).toBe("buffer");
      const need = t.legs[core].mode === "flight" ? buffers.flightDomestic : buffers.train;
      expect(buf.minutes).toBeGreaterThanOrEqual(need - 0.01);
    }
  });

  it("builds a 7-day price calendar with flight prices that vary by day", () => {
    expect(res.priceCalendar.days).toHaveLength(7);
    const amounts = res.priceCalendar.days.map((d) => d.amount).filter((x): x is number => x !== null);
    expect(new Set(amounts).size).toBeGreaterThan(1);
  });
});

describe("priority changes the order", async () => {
  const res = await plan({ from: "p:asok", to: "c:chiangmai", date: "2026-10-16", time: "07:00", mode: "depart", pax: 2 }, dry);
  it("fastest sorts by door-to-door minutes, cheapest by total cost", () => {
    const fast = rankTrips(res.trips, prefs({ priority: "fastest", pax: 2 })).filter((t) => !t.notRecommended);
    const cheap = rankTrips(res.trips, prefs({ priority: "cheapest", pax: 2 })).filter((t) => !t.notRecommended);
    for (let i = 1; i < fast.length; i++) expect(fast[i].minutes).toBeGreaterThanOrEqual(fast[i - 1].minutes);
    for (let i = 1; i < cheap.length; i++) expect(cheap[i].cost.amount).toBeGreaterThanOrEqual(cheap[i - 1].cost.amount);
    expect(fast[0].id).not.toBe(cheap[0].id);
  });
  it("value weighs time money; comfort prefers fewer transfers", () => {
    const p = prefs({ priority: "value", timeValue: 2000 });
    const v = rankTrips(res.trips, p)[0];
    expect(v.mainMode).toBe("flight");
    const c = rankTrips(res.trips, prefs({ priority: "comfort" }));
    expect(score(c[0], "comfort", prefs())).toBeLessThanOrEqual(score(c.at(-1)!, "comfort", prefs()));
  });
  it("filters remove motorbike taxis and respect the budget", () => {
    const f = rankTrips(res.trips, prefs({ avoidWin: true, budget: 1500, pax: 2 }));
    expect(f.every((t) => !t.modes.includes("win") && t.cost.amount * 2 <= 1500)).toBe(true);
  });
});

describe("weather-aware recommendations", () => {
  it("80% rain: motorbike taxi is 'not recommended' with an alternative", async () => {
    const res = await plan({ from: "p:asok", to: "p:siam", date: "2026-10-16", time: "17:00", mode: "depart", pax: 1 }, rainy);
    const win = res.trips.find((t) => t.modes.includes("win"))!;
    expect(win).toBeDefined();
    expect(win.notRecommended).toBe(true);
    const w = win.warnings.find((x) => x.code === "win.rain" || x.code === "win.heavyRain")!;
    expect(w.level).toBe("avoid");
    expect(w.message.params?.prob).toBe(80);
    expect(w.alternative?.tripId).toBeDefined();
    const alt = byId(res.trips, w.alternative!.tripId);
    expect(alt.notRecommended).toBe(false);
    expect(alt.modes.includes("win")).toBe(false);
    // the recommended ranking never puts it first
    expect(rankTrips(res.trips, prefs({ priority: "cheapest" }))[0].modes.includes("win")).toBe(false);
  });

  it("10% rain: no weather warnings", async () => {
    const res = await plan({ from: "p:asok", to: "p:siam", date: "2026-10-16", time: "11:00", mode: "depart", pax: 1 }, dry);
    expect(res.trips.flatMap((t) => t.warnings).filter((w) => w.code.startsWith("win") || w.code.startsWith("walk.umbrella"))).toHaveLength(0);
    expect(res.trips.some((t) => t.notRecommended)).toBe(false);
  });
});

describe("arrive-by mode", () => {
  it("computes the leave time so every trip arrives before the deadline", async () => {
    const deadline = bkkTime("2026-10-16", "18:00");
    const res = await plan({ from: "p:siam", to: "p:bkk", date: "2026-10-16", time: "18:00", mode: "arrive", pax: 1 }, dry);
    expect(res.trips.length).toBeGreaterThan(2);
    for (const t of res.trips) {
      expect(t.arrive).toBeLessThanOrEqual(deadline + MIN);
      expect(t.depart).toBe(t.legs[0].depart);
      expect(deadline - t.arrive).toBeLessThan(40 * MIN);
    }
  });

  it("intercity arrive-by respects airport buffers", async () => {
    const res = await plan({ from: "p:asok", to: "p:cnx-oldcity", date: "2026-10-16", time: "15:00", mode: "arrive", pax: 1 }, dry);
    const flight = res.trips.find((t) => t.mainMode === "flight")!;
    expect(flight.arrive).toBeLessThanOrEqual(bkkTime("2026-10-16", "15:00") + MIN);
    const i = flight.legs.findIndex((l) => l.mode === "flight" && l.kind === "ride");
    expect(flight.legs[i].depart - flight.legs[i - 1].depart, flight.legs.map((l) => `${l.kind}/${l.mode}`).join(" ")).toBeGreaterThanOrEqual(buffers.flightDomestic * MIN);
  });

  it("no metro transfer is shorter than the minimum connection time", async () => {
    const res = await plan({ from: "p:asok", to: "p:grandpalace", date: "2026-10-16", time: "10:00", mode: "depart", pax: 1 }, dry);
    for (const t of res.trips) {
      const rides = t.legs.filter((l) => l.kind === "ride");
      for (let i = 1; i < rides.length; i++) {
        const metro = ["bts", "mrt", "arl", "red"];
        if (metro.includes(rides[i].mode) && metro.includes(rides[i - 1].mode)) expect(rides[i].depart - rides[i - 1].arrive).toBeGreaterThanOrEqual(buffers.metroTransfer * MIN - 1000);
      }
    }
  });
});
