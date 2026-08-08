"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { API_REGISTRY_ADDRESS } from "@/lib/contract";
import { EXPLORER_URL } from "@/lib/chain";
import { formatAddress, formatCount, formatTime, formatUsdMicro } from "@/lib/format";
import type { StatsPayload } from "@/lib/statsTypes";

interface EndpointRow {
  id: bigint;
  path: string;
  priceMicro: bigint;
  callCount: bigint;
}

interface FeedEntry {
  key: string;
  path: string;
  payer: `0x${string}`;
  priceMicro: bigint;
  txHash: `0x${string}`;
  receivedAt: Date;
}

// Reads live entirely through /api/stats (server-side, one shared RPC
// connection cached for all visitors) instead of hitting the public RPC
// directly from every browser — see /api/stats/route.ts for why.
const POLL_INTERVAL_MS = 5000;

export function Dashboard() {
  const [endpoints, setEndpoints] = useState<EndpointRow[] | null>(null);
  const [globalCalls, setGlobalCalls] = useState<bigint>(BigInt(0));
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        const data = (await res.json()) as StatsPayload;
        if (cancelled) return;

        if (data.ok) {
          setEndpoints(
            data.endpoints.map((e) => ({
              id: BigInt(e.id),
              path: e.path,
              priceMicro: BigInt(e.priceMicro),
              callCount: BigInt(e.callCount),
            })),
          );
          setGlobalCalls(BigInt(data.globalCalls));
          setFeed(
            data.feed.map((f) => ({
              key: f.key,
              path: f.path,
              payer: f.payer as `0x${string}`,
              priceMicro: BigInt(f.priceMicro),
              txHash: f.txHash as `0x${string}`,
              receivedAt: new Date(f.observedAt),
            })),
          );
          hasLoadedRef.current = true;
          setLoaded(true);
          setReconnecting(false);
          setError(null);
        } else {
          // RPC refresh failed (even after retries) — keep whatever we
          // already rendered on screen instead of dropping to 0, and only
          // surface a hard error if we've never loaded real data at all.
          setReconnecting(true);
          if (!hasLoadedRef.current) setError(data.error ?? "RPC belum merespons.");
        }
      } catch (err) {
        if (cancelled) return;
        setReconnecting(true);
        if (!hasLoadedRef.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const live = loaded && !reconnecting;

  const totalRevenueMicro = useMemo(() => {
    if (!endpoints) return BigInt(0);
    return endpoints.reduce((sum, e) => sum + e.priceMicro * e.callCount, BigInt(0));
  }, [endpoints]);

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-16 px-6 py-20 md:px-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "bg-accent animate-pulse-dot" : loaded ? "bg-amber-400 animate-pulse-dot" : "bg-muted"
              }`}
            />
            <span className="stat-label">
              {loaded ? (live ? "Live" : "Reconnecting") : "Connecting"} · Monad Testnet
            </span>
          </div>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
            Sat<span className="text-accent">Set</span>
          </h1>
          <p className="mt-3 text-lg text-muted">Provider dashboard — x402 API marketplace</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/try"
            className="rounded-xl border border-accent/40 bg-accent-soft px-5 py-3 text-sm font-medium text-accent transition-colors hover:border-accent"
          >
            Coba bayar sendiri →
          </Link>
          <Link
            href="/agent"
            className="rounded-xl border border-accent/40 bg-accent-soft px-5 py-3 text-sm font-medium text-accent transition-colors hover:border-accent"
          >
            Run agent →
          </Link>
          <a
            href={`${EXPLORER_URL}/address/${API_REGISTRY_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="card px-5 py-3 font-mono text-sm text-muted transition-colors hover:text-accent"
          >
            {formatAddress(API_REGISTRY_ADDRESS)} ↗
          </a>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <StatTile
          label="Total calls"
          value={loaded ? formatCount(globalCalls) : "—"}
          accent="calls"
          reconnecting={reconnecting && loaded}
        />
        <StatTile
          label="Total revenue"
          value={loaded ? formatUsdMicro(totalRevenueMicro) : "—"}
          accent="revenue"
          reconnecting={reconnecting && loaded}
        />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="stat-label">Endpoints</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="px-8 py-5 stat-label font-medium">Path</th>
                <th className="px-8 py-5 stat-label font-medium">Price</th>
                <th className="px-8 py-5 stat-label font-medium">Total calls</th>
                <th className="px-8 py-5 stat-label font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {endpoints === null && !error && (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {endpoints?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-muted">
                    Belum ada endpoint terdaftar.
                  </td>
                </tr>
              )}
              {endpoints?.map((e) => (
                <tr
                  key={e.id.toString()}
                  className="h-16 border-t border-divider transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-8 font-mono text-base">{e.path}</td>
                  <td className="px-8 text-foreground/90">{formatUsdMicro(e.priceMicro)}</td>
                  <td className="px-8 text-foreground/90">{formatCount(e.callCount)}</td>
                  <td className="px-8 font-semibold text-accent-revenue">
                    {formatUsdMicro(e.priceMicro * e.callCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-dot" />
            <h2 className="stat-label">Live feed</h2>
          </div>
          <span className="stat-label">CallPaid events</span>
        </div>
        <div className="card max-h-[480px] divide-y divide-divider overflow-y-auto">
          {feed.length === 0 && (
            <p className="px-8 py-10 text-center text-muted">Menunggu pembayaran pertama…</p>
          )}
          {feed.map((entry) => (
            <div key={entry.key} className="animate-row-in flex flex-wrap items-center gap-4 px-8 py-5 font-mono">
              <span className="w-20 shrink-0 text-xs tabular-nums text-muted">
                {formatTime(entry.receivedAt)}
              </span>
              <span className="text-sm text-foreground">{entry.path}</span>
              <span className="text-sm text-muted">{formatAddress(entry.payer)}</span>
              <span className="ml-auto font-sans font-semibold text-accent-revenue">
                {formatUsdMicro(entry.priceMicro)}
              </span>
              <a
                href={`${EXPLORER_URL}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent underline decoration-accent/40 hover:text-accent-strong"
              >
                {formatAddress(entry.txHash)} ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatTile({
  label,
  value,
  accent,
  reconnecting,
}: {
  label: string;
  value: string;
  accent: "calls" | "revenue";
  reconnecting: boolean;
}) {
  return (
    <div className="card px-8 py-10 md:px-10 md:py-12">
      <div className="flex items-center gap-2.5">
        <p className="stat-label">{label}</p>
        {reconnecting && <span className="stat-label text-amber-400">· reconnecting</span>}
      </div>
      <p
        className={`stat-value mt-4 text-7xl md:text-8xl ${
          accent === "revenue" ? "text-accent-revenue" : "text-accent"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
