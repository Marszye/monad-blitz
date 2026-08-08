import { NextResponse } from "next/server";
import { API_REGISTRY_ABI, API_REGISTRY_ADDRESS } from "@/lib/contract";
import { publicClient } from "@/lib/publicClient";
import type { EndpointDTO, FeedEntryDTO, StatsPayload } from "@/lib/statsTypes";

// Force this route to run per-request (not statically optimized) since it
// reads live chain state via readContract/getContractEvents with no
// request-derived input Next.js could otherwise use to infer dynamism.
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 3000;
const MAX_FEED_ENTRIES = 25;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;

// One shared in-memory cache per warm serverless instance: every visitor
// hitting this route within the TTL (or while a refresh is already
// in-flight) reuses the same result instead of triggering its own RPC call.
// This is what turns "N visitors polling the public RPC directly" into
// "at most one RPC round trip per instance every few seconds."
let cache: { data: StatsPayload; expiresAt: number } | null = null;
let lastGood: StatsPayload | null = null;
let inFlight: Promise<StatsPayload> | null = null;
let lastScannedBlock: bigint | null = null;
let feedBuffer: FeedEntryDTO[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

// The public RPC hard-caps eth_getLogs to this many blocks per call
// (confirmed by reproducing "eth_getLogs is limited to a 100 range").
// Kept one under the limit as a safety margin.
const MAX_LOG_RANGE_BLOCKS = BigInt(99);

// Best-effort: extends feedBuffer with any new CallPaid logs since the last
// scan. Deliberately isolated from the core numeric read below — a log-range
// or RPC hiccup here must never take down globalCalls/endpoints, since those
// are what the dashboard's headline numbers depend on. Always advances
// lastScannedBlock (even on failure or when clamping the range) so a single
// bad window can't wedge every future scan behind it; the cost is that a
// long gap between refreshes may drop some older feed entries, which is an
// acceptable tradeoff for a "recent activity" feed.
async function refreshFeed(rows: EndpointDTO[]): Promise<void> {
  const latestBlock = await publicClient.getBlockNumber();
  let fromBlock = lastScannedBlock === null ? latestBlock : lastScannedBlock + BigInt(1);
  if (latestBlock - fromBlock > MAX_LOG_RANGE_BLOCKS - BigInt(1)) {
    fromBlock = latestBlock - (MAX_LOG_RANGE_BLOCKS - BigInt(1));
  }

  try {
    if (fromBlock <= latestBlock) {
      const logs = await publicClient.getContractEvents({
        address: API_REGISTRY_ADDRESS,
        abi: API_REGISTRY_ABI,
        eventName: "CallPaid",
        fromBlock,
        toBlock: latestBlock,
      });

      const pathById = new Map(rows.map((r) => [r.id, r.path]));
      const newEntries: FeedEntryDTO[] = logs.map((log) => {
        const { id, payer, priceMicro } = log.args;
        return {
          key: `${log.transactionHash}-${log.logIndex}`,
          path: pathById.get(id?.toString() ?? "") ?? `#${id}`,
          payer: payer ?? "0x0",
          priceMicro: (priceMicro ?? BigInt(0)).toString(),
          txHash: log.transactionHash,
          observedAt: Date.now(),
        };
      });

      // Logs come back oldest -> newest; newest should land at the top.
      feedBuffer = [...newEntries.reverse(), ...feedBuffer].slice(0, MAX_FEED_ENTRIES);
    }
  } catch (err) {
    console.error("[api/stats] feed scan failed (numbers unaffected):", err instanceof Error ? err.message : err);
  } finally {
    lastScannedBlock = latestBlock;
  }
}

async function refreshStats(): Promise<StatsPayload> {
  const { globalCalls, rows } = await withRetry(async () => {
    const count = await publicClient.readContract({
      address: API_REGISTRY_ADDRESS,
      abi: API_REGISTRY_ABI,
      functionName: "endpointCount",
    });

    const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
    const rows: EndpointDTO[] = await Promise.all(
      ids.map(async (id) => {
        const [path, priceMicro, callCount] = await publicClient.readContract({
          address: API_REGISTRY_ADDRESS,
          abi: API_REGISTRY_ABI,
          functionName: "getEndpoint",
          args: [id],
        });
        return { id: id.toString(), path, priceMicro: priceMicro.toString(), callCount: callCount.toString() };
      }),
    );

    const globalCalls = await publicClient.readContract({
      address: API_REGISTRY_ADDRESS,
      abi: API_REGISTRY_ABI,
      functionName: "globalCalls",
    });

    return { globalCalls, rows };
  });

  await refreshFeed(rows);

  return {
    ok: true,
    fetchedAt: Date.now(),
    globalCalls: globalCalls.toString(),
    endpoints: rows,
    feed: feedBuffer,
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "cache-control": "no-store" } });
  }

  if (!inFlight) {
    inFlight = refreshStats().finally(() => {
      inFlight = null;
    });
  }

  try {
    const data = await inFlight;
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    lastGood = data;
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/stats] refresh failed after retries:", message);
    cache = null;

    // Never fabricate zeros: hand back the last successful read (marked
    // stale via ok:false) so the dashboard can keep showing real numbers.
    if (lastGood) {
      return NextResponse.json(
        { ...lastGood, ok: false, error: message },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: false, fetchedAt: now, globalCalls: "0", endpoints: [], feed: [], error: message },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
