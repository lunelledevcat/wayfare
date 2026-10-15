"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Coins, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { decodeEventLog, formatUnits, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { Link } from "@/i18n/navigation";
import { activeChain, deployment, USDC_DECIMALS } from "@/lib/chain";
import { THB_PER_USDC } from "@/lib/config";
import { bookingAbi, usdcAbi } from "@/lib/contracts.generated";
import { pick, usdc } from "@/lib/format";
import type { PlanQuery, Trip } from "@/lib/planner/types";
import { saveSnapshot } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { AvalancheBadge } from "./avalanche-badge";
import { ModeIcon } from "./mode-icon";
import { SuccessCheck } from "./success-check";
import { Button } from "./ui/button";
import { Card } from "./ui/primitives";
import { useFmt } from "./use-fmt";
import { TxStatus } from "./wallet/tx-status";
import { useTx } from "./wallet/use-tx";

interface QuoteResponse {
  quote: { quoteId: Hex; passenger: `0x${string}`; pax: number; expiresAt: string; legs: { operator: `0x${string}`; serviceId: Hex; price: string; departAt: string; refundDeadline: string; cancelFeeBps: number; label: string }[] };
  signature: Hex;
  total: string;
  error?: string;
}

/** Sticky cost summary with the one-button booking flow (approve + bookTrip). Bottom bar on mobile. */
export function BookingBox({ trip, query }: { trip: Trip; query: PlanQuery }) {
  const t = useTranslations("trip");
  const tw = useTranslations("wallet");
  const tm = useTranslations("mode");
  const { price } = useFmt();
  const pax = query.pax;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const book = useTx();
  const faucet = useTx();
  const [booked, setBooked] = useState<{ tripId: string; tickets: number } | null>(null);

  const bookable = trip.legs.filter((l) => l.bookable);
  const onSite = trip.legs.filter((l) => !l.bookable && l.price.amount > 0);
  const onChainThb = trip.cost.onChain * pax;
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: deployment?.usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!deployment },
  });
  const balanceThb = balance !== undefined ? Number(formatUnits(balance as bigint, USDC_DECIMALS)) * THB_PER_USDC : null;
  const lowBalance = balanceThb !== null && balanceThb < onChainThb;

  useEffect(() => {
    if (book.state.status === "success") refetchBalance();
  }, [book.state.status, refetchBalance]);

  const ensureChain = async (setStep: (s: string) => void) => {
    if (chainId !== activeChain.id) {
      setStep("switch");
      await switchChainAsync({ chainId: activeChain.id });
    }
  };

  const getFaucet = () =>
    faucet.run(async (setStep) => {
      if (!deployment || !client) throw new Error("no deployment");
      await ensureChain(setStep);
      setStep("faucet");
      const hash = await writeContractAsync({ address: deployment.usdc, abi: usdcAbi, functionName: "faucet", chainId: activeChain.id });
      setStep("confirm");
      await client.waitForTransactionReceipt({ hash });
      await refetchBalance();
      return { hash };
    });

  const doBook = () =>
    book.run(async (setStep) => {
      if (!deployment || !client || !address) throw new Error("not ready");
      await ensureChain(setStep);
      setStep("quote");
      const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, query, passenger: address }) });
      const q = (await res.json()) as QuoteResponse;
      if (!res.ok) throw new Error(q.error ?? "quote failed");
      const total = BigInt(q.total);
      const bal = (await client.readContract({ address: deployment.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address] })) as bigint;
      if (bal < total) throw new Error("ERC20InsufficientBalance");
      const allowance = (await client.readContract({ address: deployment.usdc, abi: usdcAbi, functionName: "allowance", args: [address, deployment.booking] })) as bigint;
      if (allowance < total) {
        setStep("approve");
        const h = await writeContractAsync({ address: deployment.usdc, abi: usdcAbi, functionName: "approve", args: [deployment.booking, total], chainId: activeChain.id });
        setStep("confirm");
        await client.waitForTransactionReceipt({ hash: h });
      }
      setStep("book");
      const quoteArg = {
        quoteId: q.quote.quoteId,
        passenger: q.quote.passenger,
        pax: q.quote.pax,
        expiresAt: BigInt(q.quote.expiresAt),
        legs: q.quote.legs.map((l) => ({ ...l, price: BigInt(l.price), departAt: BigInt(l.departAt), refundDeadline: BigInt(l.refundDeadline) })),
      };
      const hash = await writeContractAsync({ address: deployment.booking, abi: bookingAbi, functionName: "bookTrip", args: [quoteArg, q.signature], chainId: activeChain.id });
      setStep("confirm");
      const receipt = await client.waitForTransactionReceipt({ hash });
      let tripId = "";
      let tickets = 0;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: bookingAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "TripBooked") tripId = String((ev.args as { tripId: bigint }).tripId);
          if (ev.eventName === "TicketIssued") tickets++;
        } catch {
          /* not a booking event */
        }
      }
      saveSnapshot({
        chainTripId: tripId,
        chainId: activeChain.id,
        plannerTripId: trip.id,
        query,
        bookedAt: Date.now(),
        points: trip.legs
          .filter((l) => l.kind === "ride" || l.kind === "transfer" || l.mode === "walk")
          .map((l) => ({ legId: l.id, mode: l.mode, kind: l.kind, at: l.depart, until: l.arrive, lat: l.from.lat, lon: l.from.lon, name: pick(l.from.name, "en"), outdoor: l.outdoor || l.kind === "transfer", precipProb: l.weather?.precipProb ?? null })),
      });
      setBooked({ tripId, tickets });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        import("canvas-confetti").then((m) => m.default({ particleCount: 60, spread: 60, startVelocity: 32, scalar: 0.85, ticks: 140, origin: { y: 0.75 } })).catch(() => {});
      return { hash };
    });

  // a pre-flight insufficient-balance error carries the code in the message
  const bookState =
    book.state.status === "error" && book.state.detail?.includes("ERC20InsufficientBalance") ? { ...book.state, code: "chain.ERC20InsufficientBalance" } : book.state;

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start" aria-labelledby="cost">
      <Card className="p-5">
        <h2 id="cost" className="text-lg font-bold">
          {t("costTitle")}
        </h2>
        {bookable.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase text-good">{t("bookOnline")}</p>
            <ul className="mt-1 space-y-1.5">
              {bookable.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <ModeIcon mode={l.mode} className="size-6 rounded-md" />
                  <span className="min-w-0 flex-1 truncate">{l.bookable!.operator} · {l.bookable!.serviceNo}</span>
                  <span className="font-semibold tabular">{price(l.price.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {onSite.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase text-muted">{t("payOnSite")}</p>
            <ul className="mt-1 space-y-1.5">
              {onSite.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <ModeIcon mode={l.mode} color={l.line?.color} className="size-6 rounded-md" />
                  <span className="min-w-0 flex-1 truncate">{l.line?.short && l.kind === "ride" && !["taxi", "grab", "win"].includes(l.mode) ? `${tm(l.mode)} ${l.line.short}` : tm(l.mode)}</span>
                  <span className="tabular text-muted">{price(l.price.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{t("grandTotal")}</span>
            <span className="text-2xl font-extrabold tabular">{price(trip.cost.amount * pax)}</span>
          </div>
          <p className="text-right text-xs text-muted">
            {price(trip.cost.amount)} {t("perPax", { n: pax })}
          </p>
        </div>
        {bookable.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            <strong className="text-fg">{t("refundPolicy")}:</strong> {t("refundText", { h: trip.refund.deadlineHours ?? 2, fee: (trip.refund.feeBps ?? 0) / 100 })}
          </p>
        )}
      </Card>

      {/* action bar: sticky bottom on mobile, inside the card column on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:static lg:mt-3 lg:rounded-2xl lg:border lg:p-4">
        {bookable.length === 0 ? (
          <p className="text-sm font-medium text-muted">{t("noBookable")}</p>
        ) : booked ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3" role="status">
              <SuccessCheck className="size-12 shrink-0" />
              <p className="font-bold text-good">{t("booked", { n: booked.tickets })}</p>
            </div>
            <AvalancheBadge tone="plain" />
            <TxStatus state={book.state} />
            <Button asChild className="w-full">
              <Link href="/app?tab=tickets">
                <Ticket aria-hidden /> {t("viewTickets")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between lg:hidden">
              <span className="text-sm text-muted">{t("grandTotal")}</span>
              <span className="text-lg font-bold tabular">{price(trip.cost.amount * pax)}</span>
            </div>
            {!deployment ? (
              <p className="text-sm text-bad">{tw("connectFirst")}</p>
            ) : !isConnected ? (
              <Button size="lg" className="w-full" onClick={openConnectModal}>
                {tw("connectFirst")}
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={doBook} disabled={book.state.status === "pending"}>
                {t("bookButton", { price: price(onChainThb) })}
              </Button>
            )}
            <p className="text-center text-xs text-muted tabular">{t("usdc", { amount: usdc(onChainThb) })}</p>
            <TxStatus
              state={bookState}
              onRetry={doBook}
              extra={
                bookState.status === "error" && bookState.code === "chain.ERC20InsufficientBalance" ? (
                  <Button size="sm" variant="good" className="mt-2" onClick={getFaucet}>
                    <Coins aria-hidden /> {tw("faucet")}
                  </Button>
                ) : null
              }
            />
            {isConnected && (lowBalance || faucet.state.status !== "idle") && (
              <div className={cn("rounded-xl border border-border p-3 text-sm", faucet.state.status === "success" && "border-good")}>
                <p className="text-muted">
                  {tw("balance")}: <span className="font-semibold text-fg tabular">{balanceThb !== null ? price(balanceThb) : "…"}</span>
                </p>
                {faucet.state.status !== "success" && (
                  <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={getFaucet} disabled={faucet.state.status === "pending"}>
                    <Coins aria-hidden /> {tw("faucet")}
                  </Button>
                )}
                <div className="mt-2">
                  <TxStatus state={faucet.state} successText={tw("faucetDone")} />
                </div>
                <p className="mt-1 text-xs text-muted">{tw("faucetHint")}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="h-36 lg:hidden" aria-hidden />
    </aside>
  );
}
