import { NextResponse } from "next/server";
import { OpenMeteoWeatherProvider } from "@/lib/providers/weather";
import { bkkTime, DAY, HOUR } from "@/lib/time";

export const runtime = "nodejs";
const provider = new OpenMeteoWeatherProvider();

const parseTime = (v: string | null, fallback: number) => {
  if (!v) return fallback;
  if (/^\d+$/.test(v)) return Number(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return bkkTime(v.slice(0, 10), v.slice(11, 16));
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return bkkTime(v);
  return NaN;
};

/** GET /api/weather?lat&lng&from&to — hourly forecast (cached 30 min). from/to: epoch ms, YYYY-MM-DD or YYYY-MM-DDTHH:MM (Bangkok). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng") ?? u.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "bad_coordinates" }, { status: 400 });
  }
  const now = Date.now();
  const from = parseTime(u.searchParams.get("from"), now);
  const to = parseTime(u.searchParams.get("to"), from + 24 * HOUR);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 17 * DAY) {
    return NextResponse.json({ error: "bad_range" }, { status: 400 });
  }
  const w = await provider.hourly({ id: `g:${lat},${lng}`, name: { th: "", en: "" }, lat, lon: lng }, from, to);
  return NextResponse.json(w, { headers: { "Cache-Control": "public, max-age=1800" } });
}
