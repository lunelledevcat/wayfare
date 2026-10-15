/**
 * Per-viewer snapshot of booked trips (planner details the chain does not store: places,
 * weather at booking time). Tickets themselves always come from the chain; this is only used
 * for weather-change alerts and nicer labels, and the app works without it.
 */
import type { Mode, PlanQuery } from "./planner/types";

export interface TripSnapshot {
  chainTripId: string;
  chainId: number;
  plannerTripId: string;
  query: PlanQuery;
  bookedAt: number;
  points: { legId: string; mode: Mode; kind: string; at: number; until: number; lat: number; lon: number; name: string; outdoor: boolean; precipProb: number | null }[];
}

const KEY = "wayfare.trips.v1";

export function loadSnapshots(): TripSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TripSnapshot[];
  } catch {
    return [];
  }
}

export function saveSnapshot(s: TripSnapshot) {
  try {
    const all = loadSnapshots().filter((x) => !(x.chainTripId === s.chainTripId && x.chainId === s.chainId));
    all.push(s);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-30)));
  } catch {
    /* storage unavailable — alerts just won't show */
  }
}
