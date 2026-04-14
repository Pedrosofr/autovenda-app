import { Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Car,
  Clock,
  Eye,
  Flame,
  PhoneCall,
  Package,
  Trophy,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/store/appStore";
import type { Lead } from "@/store/types";

const DashboardCharts = lazy(() => import("@/components/dashboard/DashboardCharts"));
const LEADS_POR_CARRO_META = 5;

function diasEmEstoque(dataCriacao: string) {
  return Math.floor((Date.now() - new Date(dataCriacao).getTime()) / 86400000);
}

function leadFoiAtendido(lead: Lead) {
  return lead.status !== "novo";
}

export default function Dashboard() {
  const { veiculos, vendas, vendedores, leads, loadingRemoteState } = useAppStore();
  const { user, loading: authLoading } = useAuth();
  const mes = new Date().getMonth();
  const ano = new Date().getFullYear();
  const [chartMode, setChartMode] = useState<"leads" | "carros">("carros");
  const sellerMembershipId = useMemo(
    () => (user?.role === "seller" ? user.membershipId : null),
    [user?.membershipId, user?.role],
  );
  const scopedVendas = useMemo(
    () => (sellerMembershipId ? vendas.filter((venda) => venda.vendedorId === sellerMembershipId) : vendas),
    [vendas, sellerMembershipId],
  );
  const scopedLeads = useMemo(
    () => (sellerMembershipId ? leads.filter((lead) => lead.vendedorId === sellerMembershipId) : leads),
    [leads, sellerMembershipId],
  );
  const scopedVendedores = useMemo(
    () => (sellerMembershipId ? vendedores.filter((vendedor) => vendedor.id === sellerMembershipId) : vendedores),
    [vendedores, sellerMembershipId],
  );
  const shouldShowTeamOnboarding = user?.role === "owner" && vendedores.length <= 1;

  const emEstoque = veiculos.filter((v) => v.status === "disponivel").length;
  const reservados = veiculos.filter((v) => v.status === "reservado").length;

  const vendasMes = scopedVendas.filter((v) => {
    const data = new Date(v.data);
    return data.getMonth() === mes && data.getFullYear() === ano;
  });

  const vendasAnterior = scopedVendas.filter((v) => {
    const data = new Date(v.data);
    return data.getMonth() === (mes === 0 ? 11 : mes - 1) && data.getFullYear() === (mes === 0 ? ano - 1 : ano);
  });

  const carrosVendidos = vendasMes.length;
  const leadsMes = scopedLeads.filter((lead) => {
    const data = new Date(lead.data);
    return data.getMonth() === mes && data.getFullYear() === ano;
  });
  const leadsAnterior = scopedLeads.filter((lead) => {
    const data = new Date(lead.data);
    return data.getMonth() === (mes === 0 ? 11 : mes - 1) && data.getFullYear() === (mes === 0 ? ano - 1 : ano);
  });
  const leadsAtendidosMes = leadsMes.filter(leadFoiAtendido).length;
  const leadsAtendidosAnterior = leadsAnterior.filter(leadFoiAtendido).length;

  const metaTotal = scopedVendedores.reduce((acc, vendedor) => acc + (vendedor.metaMensal || 0), 0);
  const progressoMeta = metaTotal > 0 ? Math.min((carrosVendidos / metaTotal) * 100, 100) : 0;
  const metaLeadsTotal = metaTotal * LEADS_POR_CARRO_META;
  const progressoMetaLeads = metaLeadsTotal > 0 ? Math.min((leadsAtendidosMes / metaLeadsTotal) * 100, 100) : 0;

  const tempoMedio = useMemo(() => {
    const disponiveis = veiculos.filter((v) => v.status === "disponivel");
    if (disponiveis.length === 0) return 0;
    return Math.round(disponiveis.reduce((acc, item) => acc + diasEmEstoque(item.createdAt), 0) / disponiveis.length);
  }, [veiculos]);

  const ranking = useMemo(() => {
    const base = new Map<string, { qtd: number; leadsAtendidos: number; nome: string; meta: number }>();
    scopedVendedores.forEach((v) => base.set(v.id, { qtd: 0, leadsAtendidos: 0, nome: v.nome, meta: v.metaMensal || 0 }));
    vendasMes.forEach((venda) => {
      const vendedor = base.get(venda.vendedorId);
      if (vendedor) {
        vendedor.qtd += 1;
      }
    });
    leadsMes.filter(leadFoiAtendido).forEach((lead) => {
      const vendedor = base.get(lead.vendedorId);
      if (vendedor) {
        vendedor.leadsAtendidos += 1;
      }
    });
    return [...base.entries()]
      .map(([id, dados]) => ({ id, ...dados }))
      .sort((a, b) => b.qtd - a.qtd || b.leadsAtendidos - a.leadsAtendidos);
  }, [scopedVendedores, vendasMes, leadsMes]);

  const chart6m = useMemo(() => {
    const nomesMesCurto = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const resultado: { mes: string; carros: number; leads: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      let mesAtual = mes - i;
      let anoAtual = ano;
      if (mesAtual < 0) {
        mesAtual += 12;
        anoAtual -= 1;
      }

      const vendasDoMes = scopedVendas.filter((item) => {
        const data = new Date(item.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
      });
      const leadsDoMes = scopedLeads.filter((item) => {
        const data = new Date(item.data);
        return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
      });

      resultado.push({
        mes: nomesMesCurto[mesAtual],
        carros: vendasDoMes.length,
        leads: leadsDoMes.filter(leadFoiAtendido).length,
      });
    }

    return resultado;
  }, [scopedVendas, scopedLeads, mes, ano]);

  const nomesMes = [
    "Janeiro",
    "Fevereiro",
    "Mar\u00e7o",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const variacaoCarros = vendasAnterior.length > 0
    ? ((carrosVendidos - vendasAnterior.length) / vendasAnterior.length) * 100
    : 0;
  const variacaoLeads = leadsAtendidosAnterior > 0
    ? ((leadsAtendidosMes - leadsAtendidosAnterior) / leadsAtendidosAnterior) * 100
    : 0;

  if (authLoading || loadingRemoteState) {
    return (
      <div className="space-y-5 lg:space-y-6 max-w-[1480px] mx-auto animate-pulse">
        <div className="h-10 w-48 rounded-xl bg-white/5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5">
          <div className="col-span-1 lg:col-span-4 h-[200px] sm:h-[460px] rounded-2xl bg-white/5" />
          <div className="col-span-1 lg:col-span-8 h-[200px] sm:h-[460px] rounded-2xl bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:space-y-6 max-w-[1480px] mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 animate-fade-up">
        <div className="text-center xl:text-left">
          <p className="text-white/32 text-xs font-semibold uppercase tracking-[0.24em]">Painel Geral</p>
          <h1 className="text-2xl sm:text-[2.4rem] font-extrabold text-white mt-1 tracking-tight">
            {nomesMes[mes]} <span className="text-gradient">{ano}</span>
          </h1>
        </div>

        <div className="flex items-center justify-center gap-2 sm:w-auto sm:justify-end">
          {user?.role === "owner" ? (
            <Link
              to="/creditos"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-500/30 transition-all hover:shadow-emerald-500/50 hover:scale-[1.03] active:scale-[0.97] ring-1 ring-emerald-400/10"
            >
              <Wallet className="h-3.5 w-3.5" />
              {"Cr\u00e9ditos"}
            </Link>
          ) : null}
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/52 text-[10px] font-bold uppercase tracking-[0.16em]">Tempo real</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: "Carros Vendidos",
            value: carrosVendidos,
            suffix: "",
            icon: Car,
            color: "#3b82f6",
            gradient: "from-blue-500/20 to-blue-600/5",
            border: "border-blue-500/20",
            variation: variacaoCarros,
            sub: `${vendasAnterior.length} m\u00eas anterior`,
          },
          {
            label: "Meta de Carros",
            value: `${carrosVendidos}/${metaTotal}`,
            suffix: "",
            icon: Car,
            color: "#8b5cf6",
            gradient: "from-purple-500/20 to-purple-600/5",
            border: "border-purple-500/20",
            variation: metaTotal > 0 ? progressoMeta : null,
            sub: metaTotal > carrosVendidos ? `${metaTotal - carrosVendidos} carros restantes` : "Meta batida",
          },
          {
            label: "Leads Atendidos",
            value: leadsAtendidosMes,
            suffix: "",
            icon: PhoneCall,
            color: "#10b981",
            gradient: "from-emerald-500/20 to-emerald-600/5",
            border: "border-emerald-500/20",
            variation: variacaoLeads,
            sub: `${leadsMes.length} leads entraram no mês`,
          },
          {
            label: "Meta de Leads",
            value: `${leadsAtendidosMes}/${metaLeadsTotal}`,
            suffix: "",
            icon: Users,
            color: "#f59e0b",
            gradient: "from-amber-500/20 to-amber-600/5",
            border: "border-amber-500/20",
            variation: metaLeadsTotal > 0 ? progressoMetaLeads : null,
            sub: metaLeadsTotal > leadsAtendidosMes ? `${metaLeadsTotal - leadsAtendidosMes} leads restantes` : "Meta batida",
          },
        ].map((kpi, index) => (
          <div
            key={kpi.label}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${kpi.gradient} border ${kpi.border} p-3 sm:p-5 lg:p-6 animate-fade-up hover:scale-[1.015] transition-all duration-300 group`}
            style={{ animationDelay: `${index * 0.08}s` }}
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[60px] opacity-30" style={{ backgroundColor: kpi.color }} />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}20` }}>
                  <kpi.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: kpi.color }} />
                </div>
                {kpi.variation !== null && (
                  <div
                    className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                      kpi.variation >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {kpi.variation >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {Math.abs(kpi.variation).toFixed(0)}%
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-0">
                <p className="text-xl sm:text-3xl md:text-[2rem] lg:text-[2.55rem] font-black text-white tabular-nums leading-none">{kpi.value}</p>
                {kpi.suffix && <span className="text-white/32 text-sm font-bold sm:ml-1 sm:text-base">{kpi.suffix}</span>}
              </div>
              <p className="text-white/42 text-[10px] sm:text-xs uppercase tracking-[0.18em] font-bold mt-2 sm:mt-3">{kpi.label}</p>
              <p className="text-white/24 text-[10px] sm:text-xs mt-1 sm:mt-2 leading-relaxed hidden sm:block">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {shouldShowTeamOnboarding && (
        <div className="relative overflow-hidden rounded-2xl border border-blue-400/15 bg-[linear-gradient(135deg,rgba(29,78,216,0.14),rgba(15,23,42,0.9),rgba(14,116,144,0.18))] p-5 sm:p-6 animate-fade-up">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-400/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-blue-200/75">Proximo passo</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                Sua loja ja entrou. Agora monte a equipe.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
                Convide vendedores e outros responsaveis para cada pessoa criar o proprio acesso, com permissoes separadas e operacao organizada desde o inicio.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                to="/equipe"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-5 text-xs font-extrabold uppercase tracking-[0.16em] text-white transition-all hover:bg-blue-400/15 hover:scale-[1.02] active:scale-[0.98]"
              >
                <UserPlus className="h-4 w-4" />
                Convidar equipe
              </Link>
            </div>
          </div>
        </div>
      )}

      <Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5">
            <div className="col-span-1 lg:col-span-4 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 h-[200px] sm:h-[460px] animate-pulse" />
            <div className="col-span-1 lg:col-span-8 rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 h-[200px] sm:h-[460px] animate-pulse" />
          </div>
        }
      >
        <DashboardCharts
          carros={carrosVendidos}
          leadsAtendidos={leadsAtendidosMes}
          chart6m={chart6m}
          chartMode={chartMode}
          metaLeadsTotal={metaLeadsTotal}
          metaTotal={metaTotal}
          mes={mes}
          nomesMes={nomesMes}
          progMetaLeads={progressoMetaLeads}
          progMeta={progressoMeta}
          ranking={ranking}
          setChartMode={setChartMode}
        />
      </Suspense>

      <div
        className="rounded-2xl overflow-hidden animate-fade-up relative"
        style={{ background: "linear-gradient(135deg, #0f0a2e 0%, #1a1145 30%, #0c1631 70%, #0a0f1f 100%)" }}
      >
        <div className="absolute w-[300px] h-[300px] rounded-full bg-yellow-500/5 blur-[100px] top-0 left-[30%]" />
        <div className="absolute w-[220px] h-[220px] rounded-full bg-blue-500/5 blur-[80px] bottom-0 right-[10%]" />

        <div className="relative z-10 p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-yellow-500/30">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl lg:text-2xl font-extrabold text-white">Ranking de Vendedores</h2>
                <p className="text-white/32 text-sm mt-1">{nomesMes[mes]} {ano}</p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-white/50 text-[10px] font-bold uppercase tracking-[0.16em]">Ao vivo</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          <div className="space-y-3">
            {ranking.map((r, index) => {
              const isTop3 = index < 3;
              const rankLabel = isTop3 ? `Top ${index + 1}` : `#${index + 1}`;
              const glowBg = index === 0
                ? "border-yellow-500/20 bg-yellow-500/5"
                : index === 1
                  ? "border-slate-400/15 bg-slate-400/5"
                  : index === 2
                    ? "border-orange-500/15 bg-orange-500/5"
                    : "border-white/5 bg-white/[0.02]";
              const nameColor = index === 0
                ? "text-yellow-300"
                : index === 1
                  ? "text-slate-200"
                  : index === 2
                    ? "text-orange-300"
                    : "text-white/80";
              const numColor = index === 0
                ? "text-yellow-400"
                : index === 1
                  ? "text-slate-300"
                  : index === 2
                    ? "text-orange-400"
                    : "text-white/60";

              return (
                <div
                  key={r.id}
                  className={`flex flex-col items-center gap-4 rounded-xl border ${glowBg} px-4 py-4 transition-all duration-200 hover:scale-[1.01] sm:px-5 md:flex-row md:items-center lg:gap-6`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
                      {rankLabel}
                    </span>
                    <Avatar className="h-11 w-11 border-2 border-white/10 shadow-lg">
                      <AvatarFallback
                        className={`font-black text-sm ${
                          index === 0 ? "bg-yellow-500/20 text-yellow-300" :
                          index === 1 ? "bg-slate-500/20 text-slate-200" :
                          index === 2 ? "bg-orange-500/20 text-orange-300" :
                          "bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {r.nome.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="w-full min-w-0 flex-1 text-center md:text-left">
                    <p className={`font-extrabold text-lg ${nameColor}`}>{r.nome}</p>
                    <p className="text-white/24 text-[11px] uppercase tracking-[0.14em] font-bold mt-1">
                      {r.leadsAtendidos > 0 ? `${r.leadsAtendidos} leads atendidos` : "Sem leads atendidos ainda"}
                    </p>
                  </div>

                  <div className="hidden md:block flex-1 max-w-[230px]">
                    <div className="flex justify-between text-[11px] mb-1.5">
                      <span className="text-white/24">Meta: {r.meta}</span>
                      <span className={`font-bold ${numColor}`}>
                        {r.meta > 0 ? `${Math.min((r.qtd / r.meta) * 100, 100).toFixed(0)}%` : "--"}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${r.meta > 0 ? Math.min((r.qtd / r.meta) * 100, 100) : 0}%`,
                          background: isTop3
                            ? ["linear-gradient(90deg, #f59e0b, #fbbf24)", "linear-gradient(90deg, #94a3b8, #cbd5e1)", "linear-gradient(90deg, #f97316, #fb923c)"][index]
                            : "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex w-full items-end justify-between gap-3 md:block md:w-auto md:min-w-[76px] md:text-right">
                    <div className="md:hidden">
                      <div className="mb-1.5 flex justify-between gap-3 text-[11px]">
                        <span className="text-white/24">Meta: {r.meta}</span>
                        <span className={`font-bold ${numColor}`}>
                          {r.meta > 0 ? `${Math.min((r.qtd / r.meta) * 100, 100).toFixed(0)}%` : "--"}
                        </span>
                      </div>
                    </div>
                    <p className={`text-3xl lg:text-4xl font-black tabular-nums leading-none ${numColor}`}>
                      {r.qtd}
                    </p>
                    <p className="text-white/22 text-[10px] uppercase tracking-[0.14em] font-bold mt-1">
                      carro{r.qtd !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 animate-fade-up">
        {[
          { label: "Total Ve\u00edculos", value: veiculos.length, icon: Car, color: "#3b82f6" },
          { label: "Dispon\u00edveis", value: emEstoque, icon: Eye, color: "#10b981" },
          { label: "Reservados", value: reservados, icon: Clock, color: "#f59e0b" },
          { label: "Tempo M\u00e9dio", value: `${tempoMedio}d`, icon: BarChart3, color: "#8b5cf6" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 sm:gap-3 rounded-xl bg-[hsl(230,18%,11%)] border border-white/5 px-2.5 sm:px-4 py-2.5 sm:py-3.5 hover:border-white/10 transition-all">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}15` }}>
              <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: item.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-base sm:text-xl font-black text-white tabular-nums leading-none">{item.value}</p>
              <p className="text-white/30 text-[9px] sm:text-[11px] uppercase tracking-[0.14em] font-bold mt-0.5 sm:mt-1 truncate">{item.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
