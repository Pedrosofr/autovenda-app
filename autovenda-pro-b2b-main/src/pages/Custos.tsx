import { useDeferredValue, useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Minus,
  Trash2,
  Wrench,
  TrendingUp,
  DollarSign,
  Search,
  Settings,
  Sparkles,
  Loader2,
  CheckCircle2,
  Car,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { Veiculo, CustoReparoCategoria, ConfiguracaoPrecos } from "@/store/types";
import { estimarCustosVeiculo } from "@/services/gemini";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMoney(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
}

function formatMoney(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type VisaoRapida = "todos" | "sem_reparo" | "margem_baixa" | "prejuizo";
const LIMIAR_MARGEM_BAIXA = 8;
type PrecoModo = "fixo" | "manual";
type AddVehicleMode = "existente" | "manual";
const SIMULACAO_PREFIX = "sim-";

// ─── Checklist ────────────────────────────────────────────────────────────────

type CL = {
  pintura:      { on: boolean; qty: number; modo: PrecoModo; valorManual: string };
  pneus:        { on: boolean; qty: number; modo: PrecoModo; valorManual: string };
  higienizacao: { on: boolean; modo: PrecoModo; valorManual: string };
  polimento:    { on: boolean; modo: PrecoModo; valorManual: string };
  ipva:         { on: boolean; valor: string };
  documentacao: { on: boolean; valor: string };
  mecanica:     { on: boolean; valor: string; desc: string };
  retrovisor:   { on: boolean; valor: string };
  parabrisa:    { on: boolean; valor: string };
  outro:        { on: boolean; valor: string; desc: string };
};

const CL_VAZIO: CL = {
  pintura:      { on: false, qty: 1, modo: "fixo", valorManual: "" },
  pneus:        { on: false, qty: 1, modo: "fixo", valorManual: "" },
  higienizacao: { on: false, modo: "fixo", valorManual: "" },
  polimento:    { on: false, modo: "fixo", valorManual: "" },
  ipva:         { on: false, valor: "" },
  documentacao: { on: false, valor: "" },
  mecanica:     { on: false, valor: "", desc: "" },
  retrovisor:   { on: false, valor: "" },
  parabrisa:    { on: false, valor: "" },
  outro:        { on: false, valor: "", desc: "" },
};

interface ItemCalculado {
  categoria: CustoReparoCategoria;
  descricao: string;
  valor: number;
}

function calcularItens(cl: CL, tamanho: "pequeno" | "grande", cfg: ConfiguracaoPrecos): ItemCalculado[] {
  const items: ItemCalculado[] = [];

  if (cl.pintura.on && cl.pintura.qty > 0 && (cl.pintura.modo === "fixo" || parseMoney(cl.pintura.valorManual) > 0)) {
    const v = cl.pintura.modo === "manual" ? parseMoney(cl.pintura.valorManual) : cl.pintura.qty * cfg.pinturaPorPeca;
    items.push({ categoria: "pintura", descricao: `Pintura — ${cl.pintura.qty} peça${cl.pintura.qty > 1 ? "s" : ""}`, valor: v });
  }
  if (cl.pneus.on && cl.pneus.qty > 0 && (cl.pneus.modo === "fixo" || parseMoney(cl.pneus.valorManual) > 0)) {
    const preco = tamanho === "pequeno" ? cfg.pneuPequeno : cfg.pneuGrande;
    const v = cl.pneus.modo === "manual" ? parseMoney(cl.pneus.valorManual) : cl.pneus.qty * preco;
    items.push({ categoria: "pneus", descricao: `${cl.pneus.qty} pneu${cl.pneus.qty > 1 ? "s" : ""} — carro ${tamanho}`, valor: v });
  }
  if (cl.higienizacao.on && (cl.higienizacao.modo === "fixo" || parseMoney(cl.higienizacao.valorManual) > 0)) {
    const v = cl.higienizacao.modo === "manual" ? parseMoney(cl.higienizacao.valorManual) : (tamanho === "pequeno" ? cfg.higienizacaoPequeno : cfg.higienizacaoGrande);
    items.push({ categoria: "higienizacao", descricao: `Higienização completa — carro ${tamanho}`, valor: v });
  }
  if (cl.polimento.on && (cl.polimento.modo === "fixo" || parseMoney(cl.polimento.valorManual) > 0)) {
    const v = cl.polimento.modo === "manual" ? parseMoney(cl.polimento.valorManual) : (tamanho === "pequeno" ? cfg.polimentoPequeno : cfg.polimentoGrande);
    items.push({ categoria: "polimento", descricao: `Polimento — carro ${tamanho}`, valor: v });
  }
  if (cl.ipva.on) {
    const v = parseMoney(cl.ipva.valor);
    if (v > 0) items.push({ categoria: "outro", descricao: "IPVA", valor: v });
  }
  if (cl.documentacao.on) {
    const v = parseMoney(cl.documentacao.valor);
    if (v > 0) items.push({ categoria: "outro", descricao: "Documentação / Transferência", valor: v });
  }
  if (cl.mecanica.on) {
    const v = parseMoney(cl.mecanica.valor);
    if (v > 0) items.push({ categoria: "mecanica", descricao: cl.mecanica.desc || "Mecânica", valor: v });
  }
  if (cl.retrovisor.on) {
    const v = parseMoney(cl.retrovisor.valor);
    if (v > 0) items.push({ categoria: "retrovisor", descricao: "Retrovisor / Funilaria", valor: v });
  }
  if (cl.parabrisa.on) {
    const v = parseMoney(cl.parabrisa.valor);
    if (v > 0) items.push({ categoria: "outro", descricao: "Parabrisa", valor: v });
  }
  if (cl.outro.on) {
    const v = parseMoney(cl.outro.valor);
    if (v > 0) items.push({ categoria: "outro", descricao: cl.outro.desc || "Outro", valor: v });
  }

  return items;
}

// ─── Checkbox estilizado ──────────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
        checked
          ? "bg-blue-500 border-blue-500"
          : "border-white/20 hover:border-white/40"
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// ─── Spinner de quantidade ────────────────────────────────────────────────────

function QtySpinner({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors">
        <Minus className="h-3 w-3" />
      </button>
      <span className="text-white font-bold tabular-nums text-sm w-5 text-center">{value}</span>
      <button onClick={() => onChange(value + 1)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function PrecoModoSwitch({ value, onChange }: { value: PrecoModo; onChange: (v: PrecoModo) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
      <button
        onClick={() => onChange("fixo")}
        className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${value === "fixo" ? "bg-blue-500/20 text-blue-300" : "text-white/50 hover:text-white/80"}`}
      >
        Preco fixo
      </button>
      <button
        onClick={() => onChange("manual")}
        className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${value === "manual" ? "bg-blue-500/20 text-blue-300" : "text-white/50 hover:text-white/80"}`}
      >
        Preco manual
      </button>
    </div>
  );
}

// ─── Modal Configuração de Preços ─────────────────────────────────────────────

function ModalConfig({
  open, onClose, config, onSave,
}: {
  open: boolean; onClose: () => void; config: ConfiguracaoPrecos; onSave: (c: ConfiguracaoPrecos) => void;
}) {
  const [form, setForm] = useState({ ...config });
  const n = (key: keyof ConfiguracaoPrecos) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: parseFloat(e.target.value) || 0 })),
    type: "number", min: "0",
    className: "bg-white/5 border-white/10 text-white mt-1 h-9",
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-md max-h-[92dvh] overflow-y-auto bg-[hsl(230,18%,11%)] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-400" /> Tabela de Preços da Loja
          </DialogTitle>
          <p className="text-white/30 text-xs">Preços fixos usados no cálculo automático</p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {/* Pintura */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-orange-400 text-[11px] font-bold uppercase tracking-widest mb-2">🎨 Pintura</p>
              <Label className="text-white/40 text-xs">Por peça pintada (R$)</Label>
              <Input {...n("pinturaPorPeca")} placeholder="300" />
            </div>
            {/* Pneus */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-yellow-400 text-[11px] font-bold uppercase tracking-widest mb-2">⚙️ Pneus — por unidade</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><Label className="text-white/40 text-xs">Carro pequeno (R$)</Label><Input {...n("pneuPequeno")} placeholder="200" /></div>
                <div><Label className="text-white/40 text-xs">Carro grande (R$)</Label><Input {...n("pneuGrande")} placeholder="300" /></div>
              </div>
            </div>
            {/* Higienização */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-blue-400 text-[11px] font-bold uppercase tracking-widest mb-2">🧹 Higienização completa</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><Label className="text-white/40 text-xs">Carro pequeno (R$)</Label><Input {...n("higienizacaoPequeno")} placeholder="500" /></div>
                <div><Label className="text-white/40 text-xs">Carro grande (R$)</Label><Input {...n("higienizacaoGrande")} placeholder="700" /></div>
              </div>
            </div>
            {/* Polimento */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-purple-400 text-[11px] font-bold uppercase tracking-widest mb-2">✨ Polimento</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><Label className="text-white/40 text-xs">Carro pequeno (R$)</Label><Input {...n("polimentoPequeno")} placeholder="250" /></div>
                <div><Label className="text-white/40 text-xs">Carro grande (R$)</Label><Input {...n("polimentoGrande")} placeholder="350" /></div>
              </div>
            </div>
            {/* Margem */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-emerald-400 text-[11px] font-bold uppercase tracking-widest mb-2">📈 Meta de lucro</p>
              <Label className="text-white/40 text-xs">Margem desejada sobre custo total (%)</Label>
              <Input {...n("margemLucroPercent")} placeholder="15" />
            </div>
            {/* Telefone da loja */}
            <div className="rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-cyan-400 text-[11px] font-bold uppercase tracking-widest mb-2">📲 Contato para anúncios</p>
              <Label className="text-white/40 text-xs">Telefone/WhatsApp exibido nos anúncios</Label>
              <Input
                value={form.telefoneLoja ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, telefoneLoja: e.target.value }))}
                placeholder="(XX) XXXXX-XXXX"
                className="bg-white/5 border-white/10 text-white mt-1 h-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={onClose} className="flex-1 border-white/10 text-white/50">Cancelar</Button>
            <Button onClick={() => { onSave(form); toast.success("Preços salvos!"); onClose(); }} className="flex-1 card-gradient-blue text-white font-bold shadow-blue-500/20">
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card do veículo ──────────────────────────────────────────────────────────

function VeiculoCard({ veiculo, totalReparos, qtdReparos, onClick }: {
  veiculo: Veiculo; totalReparos: number; qtdReparos: number; onClick: () => void;
}) {
  const compra   = parseMoney(veiculo.custo);
  const venda    = parseMoney(veiculo.valorVenda);
  const total    = compra + totalReparos;
  const lucro    = venda - total;
  const margem   = venda > 0 ? (lucro / venda) * 100 : 0;
  const prioridadeAlta = lucro < 0 || (qtdReparos > 0 && margem < LIMIAR_MARGEM_BAIXA);
  const insightRapido = lucro < 0
    ? "Prejuizo: revise preco ou reduza reparos."
    : qtdReparos === 0
      ? "Sem reparos lancados: faca checklist inicial."
      : margem < LIMIAR_MARGEM_BAIXA
        ? "Margem apertada: acompanhe custo antes de anunciar."
        : "Margem saudavel para seguir com venda.";

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-[hsl(230,18%,11%)] border overflow-hidden cursor-pointer group hover:border-blue-500/20 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200 ${
        prioridadeAlta ? "border-amber-500/30" : "border-white/5"
      }`}
    >
      {veiculo.fotos[0] ? (
        <div className="relative aspect-[16/7] overflow-hidden bg-white/5">
          <img src={veiculo.fotos[0]} alt={veiculo.modelo} className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <div className="absolute top-2 right-2">
            {qtdReparos > 0
              ? <span className="bg-orange-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{qtdReparos} reparo{qtdReparos > 1 ? "s" : ""}</span>
              : <span className="bg-white/10 text-white/40 text-[10px] px-2 py-0.5 rounded-full">Sem reparos</span>}
          </div>
          <div className="absolute bottom-2 left-3">
            <p className="text-white font-bold text-sm">{veiculo.modelo}</p>
            <p className="text-white/50 text-xs">{veiculo.ano}</p>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">{veiculo.modelo}</p>
            <p className="text-white/50 text-xs">{veiculo.ano}</p>
          </div>
          {qtdReparos > 0
            ? <span className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/20">{qtdReparos} reparo{qtdReparos > 1 ? "s" : ""}</span>
            : <span className="bg-white/5 text-white/30 text-[10px] px-2 py-0.5 rounded-full">Sem reparos</span>}
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/5 p-2.5"><p className="text-white/40 mb-1">Custo compra</p><p className="text-white font-bold tabular-nums">{formatMoney(compra)}</p></div>
          <div className="rounded-xl bg-white/5 p-2.5"><p className="text-white/40 mb-1">Reparos</p><p className={`font-bold tabular-nums ${totalReparos > 0 ? "text-orange-400" : "text-white/20"}`}>{totalReparos > 0 ? formatMoney(totalReparos) : "—"}</p></div>
          <div className="rounded-xl bg-white/5 p-2.5"><p className="text-white/40 mb-1">Custo total</p><p className="text-white font-extrabold tabular-nums">{formatMoney(total)}</p></div>
          <div className={`rounded-xl p-2.5 border ${lucro >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <p className="text-white/40 mb-1">Lucro</p>
            <p className={`font-extrabold tabular-nums text-xs ${lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatMoney(lucro)}{venda > 0 && <span className="opacity-60 ml-1">({margem.toFixed(0)}%)</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 text-[11px] leading-tight text-center text-white/20 transition-colors group-hover:text-blue-400/60 sm:flex-row sm:text-xs">
          <Wrench className="h-3 w-3" /><span>Abrir reparos</span><ChevronRight className="h-3 w-3" />
        </div>
        <div className={`rounded-xl border px-3 py-2 text-xs ${
          lucro < 0
            ? "bg-red-500/10 border-red-500/20 text-red-300"
            : margem < LIMIAR_MARGEM_BAIXA
              ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
        }`}>
          {insightRapido}
        </div>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function Custos() {
  const { veiculos, custos, addCusto, removeCusto, configPrecos, updateConfigPrecos, updateVeiculo } = useAppStore();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [visaoRapida, setVisaoRapida] = useState<VisaoRapida>("todos");
  const [selectedVeiculo, setSelectedVeiculo] = useState<Veiculo | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddVeiculo, setShowAddVeiculo] = useState(false);
  const [addMode, setAddMode] = useState<AddVehicleMode>("existente");
  const [existingSearch, setExistingSearch] = useState("");
  const [existingId, setExistingId] = useState("");
  const [existingCusto, setExistingCusto] = useState("");
  const [manualModelo, setManualModelo] = useState("");
  const [manualAno, setManualAno] = useState("");
  const [manualValorVenda, setManualValorVenda] = useState("");
  const [manualCusto, setManualCusto] = useState("");
  const [veiculosSimulados, setVeiculosSimulados] = useState<Veiculo[]>([]);
  const [custoCompraInput, setCustoCompraInput] = useState("");
  const [margemInput, setMargemInput] = useState(String(configPrecos.margemLucroPercent));

  // Checklist
  const [cl, setCl] = useState<CL>({ ...CL_VAZIO });
  const [tamanho, setTamanho] = useState<"pequeno" | "grande">("pequeno");

  // IA
  const [fipeInput, setFipeInput] = useState("");
  const [estimando, setEstimando] = useState(false);
  const [showIA, setShowIA] = useState(false);

  // ─── Derivados ────────────────────────────────────────────────────────────────

  const veiculosAtivos = useMemo(() => veiculos.filter((v) => !v.archivedAt && !v.deletedAt), [veiculos]);
  const veiculosCustos = useMemo(() => [...veiculosAtivos, ...veiculosSimulados], [veiculosAtivos, veiculosSimulados]);
  const existingFiltered = useMemo(() => {
    const s = existingSearch.trim().toLowerCase();
    return veiculosAtivos.filter((v) => !s || v.modelo.toLowerCase().includes(s));
  }, [existingSearch, veiculosAtivos]);

  const custosPorVeiculo = useMemo(() => {
    const map: Record<string, { total: number; qtd: number }> = {};
    for (const c of custos) {
      if (!map[c.veiculoId]) map[c.veiculoId] = { total: 0, qtd: 0 };
      map[c.veiculoId].total += c.valor;
      map[c.veiculoId].qtd  += 1;
    }
    return map;
  }, [custos]);

  const veiculosComResumo = useMemo(() => {
    return veiculosCustos.map((veiculo) => {
      const totalReparos = custosPorVeiculo[veiculo.id]?.total ?? 0;
      const qtdReparos = custosPorVeiculo[veiculo.id]?.qtd ?? 0;
      const compra = parseMoney(veiculo.custo);
      const venda = parseMoney(veiculo.valorVenda);
      const lucro = venda - compra - totalReparos;
      const margem = venda > 0 ? (lucro / venda) * 100 : 0;

      return { veiculo, totalReparos, qtdReparos, lucro, margem };
    });
  }, [custosPorVeiculo, veiculosCustos]);

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filtrados = useMemo(
    () => veiculosComResumo
      .filter(({ veiculo, qtdReparos, lucro, margem }) => {
        if (normalizedSearch && !veiculo.modelo.toLowerCase().includes(normalizedSearch)) return false;
        if (visaoRapida === "sem_reparo") return qtdReparos === 0;
        if (visaoRapida === "margem_baixa") return qtdReparos > 0 && margem >= 0 && margem < LIMIAR_MARGEM_BAIXA;
        if (visaoRapida === "prejuizo") return lucro < 0;
        return true;
      })
      .sort((a, b) => {
        if (visaoRapida === "prejuizo") return a.lucro - b.lucro;
        if (visaoRapida === "margem_baixa") return a.margem - b.margem;
        if (visaoRapida === "sem_reparo") return a.veiculo.modelo.localeCompare(b.veiculo.modelo);
        return 0;
      }),
    [normalizedSearch, veiculosComResumo, visaoRapida]
  );

  const prioridades = useMemo(() => {
    const semReparo = veiculosComResumo.filter((v) => v.qtdReparos === 0).length;
    const margemBaixa = veiculosComResumo.filter((v) => v.qtdReparos > 0 && v.margem >= 0 && v.margem < LIMIAR_MARGEM_BAIXA).length;
    const prejuizo = veiculosComResumo.filter((v) => v.lucro < 0).length;
    return { semReparo, margemBaixa, prejuizo };
  }, [veiculosComResumo]);

  const custosDoSelecionado = useMemo(() => custos.filter((c) => c.veiculoId === selectedVeiculo?.id), [custos, selectedVeiculo]);
  const custosJaLancadosTotal = useMemo(
    () => custosDoSelecionado.reduce((s, c) => s + c.valor, 0),
    [custosDoSelecionado]
  );

  const totalReparosGeral = useMemo(() => custos.reduce((s, c) => s + c.valor, 0), [custos]);
  const mediaReparos      = veiculosCustos.length > 0 ? totalReparosGeral / veiculosCustos.length : 0;
  const lucroTotal        = useMemo(() => veiculosCustos.reduce((acc, v) => acc + (parseMoney(v.valorVenda) - parseMoney(v.custo) - (custosPorVeiculo[v.id]?.total ?? 0)), 0), [veiculosCustos, custosPorVeiculo]);

  // Itens do checklist atual + totais
  const itensChecklist   = useMemo(() => calcularItens(cl, tamanho, configPrecos), [cl, tamanho, configPrecos]);
  const totalChecklist   = itensChecklist.reduce((s, i) => s + i.valor, 0);
  const custoCompraReal  = parseMoney(custoCompraInput || selectedVeiculo?.custo || "");
  const hasCustoCompraValido = custoCompraReal > 0;
  const custoArrumarTotal = custosJaLancadosTotal + totalChecklist;
  const custoTotalCL     = selectedVeiculo ? custoCompraReal + custoArrumarTotal : 0;
  const margemSelecionada = Math.max(0, parseFloat(margemInput.replace(",", ".")) || 0);
  const precoSugeridoCL  = hasCustoCompraValido && custoTotalCL > 0 ? custoTotalCL * (1 + margemSelecionada / 100) : 0;
  const lucroCL          = hasCustoCompraValido ? (precoSugeridoCL - custoTotalCL) : 0;
  const margemCL         = precoSugeridoCL > 0 ? (lucroCL / precoSugeridoCL) * 100 : 0;
  const precoVendaAtual  = parseMoney(selectedVeiculo?.valorVenda ?? "");
  const lucroNoPrecoAtual = hasCustoCompraValido ? precoVendaAtual - custoTotalCL : 0;
  const algumMarcado     = itensChecklist.length > 0;

  useEffect(() => {
    if (!selectedVeiculo) return;
    setCustoCompraInput(selectedVeiculo.custo || "");
    setMargemInput(String(configPrecos.margemLucroPercent));
  }, [configPrecos.margemLucroPercent, selectedVeiculo]);

  useEffect(() => {
    if (!existingId) {
      setExistingCusto("");
      return;
    }
    const veiculo = veiculosAtivos.find((v) => v.id === existingId);
    setExistingCusto(veiculo?.custo ?? "");
  }, [existingId, veiculosAtivos]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const toggle = <K extends keyof CL>(key: K) => setCl((p) => ({ ...p, [key]: { ...p[key], on: !(p[key] as { on: boolean }).on } }));
  const set    = <K extends keyof CL>(key: K, patch: Partial<CL[K]>) => setCl((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const confirmarChecklist = () => {
    if (!selectedVeiculo || itensChecklist.length === 0) return;
    const hoje = new Date().toISOString().slice(0, 10);
    for (const item of itensChecklist) {
      addCusto({ veiculoId: selectedVeiculo.id, categoria: item.categoria, descricao: item.descricao, valor: item.valor, data: hoje });
    }
    toast.success(`${itensChecklist.length} reparo${itensChecklist.length > 1 ? "s" : ""} lançado${itensChecklist.length > 1 ? "s" : ""} — ${formatMoney(totalChecklist)}`);
    setCl({ ...CL_VAZIO });
  };

  const handleEstimarIA = async () => {
    if (!selectedVeiculo) return;
    const fipe = parseMoney(fipeInput);
    if (!fipe || fipe <= 0) { toast.error("Informe o valor da FIPE."); return; }
    setEstimando(true);
    try {
      const result = await estimarCustosVeiculo({ modelo: selectedVeiculo.modelo, ano: selectedVeiculo.ano, custoCompra: parseMoney(selectedVeiculo.custo), valorFipe: fipe, config: configPrecos });
      // Preenche o checklist com base no resultado
      const newCl: CL = { ...CL_VAZIO };
      setTamanho(result.tamanho);
      for (const r of result.reparos) {
        if (r.categoria === "pintura")      { newCl.pintura      = { on: true, qty: r.quantidade, modo: "fixo", valorManual: "" }; }
        if (r.categoria === "pneus")        { newCl.pneus        = { on: true, qty: r.quantidade, modo: "fixo", valorManual: "" }; }
        if (r.categoria === "higienizacao") { newCl.higienizacao = { on: true, modo: "fixo", valorManual: "" }; }
        if (r.categoria === "polimento")    { newCl.polimento    = { on: true, modo: "fixo", valorManual: "" }; }
        if (r.categoria === "mecanica")     { newCl.mecanica     = { on: true, valor: String(r.valorTotal), desc: r.descricao }; }
      }
      setCl(newCl);
      toast.success("Checklist preenchido pela IA — ajuste se quiser e confirme!");
      setShowIA(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na IA");
    } finally {
      setEstimando(false);
    }
  };

  const handleFechar = () => {
    setSelectedVeiculo(null);
    setCl({ ...CL_VAZIO });
    setFipeInput("");
    setShowIA(false);
  };

  const handleRemover = (id: string) => {
    if (!window.confirm("Remover este reparo?")) return;
    removeCusto(id);
  };

  const handleExcluirVeiculo = () => {
    if (!selectedVeiculo) return;
    if (!selectedVeiculo.id.startsWith(SIMULACAO_PREFIX)) {
      toast.error("Veiculo de estoque nao pode ser excluido por aqui.");
      return;
    }
    if (!window.confirm("Excluir esta simulacao da aba de custos?")) return;
    setVeiculosSimulados((prev) => prev.filter((v) => v.id !== selectedVeiculo.id));
    for (const c of custos.filter((item) => item.veiculoId === selectedVeiculo.id)) {
      removeCusto(c.id);
    }
    toast.success("Simulacao removida da aba de custos.");
    handleFechar();
  };

  const salvarCustoCompra = () => {
    if (!selectedVeiculo) return;
    const valor = parseMoney(custoCompraInput);
    if (selectedVeiculo.id.startsWith(SIMULACAO_PREFIX)) {
      setVeiculosSimulados((prev) =>
        prev.map((v) => (v.id === selectedVeiculo.id ? { ...v, custo: String(valor) } : v))
      );
      setSelectedVeiculo((prev) => (prev ? { ...prev, custo: String(valor) } : prev));
      setCustoCompraInput(String(valor));
      toast.success("Custo real da compra salvo.");
      return;
    }
    updateVeiculo(selectedVeiculo.id, { custo: String(valor) });
    setSelectedVeiculo((prev) => (prev ? { ...prev, custo: String(valor) } : prev));
    setCustoCompraInput(String(valor));
    toast.success("Custo real da compra salvo.");
  };

  const abrirAdicionarVeiculo = () => {
    setAddMode("existente");
    setExistingSearch("");
    setExistingId("");
    setExistingCusto("");
    setManualModelo("");
    setManualAno("");
    setManualValorVenda("");
    setManualCusto("");
    setShowAddVeiculo(true);
  };

  const confirmarAdicionarVeiculo = () => {
    if (addMode === "existente") {
      const alvo = veiculosAtivos.find((v) => v.id === existingId);
      if (!alvo) {
        toast.error("Selecione um veiculo existente.");
        return;
      }
      const custo = parseMoney(existingCusto);
      if (custo <= 0) {
        toast.error("Informe o custo do veiculo.");
        return;
      }
      updateVeiculo(alvo.id, { custo: String(custo) });
      setSelectedVeiculo({ ...alvo, custo: String(custo) });
      setShowAddVeiculo(false);
      toast.success("Veiculo existente vinculado na aba de custos.");
      return;
    }

    const modelo = manualModelo.trim();
    const custo = parseMoney(manualCusto);
    if (!modelo) {
      toast.error("Informe o modelo do veiculo.");
      return;
    }
    if (custo <= 0) {
      toast.error("Informe o custo do veiculo.");
      return;
    }

    const novoSimulado: Veiculo = {
      id: `${SIMULACAO_PREFIX}${Date.now()}`,
      fotos: [],
      fotosDestaque: [],
      origem: "simulacao_custos",
      modelo,
      ano: manualAno.trim() || new Date().getFullYear().toString(),
      custo: String(custo),
      valorVenda: manualValorVenda.trim(),
      status: "disponivel",
      tituloAnuncio: "",
      descricaoOlx: "",
      descricaoWhatsapp: "",
      descricaoMarketplace: "",
      hashtags: [],
      fotoCapaIndex: 0,
    };
    setVeiculosSimulados((prev) => [novoSimulado, ...prev]);
    setSelectedVeiculo(novoSimulado);
    setSearch(modelo);
    setShowAddVeiculo(false);
    toast.success("Simulacao adicionada na aba de custos (nao foi para o estoque).");
  };

  // ─── Linha de item no checklist ───────────────────────────────────────────────

  const precoFixed = (cat: "higienizacao" | "polimento") => {
    const p = configPrecos;
    if (cat === "higienizacao") return tamanho === "pequeno" ? p.higienizacaoPequeno : p.higienizacaoGrande;
    return tamanho === "pequeno" ? p.polimentoPequeno : p.polimentoGrande;
  };

  const valorPinturaAtual = cl.pintura.modo === "manual"
    ? parseMoney(cl.pintura.valorManual)
    : cl.pintura.qty * configPrecos.pinturaPorPeca;
  const valorPneusAtual = cl.pneus.modo === "manual"
    ? parseMoney(cl.pneus.valorManual)
    : cl.pneus.qty * (tamanho === "pequeno" ? configPrecos.pneuPequeno : configPrecos.pneuGrande);
  const valorHigienizacaoAtual = cl.higienizacao.modo === "manual"
    ? parseMoney(cl.higienizacao.valorManual)
    : precoFixed("higienizacao");
  const valorPolimentoAtual = cl.polimento.modo === "manual"
    ? parseMoney(cl.polimento.valorManual)
    : precoFixed("polimento");

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-5 max-w-[1440px] mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Custos de Reparo</h1>
          <p className="text-white/30 text-sm mt-1">{veiculosCustos.length} veiculos na aba de custos</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={abrirAdicionarVeiculo} className="card-gradient-blue text-white gap-2 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> Adicionar veiculo
          </Button>
          <Button variant="outline" onClick={() => setShowConfig(true)} className="border-white/10 text-white/60 hover:text-white gap-2 w-full sm:w-auto">
            <Settings className="h-4 w-4" /> Configurar Preços da Loja
          </Button>
        </div>
      </div>

      {/* Preços ativos */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 sm:px-4">
        <div className="grid grid-cols-2 gap-2 text-xs text-white/40 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-4 lg:gap-y-1">
          <span className="rounded-lg bg-white/5 px-2 py-1">Pintura/peça <b className="text-white/70">R${configPrecos.pinturaPorPeca}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Pneu P <b className="text-white/70">R${configPrecos.pneuPequeno}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Pneu G <b className="text-white/70">R${configPrecos.pneuGrande}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Higieniz. P <b className="text-white/70">R${configPrecos.higienizacaoPequeno}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Higieniz. G <b className="text-white/70">R${configPrecos.higienizacaoGrande}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Polimento P <b className="text-white/70">R${configPrecos.polimentoPequeno}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Polimento G <b className="text-white/70">R${configPrecos.polimentoGrande}</b></span>
          <span className="rounded-lg bg-white/5 px-2 py-1">Margem <b className="text-emerald-400">{configPrecos.margemLucroPercent}%</b></span>
          <button onClick={() => setShowConfig(true)} className="rounded-lg bg-white/5 px-2 py-1 text-left text-blue-400 underline lg:text-center">Editar</button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: <Wrench className="h-5 w-5 text-orange-400" />, bg: "bg-orange-500/10 border-orange-500/20", label: "Total em reparos", valor: totalReparosGeral, cor: "text-white" },
          { icon: <DollarSign className="h-5 w-5 text-blue-400" />, bg: "bg-blue-500/10 border-blue-500/20", label: "Média reparo/carro", valor: mediaReparos, cor: "text-white" },
          { icon: <TrendingUp className={`h-5 w-5 ${lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}`} />, bg: lucroTotal >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20", label: "Lucro total estimado", valor: lucroTotal, cor: lucroTotal >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map((card, i) => (
          <div key={i} className="rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${card.bg}`}>{card.icon}</div>
            <div><p className="text-white/40 text-xs">{card.label}</p><p className={`font-extrabold text-lg tabular-nums ${card.cor}`}>{formatMoney(card.valor)}</p></div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[hsl(230,18%,11%)] p-3 sm:p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5" />
          <div>
            <p className="text-white font-semibold text-sm">Modo rapido do lojista</p>
            <p className="text-white/40 text-xs">Filtre por prioridade e ataque primeiro o que trava lucro.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[
            { key: "todos" as const, label: "Todos", count: veiculosComResumo.length },
            { key: "sem_reparo" as const, label: "Sem reparo", count: prioridades.semReparo },
            { key: "margem_baixa" as const, label: "Margem baixa", count: prioridades.margemBaixa },
            { key: "prejuizo" as const, label: "No prejuizo", count: prioridades.prejuizo },
          ].map((filtro) => (
            <button
              key={filtro.key}
              onClick={() => setVisaoRapida(filtro.key)}
              className={`h-10 rounded-xl px-3 text-xs font-semibold border transition-colors ${
                visaoRapida === filtro.key
                  ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  : "bg-white/5 text-white/60 border-white/10 hover:border-white/25"
              }`}
            >
              {filtro.label} ({filtro.count})
            </button>
          ))}
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input placeholder="Buscar veículo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtrados.map((item) => (
          <VeiculoCard
            key={item.veiculo.id}
            veiculo={item.veiculo}
            totalReparos={item.totalReparos}
            qtdReparos={item.qtdReparos}
            onClick={() => setSelectedVeiculo(item.veiculo)}
          />
        ))}
        {filtrados.length === 0 && (
          <div className="col-span-full py-16 text-center"><Car className="h-12 w-12 text-white/10 mx-auto mb-3" /><p className="text-white/30 text-sm">Nenhum veículo encontrado</p></div>
        )}
      </div>

      {/* ── Modal Config ── */}
      <Dialog open={showAddVeiculo} onOpenChange={setShowAddVeiculo}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg bg-[hsl(230,18%,11%)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Adicionar veiculo na aba de custos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAddMode("existente")}
                className={`h-10 rounded-xl text-xs font-bold border ${addMode === "existente" ? "bg-blue-500/15 text-blue-300 border-blue-500/30" : "bg-white/5 text-white/60 border-white/10"}`}
              >
                Veiculo existente
              </button>
              <button
                onClick={() => setAddMode("manual")}
                className={`h-10 rounded-xl text-xs font-bold border ${addMode === "manual" ? "bg-blue-500/15 text-blue-300 border-blue-500/30" : "bg-white/5 text-white/60 border-white/10"}`}
              >
                Veiculo manual
              </button>
            </div>

            {addMode === "existente" ? (
              <div className="space-y-3">
                <Input
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Buscar veiculo do estoque"
                  className="bg-white/5 border-white/10 text-white"
                />
                <select
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm"
                >
                  <option value="">Selecione um veiculo</option>
                  {existingFiltered.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.modelo} - {v.ano}
                    </option>
                  ))}
                </select>
                <Input
                  value={existingCusto}
                  onChange={(e) => setExistingCusto(e.target.value)}
                  placeholder="Custo do veiculo (obrigatorio)"
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <Input value={manualModelo} onChange={(e) => setManualModelo(e.target.value)} placeholder="Modelo" className="bg-white/5 border-white/10 text-white" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={manualAno} onChange={(e) => setManualAno(e.target.value)} placeholder="Ano" className="bg-white/5 border-white/10 text-white" />
                  <Input value={manualValorVenda} onChange={(e) => setManualValorVenda(e.target.value)} placeholder="Valor de venda (opcional)" className="bg-white/5 border-white/10 text-white" />
                </div>
                <Input value={manualCusto} onChange={(e) => setManualCusto(e.target.value)} placeholder="Custo do veiculo (obrigatorio)" className="bg-white/5 border-white/10 text-white" />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddVeiculo(false)} className="flex-1 border-white/10 text-white/70">
                Cancelar
              </Button>
              <Button onClick={confirmarAdicionarVeiculo} className="flex-1 card-gradient-blue text-white">
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ModalConfig open={showConfig} onClose={() => setShowConfig(false)} config={configPrecos} onSave={updateConfigPrecos} />

      {/* ── Modal Detalhe / Checklist ── */}
      <Dialog open={!!selectedVeiculo} onOpenChange={(o) => { if (!o) handleFechar(); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg bg-[hsl(230,18%,11%)] border-white/10 max-h-[92dvh] overflow-y-auto p-0">
          {selectedVeiculo && (
            <>
              {/* Cabeçalho */}
              <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-white font-extrabold text-xl">{selectedVeiculo.modelo}</h2>
                    <p className="text-white/40 text-sm">{selectedVeiculo.ano} · comprado por <span className="text-white/70 font-semibold">{selectedVeiculo.custo}</span></p>
                  </div>
                </div>

                {/* Resumo rápido */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-xs">
                  <div className="rounded-xl bg-white/5 p-2.5 text-center">
                    <p className="text-white/40">Reparos lançados</p>
                    <p className="text-orange-400 font-bold tabular-nums mt-0.5">{formatMoney(custosDoSelecionado.reduce((s, c) => s + c.valor, 0))}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-2.5 text-center">
                    <p className="text-white/40">Preço de venda</p>
                    <p className="text-blue-400 font-bold tabular-nums mt-0.5">{selectedVeiculo.valorVenda || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center">
                    <p className="text-white/40">Lucro atual</p>
                    <p className="text-emerald-400 font-bold tabular-nums mt-0.5">
                      {formatMoney(parseMoney(selectedVeiculo.valorVenda) - parseMoney(selectedVeiculo.custo) - custosDoSelecionado.reduce((s, c) => s + c.valor, 0))}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── CHECKLIST ── */}
              <div className="px-4 sm:px-6 py-4 border-b border-white/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-white font-bold text-sm">O que este carro precisa?</p>
                    <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setCl({ ...CL_VAZIO })} className="text-white/20 hover:text-white/50 transition-colors" title="Limpar seleção">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setShowIA(!showIA)}
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/20 bg-purple-500/10 rounded-lg px-2 py-1 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" /> Preencher com IA
                    </button>
                  </div>
                </div>

                {/* IA opcional */}
                {showIA && (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                    <p className="text-purple-300/70 text-xs">Informe a FIPE e a IA preenche o checklist automaticamente. Você pode ajustar antes de confirmar.</p>
                    <div className="flex gap-2">
                      <Input value={fipeInput} onChange={(e) => setFipeInput(e.target.value)} placeholder="FIPE (ex: 42000)" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-9 flex-1 font-bold" />
                      <Button onClick={handleEstimarIA} disabled={estimando || !fipeInput} className="h-9 bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 shrink-0">
                        {estimando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Tamanho do carro */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(["pequeno", "grande"] as const).map((t) => (
                    <button key={t} onClick={() => setTamanho(t)} className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold leading-tight border transition-all ${tamanho === t ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-white/5 text-white/40 border-white/10 hover:border-white/20"}`}>
                      {t === "pequeno" ? "🚗 Pequeno / Popular" : "🚙 Médio / Grande / SUV"}
                    </button>
                  ))}
                </div>

                {/* ── Itens com preço fixo ── */}
                <div className="space-y-2">
                  <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Preço fixo (conforme sua tabela)</p>

                  {/* Pintura */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.pintura.on ? "bg-orange-500/10 border-orange-500/20" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.pintura.on} onChange={() => toggle("pintura")} />
                      <span className="text-xl">🎨</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.pintura.on ? "text-white" : "text-white/60"}`}>Pintura</p>
                        <p className="text-white/30 text-xs">{formatMoney(configPrecos.pinturaPorPeca)} por peça</p>
                      </div>
                      {cl.pintura.on && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <PrecoModoSwitch value={cl.pintura.modo} onChange={(modo) => set("pintura", { modo })} />
                          {cl.pintura.modo === "fixo" ? (
                            <QtySpinner value={cl.pintura.qty} onChange={(q) => set("pintura", { qty: q })} />
                          ) : (
                            <Input
                              value={cl.pintura.valorManual}
                              onChange={(e) => set("pintura", { valorManual: e.target.value })}
                              placeholder="R$ manual"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-32"
                            />
                          )}
                          <p className="text-orange-400 font-bold tabular-nums text-sm w-20 text-right">
                            {valorPinturaAtual > 0 ? formatMoney(valorPinturaAtual) : "R$ 0,00"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pneus */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.pneus.on ? "bg-yellow-500/10 border-yellow-500/20" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.pneus.on} onChange={() => toggle("pneus")} />
                      <span className="text-xl">⚙️</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.pneus.on ? "text-white" : "text-white/60"}`}>Pneus</p>
                        <p className="text-white/30 text-xs">{formatMoney(tamanho === "pequeno" ? configPrecos.pneuPequeno : configPrecos.pneuGrande)} por unidade</p>
                      </div>
                      {cl.pneus.on && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <PrecoModoSwitch value={cl.pneus.modo} onChange={(modo) => set("pneus", { modo })} />
                          {cl.pneus.modo === "fixo" ? (
                            <QtySpinner value={cl.pneus.qty} onChange={(q) => set("pneus", { qty: q })} />
                          ) : (
                            <Input
                              value={cl.pneus.valorManual}
                              onChange={(e) => set("pneus", { valorManual: e.target.value })}
                              placeholder="R$ manual"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-32"
                            />
                          )}
                          <p className="text-yellow-400 font-bold tabular-nums text-sm w-20 text-right">
                            {valorPneusAtual > 0 ? formatMoney(valorPneusAtual) : "R$ 0,00"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Higienização */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.higienizacao.on ? "bg-blue-500/10 border-blue-500/20" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.higienizacao.on} onChange={() => toggle("higienizacao")} />
                      <span className="text-xl">🧹</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.higienizacao.on ? "text-white" : "text-white/60"}`}>Higienização completa</p>
                        <p className="text-white/30 text-xs">{formatMoney(precoFixed("higienizacao"))} — carro {tamanho}</p>
                      </div>
                      {cl.higienizacao.on && (
                        <div className="flex flex-col gap-2 sm:items-end">
                          <PrecoModoSwitch value={cl.higienizacao.modo} onChange={(modo) => set("higienizacao", { modo })} />
                          {cl.higienizacao.modo === "manual" && (
                            <Input
                              value={cl.higienizacao.valorManual}
                              onChange={(e) => set("higienizacao", { valorManual: e.target.value })}
                              placeholder="R$ manual"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-32"
                            />
                          )}
                          <p className="text-blue-400 font-bold tabular-nums text-sm">{valorHigienizacaoAtual > 0 ? formatMoney(valorHigienizacaoAtual) : "R$ 0,00"}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Polimento */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.polimento.on ? "bg-purple-500/10 border-purple-500/20" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.polimento.on} onChange={() => toggle("polimento")} />
                      <span className="text-xl">✨</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.polimento.on ? "text-white" : "text-white/60"}`}>Polimento</p>
                        <p className="text-white/30 text-xs">{formatMoney(precoFixed("polimento"))} — carro {tamanho}</p>
                      </div>
                      {cl.polimento.on && (
                        <div className="flex flex-col gap-2 sm:items-end">
                          <PrecoModoSwitch value={cl.polimento.modo} onChange={(modo) => set("polimento", { modo })} />
                          {cl.polimento.modo === "manual" && (
                            <Input
                              value={cl.polimento.valorManual}
                              onChange={(e) => set("polimento", { valorManual: e.target.value })}
                              placeholder="R$ manual"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-32"
                            />
                          )}
                          <p className="text-purple-400 font-bold tabular-nums text-sm">{valorPolimentoAtual > 0 ? formatMoney(valorPolimentoAtual) : "R$ 0,00"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Itens com valor livre ── */}
                <div className="space-y-2">
                  <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Valor livre (você digita o custo)</p>

                  {/* IPVA */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.ipva.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.ipva.on} onChange={() => toggle("ipva")} />
                      <span className="text-xl">📄</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.ipva.on ? "text-white" : "text-white/60"}`}>IPVA</p>
                      </div>
                      {cl.ipva.on && (
                        <Input value={cl.ipva.valor} onChange={(e) => set("ipva", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>

                  {/* Documentação */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.documentacao.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.documentacao.on} onChange={() => toggle("documentacao")} />
                      <span className="text-xl">📋</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.documentacao.on ? "text-white" : "text-white/60"}`}>Documentação / Transferência</p>
                      </div>
                      {cl.documentacao.on && (
                        <Input value={cl.documentacao.valor} onChange={(e) => set("documentacao", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>

                  {/* Mecânica */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.mecanica.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.mecanica.on} onChange={() => toggle("mecanica")} />
                      <span className="text-xl">🔩</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.mecanica.on ? "text-white" : "text-white/60"}`}>Mecânica</p>
                        {cl.mecanica.on && (
                          <Input value={cl.mecanica.desc} onChange={(e) => set("mecanica", { desc: e.target.value })} placeholder="O que foi feito?" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-7 mt-1 text-xs" />
                        )}
                      </div>
                      {cl.mecanica.on && (
                        <Input value={cl.mecanica.valor} onChange={(e) => set("mecanica", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>

                  {/* Retrovisor / Funilaria */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.retrovisor.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.retrovisor.on} onChange={() => toggle("retrovisor")} />
                      <span className="text-xl">🔧</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.retrovisor.on ? "text-white" : "text-white/60"}`}>Retrovisor / Funilaria</p>
                      </div>
                      {cl.retrovisor.on && (
                        <Input value={cl.retrovisor.valor} onChange={(e) => set("retrovisor", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>

                  {/* Parabrisa */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.parabrisa.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.parabrisa.on} onChange={() => toggle("parabrisa")} />
                      <span className="text-xl">🪟</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.parabrisa.on ? "text-white" : "text-white/60"}`}>Parabrisa</p>
                      </div>
                      {cl.parabrisa.on && (
                        <Input value={cl.parabrisa.valor} onChange={(e) => set("parabrisa", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>

                  {/* Outro */}
                  <div className={`rounded-xl border p-3 transition-all ${cl.outro.on ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Checkbox checked={cl.outro.on} onChange={() => toggle("outro")} />
                      <span className="text-xl">📝</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${cl.outro.on ? "text-white" : "text-white/60"}`}>Outro</p>
                        {cl.outro.on && (
                          <Input value={cl.outro.desc} onChange={(e) => set("outro", { desc: e.target.value })} placeholder="Descreva o custo" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-7 mt-1 text-xs" />
                        )}
                      </div>
                      {cl.outro.on && (
                        <Input value={cl.outro.valor} onChange={(e) => set("outro", { valor: e.target.value })} placeholder="R$" className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 w-full text-right font-bold sm:w-28" />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Total em tempo real ── */}
                {algumMarcado && (
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
                    <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest mb-3">Resumo do cálculo</p>

                    {/* Itens selecionados */}
                    <div className="space-y-1">
                      {itensChecklist.map((item, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-xs">
                          <span className="text-white/50">{item.descricao}</span>
                          <span className="text-white/70 tabular-nums font-semibold">{formatMoney(item.valor)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-white/10 pt-2 space-y-1.5">
                      {!hasCustoCompraValido && (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          Informe o custo real da compra para liberar preco sugerido e lucro.
                        </div>
                      )}
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-xs">
                        <span className="text-white/50">1. Custo real da compra</span>
                        <span className="text-white/70 tabular-nums">{formatMoney(custoCompraReal)}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-bold">
                        <span className="text-orange-400">2. Custo para arrumar (ja lancado + novo)</span>
                        <span className="text-orange-400 tabular-nums">{formatMoney(custoArrumarTotal)}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-extrabold border-t border-white/10 pt-1.5">
                        <span className="text-white">3. Custo total do veiculo</span>
                        <span className="text-white tabular-nums">{formatMoney(custoTotalCL)}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm font-bold">
                        <span className="text-blue-400">4. Margem (%)</span>
                        <Input
                          value={margemInput}
                          onChange={(e) => setMargemInput(e.target.value)}
                          placeholder="15"
                          className="h-8 w-24 bg-white/5 border-white/10 text-white text-right font-bold"
                        />
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-bold">
                        <span className="text-blue-400">Preco sugerido ({margemSelecionada.toFixed(1)}% margem)</span>
                        <span className="text-blue-400 tabular-nums">{hasCustoCompraValido ? formatMoney(precoSugeridoCL) : "--"}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-bold">
                        <span className="text-sky-400">Lucro no preco atual</span>
                        <span className={`tabular-nums ${lucroNoPrecoAtual >= 0 ? "text-sky-300" : "text-red-400"}`}>
                          {hasCustoCompraValido ? formatMoney(lucroNoPrecoAtual) : "--"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm font-bold">
                        <span className="text-emerald-400">5. Lucro total</span>
                        <span className="text-emerald-400 tabular-nums">
                          {hasCustoCompraValido ? formatMoney(lucroCL) : "--"} <span className="text-xs opacity-60">{hasCustoCompraValido ? `(${margemCL.toFixed(1)}%)` : ""}</span>
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={confirmarChecklist}
                      className="w-full card-gradient-blue text-white font-bold shadow-lg shadow-blue-500/20 h-11 text-sm mt-2"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Confirmar e lançar reparos — {formatMoney(totalChecklist)}
                    </Button>
                  </div>
                )}

                {!algumMarcado && (
                  <div className="py-4 text-center">
                    <p className="text-white/20 text-xs">Marque os itens acima para ver o cálculo automático</p>
                  </div>
                )}
              </div>

              {/* ── Reparos já lançados ── */}
              <div className="px-4 sm:px-6 py-4 space-y-3">
                <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest">
                  Reparos lançados ({custosDoSelecionado.length})
                </p>

                {custosDoSelecionado.length === 0 ? (
                  <div className="py-6 text-center rounded-2xl border border-dashed border-white/5">
                    <p className="text-white/20 text-sm">Nenhum reparo lançado ainda</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {custosDoSelecionado.map((c) => {
                      const ICONS: Record<string, string> = { pintura: "🎨", pneus: "⚙️", higienizacao: "🧹", polimento: "✨", mecanica: "🔩", retrovisor: "🔧", outro: "📝" };
                      return (
                        <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 px-4 py-2.5">
                          <span className="text-lg shrink-0">{ICONS[c.categoria] ?? "📋"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{c.descricao || c.categoria}</p>
                            <p className="text-white/20 text-[10px]">{new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                          </div>
                          <p className="text-orange-400 font-extrabold tabular-nums text-sm shrink-0">{formatMoney(c.valor)}</p>
                          <button onClick={() => handleRemover(c.id)} className="text-white/20 hover:text-red-400 transition-colors shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-xl bg-orange-500/5 border border-orange-500/10 px-4 py-2.5">
                      <p className="text-orange-300/60 text-sm font-bold">Total reparos</p>
                      <p className="text-orange-400 font-extrabold tabular-nums">{formatMoney(custosDoSelecionado.reduce((s, c) => s + c.valor, 0))}</p>
                    </div>
                  </div>
                )}
                {selectedVeiculo.id.startsWith(SIMULACAO_PREFIX) && (
                  <Button
                    variant="outline"
                    onClick={handleExcluirVeiculo}
                    className="w-full border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir simulacao do custo
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
