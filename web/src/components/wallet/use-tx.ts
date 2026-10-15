"use client";

import { useCallback, useState } from "react";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Hash } from "viem";

export type TxState = { status: "idle" } | { status: "pending"; step?: string } | { status: "success"; hash?: Hash; data?: unknown } | { status: "error"; code: string; detail?: string };

const KNOWN = [
  "InvalidSignature",
  "QuoteExpired",
  "QuoteAlreadyUsed",
  "NotPassenger",
  "OperatorInactive",
  "OperatorNotRegistered",
  "NotLegOperator",
  "NotTicketHolder",
  "InvalidStatus",
  "RefundDeadlinePassed",
  "NoShowTooEarly",
  "BadQuote",
  "UnknownTicket",
  "UnknownTrip",
  "TicketLocked",
  "FaucetCooldown",
  "ERC20InsufficientBalance",
  "ERC20InsufficientAllowance",
  "ERC721InsufficientApproval",
  "ZeroAddress",
];

/** Map any wallet / contract error to a translation code under errors.chain.* (or errors.*). */
export function errorCode(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "userRejected";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name && KNOWN.includes(name)) return `chain.${name}`;
    const text = `${err.shortMessage} ${err.details ?? ""}`;
    if (/insufficient funds|gas required exceeds/i.test(text)) return "chain.InsufficientGas";
    if (/chain mismatch|does not match the target chain|switch chain/i.test(text)) return "chain.WrongNetwork";
    for (const k of KNOWN) if (text.includes(k)) return `chain.${k}`;
    if (/user rejected|denied/i.test(text)) return "userRejected";
  }
  if (err instanceof Error && /network|fetch/i.test(err.message)) return "network";
  return "generic";
}

/** Four-state wrapper for an async action: idle → pending → success | error. */
export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const run = useCallback(async <T,>(fn: (setStep: (s: string) => void) => Promise<T>) => {
    setState({ status: "pending" });
    try {
      const data = await fn((step) => setState({ status: "pending", step }));
      setState({ status: "success", data, hash: (data as { hash?: Hash } | undefined)?.hash });
      return data;
    } catch (err) {
      console.error(err);
      setState({ status: "error", code: errorCode(err), detail: err instanceof Error ? err.message.slice(0, 300) : undefined });
      return undefined;
    }
  }, []);
  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset, setState };
}
