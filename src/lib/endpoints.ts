// Endpoint ids as registered onchain, in order, by scripts/deploy.ts.
export const ENDPOINT_IDS = {
  "/api/summarize": BigInt(0),
  "/api/sentiment": BigInt(1),
  "/api/price": BigInt(2),
} as const;
