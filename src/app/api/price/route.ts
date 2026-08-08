import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { MONAD_NETWORK, PAY_TO, x402Server } from "@/lib/x402";
import { recordPaidCall } from "@/lib/registry";

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: PAY_TO,
    price: "$0.002",
  },
  resource: "/api/price",
  description: "Deterministic mock price quote for a symbol",
};

// Deterministic (no external API, no LLM): hashes the symbol into a stable
// price in the $0.01-$1000 range, so repeat calls for the same symbol agree.
function quotePrice(symbol: string): number {
  let hash = 0;
  for (const char of symbol) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const normalized = (hash % 100_000) / 100_000;
  const price = 0.01 + normalized * 999.99;
  return Math.round(price * 100) / 100;
}

async function handler(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const symbol = body?.symbol;

  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    return NextResponse.json(
      { error: "Body must be JSON with a non-empty 'symbol' string field" },
      { status: 400 },
    );
  }

  // Intentionally not awaited: recording the call onchain shouldn't delay the response.
  recordPaidCall(request, "/api/price");

  const normalizedSymbol = symbol.trim().toUpperCase();
  return NextResponse.json({ symbol: normalizedSymbol, price: quotePrice(normalizedSymbol) });
}

export const POST = withX402(handler, routeConfig, x402Server);
