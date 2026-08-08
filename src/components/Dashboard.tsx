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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-10 md:gap-14 md:px-12 md:py-14">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${live ? "bg-accent animate-pulse-dot" : "bg-muted"}`}
            />
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
              {live ? "Live" : "Connecting"} · Monad Testnet
            </span>
          </div>
          <h1 className="mt-3 text-5xl font-black tracking-tight md:text-7xl">
            Sat<span className="text-accent-strong">Set</span>
          </h1>
          <p className="mt-2 text-lg text-muted">Provider dashboard — x402 API marketplace</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/agent"
            className="rounded-xl border border-accent/50 bg-accent-soft px-5 py-3 text-sm font-semibold text-accent-strong transition-colors hover:border-accent"
          >
            Run agent →
          </Link>
          <a
            href={`${EXPLORER_URL}/address/${API_REGISTRY_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border bg-surface px-5 py-3 font-mono text-sm text-muted transition-colors hover:border-accent hover:text-accent-strong"
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
        <StatTile label="Total calls" value={formatCount(globalCalls)} />
        <StatTile label="Total revenue" value={formatUsdMicro(totalRevenueMicro)} />
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Endpoints</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-sm uppercase tracking-wide text-muted">
                <th className="px-6 py-4 font-medium">Path</th>
                <th className="px-6 py-4 font-medium">Price</th>
                <th className="px-6 py-4 font-medium">Total calls</th>
                <th className="px-6 py-4 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {endpoints === null && !error && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {endpoints?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-muted">
                    Belum ada endpoint terdaftar.
                  </td>
                </tr>
              )}
              {endpoints?.map((e) => (
                <tr
                  key={e.id.toString()}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-2/60"
                >
                  <td className="px-6 py-5 font-mono text-base">{e.path}</td>
                  <td className="px-6 py-5">{formatUsdMicro(e.priceMicro)}</td>
                  <td className="px-6 py-5">{formatCount(e.callCount)}</td>
                  <td className="px-6 py-5 font-semibold text-accent-strong">
                    {formatUsdMicro(e.priceMicro * e.callCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Live feed</h2>
          <span className="text-sm text-muted">CallPaid events</span>
        </div>
        <div className="max-h-[480px] divide-y divide-border/60 overflow-y-auto rounded-2xl border border-border bg-surface">
          {feed.length === 0 && (
            <p className="px-6 py-10 text-center text-muted">Menunggu pembayaran pertama…</p>
          )}
          {feed.map((entry) => (
            <div key={entry.key} className="animate-row-in flex flex-wrap items-center gap-4 px-6 py-4">
              <span className="w-20 shrink-0 font-mono text-xs tabular-nums text-muted">
                {formatTime(entry.receivedAt)}
              </span>
              <span className="font-mono text-sm text-foreground">{entry.path}</span>
              <span className="font-mono text-sm text-muted">{formatAddress(entry.payer)}</span>
              <span className="ml-auto font-semibold text-accent-strong">
                {formatUsdMicro(entry.priceMicro)}
              </span>
              <a
                href={`${EXPLORER_URL}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent underline decoration-accent/40 hover:text-accent-strong"
              >
                View tx ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface px-8 py-10">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-strong to-accent" />
      <p className="text-sm uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-3 text-6xl font-black tracking-tight text-foreground md:text-8xl">{value}</p>
    </div>
  );
}
