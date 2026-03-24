import { useEffect, useState } from "react";

// Preco por 1M tokens (claude-sonnet-4)
const PRICE_INPUT_PER_M = 3.0;
const PRICE_OUTPUT_PER_M = 15.0;

export interface UsageEntry {
  timestamp: number;
  type: "veiculo" | "custos";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const STORAGE_KEY = "dev_api_usage";

export function recordUsage(type: "veiculo" | "custos", inputTokens: number, outputTokens: number) {
  if (!import.meta.env.DEV) return;
  const costUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M + (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  const entry: UsageEntry = { timestamp: Date.now(), type, inputTokens, outputTokens, costUsd };
  const existing: UsageEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  existing.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  window.dispatchEvent(new Event("dev-usage-update"));
}

export function clearUsage() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("dev-usage-update"));
}

export function getUsage(): UsageEntry[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
}

export default function DevUsagePanel() {
  const isDev = import.meta.env.DEV;

  const [entries, setEntries] = useState<UsageEntry[]>(getUsage);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setEntries(getUsage());
    window.addEventListener("dev-usage-update", handler);
    return () => window.removeEventListener("dev-usage-update", handler);
  }, []);

  const totalCalls = entries.length;
  const totalInput = entries.reduce((s, e) => s + e.inputTokens, 0);
  const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
  const totalCost = entries.reduce((s, e) => s + e.costUsd, 0);
  const totalTokens = totalInput + totalOutput;

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  const fmtBrl = (n: number) => `R$ ${(n * 5.05).toFixed(3)}`;

  if (!isDev) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] font-mono text-xs">
      {open ? (
        <div className="w-72 rounded-xl border border-yellow-400/40 bg-black/90 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold text-yellow-400">[DEV] Uso da API</span>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
              x
            </button>
          </div>

          <div className="mb-3 space-y-1 text-white/80">
            <div className="flex justify-between">
              <span>Geracoes</span>
              <span className="font-bold text-white">{totalCalls}x</span>
            </div>
            <div className="flex justify-between">
              <span>Tokens entrada</span>
              <span className="text-blue-300">{fmt(totalInput)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tokens saida</span>
              <span className="text-green-300">{fmt(totalOutput)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total tokens</span>
              <span className="text-white">{fmt(totalTokens)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-white/10 pt-1">
              <span>Custo USD</span>
              <span className="font-bold text-yellow-300">{fmtUsd(totalCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Custo BRL ~</span>
              <span className="text-yellow-300">{fmtBrl(totalCost)}</span>
            </div>
          </div>

          {entries.length > 0 && (
            <div className="mb-3 max-h-32 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
              {[...entries].reverse().map((entry, index) => (
                <div key={index} className="flex justify-between text-[10px] text-white/50">
                  <span>
                    {entry.type === "veiculo" ? "VEICULO" : "CUSTOS"}{" "}
                    {new Date(entry.timestamp).toLocaleTimeString("pt-BR")}
                  </span>
                  <span>
                    {fmtUsd(entry.costUsd)} ({entry.inputTokens + entry.outputTokens} tk)
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={clearUsage}
            className="w-full rounded-lg border border-red-400/20 py-1 text-red-400/70 transition-colors hover:bg-red-400/10 hover:text-red-400"
          >
            Limpar historico
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-yellow-400/40 bg-black/80 px-3 py-1.5 text-yellow-400 shadow-lg hover:bg-black"
          title="DEV: Ver uso da API"
        >
          DEV {totalCalls}x · {fmtUsd(totalCost)}
        </button>
      )}
    </div>
  );
}
