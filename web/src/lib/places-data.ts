import placesJson from "../../data/places.json";
import { haversineKm, type LatLon } from "./geo";
import type { LocalizedText, PlaceRef } from "./planner/types";

export interface City {
  id: string;
  name: LocalizedText;
  lat: number;
  lon: number;
  radiusKm: number;
  metro?: boolean;
  airports: string[];
}

export interface CuratedPlace {
  id: string;
  kind: "district" | "landmark" | "airport" | "station" | "terminal";
  city: string;
  popular?: boolean;
  code?: string;
  name: LocalizedText;
  lat: number;
  lon: number;
}

export const cities = placesJson.cities as City[];
export const curatedPlaces = placesJson.places as CuratedPlace[];

/** The city whose radius contains the point (closest centre wins). */
export function cityOf(p: LatLon): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    const d = haversineKm(p, c);
    if (d <= c.radiusKm && d < bestKm) {
      best = c;
      bestKm = d;
    }
  }
  return best;
}

export function cityById(id: string | undefined): City | undefined {
  return cities.find((c) => c.id === id);
}

export function curatedToRef(p: CuratedPlace): PlaceRef {
  return { id: `p:${p.id}`, name: p.name, lat: p.lat, lon: p.lon, city: p.city };
}

/** Encode a free-form coordinate place as a URL token. */
export function geoToken(lat: number, lon: number, label: string): string {
  return `g:${lat.toFixed(5)},${lon.toFixed(5)},${label}`;
}
