import { NextRequest } from "next/server";
import { payAndCall } from "@/lib/agentClient";
import type { AgentLogEvent } from "@/lib/agentTypes";

const STEPS: Array<{ path: string; buildBody: (input: string) => unknown }> = [
  { path: "/api/summarize", buildBody: (input) => ({ text: input }) },
  { path: "/api/sentiment", buildBody: (input) => ({ text: input }) },
  { path: "/api/price", buildBody: (input) => ({ symbol: input }) },
];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const input = body?.input;

  if (typeof input !== "string" || input.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Body must be JSON with a non-empty 'input' string field" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const origin = request.nextUrl.origin;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentLogEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      for (const step of STEPS) {
        try {
          await payAndCall(new URL(step.path, origin).toString(), step.path, step.buildBody(input), send);
        } catch (error) {
          send({
            step: "error",
            endpoint: step.path,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      send({ step: "done" });
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
