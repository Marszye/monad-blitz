import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { MONAD_NETWORK, PAY_TO, x402Server } from "@/lib/x402";
import { recordPaidCall } from "@/lib/registry";

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: PAY_TO,
    price: "$0.001",
  },
  resource: "/api/summarize",
  description: "Summarize text into its first two sentences",
};

function summarize(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .join(" ")
    .trim();
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const text = body?.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Body must be JSON with a non-empty 'text' string field" },
      { status: 400 },
    );
  }

  // Intentionally not awaited: recording the call onchain shouldn't delay the response.
  recordPaidCall(request, "/api/summarize");

  return NextResponse.json({ summary: summarize(text) });
}

export const POST = withX402(handler, routeConfig, x402Server);
