import { createPublicClient, http } from "viem";
import { RPC_URL, monadTestnet } from "./chain";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});
