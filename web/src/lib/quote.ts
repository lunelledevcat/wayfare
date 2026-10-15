import "server-only";
import { bytesToHex, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain, CHAIN_KEY, deployment, operatorAddress } from "./chain";
import { QUOTE_TTL_SECONDS, THB_PER_USDC } from "./config";
import type { Trip } from "./planner/types";

/** Hardhat account #1 — public test key, only ever used for the local chain. */
const HARDHAT_SIGNER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function signerKey(): Hex {
  const k = process.env.QUOTE_SIGNER_PRIVATE_KEY;
  if (k) return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
  if (CHAIN_KEY === "local") return HARDHAT_SIGNER;
  throw new QuoteError("signer", "QUOTE_SIGNER_PRIVATE_KEY is not set");
}

export class QuoteError extends Error {
  constructor(
    public code: "signer" | "deployment" | "nothing" | "past" | "operator" | "passenger",
    message: string,
  ) {
    super(message);
  }
}

export const LEG_TYPES = {
  Leg: [
    { name: "operator", type: "address" },
    { name: "serviceId", type: "bytes32" },
    { name: "price", type: "uint256" },
    { name: "departAt", type: "uint64" },
    { name: "refundDeadline", type: "uint64" },
    { name: "cancelFeeBps", type: "uint16" },
    { name: "label", type: "string" },
  ],
  Quote: [
    { name: "quoteId", type: "bytes32" },
    { name: "passenger", type: "address" },
    { name: "pax", type: "uint8" },
    { name: "expiresAt", type: "uint64" },
    { name: "legs", type: "Leg[]" },
  ],
} as const;

/** THB → tUSDC base units (6 decimals), rounded to whole cents. */
export function thbToUsdcUnits(thb: number): bigint {
  return BigInt(Math.round((thb / THB_PER_USDC) * 100)) * 10_000n;
}

export interface SignedQuote {
  quote: {
    quoteId: Hex;
    passenger: `0x${string}`;
    pax: number;
    expiresAt: string;
    legs: { operator: `0x${string}`; serviceId: Hex; price: string; departAt: string; refundDeadline: string; cancelFeeBps: number; label: string }[];
  };
  signature: Hex;
  total: string;
  chainId: number;
  booking: `0x${string}`;
  usdc: `0x${string}`;
}

/** Build and EIP-712 sign a quote for the bookable legs of a trip. Prices come from the server-side trip. */
export async function signQuote(trip: Trip, passenger: string, pax: number): Promise<SignedQuote> {
  if (!deployment) throw new QuoteError("deployment", "Contracts are not deployed on the active chain");
  if (!isAddress(passenger)) throw new QuoteError("passenger", "Invalid passenger address");
  const now = Math.floor(Date.now() / 1000);
  const legs = trip.legs
    .filter((l) => l.bookable)
    .map((l) => {
      const op = operatorAddress(l.bookable!.operator);
      if (!op) throw new QuoteError("operator", `Operator ${l.bookable!.operator} is not registered`);
      const departAt = Math.floor(l.depart / 1000);
      if (departAt <= now) throw new QuoteError("past", "Departure is in the past");
      const refundDeadline = Math.max(now, Math.min(departAt, Math.floor(l.bookable!.refundDeadline / 1000)));
      return {
        operator: op,
        serviceId: l.bookable!.serviceId as Hex,
        price: thbToUsdcUnits(l.price.amount),
        departAt: BigInt(departAt),
        refundDeadline: BigInt(refundDeadline),
        cancelFeeBps: l.bookable!.cancelFeeBps,
        label: l.bookable!.label,
      };
    });
  if (legs.length === 0) throw new QuoteError("nothing", "Nothing on this trip can be booked online");
  const quoteId = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const message = { quoteId, passenger: passenger as `0x${string}`, pax, expiresAt: BigInt(now + QUOTE_TTL_SECONDS), legs };
  const account = privateKeyToAccount(signerKey());
  const signature = await account.signTypedData({
    domain: { name: "WayfareBooking", version: "1", chainId: activeChain.id, verifyingContract: deployment.booking },
    types: LEG_TYPES,
    primaryType: "Quote",
    message,
  });
  const total = legs.reduce((a, l) => a + l.price, 0n) * BigInt(pax);
  return {
    quote: {
      quoteId,
      passenger: message.passenger,
      pax,
      expiresAt: message.expiresAt.toString(),
      legs: legs.map((l) => ({ ...l, price: l.price.toString(), departAt: l.departAt.toString(), refundDeadline: l.refundDeadline.toString() })),
    },
    signature,
    total: total.toString(),
    chainId: activeChain.id,
    booking: deployment.booking,
    usdc: deployment.usdc,
  };
}
