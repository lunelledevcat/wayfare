"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Building2, CircleCheck, Hand, LoaderCircle, ScanLine, ShieldCheck, TriangleAlert, Users, XCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { verifyMessage, type Address, type Hex, type PublicClient } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { activeChain, deployment, TicketStatus } from "@/lib/chain";
import { bookingAbi, ticketAbi, usdcAbi } from "@/lib/contracts.generated";
import { dayLabel } from "@/lib/format";
import { bkkMidnight } from "@/lib/time";
import { cn } from "@/lib/utils";
import { checkInMessage, loadLegs, NO_SHOW_DELAY_MS, operatorMode, shortAddr, statusKey, statusTone, unitsToThb, unitsToUsdc, useEnsureChain, type LegView } from "../app/chain-data";
import { ConnectPrompt, EmptyState, ListSkeleton, LoadError } from "../app/states";
import { ModeIcon } from "../mode-icon";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Badge, Card, Input, Label, Skeleton } from "../ui/primitives";
import { useFmt } from "../use-fmt";
import { TxStatus } from "../wallet/tx-status";
import { useTx } from "../wallet/use-tx";

const QrScanner = dynamic(() => import("./qr-scanner"), { ssr: false, loading: () => <Skeleton className="aspect-square w-full" /> });

const OP_KEY = "wf-op";

export function OperatorConsole() {
  const t = useTranslations("operator");
  const tw = useTranslations("wallet");
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: activeChain.id });

  const info = useQuery({
    queryKey: [OP_KEY, "info", activeChain.id, address],
    queryFn: async () => {
      const [name, active] = await client!.readContract({ address: deployment!.booking, abi: bookingAbi, functionName: "operatorInfo", args: [address!] });
      return { name, active };
    },
    enabled: !!client && !!address && !!deployment,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-muted">{t("subtitle")}</p>
      </div>
      {!deployment ? (
        <EmptyState icon={Building2} title={t("noDeployment")} />
      ) : !isConnected || !address ? (
        <ConnectPrompt text={t("connect")} />
      ) : info.isPending ? (
        <ListSkeleton />
      ) : info.isError ? (
        <LoadError text={t("loadError")} onRetry={() => info.refetch()} retryLabel={tw("tryAgain")} />
      ) : !info.data.name ? (
        <NotOperator address={address} />
      ) : (
        <Dashboard address={address} name={info.data.name} active={info.data.active} />
      )}
    </div>
  );
}

function NotOperator({ address }: { address: Address }) {
  const t = useTranslations("operator.notOperator");
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-6 shrink-0 text-warn" aria-hidden />
        <div>
          <h2 className="font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("body", { address: shortAddr(address) })}</p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold">{t("demoList")}</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {deployment?.operators.map((o) => {
            const mode = operatorMode(o.address);
            return (
              <li key={o.address} className="flex items-center gap-3 rounded-xl bg-bg p-3">
                {mode && <ModeIcon mode={mode} className="size-9 rounded-lg" />}
                <span className="min-w-0">
                  <span className="block font-semibold">{o.name}</span>
                  <span className="block font-mono text-xs text-muted">{shortAddr(o.address)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary">{t("howTo")}</p>
    </Card>
  );
}

interface Service {
  serviceId: Hex;
  label: string;
  departAt: number;
  tickets: LegView[];
}

/** Sum of operator income from check-ins and no-show claims made today (Bangkok time). */
async function earningsToday(client: PublicClient, operator: Address): Promise<bigint> {
  const d = deployment!;
  const since = bkkMidnight(Date.now());
  const fromBlock = BigInt(d.deployBlock);
  const [checked, noShow] = await Promise.all([
    client.getContractEvents({ address: d.booking, abi: bookingAbi, eventName: "CheckedIn", args: { operator }, fromBlock }),
    client.getContractEvents({ address: d.booking, abi: bookingAbi, eventName: "NoShowClaimed", args: { operator }, fromBlock }),
  ]);
  const logs = [...checked, ...noShow];
  const blocks = [...new Set(logs.map((l) => l.blockNumber))];
  const stamps = new Map<bigint, number>();
  await Promise.all(blocks.map(async (b) => stamps.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp) * 1000)));
  let sum = 0n;
  for (const l of logs) if ((stamps.get(l.blockNumber) ?? 0) >= since) sum += (l.args as { amount?: bigint }).amount ?? 0n;
  return sum;
}

function Dashboard({ address, name, active }: { address: Address; name: string; active: boolean }) {
  const t = useTranslations("operator");
  const tw = useTranslations("wallet");
  const { price } = useFmt();
  const client = usePublicClient({ chainId: activeChain.id });
  const [scanOpen, setScanOpen] = useState(false);

  const legs = useQuery({
    queryKey: [OP_KEY, "legs", activeChain.id, address],
    queryFn: async () => {
      const ids = await client!.readContract({ address: deployment!.booking, abi: bookingAbi, functionName: "ticketsOfOperator", args: [address] });
      return loadLegs(client!, ids);
    },
    enabled: !!client,
  });
  const balance = useQuery({
    queryKey: [OP_KEY, "balance", activeChain.id, address],
    queryFn: () => client!.readContract({ address: deployment!.usdc, abi: usdcAbi, functionName: "balanceOf", args: [address] }),
    enabled: !!client,
  });
  const earnings = useQuery({
    queryKey: [OP_KEY, "earnings", activeChain.id, address],
    queryFn: () => earningsToday(client!, address),
    enabled: !!client,
    retry: false,
  });

  const services = useMemo<Service[]>(() => {
    const map = new Map<string, Service>();
    for (const l of legs.data ?? []) {
      const s = map.get(l.serviceId);
      if (s) s.tickets.push(l);
      else map.set(l.serviceId, { serviceId: l.serviceId, label: l.label, departAt: l.departAt, tickets: [l] });
    }
    return [...map.values()].sort((a, b) => a.departAt - b.departAt);
  }, [legs.data]);

  // fallback when event logs are unavailable (e.g. RPC log-range limits): paid out on services departing today
  const todayFallback = useMemo(() => {
    const since = bkkMidnight(Date.now());
    return (legs.data ?? []).filter((l) => l.departAt >= since && l.departAt < since + 86_400_000).reduce((s, l) => s + l.paidOut, 0n);
  }, [legs.data]);
  const today = earnings.data ?? (earnings.isError ? todayFallback : undefined);

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {operatorMode(address) && <ModeIcon mode={operatorMode(address)!} className="size-12 rounded-xl" />}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
              {name}
              <Badge tone={active ? "good" : "bad"}>{active ? t("active") : t("inactive")}</Badge>
            </p>
            <p className="font-mono text-xs text-muted">{shortAddr(address)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 md:flex md:gap-6">
          <div>
            <dt className="text-xs text-muted">{t("balance")}</dt>
            <dd className="text-xl font-extrabold tabular">{balance.data !== undefined ? price(unitsToThb(balance.data)) : <Skeleton className="h-7 w-24" />}</dd>
            {balance.data !== undefined && <dd className="text-xs text-muted tabular">≈ {unitsToUsdc(balance.data)} USDC</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted">{t("today")}</dt>
            <dd className="text-xl font-extrabold text-good tabular">{today !== undefined ? price(unitsToThb(today)) : <Skeleton className="h-7 w-24" />}</dd>
          </div>
        </dl>
        <Button size="lg" onClick={() => setScanOpen(true)} className="md:ml-2">
          <ScanLine aria-hidden /> {t("scanButton")}
        </Button>
      </Card>

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} operator={address} />

      <section aria-labelledby="services" className="space-y-3">
        <h2 id="services" className="text-lg font-bold">
          {t("services")}
        </h2>
        {legs.isPending ? (
          <ListSkeleton />
        ) : legs.isError ? (
          <LoadError text={t("loadError")} onRetry={() => legs.refetch()} retryLabel={tw("tryAgain")} />
        ) : services.length === 0 ? (
          <EmptyState icon={Users} title={t("empty")} body={t("emptyBody")} />
        ) : (
          services.map((s) => <ServiceCard key={s.serviceId} service={s} />)
        )}
      </section>
    </div>
  );
}

function ServiceCard({ service }: { service: Service }) {
  const t = useTranslations("operator");
  const tw = useTranslations("wallet");
  const { price, time, locale } = useFmt();
  const [cancelOpen, setCancelOpen] = useState(false);
  const booked = service.tickets.filter((l) => l.status === TicketStatus.Booked);
  const escrow = booked.reduce((s, l) => s + l.price, 0n);
  const paid = service.tickets.reduce((s, l) => s + l.paidOut, 0n);
  const counts = new Map<TicketStatus, number>();
  for (const l of service.tickets) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-bold">{service.label}</h3>
          <p className="text-sm text-muted tabular">{t("departs", { day: dayLabel(service.departAt, locale), time: time(service.departAt) })}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone="neutral">
              <Users aria-hidden /> {t("passengers", { n: service.tickets.length })}
            </Badge>
            {[...counts].map(([s, n]) => (
              <Badge key={s} tone={statusTone(s)}>
                {tw(`status.${statusKey(s)}`)} ×{n}
              </Badge>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">{t("escrow")}</dt>
            <dd className="font-bold tabular">{price(unitsToThb(escrow))}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("paidOut")}</dt>
            <dd className="font-bold text-good tabular">{price(unitsToThb(paid))}</dd>
          </div>
        </dl>
      </div>
      <details className="group mt-4 rounded-xl border border-border">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">{t("ticketList", { n: service.tickets.length })}</summary>
        <ul className="divide-y divide-border">
          {service.tickets.map((l) => (
            <TicketRow key={String(l.id)} leg={l} />
          ))}
        </ul>
      </details>
      {booked.length > 0 && (
        <div className="mt-4">
          <Button variant="outline" className="border-bad text-bad hover:bg-bad-soft" onClick={() => setCancelOpen(true)}>
            <XCircle aria-hidden /> {t("cancelService")}
          </Button>
          <CancelServiceDialog open={cancelOpen} onOpenChange={setCancelOpen} service={service} booked={booked} total={escrow} />
        </div>
      )}
    </Card>
  );
}

function useOperatorWrite() {
  const client = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();
  const ensureChain = useEnsureChain();
  const qc = useQueryClient();
  const write = async (setStep: (s: string) => void, step: string, call: { functionName: "checkIn" | "claimNoShow" | "cancelManyByOperator"; args: readonly [bigint] | readonly [readonly bigint[]] }) => {
    if (!deployment || !client) throw new Error("not ready");
    await ensureChain(setStep);
    setStep(step);
    const hash = await writeContractAsync({ address: deployment.booking, abi: bookingAbi, functionName: call.functionName, args: call.args, chainId: activeChain.id } as never);
    setStep("confirm");
    await client.waitForTransactionReceipt({ hash });
    return { hash };
  };
  const refresh = () => qc.invalidateQueries({ queryKey: [OP_KEY] });
  return { write, refresh };
}

function TicketRow({ leg }: { leg: LegView }) {
  const t = useTranslations("operator");
  const tw = useTranslations("wallet");
  const { price } = useFmt();
  const { write, refresh } = useOperatorWrite();
  const checkIn = useTx();
  const noShow = useTx();
  const [now] = useState(() => Date.now());
  const booked = leg.status === TicketStatus.Booked;
  const noShowReady = booked && now >= leg.departAt + NO_SHOW_DELAY_MS;
  const busy = checkIn.state.status === "pending" || noShow.state.status === "pending";

  const doCheckIn = async () => {
    const r = await checkIn.run((s) => write(s, "checkin", { functionName: "checkIn", args: [leg.id] }));
    if (r) refresh();
  };
  const doNoShow = async () => {
    const r = await noShow.run((s) => write(s, "noshow", { functionName: "claimNoShow", args: [leg.id] }));
    if (r) refresh();
  };

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular">{t("ticketNo", { id: String(leg.id) })}</span>
        <Badge tone={statusTone(leg.status)}>{tw(`status.${statusKey(leg.status)}`)}</Badge>
        <span className="ml-auto text-sm tabular">{price(unitsToThb(leg.price))}</span>
      </div>
      {booked && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="good" onClick={doCheckIn} disabled={busy}>
            <CircleCheck aria-hidden /> {t("checkIn")}
          </Button>
          <Button size="sm" variant="outline" onClick={doNoShow} disabled={busy || !noShowReady} title={noShowReady ? undefined : t("noShowHint")}>
            <Hand aria-hidden /> {t("noShow")}
          </Button>
        </div>
      )}
      {booked && !noShowReady && <p className="text-xs text-muted">{t("noShowHint")}</p>}
      <TxStatus state={checkIn.state} successText={t("paidIn", { price: price(unitsToThb(leg.price)) })} onRetry={doCheckIn} />
      <TxStatus state={noShow.state} successText={t("paidIn", { price: price(unitsToThb(leg.price)) })} onRetry={doNoShow} />
    </li>
  );
}

function CancelServiceDialog({ open, onOpenChange, service, booked, total }: { open: boolean; onOpenChange: (o: boolean) => void; service: Service; booked: LegView[]; total: bigint }) {
  const t = useTranslations("operator.cancel");
  const tc = useTranslations("common");
  const { price } = useFmt();
  const { write, refresh } = useOperatorWrite();
  const tx = useTx();
  const run = () => tx.run((s) => write(s, "cancelTrip", { functionName: "cancelManyByOperator", args: [booked.map((l) => l.id)] }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o && tx.state.status === "success") refresh();
        if (!o) tx.reset();
      }}
    >
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{service.label}</DialogDescription>
        <dl className="mt-4 space-y-2 rounded-xl bg-bg p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{t("passengers")}</dt>
            <dd className="font-semibold tabular">{booked.length}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>{t("refund")}</dt>
            <dd className="tabular">
              {price(unitsToThb(total))} <span className="text-xs font-normal text-muted">≈ {unitsToUsdc(total)} USDC</span>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-muted">{t("body")}</p>
        <div className="mt-4 space-y-2">
          {tx.state.status !== "success" && (
            <Button variant="danger" className="w-full" onClick={run} disabled={tx.state.status === "pending"}>
              {t("confirm", { n: booked.length })}
            </Button>
          )}
          <TxStatus state={tx.state} successText={t("done", { n: booked.length, refund: price(unitsToThb(total)) })} onRetry={run} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Verified =
  | { ok: true; leg: LegView; holder: Address; signed: boolean }
  | { ok: false; problem: "parse" | "wrongChain" | "unknown" | "notYours" | "notBooked" | "badSignature"; leg?: LegView };

function parsePayload(text: string): { t: bigint; c?: number; s?: Hex } | null {
  const raw = text.trim();
  if (/^#?\d+$/.test(raw)) return { t: BigInt(raw.replace("#", "")) };
  try {
    const j = JSON.parse(raw) as { t?: unknown; c?: unknown; s?: unknown };
    if ((typeof j.t !== "number" && typeof j.t !== "string") || !/^\d+$/.test(String(j.t))) return null;
    return { t: BigInt(String(j.t)), c: typeof j.c === "number" ? j.c : undefined, s: typeof j.s === "string" && j.s.startsWith("0x") ? (j.s as Hex) : undefined };
  } catch {
    return null;
  }
}

async function verifyTicket(client: PublicClient, operator: Address, text: string): Promise<Verified> {
  const p = parsePayload(text);
  if (!p) return { ok: false, problem: "parse" };
  if (p.c !== undefined && p.c !== activeChain.id) return { ok: false, problem: "wrongChain" };
  let leg: LegView;
  let holder: Address;
  try {
    [leg] = await loadLegs(client, [p.t]);
    holder = await client.readContract({ address: deployment!.ticket, abi: ticketAbi, functionName: "ownerOf", args: [p.t] });
  } catch {
    return { ok: false, problem: "unknown" };
  }
  if (leg.operator.toLowerCase() !== operator.toLowerCase()) return { ok: false, problem: "notYours", leg };
  if (leg.status !== TicketStatus.Booked) return { ok: false, problem: "notBooked", leg };
  if (p.s) {
    const valid = await verifyMessage({ address: holder, message: checkInMessage(p.t), signature: p.s }).catch(() => false);
    if (!valid) return { ok: false, problem: "badSignature", leg };
  }
  return { ok: true, leg, holder, signed: !!p.s };
}

function ScanDialog({ open, onOpenChange, operator }: { open: boolean; onOpenChange: (o: boolean) => void; operator: Address }) {
  const t = useTranslations("operator.scan");
  const tc = useTranslations("common");
  const tw = useTranslations("wallet");
  const { price } = useFmt();
  const client = usePublicClient({ chainId: activeChain.id });
  const { write, refresh } = useOperatorWrite();
  const tx = useTx();
  const [manual, setManual] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Verified | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [camera, setCamera] = useState(true);

  const reset = () => {
    setResult(null);
    setManual("");
    tx.reset();
  };

  const check = async (text: string) => {
    if (!client || checking) return;
    setChecking(true);
    tx.reset();
    try {
      setResult(await verifyTicket(client, operator, text));
    } finally {
      setChecking(false);
    }
  };

  const doCheckIn = async () => {
    if (!result?.ok) return;
    const r = await tx.run((s) => write(s, "checkin", { functionName: "checkIn", args: [result.leg.id] }));
    if (r) refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent closeLabel={tc("close")}>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("body")}</DialogDescription>

        {!result && (
          <div className="mt-4 space-y-4">
            {camera && !camError ? (
              <div className="mx-auto w-full max-w-xs">
                {open && <QrScanner paused={checking} onResult={check} onError={setCamError} />}
              </div>
            ) : (
              camError && <p className="rounded-xl bg-warn-soft p-3 text-sm text-fg">{t("cameraError")}</p>
            )}
            {!camError && (
              <Button variant="ghost" size="sm" onClick={() => setCamera((c) => !c)}>
                {camera ? t("cameraOff") : t("cameraOn")}
              </Button>
            )}
            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) check(manual);
              }}
            >
              <Label htmlFor="manual-ticket">{t("manual")}</Label>
              <div className="flex gap-2">
                <Input id="manual-ticket" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("manualPlaceholder")} autoComplete="off" spellCheck={false} />
                <Button type="submit" variant="secondary" disabled={!manual.trim() || checking}>
                  {t("verify")}
                </Button>
              </div>
            </form>
            {checking && (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t("checking")}
              </p>
            )}
          </div>
        )}

        {result && !result.ok && (
          <div role="alert" className="mt-4 space-y-3 rounded-xl bg-bad-soft p-4 text-sm text-bad">
            <p className="flex items-start gap-2 font-semibold">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(`problem.${result.problem}`)}
            </p>
            {result.leg && (
              <p className="text-fg">
                {t("ticketLine", { id: String(result.leg.id), label: result.leg.label })} · {tw(`status.${statusKey(result.leg.status)}`)}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
              {t("again")}
            </Button>
          </div>
        )}

        {result?.ok && (
          <div className="mt-4 space-y-3">
            <div className={cn("rounded-xl p-4 text-sm", result.signed ? "bg-good-soft text-good" : "bg-warn-soft text-fg")}>
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5" aria-hidden />
                {result.signed ? t("signatureOk", { holder: shortAddr(result.holder) }) : t("noSignature", { holder: shortAddr(result.holder) })}
              </p>
              <p className="mt-1 text-fg">{t("ticketLine", { id: String(result.leg.id), label: result.leg.label })}</p>
            </div>
            {tx.state.status !== "success" ? (
              <Button size="lg" variant="good" className="w-full" onClick={doCheckIn} disabled={tx.state.status === "pending"}>
                <Banknote aria-hidden /> {t("checkIn", { price: price(unitsToThb(result.leg.price)) })}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={reset}>
                <ScanLine aria-hidden /> {t("next")}
              </Button>
            )}
            <TxStatus state={tx.state} successText={t("paid", { price: price(unitsToThb(result.leg.price)) })} onRetry={doCheckIn} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
