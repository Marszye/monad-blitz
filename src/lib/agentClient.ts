import { privateKeyToAccount } from "viem/accounts";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { MONAD_NETWORK } from "./x402";
import { publicClient } from "./publicClient";
import type { AgentLogEvent } from "./agentTypes";

// The agent reuses the same wallet as PAY_TO/recorder for this demo — it pays
// itself, which is fine for testing. Needs testnet USDC (not MON): get some
// from https://faucet.circle.com (select Monad Testnet).
const agentPrivateKey = process.env.PRIVATE_KEY;

if (!agentPrivateKey || !/^0x[0-9a-fA-F]{64}$/.test(agentPrivateKey)) {
  throw new Error("PRIVATE_KEY is not set (or invalid) in the environment");
}

const agentAccount = privateKeyToAccount(agentPrivateKey as `0x${string}`);
const agentSigner = toClientEvmSigner(agentAccount, publicClient);

export const AGENT_ADDRESS = agentAccount.address;

const agentX402Client = new x402Client().register(MONAD_NETWORK, new ExactEvmScheme(agentSigner));
const httpClient = new x402HTTPClient(agentX402Client);

/**
 * Calls a paid endpoint, manually driving each step of the x402 flow
 * (request -> 402 -> pay -> 200) so the caller can log every step, instead
 * of hiding the round trip inside a single wrapFetchWithPayment() call.
 */
export async function payAndCall(
  url: string,
  endpointLabel: string,
  body: unknown,
  onEvent: (event: AgentLogEvent) => void,
): Promise<void> {
  onEvent({ step: "request", endpoint: endpointLabel, message: `POST ${endpointLabel}` });

  const requestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };

  const initialRes = await fetch(url, requestInit);

  if (initialRes.status !== 402) {
    const data = await initialRes.json().catch(() => null);
    if (initialRes.ok) {
      onEvent({
        step: "200",
        endpoint: endpointLabel,
        message: `200 OK (no payment required)`,
        txHash: "",
        body: data,
      });
    } else {
      onEvent({
        step: "error",
        endpoint: endpointLabel,
        message: `Unexpected status ${initialRes.status}: ${JSON.stringify(data)}`,
      });
    }
    return;
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => initialRes.headers.get(name));
  const priceOption = paymentRequired.accepts[0];
  onEvent({
    step: "402",
    endpoint: endpointLabel,
    message: priceOption
      ? `402 Payment Required — ${(Number(priceOption.amount) / 1_000_000).toFixed(6)} USDC to ${priceOption.payTo}`
      : "402 Payment Required",
  });

  onEvent({
    step: "paying",
    endpoint: endpointLabel,
    message: `Signing payment authorization from ${AGENT_ADDRESS}...`,
  });

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paidRes = await fetch(url, {
    ...requestInit,
    headers: { ...requestInit.headers, ...paymentHeaders },
  });

  const resultBody = await paidRes.json().catch(() => null);
  const { settleResponse } = await httpClient.processPaymentResult(
    paymentPayload,
    (name) => paidRes.headers.get(name),
    paidRes.status,
  );

  if (paidRes.ok && settleResponse?.success) {
    onEvent({
      step: "200",
      endpoint: endpointLabel,
      message: `200 OK — paid, settled onchain`,
      txHash: settleResponse.transaction,
      body: resultBody,
    });
  } else {
    let reason = settleResponse?.errorReason ?? settleResponse?.errorMessage;
    if (!reason && paidRes.status === 402) {
      const retryPaymentRequired = httpClient.getPaymentRequiredResponse((name) => paidRes.headers.get(name));
      reason = retryPaymentRequired.error;
    }
    onEvent({
      step: "error",
      endpoint: endpointLabel,
      message: `Payment failed: ${reason ?? paidRes.statusText}`,
    });
  }
}
