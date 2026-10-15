/**
 * Time-dependent earliest-arrival search over the GTFS network (frequency-based and
 * timetabled trips). Equivalent to a single-criterion RAPTOR round-by-round scan,
 * run as Dijkstra with a per-boarding penalty so the result does not over-transfer.
 * Multi-criteria variety (fewer transfers / less walking / cheaper) comes from running
 * it with different mode sets and access modes, then Pareto-filtering in plan.ts.
 */
import { buffers } from "../config";
import type { LatLon } from "../geo";
import type { GtfsMode, GtfsNetwork, GtfsTrip } from "../providers/gtfs";
import { bkkDate, bkkMidnight, bkkWeekday, MIN } from "../time";

export const WALK_M_PER_MIN = 80;
const MAX_WAIT_SEC = 60 * 60;

export interface AccessPoint {
  stop: number;
  /** epoch ms the passenger is ready at the stop */
  at: number;
  /** index into the caller's access-leg list */
  ref: number;
}

export type Segment =
  | { kind: "ride"; trip: GtfsTrip; fromPos: number; toPos: number; board: number; alight: number }
  | { kind: "walk"; fromStop: number; toStop: number; meters: number; start: number; end: number };

export interface CityRoute {
  accessRef: number;
  firstStop: number;
  lastStop: number;
  segments: Segment[];
  /** arrival at the last stop */
  arriveStop: number;
}

type Pred =
  | { kind: "access"; ref: number }
  | { kind: "ride"; trip: number; fromPos: number; toPos: number; board: number; prev: number }
  | { kind: "walk"; from: number; meters: number; start: number };

class MinHeap {
  private a: number[] = [];
  private k: number[] = [];
  get size() {
    return this.a.length;
  }
  push(key: number, val: number) {
    this.k.push(key);
    this.a.push(val);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      [this.k[p], this.k[i]] = [this.k[i], this.k[p]];
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0], this.a[0]];
    const lk = this.k.pop()!;
    const la = this.a.pop()!;
    if (this.a.length > 0) {
      this.k[0] = lk;
      this.a[0] = la;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        [this.k[m], this.k[i]] = [this.k[i], this.k[m]];
        [this.a[m], this.a[i]] = [this.a[i], this.a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Earliest first-stop departure (sec after service-day midnight) ≥ `x`, or null. */
export function nextStart(trip: GtfsTrip, x: number): number | null {
  if (trip.freqs.length === 0) return trip.start >= x ? trip.start : null;
  let best: number | null = null;
  for (const [s, e, h] of trip.freqs) {
    let c: number | null = null;
    if (h <= 0) c = s >= x ? s : null;
    else if (x <= s) c = s;
    else if (x <= e) c = s + Math.ceil((x - s) / h) * h;
    if (c !== null && c <= e + (h <= 0 ? 0 : h) && (best === null || c < best)) best = c;
  }
  return best;
}

/** Latest first-stop departure (sec) ≤ `x`, used for "arrive by" refinement. */
export function headwayAt(trip: GtfsTrip, secOfDay: number): number | null {
  for (const [s, e, h] of trip.freqs) if (secOfDay >= s && secOfDay <= e) return h > 0 ? h : null;
  return null;
}

export interface RouterOptions {
  modes: Set<GtfsMode>;
  access: AccessPoint[];
  /** stop idx → walking metres to the destination */
  egress: Map<number, number>;
  /** extra penalty (minutes) per boarding, per mode */
  boardPenaltyMin?: Partial<Record<GtfsMode, number>>;
}

const DEFAULT_PENALTY: Partial<Record<GtfsMode, number>> = { bus: 6, boat: 4, van: 6 };

export function routeCity(net: GtfsNetwork, opts: RouterOptions): CityRoute | null {
  if (opts.access.length === 0 || opts.egress.size === 0) return null;
  const n = net.stops.length;
  const time = new Float64Array(n).fill(Infinity);
  const cost = new Float64Array(n).fill(Infinity);
  const pred: (Pred | undefined)[] = new Array(n);
  const viaRide = new Uint8Array(n);
  const done = new Uint8Array(n);
  const heap = new MinHeap();
  const penalty = { ...DEFAULT_PENALTY, ...opts.boardPenaltyMin };

  const t0 = Math.min(...opts.access.map((a) => a.at));
  const midnight = bkkMidnight(t0);
  const date = bkkDate(t0);
  const weekday = bkkWeekday(t0);
  const active = new Map<string, boolean>();
  const isActive = (service: string) => {
    let v = active.get(service);
    if (v === undefined) active.set(service, (v = net.isActive(service, date, weekday)));
    return v;
  };

  for (const a of opts.access) {
    if (a.at < time[a.stop]) {
      time[a.stop] = a.at;
      cost[a.stop] = a.at;
      pred[a.stop] = { kind: "access", ref: a.ref };
      heap.push(a.at, a.stop);
    }
  }

  let bestTarget = -1;
  let bestTargetCost = Infinity;
  const relax = (v: number, t: number, c: number, p: Pred, ride: boolean) => {
    if (c < cost[v]) {
      cost[v] = c;
      time[v] = t;
      pred[v] = p;
      viaRide[v] = ride ? 1 : 0;
      heap.push(c, v);
    }
  };

  while (heap.size > 0) {
    const [c, u] = heap.pop();
    if (done[u] || c > cost[u]) continue;
    done[u] = 1;
    if (c > bestTargetCost) break;
    const t = time[u];
    const eg = opts.egress.get(u);
    if (eg !== undefined) {
      const total = c + (eg / WALK_M_PER_MIN) * MIN;
      if (total < bestTargetCost) {
        bestTargetCost = total;
        bestTarget = u;
      }
    }
    const p = pred[u]!;
    // walking transfer (no walk→walk chains)
    if (p.kind !== "walk") {
      for (const [v, m] of net.transfers[u]) {
        const walkMs = (m / WALK_M_PER_MIN) * MIN;
        const dt = viaRide[u] ? Math.max(walkMs, buffers.metroTransfer * MIN) : walkMs;
        relax(v, t + dt, c + dt + 1 * MIN, { kind: "walk", from: u, meters: m, start: t }, false);
      }
    }
    const ready = t + (viaRide[u] ? buffers.metroTransfer * MIN : 0);
    const readySec = (ready - midnight) / 1000;
    const prevTrip = p.kind === "ride" ? p.trip : -1;
    for (const [ti, pos] of net.stopTrips[u]) {
      if (ti === prevTrip) continue;
      const trip = net.trips[ti];
      const route = net.routes.get(trip.route);
      if (!route || !opts.modes.has(route.mode) || !isActive(trip.service)) continue;
      const start = nextStart(trip, readySec - trip.dep[pos]);
      if (start === null) continue;
      const boardSec = start + trip.dep[pos];
      if (boardSec - readySec > MAX_WAIT_SEC) continue;
      const board = midnight + boardSec * 1000;
      const pen = (3 + (penalty[route.mode] ?? 0)) * MIN;
      for (let k = pos + 1; k < trip.stops.length; k++) {
        const arr = midnight + (start + trip.arr[k]) * 1000;
        const v = trip.stops[k];
        relax(v, arr, c + (arr - t) + pen, { kind: "ride", trip: ti, fromPos: pos, toPos: k, board, prev: u }, true);
      }
    }
  }
  if (bestTarget < 0) return null;

  // reconstruct
  const segments: Segment[] = [];
  let cur = bestTarget;
  let accessRef = -1;
  for (let guard = 0; guard < 100; guard++) {
    const p = pred[cur]!;
    if (p.kind === "access") {
      accessRef = p.ref;
      break;
    }
    if (p.kind === "ride") {
      segments.unshift({ kind: "ride", trip: net.trips[p.trip], fromPos: p.fromPos, toPos: p.toPos, board: p.board, alight: time[cur] });
      cur = p.prev;
    } else {
      segments.unshift({ kind: "walk", fromStop: p.from, toStop: cur, meters: p.meters, start: p.start, end: time[cur] });
      cur = p.from;
    }
  }
  if (accessRef < 0 || !segments.some((s) => s.kind === "ride")) return null;
  return { accessRef, firstStop: cur, lastStop: bestTarget, segments, arriveStop: time[bestTarget] };
}

/** Stops within `km` of `p` that serve one of `modes`. */
export function stopsNear(net: GtfsNetwork, p: LatLon, km: number, modes: Set<GtfsMode>) {
  return net.grid.near(p, km).filter((n) => n.item.modes.some((m) => modes.has(m)));
}
