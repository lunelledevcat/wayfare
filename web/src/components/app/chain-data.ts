"use client";

import { formatUnits, type Address, type Hex, type PublicClient } from "viem";
import { useChainId, useSwitchChain } from "wagmi";
import { activeChain, deployment, TicketStatus, USDC_DECIMALS } from "@/lib/chain";
import { THB_PER_USDC } from "@/lib/config";
import { bookingAbi, ticketAbi } from "@/lib/contracts.generated";

/** One on-chain ticket (= one leg for one passenger) with times converted to epoch ms. */
export interface LegView {
  id: bigint;
  tripId: bigint;
  operator: Address;
  serviceId: Hex;
  price: bigint;
  departAt: number;
  refundDeadline: number;
  cancelFeeBps: number;
  status: TicketStatus;
  label: string;
  paidOut: bigint;
  refunded: bigint;
}

export interface TripView {
  id: bigint;
  passenger: Address;
  pax: number;
  total: bigint;
  createdAt: number;
  legs: LegView[];
}

/** tUSDC units (6 decimals) → baht. */
export const unitsToThb = (units: bigint) => Number(formatUnits(units, USDC_DECIMALS)) * THB_PER_USDC;
/** tUSDC units → "12.34" */
export const unitsToUsdc = (units: bigint) => Number(formatUnits(units, USDC_DECIMALS)).toFixed(2);

/** Passenger refund for a ticket cancelled before its deadline. */
export function passengerRefund(leg: LegView) {
  const fee = (leg.price * BigInt(leg.cancelFeeBps)) / 10_000n;
  return { refund: leg.price - fee, fee };
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const NO_SHOW_DELAY_MS = 2 * 3600_000;

export async function loadLegs(client: PublicClient, ids: readonly bigint[]): Promise<LegView[]> {
  if (!deployment) return [];
  const d = deployment;
  return Promise.all(
    ids.map(async (id) => {
      const l = await client.readContract({ address: d.booking, abi: bookingAbi, functionName: "legOf", args: [id] });
      return {
        id,
        tripId: l.tripId,
        operator: l.operator,
        serviceId: l.serviceId,
        price: l.price,
        departAt: Number(l.departAt) * 1000,
        refundDeadline: Number(l.refundDeadline) * 1000,
        cancelFeeBps: Number(l.cancelFeeBps),
        status: Number(l.status) as TicketStatus,
        label: l.label,
        paidOut: l.paidOut,
        refunded: l.refunded,
      } satisfies LegView;
    }),
  );
}

export async function loadTrips(client: PublicClient, passenger: Address): Promise<TripView[]> {
  if (!deployment) return [];
  const d = deployment;
  const ids = await client.readContract({ address: d.booking, abi: bookingAbi, functionName: "tripsOf", args: [passenger] });
  const trips = await Promise.all(
    ids.map(async (id) => {
      const t = await client.readContract({ address: d.booking, abi: bookingAbi, functionName: "tripOf", args: [id] });
      const legs = await loadLegs(client, t.ticketIds);
      return { id, passenger: t.passenger, pax: Number(t.pax), total: t.total, createdAt: Number(t.createdAt) * 1000, legs } satisfies TripView;
    }),
  );
  return trips.sort((a, b) => b.createdAt - a.createdAt);
}

/** Decode the on-chain tokenURI (base64 JSON with an SVG image) into an image data URI. */
export async function loadTicketImage(client: PublicClient, id: bigint): Promise<string | null> {
  if (!deployment) return null;
  try {
    const uri = await client.readContract({ address: deployment.ticket, abi: ticketAbi, functionName: "tokenURI", args: [id] });
    const prefix = "data:application/json;base64,";
    const json = uri.startsWith(prefix) ? atob(uri.slice(prefix.length)) : uri.startsWith("data:application/json,") ? decodeURIComponent(uri.slice(22)) : null;
    if (!json) return null;
    const meta = JSON.parse(json) as { image?: string };
    return typeof meta.image === "string" && meta.image.startsWith("data:image/") ? meta.image : null;
  } catch {
    return null;
  }
}

export const checkInMessage = (id: bigint | number | string) => `Wayfare check-in #${id}`;

/** Switch the wallet to the active chain when needed (used before every write). */
export function useEnsureChain() {
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  return async (setStep: (s: string) => void) => {
    if (chainId !== activeChain.id) {
      setStep("switch");
      await switchChainAsync({ chainId: activeChain.id });
    }
  };
}

export const statusTone = (s: TicketStatus) =>
  s === TicketStatus.Booked ? "primary" : s === TicketStatus.CheckedIn ? "good" : s === TicketStatus.NoShowClaimed ? "neutral" : "bad";

const STATUS_KEYS = ["booked", "checkedIn", "cancelledByOperator", "cancelledByPassenger", "noShow"] as const;
/** Translation key under wallet.status.* */
export const statusKey = (s: TicketStatus) => STATUS_KEYS[s] ?? "booked";

const KIND_MODE = { flight: "flight", bus: "coach", train: "train", boat: "boat", van: "van" } as const;
/** Ride mode of a demo operator (for the icon), or null when unknown. */
export function operatorMode(addr: string) {
  const op = deployment?.operators.find((o) => o.address.toLowerCase() === addr.toLowerCase());
  return op ? KIND_MODE[op.kind] : null;
}
export function operatorName(addr: string) {
  return deployment?.operators.find((o) => o.address.toLowerCase() === addr.toLowerCase())?.name ?? shortAddr(addr);
}
