import { NextRequest } from "next/server";
import { payAndCall } from "@/lib/agentClient";
import type { AgentLogEvent } from "@/lib/agentTypes";
import type { BurstEvent } from "@/lib/agentTypes";

const BURST_TOTAL = 100;
// Lowered from 10: each successful payment also triggers a fire-and-forget
// recordCall write from the shared recorder wallet (see registry.ts). That
// write path is now serialized/nonce-safe regardless of concurrency, but
// keeping this modest still avoids hammering the payment path (RPC calls,
// x402 facilitator, signing) all at once for no benefit.
const BURST_CONCURRENCY = 4;
const BURST_PATH = "/api/price";
const CALL_RETRY_ATTEMPTS = 2; // extra attempts after the first try

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function payWithRetry(
  url: string,
  index: number,
): Promise<{ ok: boolean; txHash?: string; message?: string }> {
  let lastMessage: string | undefined;

  for (let attempt = 0; attempt <= CALL_RETRY_ATTEMPTS; attempt++) {
    let ok = false;
    let txHash: string | undefined;
    let message: string | undefined;

    const onEvent = (event: AgentLogEvent) => {
      if (event.step === "200") {
        ok = true;
        txHash = event.txHash || undefined;
      } else if (event.step === "error") {
        message = event.message;
      }
    };

    try {
      await payAndCall(url, BURST_PATH, { symbol: `BURST-${index}` }, onEvent);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    if (ok) return { ok: true, txHash };

    lastMessage = message ?? "unknown error";
    console.error(`[burst] call ${index} attempt ${attempt + 1}/${CALL_RETRY_ATTEMPTS + 1} failed:`, lastMessage);
    if (attempt < CALL_RETRY_ATTEMPTS) await sleep(500);
  }

  return { ok: false, message: lastMessage };
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: BurstEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let succeeded = 0;
      let failed = 0;

      for (let batchStart = 0; batchStart < BURST_TOTAL; batchStart += BURST_CONCURRENCY) {
        const batchIndexes = Array.from(
          { length: Math.min(BURST_CONCURRENCY, BURST_TOTAL - batchStart) },
          (_, i) => batchStart + i,
        );

        await Promise.all(
          batchIndexes.map(async (index) => {
            const result = await payWithRetry(new URL(BURST_PATH, origin).toString(), index);

            if (result.ok) succeeded += 1;
            else failed += 1;

            send({
              step: "call",
              index,
              ok: result.ok,
              txHash: result.txHash,
              message: result.message,
              completed: succeeded + failed,
              total: BURST_TOTAL,
            });
          }),
        );
      }

      send({ step: "done", total: BURST_TOTAL, succeeded, failed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
