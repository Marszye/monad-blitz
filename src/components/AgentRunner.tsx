"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentLogEvent } from "@/lib/agentTypes";
import { EXPLORER_URL } from "@/lib/chain";

type LogEntry = AgentLogEvent & { key: string };

const STEP_STYLES: Record<AgentLogEvent["step"], string> = {
  request: "text-muted",
  "402": "text-amber-300",
  paying: "text-accent-strong",
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

export function AgentRunner() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  function pushLog(event: AgentLogEvent) {
    setLogs((prev) => [...prev, { ...event, key: crypto.randomUUID() }]);
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
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-10 md:px-12 md:py-14">
      <header>
        <Link href="/" className="text-sm text-muted transition-colors hover:text-accent-strong">
          ← Dashboard
        </Link>
        <h1 className="mt-3 text-5xl font-black tracking-tight md:text-6xl">
          Agent<span className="text-accent-strong">.run()</span>
        </h1>
        <p className="mt-2 text-lg text-muted">
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
          className="flex-1 rounded-xl border border-border bg-surface px-5 py-4 text-lg text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          onClick={run}
          disabled={running || !input.trim()}
          className="rounded-xl bg-accent px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Running…" : "Run agent"}
        </button>
      </section>

      <section className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        {logs.length === 0 && (
          <p className="px-6 py-16 text-center text-muted">
            {running ? "Menghubungi endpoint pertama…" : "Log akan muncul di sini setelah agent dijalankan."}
          </p>
        )}
        <div className="flex flex-col">
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
      <div className="animate-row-in px-6 py-4 text-sm font-semibold text-accent-strong">
        ✓ Selesai — 3 endpoint dipanggil.
      </div>
    );
  }

  return (
    <div className="animate-row-in flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 font-mono text-sm last:border-0">
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
          View tx ↗
        </a>
      )}
    </div>
  );
}
