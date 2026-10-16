import { describe, expect, it } from "vitest";
import { CAR_DEFAULTS, carFromParams, carRunningCost, carToParams, fuelCost, normalizeCar, perPassenger, tollCost } from "../car";
import { plan } from "../planner/plan";
import { rentalPrice } from "../rental";
import type { Leg, Trip } from "../planner/types";
import { fixedWeather, testDeps } from "./fixtures";

describe("car options", () => {
  it("normalises and clamps values", () => {
    expect(normalizeCar(undefined)).toEqual(CAR_DEFAULTS);
    expect(normalizeCar({ kmPerL: 0, fuelPrice: 9999, parking: -5, rentDays: 99.4 })).toMatchObject({ kmPerL: 3, fuelPrice: 100, parking: 0, rentDays: 30 });
    expect(normalizeCar({ kmPerL: NaN as number }).kmPerL).toBe(CAR_DEFAULTS.kmPerL);
  });

  it("puts only non-default values in the URL and reads them back", () => {
    expect(carToParams(CAR_DEFAULTS)).toEqual({});
    const c = normalizeCar({ own: true, kmPerL: 18, fuelPrice: 41.5, tolls: false, parking: 100, rentDays: 3 });
    expect(carToParams(c)).toEqual({ car: "1", kmpl: "18", fuel: "41.5", toll: "0", park: "100", rent: "3" });
    expect(carFromParams(new URLSearchParams(carToParams(c)))).toEqual(c);
    expect(carFromParams({ car: "1", rent: "2" })).toEqual({ ...CAR_DEFAULTS, own: true, rentDays: 2 });
    expect(carFromParams({})).toEqual(CAR_DEFAULTS);
  });

  it("fuel = km / (km per litre) × price; tolls ฿60 per 100 km only above 15 km and when enabled", () => {
    expect(fuelCost(135, CAR_DEFAULTS)).toBeCloseTo((135 / 13.5) * 38);
    expect(tollCost(15, CAR_DEFAULTS)).toBe(0);
    expect(tollCost(100, CAR_DEFAULTS)).toBeCloseTo(60);
    expect(tollCost(100, { ...CAR_DEFAULTS, tolls: false })).toBe(0);
    const run = carRunningCost(100, CAR_DEFAULTS);
    expect(run.total).toBeCloseTo(run.fuel + 60 + 60);
  });

  it("splits one car's cost between passengers (5 seats per car)", () => {
    expect(perPassenger(600, 1)).toBe(600);
    expect(perPassenger(600, 2)).toBe(300);
    expect(perPassenger(600, 5)).toBe(120);
    expect(perPassenger(600, 6)).toBe(200); // two cars
  });
});

const dry = testDeps(fixedWeather({ precipProb: 10 }));
const base = { date: "2026-10-16", time: "08:00", mode: "depart" as const };
const carTrips = (trips: Trip[]) => trips.filter((t) => t.mainMode === "car");
const carLeg = (t: Trip) => t.legs.find((l) => l.mode === "car")!;
const rentalDriveOf = (t: Trip) => t.legs.find((l) => l.mode === "rental" && l.kind === "ride")!;
const pickupOf = (t: Trip) => t.legs.find((l) => l.mode === "rental" && l.kind === "buffer")!;
const expected = (leg: Leg, car = CAR_DEFAULTS, pax = 1) => {
  const r = carRunningCost(leg.distanceKm!, car);
  return Math.round(perPassenger(r.fuel, pax)) + Math.round(perPassenger(r.toll, pax)) + Math.round(perPassenger(r.parking, pax));
};

describe("own car", () => {
  it("is offered only when own=true", async () => {
    const off = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1 }, dry);
    expect(carTrips(off.trips)).toHaveLength(0);
    const on = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1, car: { own: true } }, dry);
    expect(carTrips(on.trips).length).toBeGreaterThan(0);
  });

  it("price = fuel + tolls + parking, and the step text carries the breakdown", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1, car: { own: true } }, dry);
    const leg = carLeg(carTrips(res.trips)[0]);
    expect(leg.price.amount).toBe(expected(leg));
    expect(leg.instruction.key).toBe("step.car"); // 20+ km → tolls apply
    expect(leg.instruction.params).toMatchObject({ fuel: expect.any(Number), toll: expect.any(Number), parking: 60 });
    const custom = { own: true, kmPerL: 20, fuelPrice: 45, tolls: false, parking: 150 };
    const res2 = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1, car: custom }, dry);
    const leg2 = carLeg(carTrips(res2.trips)[0]);
    expect(leg2.price.amount).toBe(expected(leg2, normalizeCarFull(custom)));
    expect(leg2.instruction.key).toBe("step.carNoToll");
  });

  it("two passengers pay half each", async () => {
    const one = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1, car: { own: true } }, dry);
    const two = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 2, car: { own: true } }, dry);
    const p1 = carLeg(carTrips(one.trips)[0]).price.amount;
    const p2 = carLeg(carTrips(two.trips)[0]).price.amount;
    expect(Math.abs(p2 * 2 - p1)).toBeLessThanOrEqual(3);
  });

  it("is offered for intercity trips too", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1, car: { own: true } }, dry);
    expect(res.scope).toBe("intercity");
    expect(carTrips(res.trips).length).toBeGreaterThan(0);
  });
});

function normalizeCarFull(c: Parameters<typeof normalizeCar>[0]) {
  return normalizeCar(c);
}

describe("rental car", () => {
  it("Asok → Chiang Mai: hire car collected at the destination after flight / train / coach", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1 }, dry);
    const dest = res.trips.filter((t) => t.mainMode !== "rental" && t.legs.some((l) => l.mode === "rental"));
    expect(dest.length).toBeGreaterThan(0);
    const t = dest[0];
    const pickup = pickupOf(t);
    expect(pickup.minutes).toBe(20);
    expect(pickup.price.estimate).toBe(true);
    expect(rentalDriveOf(t).depart).toBeGreaterThanOrEqual(pickup.arrive - 1000);
  });

  it("without a car of your own the door-to-door drive is a hire car from the origin city", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1 }, dry);
    expect(carTrips(res.trips)).toHaveLength(0);
    const d2d = res.trips.filter((t) => t.mainMode === "rental");
    expect(d2d.length).toBeGreaterThan(0);
    expect(d2d[0].legs.map((l) => l.kind)).toEqual(["buffer", "ride"]);
    expect(pickupOf(d2d[0]).from.id).toBe("p:asok");
  });

  it("with an own car the door-to-door drive is the own car, not a hire car", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1, car: { own: true } }, dry);
    expect(res.trips.filter((t) => t.mainMode === "rental")).toHaveLength(0);
    expect(carTrips(res.trips).length).toBeGreaterThan(0);
  });

  it("each extra rental day adds one day rate", async () => {
    const one = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1, car: { rentDays: 1 } }, dry);
    const three = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1, car: { rentDays: 3 } }, dry);
    const rent = (r: typeof one) => pickupOf(r.trips.find((t) => t.mainMode === "rental")!).price.amount;
    expect(rent(three) - rent(one)).toBe(2 * rentalPrice("bangkok", 1).amount);
    const total = (r: typeof one) => r.trips.find((t) => t.mainMode === "rental")!.cost.amount;
    expect(total(three) - total(one)).toBe(2 * rentalPrice("bangkok", 1).amount);
  });

  it("is offered in provincial cities without a metro for 8 km or more, never in Bangkok", async () => {
    const cm = await plan({ ...base, from: "g:18.80000,98.98000,A", to: "g:18.70000,99.05000,B", pax: 1 }, dry);
    expect(cm.scope).toBe("city");
    expect(cm.trips.some((t) => t.mainMode === "rental")).toBe(true);
    const near = await plan({ ...base, from: "g:18.80000,98.98000,A", to: "g:18.81500,98.99000,B", pax: 1 }, dry);
    expect(near.trips.some((t) => t.mainMode === "rental")).toBe(false);
    const bkk = await plan({ ...base, from: "p:asok", to: "p:bkk", pax: 1 }, dry);
    expect(bkk.trips.some((t) => t.legs.some((l) => l.mode === "rental"))).toBe(false);
  });

  it("is labelled as an estimate", async () => {
    const res = await plan({ ...base, from: "p:asok", to: "c:chiangmai", pax: 1 }, dry);
    const t = res.trips.find((x) => x.mainMode === "rental")!;
    expect(t.cost.estimate).toBe(true);
    expect(pickupOf(t).source.estimate).toBe(true);
  });
});

describe("current location", () => {
  it("plans from a g: token", async () => {
    const res = await plan({ ...base, from: "g:13.74400,100.56300,ตำแหน่งปัจจุบัน", to: "p:siam", pax: 1 }, dry);
    expect(res.trips.length).toBeGreaterThan(0);
    expect(res.from.name.th).toBe("ตำแหน่งปัจจุบัน");
    expect(res.from.city).toBe("bangkok");
  });
});
