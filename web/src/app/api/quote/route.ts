import { NextResponse } from "next/server";
import { findTrip, PlanError } from "@/lib/planner/plan";
import type { PlanQuery } from "@/lib/planner/types";
import { QuoteError, signQuote } from "@/lib/quote";

export const runtime = "nodejs";

/**
 * POST /api/quote { tripId, query, passenger } → EIP-712 signed quote (valid 10 min) for the
 * bookable legs. Prices are taken from the server's own plan result, never from the client.
 */
export async function POST(req: Request) {
  let body: { tripId?: string; query?: Partial<PlanQuery>; passenger?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.tripId || !body.passenger) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  try {
    const found = await findTrip(body.tripId, body.query);
    if (!found) return NextResponse.json({ error: "trip_not_found" }, { status: 404 });
    const signed = await signQuote(found.trip, body.passenger, found.query.pax);
    return NextResponse.json(signed, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof QuoteError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.code === "signer" || err.code === "deployment" ? 503 : 400 });
    if (err instanceof PlanError) return NextResponse.json({ error: err.code }, { status: 400 });
    console.error("[api/quote]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
