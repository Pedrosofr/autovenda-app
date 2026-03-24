import {
  Area,
  AreaChart,
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

type ChartMode = "faturamento" | "carros";

interface ChartPoint {
  mes: string;
  valor: number;
  qtd: number;
}

interface RankingEntry {
  id: string;
  qtd: number;
  valor: number;
  nome: string;
  meta: number;
}

interface DashboardChartsProps {
  carros: number;
  chart6m: ChartPoint[];
  chartMode: ChartMode;
  metaTotal: number;
  nomesMes: string[];
  progMeta: number;
  ranking: RankingEntry[];
  setChartMode: (mode: ChartMode) => void;
  mes: number;
}

export default function DashboardCharts({
  carros,
  chart6m,
  chartMode,
  metaTotal,
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-4 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 p-6 lg:p-7 animate-fade-up relative overflow-hidden">
        <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-blue-500/10 blur-[80px]" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div>
              <p className="text-white font-bold text-base">Meta de Vendas</p>
              <p className="text-white/35 text-xs mt-1">{"Desempenho do m\u00eas atual"}</p>
            </div>
            <div className="rounded-full border border-blue-500/15 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              Meta
            </div>
          </div>

          <div className="flex justify-center mb-5">
            <div className="relative w-[190px] h-[190px]">
              <RadialBarChart
                width={190}
                height={190}
                cx={95}
                cy={95}
                innerRadius={66}
                outerRadius={86}
                barSize={15}
                data={gaugeData}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background={{ fill: "rgba(255,255,255,0.05)" }} dataKey="value" cornerRadius={10} />
              </RadialBarChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-4xl font-black text-white tabular-nums">{carros}</p>
                <p className="text-white/35 text-sm font-semibold mt-1">de {metaTotal}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/50">Progresso {nomesMes[mes]}</span>
              <span className="text-white font-bold">{progMeta.toFixed(0)}%</span>
            </div>
            <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${Math.max(progMeta, 3)}%`,
                  background: progMeta >= 100
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                }}
              />
            </div>
            <p className="text-sm font-bold text-center mt-4">
              {metaTotal - carros > 0 ? (
                <span className="text-blue-400">
                  Faltam <span className="text-lg font-black">{metaTotal - carros}</span> carro{metaTotal - carros > 1 ? "s" : ""} para bater a meta
                </span>
              ) : (
                <span className="text-emerald-400">Meta batida com sucesso.</span>
              )}
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-white/5 space-y-3">
            {ranking.slice(0, 3).map((r, i) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-white/70">
                    {topLabels[i]}
                  </span>
                  <span className="text-white text-sm font-semibold truncate">{r.nome}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white text-sm font-bold">{r.qtd}/{r.meta}</span>
                  <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
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

      <div className="lg:col-span-8 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 p-6 lg:p-7 animate-fade-up relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-purple-500/10 blur-[80px]" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-white font-bold text-base">{"Evolu\u00e7\u00e3o de Vendas"}</p>
              <p className="text-white/35 text-sm mt-1">{"\u00daltimos 6 meses"}</p>
            </div>
            <div className="flex bg-white/5 rounded-xl p-1 self-start sm:self-auto">
              <button
                onClick={() => setChartMode("faturamento")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  chartMode === "faturamento"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                R$ Faturamento
              </button>
              <button
                onClick={() => setChartMode("carros")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  chartMode === "carros"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                Carros
              </button>
            </div>
          </div>

          <div className="h-72 lg:h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "faturamento" ? (
                <AreaChart data={chart6m}>
                  <defs>
                    <linearGradient id="gFat2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="strokeG2" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#d946ef" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.24)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v > 0 ? `${(v / 1000).toFixed(0)}k` : "0"}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1d2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "16px",
                      fontSize: 12,
                      color: "#fff",
                      boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                    }}
                    formatter={(val: number) => [`R$ ${val.toLocaleString("pt-BR")}`, "Faturamento"]}
                    labelStyle={{ color: "rgba(255,255,255,0.45)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="valor"
                    stroke="url(#strokeG2)"
                    strokeWidth={3}
                    fill="url(#gFat2)"
                    dot={{ r: 5, fill: "#8b5cf6", stroke: "#1a1d2e", strokeWidth: 3 }}
                    activeDot={{ r: 8, fill: "#a78bfa", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
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
                  <Bar dataKey="qtd" fill="url(#gBar)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
