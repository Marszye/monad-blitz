"use client";

import { createConfig, http, injected } from "wagmi";
import { RPC_URL, monadTestnet } from "./chain";

// storage: null — CLAUDE.md forbids localStorage, so wagmi's connector
// cache/auto-reconnect is disabled. Users click "Connect Wallet" every
// visit instead of being silently reconnected from persisted state.
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(RPC_URL),
  },
  storage: null,
  ssr: true,
});
