import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getNfeConfig, saveNfeConfig, type NfeConfigData } from "@/services/nfe";

const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const REGIME_LABELS: Record<string, string> = {
  "1": "Simples Nacional",
  "2": "Simples Nacional - Excesso de receita",
  "3": "Regime Normal",
};

const EMPTY: NfeConfigData = {
  focusApiKey: "",
  ambiente: "homologacao",
  cnpj: "",
  razaoSocial: "",
  nomeFantasia: "",
  inscricaoEstadual: "",
  regimeTributario: "1",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  codigoMunicipio: "",
  uf: "SP",
  cep: "",
  telefone: "",
  email: "",
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
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

export default function NFeConfig() {
  const { tenant, refreshSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [focusApiKeyMasked, setFocusApiKeyMasked] = useState("");
  const [form, setForm] = useState<NfeConfigData>(EMPTY);

  useEffect(() => {
    getNfeConfig()
      .then(({ config, enabled: nextEnabled, configured: nextConfigured }) => {
        setEnabled(nextEnabled);
        setConfigured(nextConfigured);
        if (config) {
          setForm({
            ...EMPTY,
            ...config,
            focusApiKey: "",
          });
          setHasSavedApiKey(!!config.hasSavedApiKey);
          setFocusApiKeyMasked(config.focusApiKeyMasked ?? "");
        } else {
          setHasSavedApiKey(false);
          setFocusApiKeyMasked("");
        }
      })
      .catch(() => toast.error("Erro ao carregar configuracoes da NF-e."))
      .finally(() => setLoading(false));
  }, []);

  const requiredFieldsComplete = useMemo(() => {
    const requiredValues = [
      hasSavedApiKey || form.focusApiKey.trim(),
      form.cnpj,
      form.razaoSocial,
      form.inscricaoEstadual,
      form.logradouro,
      form.numero,
      form.bairro,
      form.municipio,
      form.codigoMunicipio,
      form.uf,
      form.cep,
    ];
    return requiredValues.every(Boolean)
      && form.cnpj.replace(/\D/g, "").length === 14
      && form.codigoMunicipio.replace(/\D/g, "").length === 7
      && form.cep.replace(/\D/g, "").length === 8;
  }, [form, hasSavedApiKey]);

  const canEmit = enabled && configured && requiredFieldsComplete;

  function setField(field: keyof NfeConfigData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveNfeConfig(form);
      setConfigured(true);
      setHasSavedApiKey((prev) => prev || !!form.focusApiKey.trim());
      setFocusApiKeyMasked((prev) => prev || "Chave salva com sucesso");
      await refreshSession();
      toast.success("Configuracao da NF-e salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar configuracao.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <FileText className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">NF-e com Focus</h1>
              <p className="text-sm text-white/45">
                Deixe a emissao pronta e acompanhe as notas com mais previsibilidade.
              </p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-white/55">
            A Focus recebe a NF-e de forma assíncrona. Depois do envio, o sistema consulta o status
            até autorização, preserva DANFE/XML e evita duplicidade por venda.
          </p>
        </div>

        <Badge className={canEmit ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}>
          {canEmit ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertCircle className="mr-1 h-3 w-3" />}
          {canEmit ? "Pronto para emitir" : "Configuracao pendente"}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <ShieldCheck className="h-4 w-4 text-amber-300" />
            Modulo NF-e
          </div>
          <p className="text-sm text-white/65">
            {enabled
              ? "Liberado para a loja."
              : "Voce ja pode preparar os dados. A emissao libera quando a plataforma ativar o modulo."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            Integracao Focus
          </div>
          <p className="text-sm text-white/65">
            {hasSavedApiKey
              ? "Chave salva com seguranca. Voce pode deixar o campo em branco para manter a atual."
              : "Informe a chave da Focus para permitir envio, consulta e cancelamento."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <FileText className="h-4 w-4 text-blue-300" />
            Operacao
          </div>
          <p className="text-sm text-white/65">
            Depois de salvar, emita direto em <span className="text-white">Vendas</span> ou <span className="text-white">Estoque</span>.
          </p>
        </div>
      </div>

      {!enabled && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          O modulo ainda nao esta ativo para esta loja, mas voce pode deixar a configuracao pronta agora.
        </div>
      )}

      {form.ambiente === "homologacao" && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Em homologacao, a propria documentacao da Focus indica uso de dados de teste e, em alguns cenarios,
          nome do destinatario com a identificacao de ambiente sem valor fiscal.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Integracao Focus</h2>

          <div className="space-y-2">
            <Label className="text-white/60">Chave de API da Focus</Label>
            <Input
              type="password"
              value={form.focusApiKey}
              onChange={(event) => setField("focusApiKey", event.target.value)}
              placeholder={hasSavedApiKey ? "Deixe em branco para manter a chave atual" : "Cole a chave da Focus"}
              className="border-white/10 bg-white/5 text-white"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/35">
              {hasSavedApiKey ? <span>Chave atual protegida: {focusApiKeyMasked}</span> : <span>Nenhuma chave salva ainda.</span>}
              <a
                href="https://doc.focusnfe.com.br/reference/emitir_nfe"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-amber-400/80 hover:text-amber-300"
              >
                Documentacao oficial <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/60">Ambiente</Label>
            <Select value={form.ambiente} onValueChange={(value) => setField("ambiente", value)}>
              <SelectTrigger className="border-white/10 bg-white/5 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[hsl(230,18%,13%)]">
                <SelectItem value="homologacao" className="text-white">Homologacao</SelectItem>
                <SelectItem value="producao" className="text-white">Producao</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Dados do Emitente</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/60">CNPJ</Label>
              <Input
                value={form.cnpj}
                onChange={(event) => setField("cnpj", formatCnpj(event.target.value))}
                placeholder="00.000.000/0000-00"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">Inscricao Estadual</Label>
              <Input
                value={form.inscricaoEstadual}
                onChange={(event) => setField("inscricaoEstadual", event.target.value)}
                placeholder="Ex.: 123456789"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/60">Razao Social</Label>
            <Input
              value={form.razaoSocial}
              onChange={(event) => setField("razaoSocial", event.target.value)}
              placeholder="Nome juridico da empresa"
              className="border-white/10 bg-white/5 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/60">Nome Fantasia</Label>
            <Input
              value={form.nomeFantasia ?? ""}
              onChange={(event) => setField("nomeFantasia", event.target.value)}
              placeholder="Opcional"
              className="border-white/10 bg-white/5 text-white"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label className="text-white/60">Regime Tributario</Label>
              <Select value={form.regimeTributario} onValueChange={(value) => setField("regimeTributario", value)}>
                <SelectTrigger className="border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[hsl(230,18%,13%)]">
                  {Object.entries(REGIME_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value} className="text-white">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">Telefone</Label>
              <Input
                value={form.telefone ?? ""}
                onChange={(event) => setField("telefone", event.target.value)}
                placeholder="(11) 99999-9999"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">E-mail fiscal</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="fiscal@sualoja.com.br"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Endereco do Emitente</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-white/60">Logradouro</Label>
              <Input
                value={form.logradouro}
                onChange={(event) => setField("logradouro", event.target.value)}
                placeholder="Rua, avenida, travessa"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">Numero</Label>
              <Input
                value={form.numero}
                onChange={(event) => setField("numero", event.target.value)}
                placeholder="123"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/60">Complemento</Label>
              <Input
                value={form.complemento ?? ""}
                onChange={(event) => setField("complemento", event.target.value)}
                placeholder="Opcional"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">Bairro</Label>
              <Input
                value={form.bairro}
                onChange={(event) => setField("bairro", event.target.value)}
                placeholder="Centro"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/60">Municipio</Label>
              <Input
                value={form.municipio}
                onChange={(event) => setField("municipio", event.target.value)}
                placeholder="Sao Paulo"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">Codigo IBGE do municipio</Label>
              <Input
                value={form.codigoMunicipio}
                onChange={(event) => setField("codigoMunicipio", event.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="3550308"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-white/60">UF</Label>
              <Select value={form.uf} onValueChange={(value) => setField("uf", value)}>
                <SelectTrigger className="border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-48 border-white/10 bg-[hsl(230,18%,13%)]">
                  {UF_LIST.map((uf) => (
                    <SelectItem key={uf} value={uf} className="text-white">{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60">CEP</Label>
              <Input
                value={form.cep}
                onChange={(event) => setField("cep", formatCep(event.target.value))}
                placeholder="00000-000"
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-black hover:from-amber-400 hover:to-orange-400"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar configuracao da NF-e"}
        </Button>

        {!requiredFieldsComplete && (
          <p className="text-center text-xs text-white/35">
            Revise CNPJ, codigo IBGE, CEP e os campos obrigatorios do emitente antes de emitir.
          </p>
        )}
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
        Status atual: {tenant?.nfeEnabled ? "modulo ativo" : "modulo aguardando ativacao"} e{" "}
        {configured ? "integracao configurada" : "integracao ainda nao salva"}.
      </div>
    </div>
  );
}
