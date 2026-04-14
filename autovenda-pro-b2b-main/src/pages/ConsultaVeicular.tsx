import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, Search, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";
import {
  buildConsultationSummary,
  CONSULTATION_MODULES,
  CONSULTATION_MODULE_MAP,
  expandConsultationModules,
  formatConsultationPrice,
  type ConsultationExecutionResponse,
  type ConsultationModuleDefinition,
  type ConsultationModuleId,
  type ConsultationModuleResult,
} from "@/lib/consulta-modules";
import { executeConsultation } from "@/services/consultas";
import {
  fetchFipeBrandSuggestions,
  fetchFipeModelSuggestions,
  type FipeSuggestion,
} from "@/services/fipe";
import { formatPlate, isValidPlate } from "@/lib/placa";

function moduleTone(status: ConsultationModuleResult["status"]) {
  switch (status) {
    case "completed":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "pending_integration":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "provider_unavailable":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "not_found":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function statusLabel(status: ConsultationModuleResult["status"]) {
  switch (status) {
    case "completed":
      return "Concluido";
    case "pending_integration":
      return "Pronto para API";
    case "provider_unavailable":
      return "Provedor indisponivel";
    case "not_found":
      return "Nao encontrado";
    case "partial":
      return "Parcial";
    default:
      return "Falhou";
  }
}

function ResultCard({ result }: { result: ConsultationModuleResult }) {
  const data = result.data ?? {};

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-white">{result.title}</CardTitle>
            <p className="mt-1 text-xs text-white/45">{CONSULTATION_MODULE_MAP[result.moduleId].description}</p>
          </div>
          <Badge variant="outline" className={moduleTone(result.status)}>
            {statusLabel(result.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {result.status === "completed" && result.moduleId === "placa" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs text-white/45">Placa</span>
              <p className="font-mono font-bold text-white">{String(data.placa ?? "Nao informado")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Situacao</span>
              <p className="font-medium text-white">{String(data.situacao ?? "Consulta realizada")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Marca</span>
              <p className="font-medium text-white">{String(data.marca ?? "Nao informado")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Modelo</span>
              <p className="font-medium text-white">{String(data.modelo ?? "Nao informado")}</p>
            </div>
          </div>
        )}

        {result.status === "completed" && result.moduleId === "fipe" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="text-xs text-white/45">Valor FIPE</span>
              <p className="text-lg font-bold text-white">{String(data.valor ?? "Nao informado")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Codigo</span>
              <p className="font-medium text-white">{String(data.codigoFipe ?? "Nao informado")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Ano</span>
              <p className="font-medium text-white">{String(data.anoModelo ?? "Nao informado")}</p>
            </div>
            <div>
              <span className="text-xs text-white/45">Combustivel</span>
              <p className="font-medium text-white">{String(data.combustivel ?? "Nao informado")}</p>
            </div>
          </div>
        )}

        {result.status !== "completed" && (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-3">
            <p className="text-sm text-white/80">{result.message || "Sem detalhes adicionais."}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConsultaVeicular() {
  const { veiculos, addConsulta } = useAppStore();
  const brandBlurTimeoutRef = useRef<number | null>(null);
  const modelBlurTimeoutRef = useRef<number | null>(null);
  const [placa, setPlaca] = useState("");
  const [moduleIds, setModuleIds] = useState<ConsultationModuleId[]>(["completa"]);
  const [fipeForm, setFipeForm] = useState({ marca: "", modelo: "", ano: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsultationExecutionResponse | null>(null);
  const [activeAutocomplete, setActiveAutocomplete] = useState<"marca" | "modelo" | null>(null);
  const [brandSuggestions, setBrandSuggestions] = useState<FipeSuggestion[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<FipeSuggestion[]>([]);
  const [veiculoVinculado, setVeiculoVinculado] = useState<string>("none");

  useEffect(() => {
    return () => {
      if (brandBlurTimeoutRef.current !== null) window.clearTimeout(brandBlurTimeoutRef.current);
      if (modelBlurTimeoutRef.current !== null) window.clearTimeout(modelBlurTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = fipeForm.marca.trim();

    if (activeAutocomplete !== "marca" || query.length < 2) {
      setBrandSuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchFipeBrandSuggestions(query)
        .then((items) => {
          if (!cancelled) setBrandSuggestions(items);
        })
        .catch(() => {
          if (!cancelled) setBrandSuggestions([]);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeAutocomplete, fipeForm.marca]);

  useEffect(() => {
    let cancelled = false;
    const marca = fipeForm.marca.trim();
    const query = fipeForm.modelo.trim();

    if (activeAutocomplete !== "modelo" || marca.length < 2 || query.length < 2) {
      setModelSuggestions([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchFipeModelSuggestions(marca, query)
        .then((items) => {
          if (!cancelled) setModelSuggestions(items);
        })
        .catch(() => {
          if (!cancelled) setModelSuggestions([]);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeAutocomplete, fipeForm.marca, fipeForm.modelo]);

  const selectedExpandedIds = useMemo(() => expandConsultationModules(moduleIds), [moduleIds]);
  const totalPriceCents = useMemo(
    () => moduleIds.reduce((sum, moduleId) => sum + CONSULTATION_MODULE_MAP[moduleId].priceCents, 0),
    [moduleIds],
  );
  const availableStockVehicles = useMemo(
    () => veiculos.filter((item) => item.status === "disponivel" || item.status === "reservado"),
    [veiculos],
  );

  function toggleModule(module: ConsultationModuleDefinition) {
    if (module.id === "completa") {
      setModuleIds((current) => (current.includes("completa") ? ["placa"] : ["completa"]));
      return;
    }

    setModuleIds((current) => {
      const withoutBundle = current.filter((item) => item !== "completa");
      if (withoutBundle.includes(module.id)) {
        const next = withoutBundle.filter((item) => item !== module.id);
        return next.length ? next : ["placa"];
      }
      return [...withoutBundle, module.id];
    });
  }

  function hasEnoughDataForExecution() {
    if (moduleIds.includes("completa")) return isValidPlate(placa);
    if (selectedExpandedIds.some((item) => CONSULTATION_MODULE_MAP[item].requiresPlate) && !isValidPlate(placa)) {
      return false;
    }
    if (selectedExpandedIds.includes("fipe")) {
      return Boolean(isValidPlate(placa) || (fipeForm.modelo.trim() && fipeForm.ano.trim()));
    }
    return true;
  }

  async function handleExecute() {
    if (!hasEnoughDataForExecution()) {
      toast.error("Selecione os modulos e informe placa ou os dados minimos para FIPE.");
      return;
    }

    setLoading(true);
    try {
      const response = await executeConsultation({
        plate: placa,
        marca: fipeForm.marca,
        modelo: fipeForm.modelo,
        ano: fipeForm.ano,
        moduleIds,
      });

      setResult(response);

      if (response.vehicle?.marca || response.vehicle?.modelo || response.vehicle?.ano) {
        setFipeForm({
          marca: response.vehicle?.marca || fipeForm.marca,
          modelo: response.vehicle?.modelo || fipeForm.modelo,
          ano: response.vehicle?.ano || fipeForm.ano,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel executar a consulta.");
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    if (!result) return;

    const summary = buildConsultationSummary(result);
    addConsulta({
      placa: result.vehicle?.placa || result.query.plate || "",
      marca: result.vehicle?.marca,
      modelo: result.vehicle?.modelo,
      ano: result.vehicle?.ano,
      data: new Date().toISOString(),
      veiculoId: veiculoVinculado === "none" ? undefined : veiculoVinculado,
      consultaTitulo: summary.title,
      consultaResumo: summary.subtitle,
      statusLabel: summary.statusLabel,
      moduleIds: result.requestedModuleIds,
      totalPriceCents: result.totalPriceCents,
      resultados: result.results,
    });

    toast.success("Consulta salva no historico da loja.");
    setVeiculoVinculado("none");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consulta Veicular</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Estruturada por modulos e pronta para receber APIs futuras sem retrabalho de tela.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Selecao atual</p>
          <p className="mt-1 text-lg font-black text-white">{formatConsultationPrice(totalPriceCents)}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base text-white">1. Escolha os modulos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {CONSULTATION_MODULES.map((module) => {
                const active = moduleIds.includes(module.id);
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => toggleModule(module)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-blue-500/30 bg-blue-500/10 ring-1 ring-blue-500/20"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{module.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/45">{module.description}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          module.availability === "live"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : "border-blue-500/20 bg-blue-500/10 text-blue-300"
                        }
                      >
                        {module.availability === "live" ? "Ativo" : "Preparando"}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">{formatConsultationPrice(module.priceCents)}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                        {active ? "Selecionado" : "Selecionar"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base text-white">2. Informe a busca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="mb-2 text-sm font-semibold text-white">Placa</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      placeholder="ABC-1234 ou ABC-1D23"
                      value={placa}
                      onChange={(event) => setPlaca(formatPlate(event.target.value))}
                      className="font-mono uppercase tracking-[0.18em]"
                      maxLength={8}
                    />
                    <Button onClick={handleExecute} disabled={loading || !hasEnoughDataForExecution()} className="sm:min-w-[180px]">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      {loading ? "Consultando..." : "Executar consulta"}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-white/45">
                    Use placa para consulta completa ou para acionar os modulos que dependem de provedor externo.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <p className="mb-2 text-sm font-semibold text-white">Resumo rapido</p>
                  <div className="space-y-2 text-sm text-white/75">
                    <div className="flex items-center justify-between">
                      <span>Modulos selecionados</span>
                      <strong>{moduleIds.length}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Execucao real agora</span>
                      <strong>{selectedExpandedIds.filter((id) => CONSULTATION_MODULE_MAP[id].availability === "live").length}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Prontos para API</span>
                      <strong>{selectedExpandedIds.filter((id) => CONSULTATION_MODULE_MAP[id].availability === "preparing").length}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-white">
                  <Search className="h-4 w-4 text-blue-300" />
                  <p className="text-sm font-semibold">Base manual para FIPE</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Input
                      placeholder="Ex.: Volkswagen"
                      value={fipeForm.marca}
                      aria-label="Marca FIPE"
                      autoComplete="off"
                      onFocus={() => setActiveAutocomplete("marca")}
                      onBlur={() => {
                        if (brandBlurTimeoutRef.current !== null) window.clearTimeout(brandBlurTimeoutRef.current);
                        brandBlurTimeoutRef.current = window.setTimeout(() => {
                          setActiveAutocomplete((current) => (current === "marca" ? null : current));
                        }, 120);
                      }}
                      onChange={(event) => {
                        const nextBrand = event.target.value;
                        setActiveAutocomplete("marca");
                        setFipeForm((current) => ({
                          ...current,
                          marca: nextBrand,
                          modelo: current.marca === nextBrand ? current.modelo : "",
                        }));
                        setModelSuggestions([]);
                      }}
                    />
                    {activeAutocomplete === "marca" && brandSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[hsl(230,18%,12%)] shadow-xl">
                        {brandSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.value}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setFipeForm((current) => ({ ...current, marca: suggestion.label }));
                              setBrandSuggestions([]);
                              setActiveAutocomplete(null);
                            }}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      placeholder="Ex.: Gol 1.0 Flex"
                      value={fipeForm.modelo}
                      aria-label="Modelo FIPE"
                      autoComplete="off"
                      onFocus={() => setActiveAutocomplete("modelo")}
                      onBlur={() => {
                        if (modelBlurTimeoutRef.current !== null) window.clearTimeout(modelBlurTimeoutRef.current);
                        modelBlurTimeoutRef.current = window.setTimeout(() => {
                          setActiveAutocomplete((current) => (current === "modelo" ? null : current));
                        }, 120);
                      }}
                      onChange={(event) => {
                        setActiveAutocomplete("modelo");
                        setFipeForm((current) => ({ ...current, modelo: event.target.value }));
                      }}
                    />
                    {activeAutocomplete === "modelo" && modelSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[hsl(230,18%,12%)] shadow-xl">
                        {modelSuggestions.map((suggestion) => (
                          <button
                            key={`${suggestion.value}-${suggestion.label}`}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setFipeForm((current) => ({ ...current, modelo: suggestion.label }));
                              setModelSuggestions([]);
                              setActiveAutocomplete(null);
                            }}
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Input
                    placeholder="Ex.: 2019"
                    value={fipeForm.ano}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) =>
                      setFipeForm((current) => ({
                        ...current,
                        ano: event.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                  />
                </div>
                <p className="mt-2 text-xs text-white/45">
                  Se a placa nao responder, a FIPE continua operando com marca, modelo e ano.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-base text-white">Arquitetura de pre-lancamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/75">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <p>FIPE e placa ja rodam com retorno real.</p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/10 p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                <p>Leilao, multas, debitos e roubo/furto ja tem produto, preco e contrato de retorno prontos para API.</p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p>Consulta completa ja compoe modulos disponiveis agora e preserva os pendentes sem retrabalhar o front.</p>
              </div>
            </CardContent>
          </Card>

          {result && result.vehicle && (
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-base text-white">Veiculo base</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs text-white/45">Placa</span>
                  <p className="font-mono font-bold text-white">{result.vehicle.placa || result.vehicle.placaConsultada || "Nao informado"}</p>
                </div>
                <div>
                  <span className="text-xs text-white/45">Situacao</span>
                  <p className="font-medium text-white">{result.vehicle.situacao || "Consulta realizada"}</p>
                </div>
                <div>
                  <span className="text-xs text-white/45">Marca / Modelo</span>
                  <p className="font-medium text-white">{[result.vehicle.marca, result.vehicle.modelo].filter(Boolean).join(" • ") || "Nao informado"}</p>
                </div>
                <div>
                  <span className="text-xs text-white/45">Ano / Cor</span>
                  <p className="font-medium text-white">{[result.vehicle.ano, result.vehicle.cor].filter(Boolean).join(" • ") || "Nao informado"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-base text-white">Salvar no estoque</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={veiculoVinculado} onValueChange={setVeiculoVinculado}>
                  <SelectTrigger className="border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder="Selecione um veiculo (opcional)" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[hsl(230,18%,12%)] text-white">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {availableStockVehicles.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.modelo} {item.ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSave} className="w-full">
                  <Save className="mr-2 h-4 w-4" />
                  Salvar consulta
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Retorno por modulo</h2>
              <p className="text-sm text-white/45">
                {result.requestedModuleIds.length} item(ns) contratado(s) • {formatConsultationPrice(result.totalPriceCents)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {result.results.map((item) => (
              <ResultCard key={`${item.moduleId}-${item.executedAt}`} result={item} />
            ))}
          </div>

          {result.results.length === 0 && (
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="flex items-center gap-3 p-6 text-white/65">
                <XCircle className="h-5 w-5" />
                Nenhum retorno disponivel para os modulos selecionados.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
