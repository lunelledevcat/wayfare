import { airport } from "./flights";
import { loadGtfs } from "./gtfs";
import { cities, cityOf, curatedPlaces, curatedToRef } from "../places-data";
import type { LocalizedText, PlaceRef, Source } from "../planner/types";
import { fetchJson, TtlCache } from "./cache";

export interface PlaceSuggestion {
  token: string;
  name: LocalizedText;
  detail?: LocalizedText;
  kind: "district" | "landmark" | "airport" | "station" | "terminal" | "stop" | "city" | "address";
  lat: number;
  lon: number;
  source: "wayfare" | "gtfs" | "nominatim";
}

const nominatimCache = new TtlCache<PlaceSuggestion[]>(24 * 3600_000, 1000);
const NOMINATIM_UA = "Wayfare/1.0 (U-Hackathon 2026 demo; https://github.com/wayfare-th)";

const RAIL_MODES = new Set(["bts", "mrt", "arl", "red", "train", "boat"]);

/** Resolve a URL token (p:/s:/air:/c:/g:) to a place. */
export function resolvePlace(token: string): PlaceRef | null {
  if (!token) return null;
  const [kind, ...restParts] = token.split(":");
  const rest = restParts.join(":");
  if (kind === "p") {
    const p = curatedPlaces.find((x) => x.id === rest);
    return p ? curatedToRef(p) : null;
  }
  if (kind === "c") {
    const c = cities.find((x) => x.id === rest);
    return c ? { id: token, name: c.name, lat: c.lat, lon: c.lon, city: c.id } : null;
  }
  if (kind === "air") {
    const a = airport(rest);
    return a ? { id: token, name: a.name, lat: a.lat, lon: a.lon, city: a.city } : null;
  }
  if (kind === "s") {
    const net = loadGtfs();
    const s = net?.stops.find((x) => x.id === rest);
    return s ? { id: token, name: s.name, lat: s.lat, lon: s.lon, city: cityOf(s)?.id } : null;
  }
  if (kind === "g") {
    const [lat, lon, ...label] = rest.split(",");
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
    const name = label.join(",").slice(0, 120) || `${la.toFixed(4)}, ${lo.toFixed(4)}`;
    return { id: token, name: { th: name, en: name }, lat: la, lon: lo, city: cityOf({ lat: la, lon: lo })?.id };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();

function matches(name: LocalizedText, q: string): number {
  let best = -1;
  for (const v of Object.values(name)) {
    if (!v) continue;
    const n = norm(v);
    if (n === q) return 3;
    if (n.startsWith(q)) best = Math.max(best, 2);
    else if (n.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/** Local suggestions: curated places, cities, airports and GTFS rail/boat stations. */
export function searchLocal(qRaw: string, limit = 8): PlaceSuggestion[] {
  const q = norm(qRaw);
  if (!q) return [];
  const scored: { s: PlaceSuggestion; score: number }[] = [];
  for (const p of curatedPlaces) {
    const m = matches(p.name, q);
    if (m >= 0) scored.push({ s: { token: `p:${p.id}`, name: p.name, kind: p.kind, lat: p.lat, lon: p.lon, source: "wayfare", detail: cities.find((c) => c.id === p.city)?.name }, score: m + 1.5 });
  }
  for (const c of cities) {
    const m = matches(c.name, q);
    if (m >= 0) scored.push({ s: { token: `c:${c.id}`, name: c.name, kind: "city", lat: c.lat, lon: c.lon, source: "wayfare" }, score: m + 1.2 });
  }
  const net = loadGtfs();
  if (net && q.length >= 2) {
    for (const s of net.stops) {
      if (!s.modes.some((m) => RAIL_MODES.has(m)) && !(q.length >= 4 && s.modes.includes("coach"))) continue;
      const m = matches(s.name, q);
      if (m >= 0) {
        scored.push({
          s: { token: `s:${s.id}`, name: s.name, kind: RAIL_MODES.has(s.modes[0]) ? "station" : "stop", lat: s.lat, lon: s.lon, source: "gtfs", detail: cityOf(s)?.name },
          score: m + (s.modes.some((x) => x === "bts" || x === "mrt" || x === "arl") ? 0.6 : 0.3),
        });
      }
    }
  }
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s)
    .filter((s) => {
      const k = `${s.name.en}|${s.lat.toFixed(3)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

interface NominatimRow {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  namedetails?: Record<string, string>;
}

/** Nominatim (OpenStreetMap) search restricted to Thailand. Callers debounce ≥ 1 s; results cached 24 h. */
export async function searchNominatim(qRaw: string, lang: string): Promise<PlaceSuggestion[]> {
  const q = norm(qRaw);
  if (q.length < 3) return [];
  return nominatimCache.wrap(`${lang}|${q}`, async () => {
    try {
      const params = new URLSearchParams({ q, format: "jsonv2", countrycodes: "th", limit: "5", namedetails: "1", "accept-language": lang });
      const rows = await fetchJson<NominatimRow[]>(`https://nominatim.openstreetmap.org/search?${params}`, {
        timeoutMs: 3500,
        headers: { "User-Agent": NOMINATIM_UA, Referer: "https://wayfare.app" },
      });
      return rows.map((r) => {
        const th = r.namedetails?.["name:th"] ?? r.namedetails?.name ?? r.name ?? r.display_name.split(",")[0];
        const en = r.namedetails?.["name:en"] ?? r.name ?? th;
        const label = (lang === "th" ? th : en).replace(/,/g, " ");
        const lat = Number(r.lat);
        const lon = Number(r.lon);
        return {
          token: `g:${lat.toFixed(5)},${lon.toFixed(5)},${label}`,
          name: { th, en, zh: r.namedetails?.["name:zh"], ja: r.namedetails?.["name:ja"] },
          detail: { th: r.display_name.split(",").slice(1, 3).join(","), en: r.display_name.split(",").slice(1, 3).join(",") },
          kind: "address" as const,
          lat,
          lon,
          source: "nominatim" as const,
        };
      });
    } catch {
      return [];
    }
  });
}

export const nominatimSource: Source = {
  id: "nominatim",
  name: "Nominatim / OpenStreetMap",
  url: "https://nominatim.openstreetmap.org/",
  updatedAt: new Date().toISOString(),
};
