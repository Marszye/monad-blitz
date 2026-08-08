"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WagmiProvider,
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
  useReadContract,
} from "wagmi";
import { wagmiConfig } from "@/lib/wagmiConfig";
import { EXPLORER_URL, monadTestnet } from "@/lib/chain";
import { formatAddress, formatUsdMicro } from "@/lib/format";
import { makeBrowserSigner, payFromBrowser, MONAD_USDC_TESTNET, type BrowserPayEvent } from "@/lib/browserPay";

const SUMMARIZE_PATH = "/api/summarize";
const SUMMARIZE_PRICE_MICRO = BigInt(1000); // $0.001, matches this endpoint's registered price
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const CONNECT_TIMEOUT_MS = 20000;

class ConnectTimeoutError extends Error {
  constructor() {
    super("Connect timed out");
    this.name = "ConnectTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ConnectTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// EIP-1193 user-rejection is code 4001, but wagmi/viem sometimes wrap it
// (e.g. in `.cause`) rather than surfacing it directly, so check both plus
// a message fallback.
function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: number; cause?: { code?: number }; message?: string };
  if (err.code === 4001 || err.cause?.code === 4001) return true;
  return /user rejected|user denied/i.test(err.message ?? "");
}

export function TryPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TryApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function TryApp() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync } = useConnect();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const { mutate: disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  // Driven locally instead of useConnect()'s isPending: if the injected
  // connector's underlying request hangs (no popup, no response — the bug
  // this fixes), wagmi/react-query never sees a resolve or reject, so its
  // own isPending would stay stuck forever too. This state is guaranteed
  // to reset via the timeout race below regardless of what the connector
  // actually does.
  const [connecting, setConnecting] = useState(false);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    setConnectMessage(null);

    try {
      await withTimeout(connectAsync({ connector: connectors[0], chainId: monadTestnet.id }), CONNECT_TIMEOUT_MS);
    } catch (error) {
      console.error("[try] wallet connect failed:", error);

      if (error instanceof ConnectTimeoutError) {
        setConnectMessage(
          "Wallet tidak merespons — cek ikon extension di toolbar browser, mungkin ada popup menunggu.",
        );
      } else if (isUserRejection(error)) {
        setConnectMessage("Koneksi dibatalkan.");
      } else {
        setConnectMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setConnecting(false);
    }
  }

  const onWrongChain = isConnected && chainId !== monadTestnet.id;

  useEffect(() => {
    if (onWrongChain) switchChain({ chainId: monadTestnet.id });
  }, [onWrongChain, switchChain]);

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: MONAD_USDC_TESTNET,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address ?? ZERO_ADDRESS],
    chainId: monadTestnet.id,
    query: { enabled: Boolean(address) && chainId === monadTestnet.id },
  });

  const [text, setText] = useState(
    "Monad adalah blockchain layer 1 EVM-compatible yang didesain untuk throughput tinggi dan latency rendah lewat eksekusi paralel. x402 memungkinkan micropayment onchain per-request tanpa akun atau API key.",
  );
  const [paying, setPaying] = useState(false);
  const [steps, setSteps] = useState<BrowserPayEvent[]>([]);
  const [result, setResult] = useState<{ summary: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const signer = useMemo(() => {
    if (!walletClient || !address) return null;
    return makeBrowserSigner(walletClient, address);
  }, [walletClient, address]);

  const hasNoUsdc = balance !== undefined && balance < SUMMARIZE_PRICE_MICRO;

  async function pay() {
    if (!signer || paying) return;
    setPaying(true);
    setSteps([]);
    setResult(null);
    setTxHash(null);

    const onEvent = (event: BrowserPayEvent) => {
      setSteps((prev) => [...prev, event]);
      if (event.step === "200") {
        setResult((event.body as { summary: string } | null) ?? null);
        setTxHash(event.txHash || null);
      }
    };

    try {
      await payFromBrowser(SUMMARIZE_PATH, { text }, signer, onEvent);
    } finally {
      setPaying(false);
      refetchBalance();
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-16 px-6 py-20 md:px-10">
      <header>
        <Link href="/" className="stat-label transition-colors hover:text-accent">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
          Try<span className="text-accent">.x402</span>
        </h1>
        <p className="mt-3 text-lg text-muted">
          Bayar <code className="font-mono text-foreground">{SUMMARIZE_PATH}</code> langsung dari wallet kamu
          sendiri — bukan wallet server.
        </p>
      </header>

      <section className="card flex flex-col gap-6 px-8 py-8 md:px-10">
        {!isConnected ? (
          <div className="flex flex-col gap-4">
            {connectors.length === 0 && (
              <p className="text-base text-muted">
                Wallet browser (MetaMask, dll) tidak terdeteksi. Install salah satu lalu refresh halaman ini.
              </p>
            )}
            <button
              onClick={handleConnect}
              disabled={connectors.length === 0 || connecting}
              className="self-start rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {connecting ? "Menghubungkan…" : "Connect Wallet"}
            </button>
            {connectMessage && <p className="text-sm text-red-300">{connectMessage}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="stat-label">Wallet</span>
              <span className="font-mono text-lg text-foreground">{address && formatAddress(address)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="stat-label">Saldo USDC (Monad Testnet)</span>
              <span className="stat-value text-3xl text-accent">
                {balance === undefined ? "…" : formatUsdMicro(balance)}
              </span>
            </div>
            <button
              onClick={() => disconnect()}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Disconnect
            </button>
          </div>
        )}

        {onWrongChain && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-amber-300">
            <span>Wallet belum di Monad Testnet (chain id 10143).</span>
            <button
              onClick={() => switchChain({ chainId: monadTestnet.id })}
              disabled={switching}
              className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-sm font-semibold hover:bg-amber-400/10 disabled:opacity-50"
            >
              {switching ? "Switching…" : "Switch Network"}
            </button>
          </div>
        )}

        {isConnected && !onWrongChain && hasNoUsdc && (
          <div className="rounded-xl border border-accent/40 bg-accent-soft px-5 py-4 text-foreground">
            Saldo USDC kamu belum cukup untuk bayar $0.001.{" "}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-accent/40 hover:text-accent-strong"
            >
              Ambil testnet USDC di faucet.circle.com ↗
            </a>{" "}
            (pilih Monad Testnet).
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4 px-8 py-8 md:px-10">
        <h2 className="stat-label">Panggil {SUMMARIZE_PATH}</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={paying}
          rows={4}
          className="w-full rounded-xl border border-border bg-surface px-5 py-4 text-base text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={pay}
          disabled={!isConnected || onWrongChain || !signer || paying || hasNoUsdc || !text.trim()}
          className="self-start rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {paying ? "Memproses…" : `Panggil ${SUMMARIZE_PATH} — $0.001`}
        </button>

        {steps.length > 0 && (
          <div className="flex flex-col divide-y divide-divider rounded-xl border border-divider">
            {steps.map((event, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 px-5 py-3 font-mono text-sm">
                <span className="w-16 shrink-0 font-bold uppercase text-muted">{event.step}</span>
                <span className="text-foreground">{event.message}</span>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft px-6 py-5">
            <p className="stat-label">Hasil</p>
            <p className="mt-2 text-lg text-foreground">{result.summary}</p>
          </div>
        )}

        {txHash && (
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="self-start font-mono text-sm text-accent underline decoration-accent/40 hover:text-accent-strong"
          >
            {formatAddress(txHash)} ↗
          </a>
        )}
      </section>
    </main>
  );
}
