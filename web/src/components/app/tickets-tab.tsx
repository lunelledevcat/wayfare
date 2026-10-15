"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, Send, Ticket, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from "wagmi";
import { Link } from "@/i18n/navigation";
import { activeChain, deployment, explorerToken, TicketStatus } from "@/lib/chain";
import { bookingAbi, ticketAbi } from "@/lib/contracts.generated";
import { dayLabel } from "@/lib/format";
import { ModeIcon } from "../mode-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Badge, Card, Input, Label, Skeleton } from "../ui/primitives";
import { useFmt } from "../use-fmt";
import { TxStatus } from "../wallet/tx-status";
import { useTx } from "../wallet/use-tx";
import { checkInMessage, loadLegs, loadTicketImage, operatorMode, operatorName, passengerRefund, statusKey, statusTone, unitsToThb, unitsToUsdc, useEnsureChain, type LegView } from "./chain-data";
import { ConnectPrompt, EmptyState, ListSkeleton, LoadError } from "./states";

/** QR signatures are kept in memory only, so the wallet is asked once per ticket per session. */
const signatureCache = new Map<string, string>();

export function TicketsTab() {
  const t = useTranslations("app.tickets");
  const ta = useTranslations("app");
  const tw = useTranslations("wallet");
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });

  const q = useQuery({
    queryKey: ["wf-tickets", activeChain.id, address],
    queryFn: async () => {
      const ids = await client!.readContract({ address: deployment!.ticket, abi: ticketAbi, functionName: "ticketsOfOwner", args: [address!] });
      const legs = await loadLegs(client!, ids);
      return legs.sort((a, b) => Number(a.status !== TicketStatus.Booked) - Number(b.status !== TicketStatus.Booked) || a.departAt - b.departAt);
    },
    enabled: !!client && !!address && !!deployment,
  });

  if (!deployment) return <EmptyState icon={Ticket} title={ta("noDeployment")} />;
  if (!isConnected || !address) return <ConnectPrompt text={t("connect")} />;
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <LoadError text={ta("loadError")} onRetry={() => q.refetch()} retryLabel={tw("tryAgain")} />;
  if (!q.data.length)
    return (
      <EmptyState
        icon={Ticket}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Button asChild>
            <Link href="/app?tab=plan">{ta("trips.planNow")}</Link>
          </Button>
        }
      />
    );

  return (
    <ul className="space-y-4">
      {q.data.map((leg) => (
        <li key={String(leg.id)}>
          <TicketCard leg={leg} owner={address} />
        </li>
      ))}
    </ul>
  );
}

function TicketCard({ leg, owner }: { leg: LegView; owner: Address }) {
  const t = useTranslations("app.tickets");
  const tw = useTranslations("wallet");
  const { price, time, locale } = useFmt();
  const client = usePublicClient({ chainId: activeChain.id });
  const img = useQuery({
    queryKey: ["wf-ticket-img", activeChain.id, String(leg.id), leg.status],
    queryFn: () => loadTicketImage(client!, leg.id),
    enabled: !!client,
    staleTime: Infinity,
  });
  const mode = operatorMode(leg.operator);
  const booked = leg.status === TicketStatus.Booked;
  const [now] = useState(() => Date.now());
  const canCancel = booked && now < leg.refundDeadline;
  const nft = deployment ? explorerToken(deployment.ticket, String(leg.id)) : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {mode && <ModeIcon mode={mode} className="size-10 shrink-0 rounded-xl" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{leg.label}</p>
            <Badge tone={statusTone(leg.status)}>{tw(`status.${statusKey(leg.status)}`)}</Badge>
          </div>
          <p className="text-sm text-muted">
            {operatorName(leg.operator)} · {t("ticketNo", { id: String(leg.id) })}
          </p>
          <p className="mt-1 text-sm font-medium tabular">{t("departs", { day: dayLabel(leg.departAt, locale), time: time(leg.departAt) })}</p>
        </div>
        <div className="text-right">
          <p className="font-extrabold tabular">{price(unitsToThb(leg.price))}</p>
          <p className="text-xs text-muted tabular">≈ {unitsToUsdc(leg.price)} USDC</p>
        </div>
      </div>
      {img.isPending ? (
        <Skeleton className="mx-4 aspect-[2/1] rounded-xl" />
      ) : img.data ? (
        // eslint-disable-next-line @next/next/no-img-element -- on-chain SVG data URI
        <img src={img.data} alt={t("imageAlt", { id: String(leg.id) })} className="mx-auto block w-[calc(100%-2rem)] rounded-xl border border-border" />
      ) : null}
      <div className="flex flex-wrap gap-2 p-4">
        {booked && <QrButton leg={leg} owner={owner} />}
        {canCancel && <CancelButton leg={leg} />}
        {booked && <TransferButton leg={leg} owner={owner} />}
        {nft && (
          <Button asChild variant="ghost" size="sm">
            <a href={nft} target="_blank" rel="noreferrer">
              {tw("viewExplorer")}
            </a>
          </Button>
        )}
      </div>
      {booked && !canCancel && <p className="px-4 pb-4 text-xs text-muted">{t("noRefund")}</p>}
    </Card>
  );
}

function QrButton({ leg, owner }: { leg: LegView; owner: Address }) {
  const t = useTranslations("app.tickets");
  const tc = useTranslations("common");
  const { signMessageAsync } = useSignMessage();
  const sign = useTx();
  const [open, setOpen] = useState(false);
  const cacheKey = `${activeChain.id}:${owner}:${leg.id}`;
  const [sig, setSig] = useState<string | null>(() => signatureCache.get(cacheKey) ?? null);

  const show = async () => {
    setOpen(true);
    if (sig) return;
    await sign.run(async (setStep) => {
      setStep("sign");
      const s = await signMessageAsync({ account: owner, message: checkInMessage(leg.id) });
      signatureCache.set(cacheKey, s);
      setSig(s);
      return {};
    });
  };

  const payload = sig ? JSON.stringify({ t: Number(leg.id), c: activeChain.id, s: sig }) : null;

  return (
    <>
      <Button size="sm" onClick={show}>
        <QrCode aria-hidden /> {t("showQr")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")}>
          <DialogTitle>{t("qrTitle", { id: String(leg.id) })}</DialogTitle>
          <DialogDescription>{t("qrBody")}</DialogDescription>
          <div className="mt-4 flex flex-col items-center gap-3">
            {payload ? (
              <div className="rounded-2xl bg-white p-4">
                <QRCodeSVG value={payload} size={240} level="M" aria-label={t("qrTitle", { id: String(leg.id) })} />
              </div>
            ) : (
              sign.state.status !== "error" && <Skeleton className="size-[272px]" />
            )}
            <p className="font-semibold">{leg.label}</p>
            {sign.state.status !== "success" && <TxStatus state={sign.state} onRetry={show} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CancelButton({ leg }: { leg: LegView }) {
  const t = useTranslations("app.tickets");
  const tc = useTranslations("common");
  const { price, time, locale } = useFmt();
  const client = usePublicClient({ chainId: activeChain.id });
  const qc = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const ensureChain = useEnsureChain();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const { refund, fee } = passengerRefund(leg);

  const cancel = () =>
    tx.run(async (setStep) => {
      if (!deployment || !client) throw new Error("not ready");
      await ensureChain(setStep);
      setStep("cancel");
      const hash = await writeContractAsync({ address: deployment.booking, abi: bookingAbi, functionName: "cancelByPassenger", args: [leg.id], chainId: activeChain.id });
      setStep("confirm");
      await client.waitForTransactionReceipt({ hash });
      return { hash };
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <XCircle aria-hidden /> {t("cancel")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && tx.state.status === "success") qc.invalidateQueries({ queryKey: ["wf-tickets"] });
          if (!o) tx.reset();
        }}
      >
        <DialogContent closeLabel={tc("close")}>
          <DialogTitle>{t("cancelTitle")}</DialogTitle>
          <DialogDescription>{leg.label}</DialogDescription>
          <dl className="mt-4 space-y-2 rounded-xl bg-bg p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("paidLabel")}</dt>
              <dd className="tabular">{price(unitsToThb(leg.price))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t("feeLabel", { pct: leg.cancelFeeBps / 100 })}</dt>
              <dd className="tabular">−{price(unitsToThb(fee))}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>{t("refundLabel")}</dt>
              <dd className="text-good tabular">
                {price(unitsToThb(refund))} <span className="text-xs font-normal text-muted">≈ {unitsToUsdc(refund)} USDC</span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">{t("cancelDeadline", { day: dayLabel(leg.refundDeadline, locale), time: time(leg.refundDeadline) })}</p>
          <div className="mt-4 space-y-2">
            {tx.state.status !== "success" && (
              <Button variant="danger" className="w-full" onClick={cancel} disabled={tx.state.status === "pending"}>
                {t("cancelConfirm", { refund: price(unitsToThb(refund)) })}
              </Button>
            )}
            <TxStatus state={tx.state} successText={t("cancelDone", { refund: price(unitsToThb(refund)) })} onRetry={cancel} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TransferButton({ leg, owner }: { leg: LegView; owner: Address }) {
  const t = useTranslations("app.tickets");
  const tc = useTranslations("common");
  const client = usePublicClient({ chainId: activeChain.id });
  const qc = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const ensureChain = useEnsureChain();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const trimmed = to.trim();
  const invalid = trimmed.length > 0 && !isAddress(trimmed);
  const self = isAddress(trimmed) && trimmed.toLowerCase() === owner.toLowerCase();

  const send = () =>
    tx.run(async (setStep) => {
      if (!deployment || !client || !isAddress(trimmed)) throw new Error("not ready");
      await ensureChain(setStep);
      setStep("transfer");
      const hash = await writeContractAsync({ address: deployment.ticket, abi: ticketAbi, functionName: "safeTransferFrom", args: [owner, trimmed, leg.id], chainId: activeChain.id });
      setStep("confirm");
      await client.waitForTransactionReceipt({ hash });
      return { hash };
    });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send aria-hidden /> {t("transfer")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && tx.state.status === "success") {
            qc.invalidateQueries({ queryKey: ["wf-tickets"] });
            setTo("");
          }
          if (!o) tx.reset();
        }}
      >
        <DialogContent closeLabel={tc("close")}>
          <DialogTitle>{t("transferTitle")}</DialogTitle>
          <DialogDescription>{t("transferBody", { label: leg.label })}</DialogDescription>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`to-${leg.id}`}>{t("transferTo")}</Label>
            <Input
              id={`to-${leg.id}`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={invalid || self}
              aria-describedby={`to-help-${leg.id}`}
              className="font-mono text-sm"
            />
            <p id={`to-help-${leg.id}`} className={invalid || self ? "text-sm text-bad" : "text-xs text-muted"}>
              {invalid ? t("transferInvalid") : self ? t("transferSelf") : t("transferHint")}
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {tx.state.status !== "success" && (
              <Button className="w-full" onClick={send} disabled={!isAddress(trimmed) || self || tx.state.status === "pending"}>
                <Send aria-hidden /> {t("transferConfirm")}
              </Button>
            )}
            <TxStatus state={tx.state} successText={t("transferDone")} onRetry={send} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
