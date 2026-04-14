import {
  Bar,
  BarChart,
  CartesianGrid,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartMode = "leads" | "carros";

interface ChartPoint {
  mes: string;
  carros: number;
  leads: number;
}

interface RankingEntry {
  id: string;
  qtd: number;
  leadsAtendidos: number;
  nome: string;
  meta: number;
}

interface DashboardChartsProps {
  carros: number;
  leadsAtendidos: number;
  chart6m: ChartPoint[];
  chartMode: ChartMode;
  metaLeadsTotal: number;
  metaTotal: number;
  progMetaLeads: number;
  nomesMes: string[];
  progMeta: number;
  ranking: RankingEntry[];
  setChartMode: (mode: ChartMode) => void;
  mes: number;
}

export default function DashboardCharts({
  carros,
  leadsAtendidos,
  chart6m,
  chartMode,
  metaLeadsTotal,
  metaTotal,
  progMetaLeads,
  nomesMes,
  progMeta,
  ranking,
  setChartMode,
  mes,
}: DashboardChartsProps) {
  const gaugeData = [
    {
      name: "meta",
      value: progMeta,
      fill: progMeta >= 100 ? "#10b981" : progMeta >= 50 ? "#8b5cf6" : "#3b82f6",
    },
  ];

  const topLabels = ["TOP 1", "TOP 2", "TOP 3"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5">
      <div className="col-span-1 lg:col-span-4 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 p-3 sm:p-6 lg:p-7 animate-fade-up relative overflow-hidden">
        <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-blue-500/10 blur-[80px]" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2 mb-3 sm:mb-6">
            <div>
              <p className="text-white font-bold text-xs sm:text-base">Metas do Mês</p>
              <p className="text-white/35 text-[10px] sm:text-xs mt-0.5 sm:mt-1 hidden sm:block">Ritmo operacional de leads e carros vendidos</p>
            </div>
            <div className="rounded-full border border-blue-500/15 bg-blue-500/10 px-2 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              Meta
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:p-4">
              <div className="flex justify-center mb-2 sm:mb-3">
                <div className="relative w-[88px] h-[88px] sm:w-[132px] sm:h-[132px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      cx="50%"
                      cy="50%"
                      innerRadius="65%"
                      outerRadius="90%"
                      barSize={10}
                      data={gaugeData}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <RadialBar background={{ fill: "rgba(255,255,255,0.05)" }} dataKey="value" cornerRadius={10} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xl sm:text-3xl font-black text-white tabular-nums">{carros}</p>
                    <p className="text-white/35 text-[9px] sm:text-xs font-semibold mt-0.5">de {metaTotal}</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-white/55">Carros vendidos</p>
              <p className="mt-2 text-center text-[10px] sm:text-sm font-bold">
                {metaTotal - carros > 0 ? (
                  <span className="text-blue-400">
                    Faltam {metaTotal - carros}
                  </span>
                ) : (
                  <span className="text-emerald-400">Meta batida</span>
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:p-4">
              <div className="mb-2">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-white/55">Leads atendidos</p>
                <p className="mt-1 text-2xl sm:text-3xl font-black text-white tabular-nums">{leadsAtendidos}</p>
                <p className="text-white/35 text-[9px] sm:text-xs font-semibold">de {metaLeadsTotal}</p>
              </div>
              <div className="w-full h-2 sm:h-2.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.max(Math.min(progMetaLeads, 100), metaLeadsTotal > 0 ? 3 : 0)}%`,
                    background: progMetaLeads >= 100
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : "linear-gradient(90deg, #f59e0b, #fb7185)",
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] sm:text-sm font-bold">
                {metaLeadsTotal - leadsAtendidos > 0 ? (
                  <span className="text-amber-400">
                    Faltam {metaLeadsTotal - leadsAtendidos} leads
                  </span>
                ) : (
                  <span className="text-emerald-400">Meta batida</span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:text-sm">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/45">Progresso {nomesMes[mes]}</div>
              <div className="mt-1 text-lg sm:text-xl font-black text-white">{progMeta.toFixed(0)}%</div>
              <div className="text-white/35">Meta de carros</div>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <div className="text-white/45">Ritmo comercial</div>
              <div className="mt-1 text-lg sm:text-xl font-black text-white">{progMetaLeads.toFixed(0)}%</div>
              <div className="text-white/35">Meta de leads</div>
            </div>
          </div>

          <div className="mt-3 sm:mt-6 pt-3 sm:pt-5 border-t border-white/5 space-y-2 sm:space-y-3">
            {ranking.slice(0, 3).map((r, i) => (
              <div key={r.id} className="flex items-center justify-between gap-1.5 sm:gap-3">
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <span className="rounded-full border border-white/10 bg-white/5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold tracking-[0.18em] text-white/70 shrink-0">
                    {topLabels[i]}
                  </span>
                  <span className="text-white text-[10px] sm:text-sm font-semibold truncate">{r.nome}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <span className="text-white text-[10px] sm:text-sm font-bold">{r.qtd}/{r.meta}</span>
                  <div className="w-8 sm:w-16 h-1 sm:h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${r.meta > 0 ? Math.min((r.qtd / r.meta) * 100, 100) : 0}%`,
                        background: i === 0 ? "#facc15" : i === 1 ? "#94a3b8" : "#fb923c",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="col-span-1 lg:col-span-8 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 p-3 sm:p-6 lg:p-7 animate-fade-up relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-purple-500/10 blur-[80px]" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-6">
            <div>
              <p className="text-white font-bold text-xs sm:text-base">Evolução operacional</p>
              <p className="text-white/35 text-[10px] sm:text-sm mt-0.5 sm:mt-1 hidden sm:block">Últimos 6 meses</p>
            </div>
            <div className="flex bg-white/5 rounded-lg sm:rounded-xl p-0.5 sm:p-1 self-start sm:self-auto">
              <button
                onClick={() => setChartMode("leads")}
                className={`px-2 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-bold transition-all ${
                  chartMode === "leads"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                Leads
              </button>
              <button
                onClick={() => setChartMode("carros")}
                className={`px-2 sm:px-4 py-1 sm:py-2 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-bold transition-all ${
                  chartMode === "carros"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                Carros
              </button>
            </div>
          </div>

          <div className="h-40 sm:h-72 lg:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "leads" ? (
                <BarChart data={chart6m}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.24)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1d2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "16px",
                      fontSize: 12,
                      color: "#fff",
                      boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                    }}
                    formatter={(val: number) => [`${val} leads`, "Atendidos"]}
                    labelStyle={{ color: "rgba(255,255,255,0.45)" }}
                  />
                  <Bar dataKey="leads" fill="url(#gLeads)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              ) : (
                <BarChart data={chart6m}>
                  <defs>
                    <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.24)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1d2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "16px",
                      fontSize: 12,
                      color: "#fff",
                      boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                    }}
                    formatter={(val: number) => [`${val} carros`, "Vendidos"]}
                    labelStyle={{ color: "rgba(255,255,255,0.45)" }}
                  />
                  <Bar dataKey="carros" fill="url(#gBar)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
