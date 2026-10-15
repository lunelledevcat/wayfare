import { defineChain, type Chain } from "viem";
import { avalancheFuji } from "viem/chains";
import { deployments, type Deployment } from "./contracts.generated";

/** Hardhat local node (port 8546 so it does not clash with other local projects). */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8546"] } },
  testnet: true,
});

export const CHAIN_KEY = (process.env.NEXT_PUBLIC_CHAIN === "fuji" ? "fuji" : "local") as "fuji" | "local";
export const activeChain: Chain = CHAIN_KEY === "fuji" ? avalancheFuji : hardhatLocal;

export const deployment: Deployment | null = (deployments as Record<number, Deployment>)[activeChain.id] ?? null;

export const explorerTx = (hash: string) => (CHAIN_KEY === "fuji" ? `https://testnet.snowtrace.io/tx/${hash}` : null);
export const explorerAddress = (addr: string) => (CHAIN_KEY === "fuji" ? `https://testnet.snowtrace.io/address/${addr}` : null);
export const explorerToken = (contract: string, id: string | number) => (CHAIN_KEY === "fuji" ? `https://testnet.snowtrace.io/nft/${contract}/${id}` : null);

export const USDC_DECIMALS = 6;

export enum TicketStatus {
  Booked = 0,
  CheckedIn = 1,
  CancelledByOperator = 2,
  CancelledByPassenger = 3,
  NoShowClaimed = 4,
}

export function operatorAddress(name: string): `0x${string}` | null {
  return deployment?.operators.find((o) => o.name === name)?.address ?? null;
}
