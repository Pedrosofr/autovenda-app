import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Download, FileText, Loader2, Printer, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/store/appStore";
import type { NfeStatus, Venda, Veiculo } from "@/store/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NFeEmitirDialog } from "@/components/NFeEmitirDialog";
import { consultarNfe, downloadNfeAsset, getNfeConfig } from "@/services/nfe";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Agora";
}

function statusBadge(status?: NfeStatus) {
  switch (status) {
    case "autorizada":
      return <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" />Autorizada</Badge>;
    case "cancelada":
      return <Badge className="border-slate-500/20 bg-slate-500/10 text-slate-300"><XCircle className="mr-1 h-3 w-3" />Cancelada</Badge>;
    case "erro":
      return <Badge className="border-red-500/20 bg-red-500/10 text-red-300"><AlertCircle className="mr-1 h-3 w-3" />Com erro</Badge>;
    case "pendente":
      return <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300"><Clock3 className="mr-1 h-3 w-3" />Em emissao</Badge>;
    default:
      return <Badge className="border-white/10 bg-white/5 text-white/60">Pronta para emitir</Badge>;
  }
}

type SaleRow = { venda: Venda; veiculo?: Veiculo; vendedorNome: string };

export default function NFeConfig() {
  const { vendas, veiculos, vendedores, refreshRemoteState } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [statusLoadingVendaId, setStatusLoadingVendaId] = useState<string | null>(null);
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [selectedVendaId, setSelectedVendaId] = useState<string | null>(null);

  useEffect(() => {
    getNfeConfig()
      .then(({ enabled: nextEnabled, configured: nextConfigured }) => {
        setEnabled(nextEnabled);
        setConfigured(nextConfigured);
      })
      .catch(() => toast.error("Erro ao carregar os dados do modulo fiscal."))
      .finally(() => setLoading(false));
  }, []);

  const canOperate = enabled && configured;

  const rows = useMemo<SaleRow[]>(() => vendas.map((venda) => ({
    venda,
    veiculo: veiculos.find((item) => item.id === venda.veiculoId),
    vendedorNome: vendedores.find((item) => item.id === venda.vendedorId)?.nome ?? "Nao identificado",
  })).sort((a, b) => new Date(b.venda.data).getTime() - new Date(a.venda.data).getTime()), [vendas, veiculos, vendedores]);

  const stats = useMemo(() => ({
    total: rows.length,
    autorizadas: rows.filter((row) => row.venda.nfe?.status === "autorizada").length,
    pendentes: rows.filter((row) => row.venda.nfe?.status === "pendente").length,
    comErro: rows.filter((row) => row.venda.nfe?.status === "erro").length,
    semNota: rows.filter((row) => !row.venda.nfe).length,
  }), [rows]);

  const selectedRow = useMemo(() => rows.find((row) => row.venda.id === selectedVendaId) ?? null, [rows, selectedVendaId]);

  async function handleRefreshStatus(venda: Venda) {
    if (!venda.nfe?.ref) return;
    setStatusLoadingVendaId(venda.id);
    try {
      const result = await consultarNfe(venda.id, venda.nfe.ref);
      await refreshRemoteState();
      if (result.nfe.status === "autorizada") toast.success("Status atualizado: nota autorizada.");
      else if (result.nfe.status === "erro") toast.error(result.nfe.erro ?? "A nota retornou erro no processamento.");
      else toast.info("Status atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao consultar o status da nota.");
    } finally {
      setStatusLoadingVendaId(null);
    }
  }

  async function handleDownload(vendaId: string, type: "danfe" | "xml") {
    const key = `${vendaId}-${type}`;
    setDownloadingAsset(key);
    try {
      const result = await downloadNfeAsset(vendaId, type);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao baixar o arquivo.");
    } finally {
      setDownloadingAsset(null);
    }
  }

  async function handlePrint(vendaId: string) {
    const key = `${vendaId}-print`;
    setDownloadingAsset(key);
    try {
      const result = await downloadNfeAsset(vendaId, "danfe");
      const url = URL.createObjectURL(result.blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      win?.focus();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao imprimir o documento.");
    } finally {
      setDownloadingAsset(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <FileText className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Notas fiscais</h1>
              <p className="text-sm text-white/45">Emita, acompanhe status, salve arquivos e gerencie cancelamentos sem sair da operacao.</p>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-white/55">As vendas aprovadas ficam centralizadas aqui para voce emitir a nota, consultar retorno da SEFAZ, salvar PDF/XML e abrir a nota novamente quando precisar.</p>
        </div>
        <Badge className={canOperate ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}>
          {canOperate ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertCircle className="mr-1 h-3 w-3" />}
          {canOperate ? "Operacao pronta" : !enabled ? "Modulo inativo" : "Aguardando configuracao"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><ShieldCheck className="h-4 w-4 text-amber-300" />Modulo fiscal</div><p className="text-sm text-white/65">{enabled ? "Ativo para esta loja." : "Entre em contato com o suporte para ativar."}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" />Notas autorizadas</div><p className="text-2xl font-semibold text-white">{stats.autorizadas}</p><p className="mt-1 text-sm text-white/50">{stats.total > 0 ? `${stats.total} vendas listadas` : "Nenhuma venda ainda"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><Clock3 className="h-4 w-4 text-amber-300" />Acompanhamento</div><p className="text-2xl font-semibold text-white">{stats.pendentes + stats.comErro}</p><p className="mt-1 text-sm text-white/50">{stats.pendentes} pendentes e {stats.comErro} com erro</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-white"><FileText className="h-4 w-4 text-blue-300" />Prontas para emitir</div><p className="text-2xl font-semibold text-white">{stats.semNota}</p><p className="mt-1 text-sm text-white/50">{canOperate ? "Vendas sem nota emitida." : "Modulo fiscal pendente de configuracao."}</p></div>
      </div>

      {!canOperate && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
          <div className="font-semibold text-white">{!enabled ? "Modulo fiscal inativo" : "Configuracao pendente"}</div>
          <p className="mt-1 text-amber-100/80">{!enabled ? "O modulo de emissao de notas fiscais ainda nao esta ativo para esta loja. Entre em contato com o suporte." : "O cadastro fiscal da loja esta sendo configurado. Em breve voce podera emitir notas fiscais."}</p>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Vendas e notas</h2>
            <p className="text-sm text-white/45">Veja cada venda concluida e aja rapido com emissao, status, arquivos e cancelamento.</p>
          </div>
          <Badge className="border-white/10 bg-white/5 text-white/70">{stats.total} {stats.total === 1 ? "venda" : "vendas"}</Badge>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/60">
            <FileText className="mx-auto mb-3 h-12 w-12 text-white/20" />
            <p className="text-base font-medium text-white">Nenhuma venda concluida ainda.</p>
            <p className="mt-2 text-sm text-white/45">Assim que um veiculo for marcado como vendido, ele aparecera aqui para emissao da nota.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map((row) => (
              <div key={row.venda.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold text-white">{row.veiculo?.modelo ?? "Veiculo vendido"}</div>
                      {statusBadge(row.venda.nfe?.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50">
                      <span>{row.veiculo?.ano ?? "Ano nao informado"}</span>
                      <span>Venda em {new Date(row.venda.data).toLocaleDateString("pt-BR")}</span>
                      <span>Vendedor: {row.vendedorNome}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Valor</div><div className="mt-1 text-base font-semibold text-white">{formatCurrency(row.venda.valor)}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Numero / serie</div><div className="mt-1 text-sm font-medium text-white">{row.venda.nfe?.numero ? `${row.venda.nfe.numero}${row.venda.nfe.serie ? ` / ${row.venda.nfe.serie}` : ""}` : "Aguardando emissao"}</div></div>
                      <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Atualizado em</div><div className="mt-1 text-sm font-medium text-white">{formatDate(row.venda.nfe?.ultimaAtualizacaoEm)}</div></div>
                    </div>
                  </div>
                  <div className="w-full xl:max-w-[380px]">
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Acoes</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canOperate ? (
                          <Button type="button" onClick={() => setSelectedVendaId(row.venda.id)} className="bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-black hover:from-amber-400 hover:to-orange-400">
                            <FileText className="mr-2 h-4 w-4" />
                            {row.venda.nfe ? "Abrir nota" : "Emitir nota"}
                          </Button>
                        ) : (
                          <div className="text-sm text-white/40">Aguardando ativacao do modulo fiscal.</div>
                        )}
                        {row.venda.nfe?.ref && (
                          <Button type="button" variant="outline" onClick={() => void handleRefreshStatus(row.venda)} disabled={statusLoadingVendaId === row.venda.id} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                            {statusLoadingVendaId === row.venda.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Atualizar status
                          </Button>
                        )}
                        {row.venda.nfe?.danfeUrl && (
                          <Button type="button" variant="outline" onClick={() => void handleDownload(row.venda.id, "danfe")} disabled={downloadingAsset === `${row.venda.id}-danfe`} className="border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
                            {downloadingAsset === `${row.venda.id}-danfe` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Salvar PDF
                          </Button>
                        )}
                        {row.venda.nfe?.xmlUrl && (
                          <Button type="button" variant="outline" onClick={() => void handleDownload(row.venda.id, "xml")} disabled={downloadingAsset === `${row.venda.id}-xml`} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                            {downloadingAsset === `${row.venda.id}-xml` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Salvar XML
                          </Button>
                        )}
                        {row.venda.nfe?.danfeUrl && (
                          <Button type="button" variant="outline" onClick={() => void handlePrint(row.venda.id)} disabled={downloadingAsset === `${row.venda.id}-print`} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                            {downloadingAsset === `${row.venda.id}-print` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                            Imprimir
                          </Button>
                        )}
                        {row.venda.nfe?.status === "autorizada" && (
                          <Button type="button" variant="outline" onClick={() => setSelectedVendaId(row.venda.id)} className="border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/10">Cancelar</Button>
                        )}
                      </div>
                      {row.venda.nfe?.chave && (
                        <div className="mt-3 rounded-2xl bg-white/5 p-3">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Chave de acesso</div>
                          <div className="mt-2 break-all font-mono text-xs text-white/80">{row.venda.nfe.chave}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedRow?.veiculo ? (
        <NFeEmitirDialog
          open={!!selectedRow}
          onOpenChange={(open) => { if (!open) setSelectedVendaId(null); }}
          venda={selectedRow.venda}
          veiculo={selectedRow.veiculo}
          onNfeEmitida={() => { void refreshRemoteState(); }}
        />
      ) : null}
    </div>
  );
}
