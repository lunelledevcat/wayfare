import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http } from "viem";
import { activeChain, deployment, USDC_DECIMALS } from "@/lib/chain";
import { bookingAbi } from "@/lib/contracts.generated";
import { TtlCache } from "@/lib/providers/cache";

export const runtime = "nodejs";
const cache = new TtlCache<object>(30_000, 2);

/** GET /api/stats — live counters read from the booking contract (cached 30 s). */
export async function GET() {
  if (!deployment) return NextResponse.json({ available: false });
  try {
    const data = await cache.wrap("stats", async () => {
      const client = createPublicClient({ chain: activeChain, transport: http(undefined, { timeout: 4000 }) });
      const [trips, tickets, refunded, paid] = await client.readContract({ address: deployment!.booking, abi: bookingAbi, functionName: "stats" });
      return {
        available: true,
        chainId: activeChain.id,
        trips: Number(trips),
        tickets: Number(tickets),
        refundedUsdc: Number(formatUnits(refunded, USDC_DECIMALS)),
        paidUsdc: Number(formatUnits(paid, USDC_DECIMALS)),
      };
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return NextResponse.json({ available: false });
  }
}
