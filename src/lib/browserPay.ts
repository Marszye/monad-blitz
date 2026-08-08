"use client";

import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner, type ClientEvmSigner } from "@x402/evm";
import type { WalletClient } from "viem";
import { publicClient } from "./publicClient";

// Client-safe copy of the network id used server-side in lib/x402.ts. Not
// reusing that file directly: it reads PAY_TO_ADDRESS from process.env at
// module scope and throws if unset, which would break as soon as this
// module (imported into a client component) loaded in the browser, where
// server-only env vars aren't available.
export const MONAD_NETWORK = "eip155:10143" as const;
export const MONAD_USDC_TESTNET = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;

export type BrowserPayEvent =
  | { step: "request"; message: string }
  | { step: "402"; message: string }
  | { step: "paying"; message: string }
  | { step: "200"; message: string; txHash: string; body: unknown }
  | { step: "error"; message: string };

/** Wraps a connected wagmi/viem WalletClient into the signer shape x402 expects. */
export function makeBrowserSigner(walletClient: WalletClient, address: `0x${string}`): ClientEvmSigner {
  return toClientEvmSigner(
    {
      address,
      signTypedData: (message) =>
        walletClient.signTypedData({
          account: address,
          domain: message.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
          types: message.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
          primaryType: message.primaryType,
          message: message.message,
        } as Parameters<typeof walletClient.signTypedData>[0]),
    },
    publicClient,
  );
}

/**
 * Pays for and calls a paid endpoint using the USER's own wallet signer
 * (an EIP-712 signature prompt in their wallet), driving each step of the
 * x402 flow manually so the UI can show request -> 402 -> paying -> 200.
 * The facilitator broadcasts the settlement onchain; the user never pays
 * gas or submits a transaction directly.
 */
export async function payFromBrowser(
  url: string,
  body: unknown,
  signer: ClientEvmSigner,
  onEvent: (event: BrowserPayEvent) => void,
): Promise<void> {
  const client = new x402Client().register(MONAD_NETWORK, new ExactEvmScheme(signer));
  const httpClient = new x402HTTPClient(client);

  onEvent({ step: "request", message: `POST ${url}` });

  const requestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };

  const initialRes = await fetch(url, requestInit);

  if (initialRes.status !== 402) {
    const data = await initialRes.json().catch(() => null);
    if (initialRes.ok) {
      onEvent({ step: "200", message: "200 OK (no payment required)", txHash: "", body: data });
    } else {
      onEvent({ step: "error", message: `Unexpected status ${initialRes.status}: ${JSON.stringify(data)}` });
    }
    return;
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => initialRes.headers.get(name));
  const priceOption = paymentRequired.accepts[0];
  onEvent({
    step: "402",
    message: priceOption
      ? `402 Payment Required — ${(Number(priceOption.amount) / 1_000_000).toFixed(6)} USDC ke ${priceOption.payTo}`
      : "402 Payment Required",
  });

  onEvent({ step: "paying", message: "Menunggu tanda tangan di wallet..." });

  let paymentPayload;
  try {
    paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User rejected") || message.includes("User denied")) {
      onEvent({ step: "error", message: "Tanda tangan dibatalkan di wallet." });
    } else {
      onEvent({ step: "error", message: `Gagal menandatangani pembayaran: ${message}` });
    }
    return;
  }

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
      message: "200 OK — dibayar, settle onchain",
      txHash: settleResponse.transaction,
      body: resultBody,
    });
  } else {
    let reason = settleResponse?.errorReason ?? settleResponse?.errorMessage;
    if (!reason && paidRes.status === 402) {
      const retryPaymentRequired = httpClient.getPaymentRequiredResponse((name) => paidRes.headers.get(name));
      reason = retryPaymentRequired.error;
    }
    onEvent({ step: "error", message: `Pembayaran gagal: ${reason ?? paidRes.statusText}` });
  }
}
