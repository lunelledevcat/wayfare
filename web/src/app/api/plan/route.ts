import { NextResponse } from "next/server";
import { plan, PlanError } from "@/lib/planner/plan";
import type { PlanQuery } from "@/lib/planner/types";

export const runtime = "nodejs";

/** POST /api/plan — full analysis: trips, itemised times, prices, weather, warnings, sources. */
export async function POST(req: Request) {
  let body: Partial<PlanQuery>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  try {
    const result = await plan(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    if (err instanceof PlanError) return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    console.error("[api/plan]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
