import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Wallet, CreditCard, QrCode, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

type MetodoRecarga = "pix" | "cartao";
type TipoMovimento = "recarga" | "consumo";

interface MovimentoCredito {
  id: string;
  tipo: TipoMovimento;
  descricao: string;
  valorCentavos: number;
  saldoAposCentavos: number;
  data: string;
  metodo?: MetodoRecarga;
}

interface CreditosState {
  saldoCentavos: number;
  movimentos: MovimentoCredito[];
}

interface PagamentoPendente {
  metodo: MetodoRecarga;
  valorCentavos: number;
}

const STORAGE_KEY = "rozzcar_creditos";
const PRECO_DESCRICAO = 20;
const PRECO_FOTOS = 50;
const PRECO_CONSULTA = 20;

function formatMoneyFromCents(value: number) {
  return (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function loadCreditos(): CreditosState {
  if (typeof window === "undefined") return { saldoCentavos: 0, movimentos: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { saldoCentavos: 0, movimentos: [] };
  } catch {
    return { saldoCentavos: 0, movimentos: [] };
  }
}

export default function Creditos() {
  const [state, setState] = useState<CreditosState>(() => loadCreditos());
  const [valorRecarga, setValorRecarga] = useState("100");
  const [pagamentoPendente, setPagamentoPendente] = useState<PagamentoPendente | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const abrirPagamento = (metodo: MetodoRecarga) => {
    const valor = Math.round(Number(valorRecarga.replace(",", ".")) * 100);
    if (!valor || valor <= 0) {
      toast.error("Informe um valor de recarga valido.");
      return;
    }

    setPagamentoPendente({
      metodo,
      valorCentavos: valor,
    });
  };

  const confirmarRecarga = () => {
    if (!pagamentoPendente) return;

    const saldoAposCentavos = state.saldoCentavos + pagamentoPendente.valorCentavos;
    const movimento: MovimentoCredito = {
      id: Date.now().toString(),
      tipo: "recarga",
      descricao: `Recarga via ${pagamentoPendente.metodo === "pix" ? "PIX" : "cartao"}`,
      valorCentavos: pagamentoPendente.valorCentavos,
      saldoAposCentavos,
      data: new Date().toISOString(),
      metodo: pagamentoPendente.metodo,
    };

    setState((prev) => ({
      saldoCentavos: saldoAposCentavos,
      movimentos: [movimento, ...prev.movimentos],
    }));

    setPagamentoPendente(null);
    toast.success("Recarga confirmada e adicionada ao historico.");
  };

  const estimativa = useMemo(() => {
    const saldo = state.saldoCentavos;
    return {
      descricoes: Math.floor(saldo / PRECO_DESCRICAO),
      packsFoto: Math.floor(saldo / PRECO_FOTOS),
      consultas: Math.floor(saldo / PRECO_CONSULTA),
    };
  }, [state.saldoCentavos]);

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-white/35 text-xs font-semibold uppercase tracking-[0.25em]">Carteira do cliente</p>
          <h1 className="text-3xl font-black text-white mt-2">Creditos</h1>
          <p className="text-white/35 text-sm mt-2">
            Saldo para gerar descricao, melhorar 2 fotos principais e rodar consultas.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <p className="text-emerald-300 text-xs uppercase tracking-[0.25em]">Saldo atual</p>
          <p className="text-white text-2xl font-black mt-1">{formatMoneyFromCents(state.saldoCentavos)}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-white/10 bg-[hsl(230,18%,11%)] p-3 sm:p-5">
          <div className="flex items-center gap-2 text-white">
            <Wallet className="h-5 w-5 text-emerald-300" />
            <h2 className="font-bold text-lg">Tabela de precos</h2>
          </div>

          <div className="space-y-3 mt-5">
            {[
              { nome: "1 texto de descricao", preco: PRECO_DESCRICAO, detalhe: "Anuncio profissional completo" },
              { nome: "2 fotos melhoradas", preco: PRECO_FOTOS, detalhe: "Capa + secundaria tratadas" },
              { nome: "1 consulta", preco: PRECO_CONSULTA, detalhe: "Consulta veicular unitária" },
            ].map((item) => (
              <div key={item.nome} className="rounded-2xl border border-white/10 bg-white/5 px-3 sm:px-4 py-3 sm:py-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-white font-semibold">{item.nome}</p>
                  <p className="text-white/35 text-sm mt-1">{item.detalhe}</p>
                </div>
                <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  {formatMoneyFromCents(item.preco)}
                </Badge>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mt-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-white/35 text-xs uppercase tracking-[0.25em]">Descricoes</p>
              <p className="text-white text-2xl font-black mt-2">{estimativa.descricoes}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-white/35 text-xs uppercase tracking-[0.25em]">Packs de foto</p>
              <p className="text-white text-2xl font-black mt-2">{estimativa.packsFoto}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-white/35 text-xs uppercase tracking-[0.25em]">Consultas</p>
              <p className="text-white text-2xl font-black mt-2">{estimativa.consultas}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[hsl(230,18%,11%)] p-3 sm:p-5">
          <div className="flex items-center gap-2 text-white">
            <CreditCard className="h-5 w-5 text-blue-300" />
            <h2 className="font-bold text-lg">Abastecer saldo</h2>
          </div>

          <div className="space-y-4 mt-5">
            <Input
              value={valorRecarga}
              onChange={(e) => setValorRecarga(e.target.value)}
              placeholder="Valor da recarga"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-11"
            />

            <div className="grid grid-cols-3 gap-2">
              {["50", "100", "200"].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setValorRecarga(valor)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                >
                  R$ {valor}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Button onClick={() => abrirPagamento("pix")} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold h-11">
                <QrCode className="h-4 w-4 mr-2" /> Gerar PIX
              </Button>
              <Button onClick={() => abrirPagamento("cartao")} variant="outline" className="border-white/10 text-white/75 h-11">
                <CreditCard className="h-4 w-4 mr-2" /> Ir para cartao
              </Button>
            </div>

            {pagamentoPendente ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-3">
                <div>
                  <p className="text-emerald-300 text-xs uppercase tracking-[0.2em]">Pagamento pendente</p>
                  <p className="text-white font-bold mt-1">
                    {pagamentoPendente.metodo === "pix" ? "PIX gerado" : "Cartao preparado"} para{" "}
                    {formatMoneyFromCents(pagamentoPendente.valorCentavos)}
                  </p>
                  <p className="text-white/45 text-sm mt-1">
                    A recarga so entra no historico depois de confirmar o pagamento.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={confirmarRecarga} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold h-11 flex-1">
                    Confirmar pagamento
                  </Button>
                  <Button onClick={() => setPagamentoPendente(null)} variant="outline" className="border-white/10 text-white/75 h-11 flex-1">
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-white/35">
              Fluxo de recarga ainda esta em modo base/simulado para o app. O proximo passo e plugar PIX e cartao reais.
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-[hsl(230,18%,11%)] p-3 sm:p-5">
        <div className="flex items-center gap-2 text-white">
          <ArrowDownCircle className="h-5 w-5 text-blue-300" />
          <h2 className="font-bold text-lg">Historico</h2>
        </div>

        <div className="space-y-3 mt-5">
          {state.movimentos.length > 0 ? (
            state.movimentos.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 sm:px-4 py-3 sm:py-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-start gap-3 min-w-0 w-full">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${item.tipo === "recarga" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                    {item.tipo === "recarga" ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm sm:text-base truncate">{item.descricao}</p>
                    <p className="text-white/35 text-xs sm:text-sm mt-1 break-words">
                      {new Date(item.data).toLocaleString("pt-BR")} • saldo apos: {formatMoneyFromCents(item.saldoAposCentavos)}
                    </p>
                  </div>
                </div>
                <span className={`font-bold shrink-0 sm:self-center ${item.tipo === "recarga" ? "text-emerald-300" : "text-amber-300"}`}>
                  {item.tipo === "recarga" ? "+" : "-"}{formatMoneyFromCents(item.valorCentavos)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-12 text-center">
              <p className="text-white/35">Nenhum movimento de credito ainda.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
