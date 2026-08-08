import { NextRequest } from "next/server";
import { payAndCall } from "@/lib/agentClient";
import type { AgentLogEvent } from "@/lib/agentTypes";
import type { BurstEvent } from "@/lib/agentTypes";

const BURST_TOTAL = 100;
const BURST_BATCH_SIZE = 10;
const BURST_PATH = "/api/price";

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

      for (let batchStart = 0; batchStart < BURST_TOTAL; batchStart += BURST_BATCH_SIZE) {
        const batchIndexes = Array.from(
          { length: Math.min(BURST_BATCH_SIZE, BURST_TOTAL - batchStart) },
          (_, i) => batchStart + i,
        );

        await Promise.all(
          batchIndexes.map(async (index) => {
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
              await payAndCall(
                new URL(BURST_PATH, origin).toString(),
                BURST_PATH,
                { symbol: `BURST-${index}` },
                onEvent,
              );
            } catch (error) {
              message = error instanceof Error ? error.message : String(error);
            }

            if (ok) succeeded += 1;
            else failed += 1;

            send({
              step: "call",
              index,
              ok,
              txHash,
              message,
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
