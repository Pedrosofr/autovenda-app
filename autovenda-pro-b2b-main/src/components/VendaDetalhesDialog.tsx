import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Car, CheckCircle2, Circle, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/appStore";
import type { Venda, Veiculo, Vendedor, VendaCusto } from "@/store/types";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function formatMoney(value: number | undefined): string {
  if (!value) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venda: Venda;
  veiculo: Veiculo | undefined;
  vendedor: Vendedor | undefined;
}

export function VendaDetalhesDialog({ open, onOpenChange, venda, veiculo, vendedor }: Props) {
  const { custos, tarefasPosVenda, updateVendaCusto } = useAppStore();

  const custoAutoReparo = useMemo(() => {
    if (!veiculo) return 0;
    return custos
      .filter((c) => c.veiculoId === veiculo.id)
      .reduce((acc, c) => acc + c.valor, 0);
  }, [custos, veiculo]);

  const tarefas = useMemo(
    () => tarefasPosVenda.filter((t) => t.vendaId === venda.id),
    [tarefasPosVenda, venda.id],
  );

  const savedCusto = venda.custo ?? {};

  const [custoAquisicao, setCustoAquisicao] = useState(formatMoney(savedCusto.custoAquisicao));
  const [modoReparo, setModoReparo] = useState<"manual" | "auto">(
    savedCusto.usarCustoAutoReparo ? "auto" : "manual",
  );
  const [custoCarroManual, setCustoCarroManual] = useState(formatMoney(savedCusto.custoCarroManual));
  const [comissao, setComissao] = useState(formatMoney(savedCusto.comissaoVendedor));
  const [formaPagamento, setFormaPagamento] = useState<"avista" | "financiado">(
    savedCusto.formaPagamento ?? "avista",
  );
  const [carroNaTroca, setCarroNaTroca] = useState(savedCusto.carroNaTroca ?? false);
  const [valorTroca, setValorTroca] = useState(formatMoney(savedCusto.valorTroca));

  useEffect(() => {
    if (open) {
      const c = venda.custo ?? {};
      setCustoAquisicao(formatMoney(c.custoAquisicao));
      setModoReparo(c.usarCustoAutoReparo ? "auto" : "manual");
      setCustoCarroManual(formatMoney(c.custoCarroManual));
      setComissao(formatMoney(c.comissaoVendedor));
      setFormaPagamento(c.formaPagamento ?? "avista");
      setCarroNaTroca(c.carroNaTroca ?? false);
      setValorTroca(formatMoney(c.valorTroca));
    }
  }, [open, venda.custo]);

  const custoCarro = modoReparo === "auto" ? custoAutoReparo : parseMoney(custoCarroManual);
  const lucro =
    venda.valor -
    parseMoney(custoAquisicao) -
    custoCarro -
    parseMoney(comissao) -
    (carroNaTroca ? parseMoney(valorTroca) : 0);
  const margem = venda.valor > 0 ? (lucro / venda.valor) * 100 : 0;
  const hasInputs = !!parseMoney(custoAquisicao) || !!custoCarro || !!parseMoney(comissao) || carroNaTroca;

  function handleSave() {
    const custo: VendaCusto = {
      custoAquisicao: parseMoney(custoAquisicao) || undefined,
      custoCarroManual: modoReparo === "manual" ? parseMoney(custoCarroManual) || undefined : undefined,
      usarCustoAutoReparo: modoReparo === "auto",
      comissaoVendedor: parseMoney(comissao) || undefined,
      formaPagamento,
      carroNaTroca,
      valorTroca: carroNaTroca ? parseMoney(valorTroca) || undefined : undefined,
    };
    updateVendaCusto(venda.id, custo);
    toast.success("Dados da venda salvos.");
    onOpenChange(false);
  }

  const pendentes = tarefas.filter((t) => t.status !== "concluida");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[hsl(230,18%,11%)] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Car className="h-5 w-5 text-blue-400" />
            {veiculo?.modelo ?? "Veiculo"} {veiculo?.ano ?? ""}
          </DialogTitle>
        </DialogHeader>

        {/* Info da venda */}
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-white/5 p-4 text-sm">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Vendedor</p>
            <p className="font-semibold">{vendedor?.nome ?? "—"}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Data</p>
            <p className="font-semibold">{new Date(venda.data).toLocaleDateString("pt-BR")}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Valor de venda</p>
            <p className="font-semibold text-emerald-400">{currency(venda.valor)}</p>
          </div>
        </div>

        {/* Calcular Lucro */}
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40">Calcular Lucro</p>

          {/* Custo de aquisicao */}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">Custo de aquisicao (R$)</Label>
            <Input
              value={custoAquisicao}
              onChange={(e) => setCustoAquisicao(e.target.value)}
              placeholder="Ex: 40.000,00"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Custo do carro */}
          <div className="space-y-2">
            <Label className="text-white/70 text-sm">Custo do carro (reparos, preparacao)</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModoReparo("manual")}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                  modoReparo === "manual"
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:text-white/60"
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setModoReparo("auto")}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                  modoReparo === "auto"
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:text-white/60"
                }`}
              >
                Automatico (aba Custos)
              </button>
            </div>
            {modoReparo === "manual" ? (
              <Input
                value={custoCarroManual}
                onChange={(e) => setCustoCarroManual(e.target.value)}
                placeholder="Ex: 2.500,00"
                className="bg-white/5 border-white/10 text-white"
              />
            ) : (
              <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm">
                {custoAutoReparo > 0 ? (
                  <span className="text-emerald-300 font-semibold">
                    {currency(custoAutoReparo)} registrados na aba Custos
                  </span>
                ) : (
                  <span className="text-white/40">Nenhum custo registrado na aba Custos para este veiculo.</span>
                )}
              </div>
            )}
          </div>

          {/* Comissao */}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">Comissao do vendedor (R$) — opcional</Label>
            <Input
              value={comissao}
              onChange={(e) => setComissao(e.target.value)}
              placeholder="Ex: 350,00"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Forma de pagamento */}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">Forma de pagamento</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormaPagamento("avista")}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                  formaPagamento === "avista"
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:text-white/60"
                }`}
              >
                A vista
              </button>
              <button
                type="button"
                onClick={() => setFormaPagamento("financiado")}
                className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                  formaPagamento === "financiado"
                    ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                    : "border-white/10 bg-white/5 text-white/40 hover:text-white/60"
                }`}
              >
                Financiado
              </button>
            </div>
          </div>

          {/* Carro na troca */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCarroNaTroca((v) => !v)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  carroNaTroca ? "border-blue-400 bg-blue-500" : "border-white/20 bg-transparent"
                }`}
              >
                {carroNaTroca && <span className="text-white text-xs font-black">✓</span>}
              </button>
              <Label className="text-white/70 text-sm cursor-pointer" onClick={() => setCarroNaTroca((v) => !v)}>
                Carro na troca
              </Label>
            </div>
            {carroNaTroca && (
              <Input
                value={valorTroca}
                onChange={(e) => setValorTroca(e.target.value)}
                placeholder="Valor do carro na troca (R$)"
                className="bg-white/5 border-white/10 text-white"
              />
            )}
          </div>

          {/* Resultado */}
          {hasInputs && (
            <div
              className={`rounded-xl border p-4 ${
                lucro >= 0
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-red-500/30 bg-red-500/10"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {lucro >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-400" />
                  )}
                  <span className="text-sm font-bold text-white/70">Lucro da venda</span>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-black ${lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {currency(lucro)}
                  </p>
                  <p className="text-xs text-white/40">
                    Margem: {margem.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
            Salvar
          </Button>
        </div>

        {/* Pos venda */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">Pos Venda</p>
            <Link
              to="/pos-venda"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              Ver completo <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {tarefas.length === 0 ? (
            <p className="text-sm text-white/35">Nenhuma tarefa registrada. Adicione na aba Pos Venda.</p>
          ) : (
            <div className="space-y-2">
              {tarefas.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 text-sm">
                  {t.status === "concluida" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-white/25" />
                  )}
                  <span className={t.status === "concluida" ? "line-through text-white/35" : "text-white/80"}>
                    {t.titulo}
                  </span>
                </div>
              ))}
              {pendentes.length > 0 && (
                <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300 text-xs">
                  {pendentes.length} pendente{pendentes.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
