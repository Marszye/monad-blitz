import type { NextRequest } from "next/server";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { isPermit2Payload, type ExactEvmPayloadV2 } from "@x402/evm";
import type { Network } from "@x402/core/types";

export const MONAD_NETWORK: Network = "eip155:10143";
export const MONAD_USDC_TESTNET = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
export const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

const payToAddress = process.env.PAY_TO_ADDRESS;

if (!payToAddress) {
  throw new Error("PAY_TO_ADDRESS is not set in the environment");
}

export const PAY_TO: string = payToAddress;

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const x402Server = new x402ResourceServer(facilitatorClient);

const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    const tokenAmount = Math.floor(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: MONAD_USDC_TESTNET,
      extra: {
        name: "USDC",
        version: "2",
      },
    };
  }
  return null;
});

x402Server.register(MONAD_NETWORK, monadScheme);

/**
 * Extracts the payer's wallet address from the request's `payment-signature`
 * header. Only call this after `withX402` has run the handler (i.e. the
 * payment was already verified) — this just re-decodes the same header the
 * SDK verified, since withX402 doesn't pass the payload into the handler.
 */
export function getPayerFromRequest(request: NextRequest): `0x${string}` | null {
  const header = request.headers.get("payment-signature");
  if (!header) return null;

  try {
    const paymentPayload = decodePaymentSignatureHeader(header);
    const evmPayload = paymentPayload.payload as unknown as ExactEvmPayloadV2;
    return isPermit2Payload(evmPayload)
      ? evmPayload.permit2Authorization.from
      : evmPayload.authorization.from;
  } catch (error) {
    console.error("[x402] Failed to decode payment-signature header:", error);
    return null;
  }
}
