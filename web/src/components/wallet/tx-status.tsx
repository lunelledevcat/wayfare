"use client";

import { CircleCheck, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { CHAIN_KEY, explorerTx } from "@/lib/chain";
import type { TxState } from "./use-tx";

/** Renders the pending / success / error states of an action. */
export function TxStatus({ state, successText, onRetry, extra }: { state: TxState; successText?: string; onRetry?: () => void; extra?: React.ReactNode }) {
  const t = useTranslations("wallet");
  const te = useTranslations("errors");
  if (state.status === "idle") return null;
  if (state.status === "pending")
    return (
      <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> {state.step ? t(`steps.${state.step}`) : t("pending")}
      </p>
    );
  if (state.status === "success") {
    const url = state.hash ? explorerTx(state.hash) : null;
    return (
      <div role="status" className="rounded-xl bg-good-soft px-3 py-2 text-sm font-medium text-good">
        <p className="flex items-center gap-2">
          <CircleCheck className="size-4" aria-hidden /> {successText ?? t("success")}
        </p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline">
            {t("viewExplorer")} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : (
          state.hash && CHAIN_KEY === "local" && <p className="mt-1 break-all text-xs text-muted">{t("localChain")} · {state.hash}</p>
        )}
      </div>
    );
  }
  return (
    <div role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{te(state.code)}</span>
      </p>
      {state.code === "chain.InsufficientGas" && (
        <a href="https://core.app/tools/testnet-faucet/?subnet=c&token=c" target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold underline">
          {t("gasFaucet")} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      {extra}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-card px-3 font-semibold text-fg">
          {t("tryAgain")}
        </button>
      )}
    </div>
  );
}
