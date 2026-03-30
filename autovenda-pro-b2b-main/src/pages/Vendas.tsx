import { useMemo, useState } from "react";
import { AlertCircle, Car, CheckCircle2, FileText, Receipt, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NFeEmitirDialog } from "@/components/NFeEmitirDialog";
import { VendaDetalhesDialog } from "@/components/VendaDetalhesDialog";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/store/appStore";

function currency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function nfeBadge(status?: "pendente" | "autorizada" | "cancelada" | "erro") {
  switch (status) {
    case "autorizada":
      return <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Nota autorizada</Badge>;
    case "cancelada":
      return <Badge className="border-slate-500/20 bg-slate-500/10 text-slate-300">Nota cancelada</Badge>;
    case "erro":
      return <Badge className="border-red-500/20 bg-red-500/10 text-red-300">Nota com erro</Badge>;
    case "pendente":
      return <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300">Em emissao</Badge>;
    default:
      return <Badge className="border-white/10 bg-white/5 text-white/60">Sem nota emitida</Badge>;
  }
}

export default function Vendas() {
  const { tenant, user } = useAuth();
  const { vendas, veiculos, vendedores, tarefasPosVenda, custos, refreshRemoteState } = useAppStore();
  const [search, setSearch] = useState("");
  const [selectedVendaId, setSelectedVendaId] = useState<string | null>(null);
  const [detalhesVendaId, setDetalhesVendaId] = useState<string | null>(null);
  const nfeEnabled = tenant?.nfeEnabled ?? false;
  const nfeConfigured = tenant?.nfeConfigured ?? false;
  const canEmitNfe = nfeEnabled && nfeConfigured;

  const rows = useMemo(() => {
    return vendas
      .map((venda) => {
        const veiculo = veiculos.find((item) => item.id === venda.veiculoId);
        const vendedor = vendedores.find((item) => item.id === venda.vendedorId);
        const pendencias = tarefasPosVenda.filter(
          (item) => item.vendaId === venda.id && item.status !== "concluida",
        ).length;

        return {
          venda,
          veiculo,
          vendedor,
          pendencias,
        };
      })
      .sort((a, b) => new Date(b.venda.data).getTime() - new Date(a.venda.data).getTime());
  }, [tarefasPosVenda, veiculos, vendedores, vendas]);

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.veiculo?.modelo,
        row.veiculo?.ano,
        row.vendedor?.nome,
        row.venda.data,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const pendencias = rows.reduce((sum, row) => sum + row.pendencias, 0);
    const nfesAutorizadas = rows.filter((row) => row.venda.nfe?.status === "autorizada").length;
    return { pendencias, nfesAutorizadas };
  }, [rows]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.venda.id === selectedVendaId) ?? null,
    [rows, selectedVendaId],
  );

  const detalhesRow = useMemo(
    () => rows.find((row) => row.venda.id === detalhesVendaId) ?? null,
    [rows, detalhesVendaId],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Receipt className="h-7 w-7 text-amber-400" />
            Vendas
          </h1>
          <p className="mt-1 text-sm text-white/45">
            Acompanhe lucro, status das notas fiscais e pendencias de cada veiculo vendido.
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por veiculo, ano, vendedor..."
            className="border-white/10 bg-white/5 pl-9 text-white"
          />
        </div>
      </div>

      <div className={`grid gap-3 ${nfeEnabled ? "md:grid-cols-2" : "md:grid-cols-1 max-w-sm"}`}>
        <Card className="border-white/10 bg-white/[0.03] text-white">
          <CardContent className="flex items-center gap-3 p-5">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
              <AlertCircle className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/35">Pendencias</div>
              <div className="mt-1 text-lg font-semibold">
                {totals.pendencias} {totals.pendencias === 1 ? "aberta" : "abertas"}
              </div>
            </div>
          </CardContent>
        </Card>

        {nfeEnabled && (
          <Card className="border-white/10 bg-white/[0.03] text-white">
            <CardContent className="flex items-center gap-3 p-5">
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-violet-300" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-white/35">NF-e autorizadas</div>
                <div className="mt-1 text-lg font-semibold">{totals.nfesAutorizadas}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {nfeEnabled && !nfeConfigured && (
        <Card className="border-amber-500/20 bg-amber-500/5 text-white">
          <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Complete os dados fiscais da loja</div>
              <p className="mt-1 text-sm text-amber-100/80">
                O modulo ja esta ativo, mas ainda faltam os dados fiscais da loja para liberar emissao, status e arquivos da nota.
              </p>
            </div>
            {user?.role === "owner" ? (
              <Button asChild className="bg-amber-500 text-black hover:bg-amber-400">
                <Link to="/nfe">Completar dados fiscais</Link>
              </Button>
            ) : (
              <Badge className="border-white/10 bg-white/5 text-white/70">Aguardando dados fiscais do owner</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {filteredRows.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03] text-white">
          <CardContent className="p-10 text-center">
            <Car className="mx-auto mb-3 h-12 w-12 text-white/20" />
            <p className="text-base font-medium">
              {rows.length === 0 ? "Nenhuma venda registrada ainda." : "Nenhuma venda encontrada para esse filtro."}
            </p>
            <p className="mt-2 text-sm text-white/45">
              {rows.length === 0
                ? "Marque um veiculo como vendido no estoque para ele aparecer aqui."
                : "Tente buscar por outro modelo, ano ou vendedor."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((row) => (
            <Card
              key={row.venda.id}
              className="border-white/10 bg-white/[0.03] text-white cursor-pointer hover:bg-white/[0.05] transition-colors"
              onClick={() => setDetalhesVendaId(row.venda.id)}
            >
              <CardHeader className="gap-4 pb-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{row.veiculo?.modelo ?? "Veiculo vendido"}</CardTitle>
                    {nfeEnabled ? nfeBadge(row.venda.nfe?.status) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50">
                    <span>{row.veiculo?.ano ?? "Ano nao informado"}</span>
                    <span>Venda em {new Date(row.venda.data).toLocaleDateString("pt-BR")}</span>
                    <span>Vendedor: {row.vendedor?.nome ?? "Nao identificado"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {canEmitNfe ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      onClick={() => setSelectedVendaId(row.venda.id)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {row.venda.nfe ? "Ver nota" : "Emitir nota"}
                    </Button>
                  ) : nfeEnabled ? (
                    user?.role === "owner" ? (
                      <Button asChild variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
                        <Link to="/nfe">
                          <FileText className="mr-2 h-4 w-4" />
                          Completar dados fiscais
                        </Link>
                      </Button>
                    ) : (
                      <Badge className="border-white/10 bg-white/5 text-white/60">Notas fiscais aguardando liberacao</Badge>
                    )
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="grid gap-3 border-t border-white/5 pt-4 md:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">Valor</div>
                  <div className="mt-1 text-lg font-semibold">{currency(row.venda.valor)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">Pos-venda</div>
                  <div className="mt-1 text-sm font-medium">
                    {row.pendencias} {row.pendencias === 1 ? "pendencia aberta" : "pendencias abertas"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">Lucro</div>
                  <div className="mt-1 text-sm font-medium">
                    {(() => {
                      const c = row.venda.custo;
                      if (!c || c.custoAquisicao === undefined) return <span className="text-white/30 italic text-xs">Clique para calcular</span>;
                      const custoAutoReparo = c.usarCustoAutoReparo
                        ? custos.filter((x) => x.veiculoId === row.veiculo?.id).reduce((a, x) => a + x.valor, 0)
                        : 0;
                      const custoCarro = c.usarCustoAutoReparo ? custoAutoReparo : (c.custoCarroManual ?? 0);
                      const lucro = row.venda.valor - (c.custoAquisicao ?? 0) - custoCarro - (c.comissaoVendedor ?? 0) - (c.carroNaTroca ? (c.valorTroca ?? 0) : 0);
                      return <span className={lucro >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>{currency(lucro)}</span>;
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedRow?.veiculo ? (
        <NFeEmitirDialog
          open={!!selectedRow}
          onOpenChange={(open) => {
            if (!open) setSelectedVendaId(null);
          }}
          venda={selectedRow.venda}
          veiculo={selectedRow.veiculo}
          onNfeEmitida={() => {
            void refreshRemoteState();
          }}
        />
      ) : null}

      {detalhesRow ? (
        <VendaDetalhesDialog
          open={!!detalhesRow}
          onOpenChange={(open) => {
            if (!open) setDetalhesVendaId(null);
          }}
          venda={detalhesRow.venda}
          veiculo={detalhesRow.veiculo}
          vendedor={detalhesRow.vendedor}
        />
      ) : null}
    </div>
  );
}
