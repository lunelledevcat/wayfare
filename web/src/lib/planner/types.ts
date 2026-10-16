import type { CarOptions } from "../car";

/** Shared types for the Wayfare trip planner (server + client). */

export type LocalizedText = { th: string; en: string; zh?: string; ja?: string };

/** A message the UI translates: `key` lives in messages/*.json under "msg". */
export type MsgParam = string | number | LocalizedText;
export type MsgRef = { key: string; params?: Record<string, MsgParam> };

export type Mode =
  | "walk"
  | "bts"
  | "mrt"
  | "arl"
  | "red"
  | "train"
  | "bus"
  | "coach"
  | "van"
  | "boat"
  | "flight"
  | "taxi"
  | "grab"
  | "win"
  | "car"
  | "rental";

/** Time categories every minute of a trip is assigned to. */
export type TimeKind = "walk" | "wait" | "ride" | "transfer" | "buffer";

export type Priority = "fastest" | "cheapest" | "value" | "comfort";
export const PRIORITIES: Priority[] = ["fastest", "cheapest", "value", "comfort"];

export interface Source {
  id: string;
  name: string;
  url: string;
  updatedAt: string;
  /** Data came from a fallback (the live source was unavailable). */
  fallback?: boolean;
  /** Value is an estimate (modelled price or time). */
  estimate?: boolean;
}

export interface PlaceRef {
  id: string;
  name: LocalizedText;
  lat: number;
  lon: number;
  city?: string;
  detail?: LocalizedText;
}

export interface WeatherAt {
  time: number;
  precipProb: number;
  precipMm: number;
  tempC: number;
  feelsC: number;
  code: number;
  windKmh: number;
  gustKmh: number;
  pm25?: number;
  /** true when no forecast exists for this time and a seasonal average was used */
  seasonal?: boolean;
}

export type WarningLevel = "info" | "caution" | "avoid";

export interface Alternative {
  /** id of a sibling trip that avoids the problem */
  tripId?: string;
  mode?: Mode;
  deltaPrice?: number;
  message: MsgRef;
}

export interface Warning {
  code: string;
  level: WarningLevel;
  message: MsgRef;
  legId?: string;
  alternative?: Alternative;
}

export interface Price {
  /** THB per passenger */
  amount: number;
  low: number;
  high: number;
  estimate: boolean;
}

export interface Bookable {
  operator: string;
  serviceNo: string;
  serviceId: string;
  refundDeadline: number;
  cancelFeeBps: number;
  label: string;
}

export interface Leg {
  id: string;
  mode: Mode;
  kind: TimeKind;
  from: PlaceRef;
  to: PlaceRef;
  depart: number;
  arrive: number;
  minutes: number;
  distanceKm?: number;
  price: Price;
  payOnSite: boolean;
  bookable?: Bookable;
  line?: {
    name: LocalizedText;
    short?: string;
    color?: string | null;
    headsign?: LocalizedText;
    stops?: number;
    agency?: string;
    classLabel?: LocalizedText;
  };
  reliability: { level: "high" | "medium" | "low"; plusMinusMin: number };
  instruction: MsgRef;
  path: [number, number][];
  source: Source;
  weather?: WeatherAt;
  /** passenger is exposed to the weather during this leg */
  outdoor: boolean;
  seated: boolean;
  aircon: boolean;
  /** multiplier applied to road time due to weather (1 = none) */
  weatherSlowdown?: number;
}

export interface TimeBreakdown {
  walk: number;
  wait: number;
  ride: number;
  transfer: number;
  buffer: number;
}

export interface Trip {
  id: string;
  scope: "city" | "intercity";
  legs: Leg[];
  depart: number;
  arrive: number;
  minutes: number;
  breakdown: TimeBreakdown;
  /** THB per passenger */
  cost: { amount: number; low: number; high: number; onChain: number; onSite: number; estimate: boolean };
  transfers: number;
  walkMin: number;
  modes: Mode[];
  /** main (longest) mode used for labels and filters */
  mainMode: Mode;
  /** 0 (no risk) .. 1 (severe) */
  weatherRisk: number;
  comfort: number;
  co2Kg: number;
  reliability: { level: "high" | "medium" | "low"; plusMinusMin: number };
  warnings: Warning[];
  /** trip is excluded from the recommended ranking (e.g. motorbike in heavy rain) */
  notRecommended: boolean;
  refund: { kind: "none" | "partial" | "full"; feeBps?: number; deadlineHours?: number };
  /** key identifying the non-road core of the trip, used to pair alternatives */
  coreKey: string;
}

export interface PlanQuery {
  /** own-car and rental-car options (see lib/car.ts) */
  car: CarOptions;
  from: string;
  to: string;
  /** YYYY-MM-DD in Asia/Bangkok */
  date: string;
  /** HH:MM */
  time: string;
  mode: "depart" | "arrive";
  pax: number;
}

export interface Preferences {
  priority: Priority;
  avoidWin: boolean;
  maxWalkMin: number | null;
  bigLuggage: boolean;
  budget: number | null;
  pax: number;
  /** ฿ per hour, used by "value" */
  timeValue: number;
  modes: Mode[] | null;
}

export interface HourlyWeather {
  place: PlaceRef;
  hours: WeatherAt[];
  source: Source;
  forecastAvailable: boolean;
}

export interface PriceDay {
  date: string;
  /** cheapest total per passenger for trips similar to the reference trip */
  amount: number | null;
  /** cheapest trip of any kind */
  cheapest: number | null;
  holiday: boolean;
}

export interface PlanResult {
  query: PlanQuery;
  from: PlaceRef;
  to: PlaceRef;
  scope: "city" | "intercity";
  trips: Trip[];
  weather: { origin: HourlyWeather; destination: HourlyWeather };
  priceCalendar: { reference: Mode; days: PriceDay[] };
  betterDeparture?: { time: string; precipProb: number; currentProb: number };
  sources: Source[];
  generatedAt: string;
  tookMs: number;
}
