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
  resource: "/api/sentiment",
  description: "Score text as positive, negative, or neutral",
};

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "love", "fast", "reliable",
  "awesome", "positive", "happy", "best", "nice", "wonderful",
]);
const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "slow", "hate", "awful", "negative", "worst",
  "broken", "sad", "poor", "buggy", "annoying",
]);

function analyzeSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let score = 0;
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) score += 1;
    if (NEGATIVE_WORDS.has(word)) score -= 1;
  }
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  return { sentiment, score };
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
  recordPaidCall(request, "/api/sentiment");

  return NextResponse.json(analyzeSentiment(text));
}

export const POST = withX402(handler, routeConfig, x402Server);
