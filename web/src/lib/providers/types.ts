import type { LatLon } from "../geo";
import type { HourlyWeather, LocalizedText, Mode, PlaceRef, Source } from "../planner/types";
import type { GtfsNetwork } from "./gtfs";

/** City transit (GTFS) and intercity rail/coach schedules. */
export interface TransitProvider {
  source(): Source;
  network(): GtfsNetwork | null;
  intercity(fromCity: string, toCity: string, date: string): Promise<IntercityService[]>;
}

export interface IntercityService {
  mode: Mode; // train | coach | van | boat
  operator: string; // fictional demo operator that sells the ticket on chain
  serviceNo: string;
  name: LocalizedText;
  classLabel?: LocalizedText;
  from: PlaceRef;
  to: PlaceRef;
  depart: number;
  arrive: number;
  fare: number;
  fareHigh: number;
  comfort: number; // 1..4
  stops?: number;
  source: Source;
}

export interface FlightOffer {
  carrier: string;
  operator: string;
  flightNo: string;
  from: PlaceRef & { code: string };
  to: PlaceRef & { code: string };
  depart: number;
  arrive: number;
  fare: number;
  fareLow: number;
  fareHigh: number;
  source: Source;
}

export interface FlightProvider {
  search(fromCodes: string[], toCodes: string[], date: string, searchDate: string): Promise<FlightOffer[]>;
  /** Modelled price for another date (used for the 7-day price graph). */
  priceOn(offer: FlightOffer, date: string, searchDate: string): number;
}

export interface RoadRoute {
  km: number;
  /** free-flow minutes before traffic/weather adjustments */
  minutes: number;
  path: [number, number][];
  source: Source;
}

export interface RoadProvider {
  route(a: LatLon, b: LatLon): Promise<RoadRoute>;
}

export interface WeatherProvider {
  hourly(place: PlaceRef, fromEpoch: number, toEpoch: number): Promise<HourlyWeather>;
}
