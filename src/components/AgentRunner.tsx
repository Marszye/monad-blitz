"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentLogEvent, BurstEvent } from "@/lib/agentTypes";
import { EXPLORER_URL } from "@/lib/chain";

type LogEntry = AgentLogEvent & { key: string };

const STEP_STYLES: Record<AgentLogEvent["step"], string> = {
  request: "text-muted",
  "402": "text-amber-300",
  paying: "text-accent",
  "200": "text-emerald-300",
  error: "text-red-300",
  done: "text-muted",
};

const STEP_LABELS: Record<AgentLogEvent["step"], string> = {
  request: "REQUEST",
  "402": "402",
  paying: "PAY",
  "200": "200",
  error: "ERROR",
  done: "DONE",
};

interface BurstState {
  running: boolean;
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
}

const BURST_IDLE: BurstState = { running: false, completed: 0, total: 100, succeeded: 0, failed: 0 };

export function AgentRunner() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [burst, setBurst] = useState<BurstState>(BURST_IDLE);

  function pushLog(event: AgentLogEvent) {
    setLogs((prev) => [...prev, { ...event, key: crypto.randomUUID() }]);
  }

  async function runBurst() {
    if (burst.running) return;
    setBurst({ ...BURST_IDLE, running: true });

    try {
      const res = await fetch("/api/agent/burst", { method: "POST" });
      if (!res.body) throw new Error("No response body from /api/agent/burst");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as BurstEvent;
          if (event.step === "call") {
            setBurst((prev) => ({
              ...prev,
              completed: event.completed,
              total: event.total,
              succeeded: prev.succeeded + (event.ok ? 1 : 0),
              failed: prev.failed + (event.ok ? 0 : 1),
            }));
          } else if (event.step === "done") {
            setBurst((prev) => ({ ...prev, succeeded: event.succeeded, failed: event.failed }));
          }
        }
      }
    } catch (err) {
      console.error("Burst failed:", err);
    } finally {
      setBurst((prev) => ({ ...prev, running: false }));
    }
  }

  async function run() {
    if (!input.trim() || running) return;
    setRunning(true);
    setLogs([]);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!res.body) throw new Error("No response body from /api/agent/run");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          pushLog(JSON.parse(line) as AgentLogEvent);
        }
      }
    } catch (err) {
      pushLog({ step: "error", endpoint: "agent", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-16 px-6 py-20 md:px-10">
      <header>
        <Link href="/" className="stat-label transition-colors hover:text-accent">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight md:text-6xl">
          Agent<span className="text-accent">.run()</span>
        </h1>
        <p className="mt-3 text-lg text-muted">
          Panggil <code className="font-mono text-foreground">/api/summarize</code>,{" "}
          <code className="font-mono text-foreground">/api/sentiment</code>, dan{" "}
          <code className="font-mono text-foreground">/api/price</code> berurutan — bayar x402 otomatis, tanpa
          popup konfirmasi wallet.
        </p>
      </header>

      <section className="flex flex-col gap-4 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          disabled={running}
          placeholder="Masukkan teks / simbol untuk diproses agent..."
          className="card flex-1 px-5 py-4 text-lg text-foreground placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={run}
          disabled={running || !input.trim()}
          className="rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Running…" : "Run agent"}
        </button>
      </section>

      <section className="card flex flex-col gap-6 px-8 py-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="stat-label">Burst</h2>
            <p className="mt-2 text-base text-muted">
              Panggil <code className="font-mono text-foreground">/api/price</code> 100x paralel (batch 10),
              masing-masing bayar x402.
            </p>
          </div>
          <button
            onClick={runBurst}
            disabled={burst.running || running}
            className="rounded-2xl bg-accent px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {burst.running ? "Bursting…" : "Burst 100x"}
          </button>
        </div>

        {(burst.running || burst.completed > 0) && (
          <div className="flex flex-col gap-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                style={{ width: `${(burst.completed / burst.total) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-5 font-mono text-sm tabular-nums text-muted">
              <span className="text-foreground">
                {burst.completed} / {burst.total}
              </span>
              <span className="text-emerald-300">{burst.succeeded} ok</span>
              {burst.failed > 0 && <span className="text-red-300">{burst.failed} failed</span>}
              {!burst.running && burst.completed === burst.total && (
                <span className="text-accent">✓ Selesai</span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card flex-1 overflow-hidden">
        {logs.length === 0 && (
          <p className="px-8 py-16 text-center text-muted">
            {running ? "Menghubungi endpoint pertama…" : "Log akan muncul di sini setelah agent dijalankan."}
          </p>
        )}
        <div className="flex flex-col divide-y divide-divider">
          {logs.map((entry) => (
            <LogLine key={entry.key} entry={entry} />
          ))}
        </div>
      </section>
    </main>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  if (entry.step === "done") {
    return (
      <div className="animate-row-in px-8 py-5 text-sm font-semibold text-accent">
        ✓ Selesai — 3 endpoint dipanggil.
      </div>
    );
  }

  return (
    <div className="animate-row-in flex flex-wrap items-center gap-3 px-8 py-4 font-mono text-sm">
      <span className={`w-16 shrink-0 font-bold ${STEP_STYLES[entry.step]}`}>{STEP_LABELS[entry.step]}</span>
      <span className="text-muted">{entry.endpoint}</span>
      <span className="text-foreground">{entry.message}</span>
      {entry.step === "200" && entry.txHash && (
        <a
          href={`${EXPLORER_URL}/tx/${entry.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-accent underline decoration-accent/40 hover:text-accent-strong"
        >
          {entry.txHash.slice(0, 6)}…{entry.txHash.slice(-4)} ↗
        </a>
      )}
    </div>
  );
}
