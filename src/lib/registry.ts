import type { NextRequest } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { API_REGISTRY_ABI, API_REGISTRY_ADDRESS } from "./contract";
import { EXPLORER_URL, RPC_URL, monadTestnet } from "./chain";
import { getPayerFromRequest } from "./x402";
import { ENDPOINT_IDS } from "./endpoints";
import { publicClient } from "./publicClient";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// testnet-rpc.monad.xyz is a multi-node public gateway: an
// eth_getTransactionCount("pending") call can land on a different backend
// node than the one that just accepted our previous
// eth_sendRawTransaction, so it doesn't reliably see our own just-submitted
// tx yet. In testing, even a fully serialized queue of sends that each
// asked viem's writeContract() for a fresh "pending" nonce per call still
// only landed 35/100 recordCall writes — the rest lost a nonce race
// against the gateway's own inconsistent view and were dropped
// ("An existing transaction had higher priority").
//
// Tracking the nonce ourselves removes that dependency entirely: reserve
// one starting nonce, then hand out strictly incrementing values from a
// local counter for every send, never asking the RPC again. The
// read-and-increment below is synchronous (no `await` inside
// reserveNonce), so concurrent callers can never observe/reserve the same
// value no matter how many recordCall writes land at once upstream.
let nextNoncePromise: Promise<number> = publicClient.getTransactionCount({
  address: recorderAccount.address,
  blockTag: "pending",
});

function reserveNonce(): Promise<number> {
  const reserved = nextNoncePromise;
  nextNoncePromise = nextNoncePromise.then((n) => n + 1);
  return reserved;
}

async function sendRecordCall(endpointId: bigint, payer: `0x${string}`, nonce: number): Promise<`0x${string}`> {
  return recorderWalletClient.writeContract({
    address: API_REGISTRY_ADDRESS,
    abi: API_REGISTRY_ABI,
    functionName: "recordCall",
    args: [endpointId, payer],
    nonce,
  });
}

/**
 * Records a paid API call on ApiRegistry. Fire-and-forget from the caller's
 * perspective on purpose — the caller must NOT await this, so the HTTP
 * response isn't held up by onchain confirmation — but internally every
 * call gets its own reserved nonce (see reserveNonce) and is retried on
 * that same nonce if the send fails, so it doesn't get silently lost. The
 * resulting tx hash (or final error) is only logged server-side.
 */
export function recordCallFireAndForget(endpointId: bigint, payer: `0x${string}`): void {
  void (async () => {
    const nonce = await reserveNonce();
    const attempts = 3; // initial try + 2 retries
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const hash = await sendRecordCall(endpointId, payer, nonce);
        console.log(`[ApiRegistry] recordCall tx (nonce ${nonce}): ${EXPLORER_URL}/tx/${hash}`);
        return;
      } catch (error) {
        lastError = error;
        console.error(`[ApiRegistry] recordCall attempt ${attempt}/${attempts} (nonce ${nonce}) failed:`, error);
        if (attempt < attempts) await sleep(500);
      }
    }

    console.error(
      `[ApiRegistry] recordCall permanently failed for endpoint ${endpointId} / payer ${payer} (nonce ${nonce}):`,
      lastError,
    );
  })();
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
