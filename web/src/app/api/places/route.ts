import { NextResponse } from "next/server";
import { searchLocal, searchNominatim } from "@/lib/providers/places";

export const runtime = "nodejs";

/** GET /api/places?q=&lang=&osm=1 — autocomplete from GTFS stations, curated places and (osm=1) Nominatim. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 80);
  const lang = ["th", "en", "zh", "ja"].includes(u.searchParams.get("lang") ?? "") ? u.searchParams.get("lang")! : "th";
  const local = searchLocal(q, 8);
  let results = local;
  if (u.searchParams.get("osm") === "1" && local.length < 6) {
    const osm = await searchNominatim(q, lang);
    results = [...local, ...osm.filter((o) => !local.some((l) => Math.abs(l.lat - o.lat) < 0.002 && Math.abs(l.lon - o.lon) < 0.002))].slice(0, 10);
  }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
