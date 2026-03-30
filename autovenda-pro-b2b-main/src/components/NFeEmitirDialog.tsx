import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cancelarNfe, consultarNfe, emitirNfe } from "@/services/nfe";
import type { NfeDestinatario, NfeInfo, Venda, Veiculo } from "@/store/types";

const FORMAS_PAGAMENTO = [
  { value: "01", label: "Dinheiro" },
  { value: "02", label: "Cheque" },
  { value: "03", label: "Cartao de Credito" },
  { value: "04", label: "Cartao de Debito" },
  { value: "15", label: "Boleto Bancario" },
  { value: "99", label: "Outros" },
];

const INDICADOR_IE_OPTIONS: Array<{ value: NfeDestinatario["indicadorInscricaoEstadual"]; label: string }> = [
  { value: "9", label: "Nao contribuinte" },
  { value: "2", label: "Isento" },
  { value: "1", label: "Contribuinte ICMS" },
];

function nfeStatusBadge(status: NfeInfo["status"]) {
  switch (status) {
    case "autorizada":
      return <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"><CheckCircle2 className="mr-1 h-3 w-3" />Autorizada</Badge>;
    case "cancelada":
      return <Badge className="border-slate-500/20 bg-slate-500/10 text-slate-300"><XCircle className="mr-1 h-3 w-3" />Cancelada</Badge>;
    case "erro":
      return <Badge className="border-red-500/20 bg-red-500/10 text-red-300"><AlertCircle className="mr-1 h-3 w-3" />Erro</Badge>;
    default:
      return <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-300"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Processando</Badge>;
  }
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

function sameNfe(a: NfeInfo | null, b: NfeInfo) {
  return JSON.stringify(a ?? null) === JSON.stringify(b);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venda: Venda;
  veiculo: Veiculo;
  onNfeEmitida: (vendaId: string, nfe: NfeInfo) => void;
}

export function NFeEmitirDialog({ open, onOpenChange, venda, veiculo, onNfeEmitida }: Props) {
  const [step, setStep] = useState<"form" | "result">("form");
  const [loading, setLoading] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [showCancelar, setShowCancelar] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [currentNfe, setCurrentNfe] = useState<NfeInfo | null>(null);
  const [compradorNome, setCompradorNome] = useState("");
  const [compradorCpfCnpj, setCompradorCpfCnpj] = useState("");
  const [compradorEmail, setCompradorEmail] = useState("");
  const [compradorLogradouro, setCompradorLogradouro] = useState("");
  const [compradorNumero, setCompradorNumero] = useState("");
  const [compradorComplemento, setCompradorComplemento] = useState("");
  const [compradorBairro, setCompradorBairro] = useState("");
  const [compradorMunicipio, setCompradorMunicipio] = useState("");
  const [compradorCodigoMunicipio, setCompradorCodigoMunicipio] = useState("");
  const [compradorUf, setCompradorUf] = useState("SP");
  const [compradorCep, setCompradorCep] = useState("");
  const [indicadorIe, setIndicadorIe] = useState<NfeDestinatario["indicadorInscricaoEstadual"]>("9");
  const [inscricaoEstadualDestinatario, setInscricaoEstadualDestinatario] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("01");

  useEffect(() => {
    if (!open) return;

    const destinatario = venda.nfe?.destinatario;
    setCurrentNfe(venda.nfe ?? null);
    setStep(venda.nfe ? "result" : "form");
    setShowCancelar(false);
    setJustificativa("");
    setCompradorNome(destinatario?.nome ?? "");
    setCompradorCpfCnpj(destinatario?.documento ? formatCpfCnpj(destinatario.documento) : "");
    setCompradorEmail(destinatario?.email ?? "");
    setCompradorLogradouro(destinatario?.logradouro ?? "");
    setCompradorNumero(destinatario?.numero ?? "");
    setCompradorComplemento(destinatario?.complemento ?? "");
    setCompradorBairro(destinatario?.bairro ?? "");
    setCompradorMunicipio(destinatario?.municipio ?? "");
    setCompradorCodigoMunicipio(destinatario?.codigoMunicipio ?? "");
    setCompradorUf(destinatario?.uf ?? "SP");
    setCompradorCep(destinatario?.cep ? formatCep(destinatario.cep) : "");
    setIndicadorIe(destinatario?.indicadorInscricaoEstadual ?? "9");
    setInscricaoEstadualDestinatario(destinatario?.inscricaoEstadual ?? "");
    setFormaPagamento(venda.nfe?.formaPagamento ?? "01");
  }, [open, venda]);

  useEffect(() => {
    if (!open || currentNfe?.status !== "pendente" || !currentNfe.ref) return;

    const timer = window.setInterval(() => {
      void handleRefreshStatus(true);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [currentNfe?.ref, currentNfe?.status, open]);

  async function handleRefreshStatus(silent = false) {
    const ref = currentNfe?.ref ?? venda.nfe?.ref;
    if (!ref) return;

    setRefreshingStatus(true);
    try {
      const result = await consultarNfe(venda.id, ref);
      const nextNfe = result.nfe;
      const previousNfe = currentNfe;

      setCurrentNfe(nextNfe);
      setStep("result");

      if (!sameNfe(previousNfe, nextNfe)) {
        onNfeEmitida(venda.id, nextNfe);
      }

      if (!silent && nextNfe.status === "autorizada" && previousNfe?.status !== "autorizada") {
        toast.success("NF-e autorizada com sucesso.");
      }
      if (!silent && nextNfe.status === "erro" && previousNfe?.status !== "erro") {
        toast.error(nextNfe.erro ?? "A Focus retornou erro na NF-e.");
      }
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Erro ao consultar status da NF-e.");
      }
    } finally {
      setRefreshingStatus(false);
    }
  }

  async function handleEmitir(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await emitirNfe({
        vendaId: venda.id,
        compradorNome: compradorNome.trim(),
        compradorCpfCnpj: compradorCpfCnpj.replace(/\D/g, ""),
        compradorEmail: compradorEmail.trim() || undefined,
        compradorLogradouro: compradorLogradouro.trim(),
        compradorNumero: compradorNumero.trim(),
        compradorComplemento: compradorComplemento.trim() || undefined,
        compradorBairro: compradorBairro.trim(),
        compradorMunicipio: compradorMunicipio.trim(),
        compradorCodigoMunicipio: compradorCodigoMunicipio.trim() || undefined,
        compradorUf: compradorUf.trim().toUpperCase(),
        compradorCep: compradorCep.replace(/\D/g, ""),
        indicadorInscricaoEstadualDestinatario: indicadorIe,
        inscricaoEstadualDestinatario: inscricaoEstadualDestinatario.trim() || undefined,
        formaPagamento,
      });

      setCurrentNfe(result.nfe);
      setStep("result");
      onNfeEmitida(venda.id, result.nfe);

      if (result.alreadyExists) {
        toast.info("Essa venda ja possui uma NF-e em andamento.");
      } else if (result.nfe.status === "autorizada") {
        toast.success("NF-e emitida com sucesso.");
      } else if (result.nfe.status === "erro") {
        toast.error(result.nfe.erro ?? "A NF-e retornou erro.");
      } else {
        toast.info("NF-e enviada para a Focus. Vamos acompanhar a autorizacao.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao emitir NF-e.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelar() {
    if (justificativa.trim().length < 15) {
      toast.error("A justificativa deve ter pelo menos 15 caracteres.");
      return;
    }

    setCancelando(true);
    try {
      const result = await cancelarNfe(venda.id, justificativa.trim(), currentNfe?.ref);
      setCurrentNfe(result.nfe);
      setShowCancelar(false);
      setJustificativa("");
      onNfeEmitida(venda.id, result.nfe);
      toast.success("NF-e cancelada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cancelar NF-e.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl border-white/10 bg-[hsl(230,18%,11%)] text-white sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-4 w-4 text-amber-400" />
            {step === "form" ? "Emitir NF-e" : "NF-e da Venda"}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
          <div className="font-medium text-white">{veiculo.modelo} {veiculo.ano}</div>
          <div className="mt-1">
            Valor da venda:{" "}
            <span className="font-semibold text-white">
              {venda.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        </div>

        {step === "form" && (
          <form onSubmit={handleEmitir} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-white/60">Nome do comprador</Label>
                <Input
                  value={compradorNome}
                  onChange={(event) => setCompradorNome(event.target.value)}
                  placeholder="Nome completo ou razao social"
                  className="border-white/10 bg-white/5 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60">CPF ou CNPJ</Label>
                <Input
                  value={compradorCpfCnpj}
                  onChange={(event) => setCompradorCpfCnpj(formatCpfCnpj(event.target.value))}
                  placeholder="000.000.000-00"
                  className="border-white/10 bg-white/5 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60">E-mail</Label>
                <Input
                  type="email"
                  value={compradorEmail}
                  onChange={(event) => setCompradorEmail(event.target.value)}
                  placeholder="cliente@email.com"
                  className="border-white/10 bg-white/5 text-white"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              <div className="text-sm font-medium text-white">Endereco do comprador</div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-white/60">Logradouro</Label>
                  <Input
                    value={compradorLogradouro}
                    onChange={(event) => setCompradorLogradouro(event.target.value)}
                    placeholder="Rua, avenida, travessa"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60">Numero</Label>
                  <Input
                    value={compradorNumero}
                    onChange={(event) => setCompradorNumero(event.target.value)}
                    placeholder="123"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/60">Complemento</Label>
                  <Input
                    value={compradorComplemento}
                    onChange={(event) => setCompradorComplemento(event.target.value)}
                    placeholder="Opcional"
                    className="border-white/10 bg-white/5 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60">Bairro</Label>
                  <Input
                    value={compradorBairro}
                    onChange={(event) => setCompradorBairro(event.target.value)}
                    placeholder="Centro"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/60">Municipio</Label>
                  <Input
                    value={compradorMunicipio}
                    onChange={(event) => setCompradorMunicipio(event.target.value)}
                    placeholder="Sao Paulo"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60">Codigo IBGE do municipio</Label>
                  <Input
                    value={compradorCodigoMunicipio}
                    onChange={(event) => setCompradorCodigoMunicipio(event.target.value.replace(/\D/g, "").slice(0, 7))}
                    placeholder="Opcional"
                    className="border-white/10 bg-white/5 text-white"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-white/60">UF</Label>
                  <Input
                    value={compradorUf}
                    onChange={(event) => setCompradorUf(event.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60">CEP</Label>
                  <Input
                    value={compradorCep}
                    onChange={(event) => setCompradorCep(formatCep(event.target.value))}
                    placeholder="00000-000"
                    className="border-white/10 bg-white/5 text-white"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white/60">Indicador de IE</Label>
                <Select value={indicadorIe} onValueChange={(value) => setIndicadorIe(value as NfeDestinatario["indicadorInscricaoEstadual"])}>
                  <SelectTrigger className="border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[hsl(230,18%,13%)]">
                    {INDICADOR_IE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-white">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/60">Inscricao Estadual</Label>
                <Input
                  value={inscricaoEstadualDestinatario}
                  onChange={(event) => setInscricaoEstadualDestinatario(event.target.value)}
                  placeholder={indicadorIe === "1" ? "Obrigatoria para contribuinte" : "Opcional"}
                  className="border-white/10 bg-white/5 text-white"
                  required={indicadorIe === "1"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/60">Forma de pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger className="border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[hsl(230,18%,13%)]">
                  {FORMAS_PAGAMENTO.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-white">{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">
              A Focus processa a NF-e e o sistema acompanha o status automaticamente ate autorizacao ou erro.
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-black hover:from-amber-400 hover:to-orange-400"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {loading ? "Enviando para a Focus..." : "Emitir NF-e"}
            </Button>
          </form>
        )}

        {step === "result" && currentNfe && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {nfeStatusBadge(currentNfe.status)}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefreshStatus()}
                disabled={refreshingStatus}
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                {refreshingStatus ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                Atualizar status
              </Button>
            </div>

            {currentNfe.status === "pendente" && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                A NF-e foi enviada para a Focus e ainda esta aguardando retorno da SEFAZ.
              </div>
            )}

            {currentNfe.erro && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-200">
                {currentNfe.erro}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.15em] text-white/35">Numero / Serie</div>
                <div className="mt-2 text-sm font-medium text-white">
                  {currentNfe.numero ? `${currentNfe.numero}${currentNfe.serie ? ` / ${currentNfe.serie}` : ""}` : "Aguardando autorizacao"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.15em] text-white/35">Atualizado em</div>
                <div className="mt-2 text-sm font-medium text-white">
                  {currentNfe.ultimaAtualizacaoEm
                    ? new Date(currentNfe.ultimaAtualizacaoEm).toLocaleString("pt-BR")
                    : "Agora"}
                </div>
              </div>
            </div>

            {currentNfe.destinatario && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs uppercase tracking-[0.15em] text-white/35">Destinatario</div>
                <div className="mt-2 space-y-1 text-sm text-white/80">
                  <div className="font-medium text-white">{currentNfe.destinatario.nome}</div>
                  <div>{formatCpfCnpj(currentNfe.destinatario.documento)}</div>
                  <div>
                    {currentNfe.destinatario.logradouro}, {currentNfe.destinatario.numero}
                    {currentNfe.destinatario.complemento ? ` - ${currentNfe.destinatario.complemento}` : ""}
                  </div>
                  <div>
                    {currentNfe.destinatario.bairro} - {currentNfe.destinatario.municipio}/{currentNfe.destinatario.uf}
                  </div>
                  <div>CEP {formatCep(currentNfe.destinatario.cep)}</div>
                  {currentNfe.destinatario.email ? <div>{currentNfe.destinatario.email}</div> : null}
                </div>
              </div>
            )}

            {currentNfe.chave && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.15em] text-white/35">Chave de acesso</div>
                <div className="rounded-2xl bg-white/5 p-3 text-xs font-mono text-white/80 break-all">
                  {currentNfe.chave}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {currentNfe.danfeUrl && (
                <a
                  href={currentNfe.danfeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/20"
                >
                  <Download className="h-4 w-4" />
                  Baixar DANFE
                </a>
              )}
              {currentNfe.xmlUrl && (
                <a
                  href={currentNfe.xmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 hover:bg-white/10"
                >
                  <Download className="h-4 w-4" />
                  Baixar XML
                </a>
              )}
              {currentNfe.status === "erro" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("form")}
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  Corrigir e reenviar
                </Button>
              )}
            </div>

            {currentNfe.status === "autorizada" && !showCancelar && (
              <button
                type="button"
                onClick={() => setShowCancelar(true)}
                className="text-left text-sm text-red-300 underline-offset-4 hover:underline"
              >
                Cancelar NF-e
              </button>
            )}

            {showCancelar && (
              <div className="space-y-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                <Label className="text-red-200">Justificativa do cancelamento</Label>
                <Input
                  value={justificativa}
                  onChange={(event) => setJustificativa(event.target.value)}
                  placeholder="Minimo de 15 caracteres"
                  className="border-red-500/20 bg-white/5 text-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" onClick={handleCancelar} disabled={cancelando}>
                    {cancelando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirmar cancelamento
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCancelar(false);
                      setJustificativa("");
                    }}
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
