"use client";

import { useQuery } from "@tanstack/react-query";
import { Coins, ExternalLink, Wallet } from "lucide-react";
import { PriorityIcon } from "../icons";
import { Segmented } from "../ui/segmented";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { activeChain, deployment, explorerAddress } from "@/lib/chain";
import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/config";
import { usdcAbi } from "@/lib/contracts.generated";
import type { Priority } from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "../locale-switcher";
import { usePrefs } from "../prefs";
import { Button } from "../ui/button";
import { Card, Input, Label, Skeleton } from "../ui/primitives";
import { useFmt } from "../use-fmt";
import { TxStatus } from "../wallet/tx-status";
import { useTx } from "../wallet/use-tx";
import { unitsToThb, unitsToUsdc, useEnsureChain } from "./chain-data";
import { ConnectPrompt } from "./states";

const PRIORITIES: Priority[] = ["fastest", "cheapest", "value", "comfort"];

export function ProfileTab() {
  const t = useTranslations("app.profile");
  const tp = useTranslations("plan.priority");
  const tc = useTranslations("common");
  const { prefs, setPrefs } = usePrefs();
  const { price } = useFmt();
  // local draft while typing; falls back to the stored value
  const [draft, setDraft] = useState<string | null>(null);
  const timeValue = draft ?? String(prefs.timeValue);

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-5">
        <h2 className="font-bold">{t("settings")}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted">{tc("language")}</span>
          <Suspense fallback={<Skeleton className="h-10 w-28" />}>
            <LocaleSwitcher />
          </Suspense>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-muted">{tc("currency")}</span>
          <Segmented
            ariaLabel={tc("currency")}
            size="sm"
            value={prefs.currency}
            onChange={(c) => setPrefs({ currency: c as DisplayCurrency })}
            options={DISPLAY_CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-value">{t("timeValue")}</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted" aria-hidden>
              ฿
            </span>
            <Input
              id="time-value"
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              step={10}
              value={timeValue}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n) && n >= 0 && n <= 5000) setPrefs({ timeValue: Math.round(n) });
              }}
              onBlur={() => setDraft(null)}
              aria-describedby="time-value-hint"
              className="max-w-40 tabular"
            />
            <span className="text-sm text-muted">{t("perHour")}</span>
          </div>
          <p id="time-value-hint" className="text-xs text-muted">
            {t("timeValueHint", { price: price(prefs.timeValue) })}
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-muted">{t("defaultPriority")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={prefs.priority === p}
                onClick={() => setPrefs({ priority: p })}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold",
                  prefs.priority === p ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-fg hover:bg-bg",
                )}
              >
                <PriorityIcon priority={p} className="size-4" />
                {tp(p)}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>
      <WalletCard />
    </div>
  );
}

function WalletCard() {
  const t = useTranslations("app.profile");
  const tw = useTranslations("wallet");
  const { price, time } = useFmt();
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();
  const ensureChain = useEnsureChain();
  const faucet = useTx();
  const [now, setNow] = useState(() => Date.now());

  const q = useQuery({
    queryKey: ["wf-balance", activeChain.id, address],
    queryFn: async () => {
      const [balance, next] = await Promise.all([
        client!.readContract({ address: deployment!.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address!] }),
        client!.readContract({ address: deployment!.usdc, abi: usdcAbi, functionName: "nextFaucetAt", args: [address!] }),
      ]);
      return { balance, nextAt: Number(next) * 1000 };
    },
    enabled: !!client && !!address && !!deployment,
  });

  const nextAt = q.data?.nextAt ?? 0;
  const waiting = nextAt > now;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  if (!isConnected || !address) return <ConnectPrompt text={t("connect")} />;
  if (!deployment) return null;

  const getFaucet = () =>
    faucet.run(async (setStep) => {
      if (!client || !deployment) throw new Error("not ready");
      await ensureChain(setStep);
      setStep("faucet");
      const hash = await writeContractAsync({ address: deployment.usdc, abi: usdcAbi, functionName: "faucet", chainId: activeChain.id });
      setStep("confirm");
      await client.waitForTransactionReceipt({ hash });
      await q.refetch();
      setNow(Date.now());
      return { hash };
    });

  const left = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const url = explorerAddress(address);

  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Wallet className="size-5 text-primary" aria-hidden /> {t("wallet")}
      </h2>
      <div>
        <p className="text-sm text-muted">{t("address")}</p>
        <p className="break-all font-mono text-sm">{address}</p>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary underline">
            {tw("viewExplorer")} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      <div className="rounded-xl bg-bg p-4">
        <p className="text-sm text-muted">{tw("balance")}</p>
        {q.data ? (
          <p>
            <span className="text-2xl font-extrabold tabular">{price(unitsToThb(q.data.balance))}</span>{" "}
            <span className="text-xs text-muted tabular">≈ {unitsToUsdc(q.data.balance)} USDC</span>
          </p>
        ) : (
          <Skeleton className="mt-1 h-8 w-32" />
        )}
      </div>
      <Button variant="good" className="w-full" onClick={getFaucet} disabled={waiting || faucet.state.status === "pending" || !q.data}>
        <Coins aria-hidden /> {waiting ? t("faucetWait", { time: `${mm}:${ss}` }) : tw("faucet")}
      </Button>
      {waiting && <p className="text-center text-xs text-muted">{t("faucetNext", { time: time(nextAt) })}</p>}
      <TxStatus state={faucet.state} successText={tw("faucetDone")} onRetry={getFaucet} />
      <p className="text-xs text-muted">{tw("faucetHint")}</p>
    </Card>
  );
}
