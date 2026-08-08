"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { API_REGISTRY_ABI, API_REGISTRY_ADDRESS } from "@/lib/contract";
import { publicClient } from "@/lib/publicClient";
import { EXPLORER_URL } from "@/lib/chain";
import { formatAddress, formatCount, formatTime, formatUsdMicro } from "@/lib/format";

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

const MAX_FEED_ENTRIES = 25;

export function Dashboard() {
  const [endpoints, setEndpoints] = useState<EndpointRow[] | null>(null);
  const [globalCalls, setGlobalCalls] = useState<bigint>(BigInt(0));
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const endpointsRef = useRef<EndpointRow[]>([]);
  useEffect(() => {
    endpointsRef.current = endpoints ?? [];
  }, [endpoints]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const count = await publicClient.readContract({
          address: API_REGISTRY_ADDRESS,
          abi: API_REGISTRY_ABI,
          functionName: "endpointCount",
        });

        const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
        const rows = await Promise.all(
          ids.map(async (id) => {
            const [path, priceMicro, callCount] = await publicClient.readContract({
              address: API_REGISTRY_ADDRESS,
              abi: API_REGISTRY_ABI,
              functionName: "getEndpoint",
              args: [id],
            });
            const row: EndpointRow = { id, path, priceMicro, callCount };
            return row;
          }),
        );

        const total = await publicClient.readContract({
          address: API_REGISTRY_ADDRESS,
          abi: API_REGISTRY_ABI,
          functionName: "globalCalls",
        });

        if (cancelled) return;
        setEndpoints(rows);
        setGlobalCalls(total);
        setLive(true);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load ApiRegistry state:", err);
          setError("Gagal membaca data dari contract. Cek koneksi RPC.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: API_REGISTRY_ADDRESS,
      abi: API_REGISTRY_ABI,
      eventName: "CallPaid",
      pollingInterval: 2000,
      onLogs: (logs) => {
        setLive(true);
        for (const log of logs) {
          const { id, payer, priceMicro } = log.args;
          if (id === undefined || payer === undefined || priceMicro === undefined) continue;

          const path = endpointsRef.current.find((e) => e.id === id)?.path ?? `#${id}`;

          setEndpoints((prev) =>
            prev ? prev.map((e) => (e.id === id ? { ...e, callCount: e.callCount + BigInt(1) } : e)) : prev,
          );
          setGlobalCalls((prev) => prev + BigInt(1));
          setFeed((prev) => {
            const entry: FeedEntry = {
              key: `${log.transactionHash}-${log.logIndex}`,
              path,
              payer,
              priceMicro,
              txHash: log.transactionHash,
              receivedAt: new Date(),
            };
            return [entry, ...prev].slice(0, MAX_FEED_ENTRIES);
          });
        }
      },
      onError: (err) => {
        console.error("watchContractEvent error:", err);
      },
    });
    return () => unwatch();
  }, []);

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
              className={`h-2 w-2 rounded-full ${live ? "bg-accent animate-pulse-dot" : "bg-muted"}`}
            />
            <span className="stat-label">
              {live ? "Live" : "Connecting"} · Monad Testnet
            </span>
          </div>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
            Sat<span className="text-accent">Set</span>
          </h1>
          <p className="mt-3 text-lg text-muted">Provider dashboard — x402 API marketplace</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        <StatTile label="Total calls" value={formatCount(globalCalls)} accent="calls" />
        <StatTile label="Total revenue" value={formatUsdMicro(totalRevenueMicro)} accent="revenue" />
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

function StatTile({ label, value, accent }: { label: string; value: string; accent: "calls" | "revenue" }) {
  return (
    <div className="card px-8 py-10 md:px-10 md:py-12">
      <p className="stat-label">{label}</p>
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
