/**
 * Ranking by user priority. Pure and dependency-free so the client can re-rank
 * instantly when the priority or filters change (no reload, no refetch).
 */
import { DEFAULT_TIME_VALUE } from "../config";
import type { Preferences, Priority, Trip } from "./types";

export const DEFAULT_PREFS: Preferences = {
  priority: "value",
  avoidWin: false,
  maxWalkMin: null,
  bigLuggage: false,
  budget: null,
  pax: 1,
  timeValue: DEFAULT_TIME_VALUE,
  modes: null,
};

const LUGGAGE_WALK_FACTOR = 1.3;

/** Walking minutes as experienced with the current preferences. */
export const effectiveWalk = (t: Trip, p: Preferences) => (p.bigLuggage ? t.walkMin * LUGGAGE_WALK_FACTOR : t.walkMin);

/** Trips that satisfy the filters. */
export function applyFilters(trips: Trip[], p: Preferences): Trip[] {
  return trips.filter((t) => {
    if ((p.avoidWin || p.bigLuggage) && t.modes.includes("win")) return false;
    if (p.bigLuggage && t.modes.includes("boat")) return false;
    if (p.maxWalkMin !== null && effectiveWalk(t, p) > p.maxWalkMin) return false;
    if (p.budget !== null && t.cost.amount * p.pax > p.budget) return false;
    if (p.modes && p.modes.length > 0 && !t.modes.some((m) => p.modes!.includes(m))) return false;
    return true;
  });
}

/** Lower is better. */
export function score(t: Trip, priority: Priority, p: Preferences): number {
  const total = t.cost.amount * p.pax;
  switch (priority) {
    case "fastest":
      return t.minutes + total / 100000;
    case "cheapest":
      return total + t.minutes / 10000;
    case "value":
      // money + time valued at ฿/h + a price on weather risk and transfers
      return total + (t.minutes / 60) * p.timeValue * p.pax + t.weatherRisk * 250 * p.pax + t.transfers * 15 * p.pax;
    case "comfort": {
      const luggage = p.bigLuggage ? (t.walkMin * (LUGGAGE_WALK_FACTOR - 1)) * 0.8 + t.transfers * 6 : 0;
      return -(t.comfort - luggage) + t.minutes / 600;
    }
  }
}

export function rankTrips(trips: Trip[], p: Preferences): Trip[] {
  return applyFilters(trips, p).sort((a, b) => {
    if (a.notRecommended !== b.notRecommended) return a.notRecommended ? 1 : -1;
    return score(a, p.priority, p) - score(b, p.priority, p);
  });
}

/** Best trip id for every priority (among recommended, filtered trips). */
export function bestByPriority(trips: Trip[], p: Preferences): Partial<Record<Priority, string>> {
  const pool = applyFilters(trips, p).filter((t) => !t.notRecommended);
  const out: Partial<Record<Priority, string>> = {};
  for (const pr of ["fastest", "cheapest", "value", "comfort"] as Priority[]) {
    const best = pool.slice().sort((a, b) => score(a, pr, p) - score(b, pr, p))[0];
    if (best) out[pr] = best.id;
  }
  return out;
}

/** Short reasons comparing the winner with the best trip of another main mode. */
export function reasonFor(winner: Trip, trips: Trip[], p: Preferences) {
  const rival = trips
    .filter((t) => t.id !== winner.id && t.mainMode !== winner.mainMode && !t.notRecommended)
    .sort((a, b) => score(a, p.priority, p) - score(b, p.priority, p))[0];
  if (!rival) return null;
  return {
    rivalMode: rival.mainMode,
    minutesSaved: rival.minutes - winner.minutes,
    priceDiff: (winner.cost.amount - rival.cost.amount) * p.pax,
    weatherOk: winner.weatherRisk < 0.3,
  };
}
