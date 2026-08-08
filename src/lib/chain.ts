import { defineChain } from "viem";

export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const EXPLORER_URL = "https://testnet.monadexplorer.com";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: EXPLORER_URL } },
  testnet: true,
});
