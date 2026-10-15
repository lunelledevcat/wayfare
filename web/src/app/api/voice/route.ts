import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { TtlCache } from "@/lib/providers/cache";

export const runtime = "nodejs";

/**
 * Text-to-speech through ElevenLabs. The API key stays on the server (ELEVENLABS_API_KEY);
 * the browser only ever receives audio. Same text → served from cache, no new API call.
 */
const MAX_CHARS = 1500;
const LOCALES = ["th", "en", "zh", "ja"] as const;
// Default voice: a premade multilingual voice; override with ELEVENLABS_VOICE_ID.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
// Multilingual models. Thai is not among eleven_multilingual_v2's languages, so Thai uses eleven_v3.
const MODEL_DEFAULT = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const MODEL_TH = process.env.ELEVENLABS_MODEL_ID_TH || "eleven_v3";

const audioCache = new TtlCache<ArrayBuffer>(24 * 3600_000, 200);
const hits = new Map<string, number[]>();
const RATE = { max: 20, windowMs: 10 * 60_000 };

const enabled = () => !!process.env.ELEVENLABS_API_KEY;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE.max;
}

async function synthesize(text: string, model: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
  return res.arrayBuffer();
}

/** GET /api/voice → whether voice is available (the UI hides the button otherwise). */
export function GET() {
  return NextResponse.json({ enabled: enabled() }, { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/voice { text, locale } → audio/mpeg */
export async function POST(req: Request) {
  if (!enabled()) return NextResponse.json({ error: "voice_disabled" }, { status: 503 });
  let body: { text?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS) : "";
  const locale = LOCALES.includes(body.locale as (typeof LOCALES)[number]) ? (body.locale as string) : "en";
  if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });

  const model = locale === "th" ? MODEL_TH : MODEL_DEFAULT;
  const key = createHash("sha256").update(`${VOICE_ID}|${model}|${locale}|${text}`).digest("hex");
  const cached = audioCache.get(key);
  if (!cached) {
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const audio =
      cached ??
      (await audioCache.wrap(key, async () => {
        try {
          return await synthesize(text, model);
        } catch (err) {
          // second chance with the other multilingual model
          const other = model === MODEL_TH ? MODEL_DEFAULT : MODEL_TH;
          if (other === model) throw err;
          return synthesize(text, other);
        }
      }));
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    console.error("[api/voice]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  }
}
