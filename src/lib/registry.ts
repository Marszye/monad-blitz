import type { NextRequest } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { API_REGISTRY_ABI, API_REGISTRY_ADDRESS } from "./contract";
import { EXPLORER_URL, RPC_URL, monadTestnet } from "./chain";
import { getPayerFromRequest } from "./x402";
import { ENDPOINT_IDS } from "./endpoints";

const recorderPrivateKey = process.env.PRIVATE_KEY;

if (!recorderPrivateKey || !/^0x[0-9a-fA-F]{64}$/.test(recorderPrivateKey)) {
  throw new Error("PRIVATE_KEY is not set (or invalid) in the environment");
}

const recorderAccount = privateKeyToAccount(recorderPrivateKey as `0x${string}`);

const recorderWalletClient = createWalletClient({
  account: recorderAccount,
  chain: monadTestnet,
  transport: http(RPC_URL),
});

/**
 * Records a paid API call on ApiRegistry. Fire-and-forget on purpose: the
 * caller must NOT await this, so the HTTP response isn't held up by onchain
 * confirmation. The resulting tx hash (or error) is only logged server-side.
 */
export function recordCallFireAndForget(endpointId: bigint, payer: `0x${string}`): void {
  recorderWalletClient
    .writeContract({
      address: API_REGISTRY_ADDRESS,
      abi: API_REGISTRY_ABI,
      functionName: "recordCall",
      args: [endpointId, payer],
    })
    .then((hash) => {
      console.log(`[ApiRegistry] recordCall tx: ${EXPLORER_URL}/tx/${hash}`);
    })
    .catch((error) => {
      console.error("[ApiRegistry] recordCall failed:", error);
    });
}

/**
 * Extracts the payer from a verified request and fires off `recordCall` for
 * the given registered endpoint path. Never await this from a route handler.
 */
export function recordPaidCall(request: NextRequest, path: keyof typeof ENDPOINT_IDS): void {
  const payer = getPayerFromRequest(request);
  if (!payer) {
    console.error(`[${path}] Could not determine payer address; skipping recordCall`);
    return;
  }
  recordCallFireAndForget(ENDPOINT_IDS[path], payer);
}
