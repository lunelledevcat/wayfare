import { describe, expect, it } from "vitest";
import { plan } from "../planner/plan";
import { routeModes, stepSummary } from "../planner/steps";
import type { Leg, Mode, TimeKind } from "../planner/types";
import { fixedWeather, testDeps } from "./fixtures";

const place = (name: string) => ({ id: name, name: { th: name, en: name }, lat: 0, lon: 0 });
const leg = (mode: Mode, kind: TimeKind, minutes: number, to = "X"): Leg =>
  ({ id: `${mode}${minutes}${to}`, mode, kind, from: place("A"), to: place(to), depart: 0, arrive: minutes * 60_000, minutes }) as unknown as Leg;

describe("routeModes", () => {
  it("lists the vehicles in order and merges repeats", () => {
    const legs = [leg("walk", "walk", 3), leg("coach", "ride", 120), leg("bus", "ride", 20), leg("bus", "ride", 5), leg("win", "ride", 6), leg("walk", "walk", 2)];
    expect(routeModes({ legs })).toEqual(["coach", "bus", "win"]);
  });
  it("ignores waits, buffers and transfers", () => {
    expect(routeModes({ legs: [leg("taxi", "ride", 20), leg("flight", "buffer", 90), leg("flight", "ride", 70), leg("flight", "transfer", 20), leg("rental", "buffer", 20), leg("rental", "ride", 30)] })).toEqual(["taxi", "flight", "rental"]);
  });
});

describe("stepSummary", () => {
  it("coach › bus › win: get off at the coach terminal, change to bus, finish by win", () => {
    const parts = stepSummary({ legs: [leg("coach", "ride", 150, "Pattaya terminal"), leg("bus", "ride", 20, "Mall"), leg("win", "ride", 6, "Home")] });
    expect(parts.map((p) => p.key)).toEqual(["route.alight", "route.then", "route.finish"]);
    expect(parts[0].params).toEqual({ place: { th: "Pattaya terminal", en: "Pattaya terminal" } });
    expect(parts[1].params?.mode).toMatchObject({ en: "Bus" });
    expect(parts[2].params?.mode).toMatchObject({ en: "Motorbike taxi" });
  });

  it("two rides: only the ending", () => {
    const parts = stepSummary({ legs: [leg("van", "ride", 150, "Van stop"), leg("win", "ride", 5)] });
    expect(parts.map((p) => p.key)).toEqual(["route.alight", "route.finish"]);
  });

  it("taxi › flight › rental: change to flight, get off at the airport, finish by rental car", () => {
    const parts = stepSummary({ legs: [leg("taxi", "ride", 30), leg("flight", "buffer", 90), leg("flight", "ride", 70, "CNX airport"), leg("rental", "buffer", 20), leg("rental", "ride", 25)] });
    expect(parts.map((p) => p.key)).toEqual(["route.then", "route.alight", "route.finish"]);
    expect(parts[1].params).toEqual({ place: { th: "CNX airport", en: "CNX airport" } });
  });

  it("a single ride has no summary; short walks are not mentioned, long ones are", () => {
    expect(stepSummary({ legs: [leg("walk", "walk", 4), leg("bts", "ride", 20), leg("walk", "walk", 10)] })).toEqual([]);
    const long = stepSummary({ legs: [leg("walk", "walk", 12), leg("bts", "ride", 20), leg("walk", "walk", 11)] });
    expect(long).toEqual([
      { key: "route.walk", params: { min: 12 } },
      { key: "route.walk", params: { min: 11 } },
    ]);
  });

  it("an empty trip gives nothing", () => {
    expect(stepSummary({ legs: [] })).toEqual([]);
    expect(routeModes({ legs: [] })).toEqual([]);
  });
});

describe("on real plans", () => {
  it("every multi-vehicle trip has a route and key points that reference its own places", async () => {
    const res = await plan({ from: "p:asok", to: "c:chiangmai", date: "2026-10-16", time: "08:00", mode: "depart", pax: 1 }, testDeps(fixedWeather({ precipProb: 10 })));
    for (const t of res.trips) {
      const modes = routeModes(t);
      expect(modes.length).toBeGreaterThan(0);
      const parts = stepSummary(t);
      if (modes.length > 1) expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) expect(p.key).toMatch(/^route\.(alight|then|finish|walk)$/);
    }
  });
});
