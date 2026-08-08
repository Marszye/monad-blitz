# CLAUDE.md

## PROJECT
SatSet — marketplace API micropayment di Monad, pakai x402.
Hackathon Monad Blitz, deadline submit 17:45 WIB hari ini.

## STACK
Next.js (TypeScript, Tailwind, App Router, src/), viem, wagmi.

## KONSTANTA MONAD (dari docs resmi, JANGAN diubah/ditebak)
- Network x402: `eip155:10143`
- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Explorer: `https://testnet.monadexplorer.com`
- USDC testnet: `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- Facilitator: `https://x402-facilitator.molandak.org`
- Scheme: `"exact"` (JANGAN `"upto"`)
- Package: `@x402/core @x402/evm @x402/fetch @x402/next`
- `@x402/evm` minimal versi 2.2.0

## ATURAN KERJA
1. Untuk apa pun soal x402, WAJIB baca https://docs.monad.xyz/guides/x402 dulu. Jangan tulis kode x402 dari ingatan.
2. Jangan pakai localStorage.
3. `routeConfig.resource` pakai path relatif, bukan `http://localhost:3000`.
4. `.env.local` WAJIB masuk `.gitignore`. Jangan pernah commit private key.
5. Kerjakan satu tahap, tunjukkan hasil, tunggu konfirmasi sebelum lanjut.
6. Kalau ragu, tanya. Jangan asal jalan.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
