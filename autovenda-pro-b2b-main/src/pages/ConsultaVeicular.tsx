import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, FileText, Save, Search, XCircle } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";
import { fetchVeiculoByPlaca } from "@/services/brasilapi";
import {
  fetchFipeBrandSuggestions,
  fetchFipeByText,
  fetchFipeModelSuggestions,
  type FipeSuggestion,
} from "@/services/fipe";
import { formatPlate, isValidPlate } from "@/lib/placa";

interface ConsultaResult {
  placa: string;
  placaConsultada: string;
  marca: string;
  modelo: string;
  ano: string;
  cor?: string;
  multas: number | null;
  debitos: string | null;
  leilao: boolean | null;
  roubo: boolean | null;
  recall?: boolean | null;
  situacao: string;
  municipio?: string;
  uf?: string;
  source: string;
  valorFipe?: string | null;
  codigoFipe?: string | null;
  mesReferenciaFipe?: string | null;
  combustivelFipe?: string | null;
  autenticacaoFipe?: string | null;
  sourceFipe?: string | null;
}

function availabilityClass(value: boolean | null) {
  if (value === null) return "border-white/10";
  return value ? "border-destructive/30" : "border-success/30";
}

export default function ConsultaVeicular() {
  const { veiculos, addConsulta } = useAppStore();
  const brandBlurTimeoutRef = useRef<number | null>(null);
  const modelBlurTimeoutRef = useRef<number | null>(null);
  const [placa, setPlaca] = useState("");
  const [fipeForm, setFipeForm] = useState({
    marca: "",
    modelo: "",
    ano: "",
  });
  const [result, setResult] = useState<ConsultaResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingFipe, setLoadingFipe] = useState(false);
  const [fipeMessage, setFipeMessage] = useState<string | null>(null);
  const [brandSuggestions, setBrandSuggestions] = useState<FipeSuggestion[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<FipeSuggestion[]>([]);
  const [activeAutocomplete, setActiveAutocomplete] = useState<"marca" | "modelo" | null>(null);
  const [manualFipeResult, setManualFipeResult] = useState<ConsultaResult | null>(null);
  const [loadingManualFipe, setLoadingManualFipe] = useState(false);
  const [manualFipeMessage, setManualFipeMessage] = useState<string | null>(null);
  const [veiculoVinculado, setVeiculoVinculado] = useState<string>("none");
  const lookupIdRef = useRef(0);

  const handlePlacaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaca(formatPlate(e.target.value));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = fipeForm.marca.trim();

    if (activeAutocomplete !== "marca" || query.length < 2) {
      setBrandSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      void fetchFipeBrandSuggestions(query)
        .then((items) => {
          if (!cancelled) {
            setBrandSuggestions(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setBrandSuggestions([]);
          }
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
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      void fetchFipeModelSuggestions(marca, query)
        .then((items) => {
          if (!cancelled) {
            setModelSuggestions(items);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setModelSuggestions([]);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeAutocomplete, fipeForm.marca, fipeForm.modelo]);

  useEffect(() => {
    return () => {
      if (brandBlurTimeoutRef.current !== null) {
        window.clearTimeout(brandBlurTimeoutRef.current);
      }
      if (modelBlurTimeoutRef.current !== null) {
        window.clearTimeout(modelBlurTimeoutRef.current);
      }
    };
  }, []);

  const consultarFipeManual = async () => {
    setLoadingManualFipe(true);
    setManualFipeMessage(null);
    setManualFipeResult(null);

    try {
      const fipe = await fetchFipeByText(
        fipeForm.marca,
        fipeForm.modelo,
        fipeForm.ano,
      );

      if (!fipe) {
        setManualFipeMessage("FIPE nao localizada para os dados informados.");
        return;
      }

      setManualFipeResult({
        placa: "",
        placaConsultada: "",
        marca: fipe.marca,
        modelo: fipe.modelo,
        ano: String(fipe.anoModelo),
        multas: null,
        debitos: null,
        leilao: null,
        roubo: null,
        recall: null,
        situacao: "Consulta FIPE",
        source: "consulta-manual",
        valorFipe: fipe.valor,
        codigoFipe: fipe.codigoFipe,
        mesReferenciaFipe: fipe.mesReferencia,
        combustivelFipe: fipe.combustivel,
        autenticacaoFipe: fipe.autenticacao ?? null,
        sourceFipe: fipe.source,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel consultar a FIPE.";
      setManualFipeMessage(message);
    } finally {
      setLoadingManualFipe(false);
    }
  };

  const consultar = async () => {
    const lookupId = ++lookupIdRef.current;
    setLoading(true);
    setLoadingFipe(false);
    setFipeMessage(null);
    setNotFound(false);
    setResult(null);

    try {
      const response = await fetchVeiculoByPlaca(placa);
      if (lookupId !== lookupIdRef.current) return;

      const baseResult: ConsultaResult = {
        placa: response.placa,
        placaConsultada: response.placaConsultada,
        marca: response.marca,
        modelo: response.modelo,
        ano: response.ano,
        cor: response.cor,
        multas: null,
        debitos: null,
        leilao: null,
        roubo: null,
        recall: null,
        situacao: response.situacao,
        municipio: response.municipio,
        uf: response.uf,
        source: response.source,
      };

      setResult(baseResult);
      setFipeForm({
        marca: response.marca,
        modelo: response.modelo,
        ano: response.ano,
      });
      setLoadingFipe(true);

      void (async () => {
        try {
          const fipe = await fetchFipeByText(
            response.marca,
            response.modelo,
            response.ano,
          );

          if (lookupId !== lookupIdRef.current) return;

          if (!fipe) {
            setFipeMessage("FIPE nao localizada para este veiculo.");
            return;
          }

          setResult((current) => {
            if (!current || current.placaConsultada !== baseResult.placaConsultada) {
              return current;
            }

            return {
              ...current,
              valorFipe: fipe.valor,
              codigoFipe: fipe.codigoFipe,
              mesReferenciaFipe: fipe.mesReferencia,
              combustivelFipe: fipe.combustivel,
              autenticacaoFipe: fipe.autenticacao ?? null,
              sourceFipe: fipe.source,
            };
          });
        } catch (error) {
          if (lookupId !== lookupIdRef.current) return;
          const message =
            error instanceof Error ? error.message : "Nao foi possivel consultar a FIPE.";
          setFipeMessage(message);
        } finally {
          if (lookupId === lookupIdRef.current) {
            setLoadingFipe(false);
          }
        }
      })();
    } catch (error) {
      if (lookupId !== lookupIdRef.current) return;
      const message = error instanceof Error ? error.message : "Nao foi possivel consultar a placa.";
      if (/nao encontrada/i.test(message)) {
        setNotFound(true);
      } else {
        toast.error(message);
      }
    } finally {
      if (lookupId === lookupIdRef.current) {
        setLoading(false);
      }
    }
  };

  const salvarConsulta = () => {
    if (!result) return;

    addConsulta({
      placa: result.placa,
      data: new Date().toISOString(),
      veiculoId: veiculoVinculado === "none" ? undefined : veiculoVinculado,
      resultado: {
        marca: result.marca,
        modelo: result.modelo,
        ano: result.ano,
        cor: result.cor ?? "Nao informado",
        situacao: result.situacao,
        multas: result.multas,
        debitos: result.debitos,
        leilao: result.leilao,
        roubo: result.roubo,
        recall: result.recall,
        valorFipe: result.valorFipe ?? null,
        codigoFipe: result.codigoFipe ?? null,
        mesReferenciaFipe: result.mesReferenciaFipe ?? null,
        combustivelFipe: result.combustivelFipe ?? null,
      },
    });

    toast.success("Consulta salva.");
    setVeiculoVinculado("none");
  };

  const veiculosDisponiveis = veiculos.filter(
    (v) => v.status === "disponivel" || v.status === "reservado",
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Consulta Veicular</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Consulte placa antiga ou Mercosul e salve o resultado vinculado ao estoque.
        </p>
      </div>

      <Card className="animate-fade-up">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="ABC-1234 ou ABC-1D23"
              value={placa}
              onChange={handlePlacaChange}
              className="font-mono text-base sm:text-lg uppercase tracking-wider"
              maxLength={8}
            />
            <Button
              className="sm:min-w-[140px]"
              onClick={consultar}
              disabled={!isValidPlate(placa) || loading}
            >
              <Search className="h-4 w-4 mr-1" />
              {loading ? "Consultando..." : "Consultar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Formatos aceitos: `ABC-1234` e `ABC-1D23`
          </p>
        </CardContent>
      </Card>

      <Card className="animate-fade-up">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Consulta FIPE
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Input
                placeholder="Ex.: Volkswagen"
                value={fipeForm.marca}
                aria-label="Marca FIPE"
                autoComplete="off"
                onFocus={() => setActiveAutocomplete("marca")}
                onBlur={() => {
                  if (brandBlurTimeoutRef.current !== null) {
                    window.clearTimeout(brandBlurTimeoutRef.current);
                  }
                  brandBlurTimeoutRef.current = window.setTimeout(() => {
                    setActiveAutocomplete((current) =>
                      current === "marca" ? null : current,
                    );
                  }, 120);
                }}
                onChange={(e) => {
                  const nextBrand = e.target.value;
                  setActiveAutocomplete("marca");
                  setFipeForm((current) => ({
                    ...current,
                    marca: nextBrand,
                    modelo: current.marca === nextBrand ? current.modelo : "",
                  }));
                  setModelSuggestions([]);
                  setManualFipeResult(null);
                  setManualFipeMessage(null);
                }}
              />
              {activeAutocomplete === "marca" && brandSuggestions.length > 0 && (
                <div
                  className="absolute z-20 top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[hsl(230,18%,12%)] shadow-xl"
                  role="listbox"
                  aria-label="Sugestoes de marca FIPE"
                >
                  {brandSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.value}
                      type="button"
                      className="w-full break-words px-3 py-2 text-left text-sm leading-5 hover:bg-white/5 transition-colors"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setFipeForm((current) => ({
                          ...current,
                          marca: suggestion.label,
                        }));
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
                  if (modelBlurTimeoutRef.current !== null) {
                    window.clearTimeout(modelBlurTimeoutRef.current);
                  }
                  modelBlurTimeoutRef.current = window.setTimeout(() => {
                    setActiveAutocomplete((current) =>
                      current === "modelo" ? null : current,
                    );
                  }, 120);
                }}
                onChange={(e) => {
                  setActiveAutocomplete("modelo");
                  setFipeForm((current) => ({ ...current, modelo: e.target.value }));
                  setManualFipeResult(null);
                  setManualFipeMessage(null);
                }}
              />
              {activeAutocomplete === "modelo" && modelSuggestions.length > 0 && (
                <div
                  className="absolute z-20 top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[hsl(230,18%,12%)] shadow-xl"
                  role="listbox"
                  aria-label="Sugestoes de modelo FIPE"
                >
                  {modelSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.value}-${suggestion.label}`}
                      type="button"
                      className="w-full break-words px-3 py-2 text-left text-sm leading-5 hover:bg-white/5 transition-colors"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setFipeForm((current) => ({
                          ...current,
                          modelo: suggestion.label,
                        }));
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
              onChange={(e) =>
                setFipeForm((current) => ({
                  ...current,
                  ano: e.target.value.replace(/\D/g, "").slice(0, 4),
                }))
              }
            />
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              onClick={consultarFipeManual}
              disabled={!fipeForm.modelo.trim() || !fipeForm.ano.trim() || loadingManualFipe}
              className="w-full sm:w-auto"
            >
              <Search className="h-4 w-4 mr-1" />
              {loadingManualFipe ? "Consultando FIPE..." : "Consultar FIPE"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground sm:max-w-[28rem]">
              Funciona mesmo sem a consulta por placa. Se a placa responder, os campos sao preenchidos automaticamente.
            </p>
          </div>

          {loadingManualFipe && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm font-medium">Consultando FIPE manual...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Buscando valor de referencia para os dados informados.
              </p>
            </div>
          )}

          {!loadingManualFipe && manualFipeResult?.valorFipe && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Valor FIPE</span>
                  <p className="text-xl font-bold tabular-nums">{manualFipeResult.valorFipe}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Codigo FIPE</span>
                  <p className="font-medium tabular-nums">{manualFipeResult.codigoFipe}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Modelo</span>
                  <p className="font-medium">{manualFipeResult.modelo}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Ano / combustivel</span>
                  <p className="font-medium">
                    {manualFipeResult.ano} {manualFipeResult.combustivelFipe || ""}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <span className="text-muted-foreground text-xs">Mes referencia</span>
                  <p className="font-medium">
                    {manualFipeResult.mesReferenciaFipe || "Nao informado"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loadingManualFipe && !manualFipeResult && manualFipeMessage && (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm font-medium">Nao foi possivel consultar a FIPE manual</p>
              <p className="text-xs text-muted-foreground mt-1">{manualFipeMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {notFound && (
        <Card className="border-destructive/20 animate-fade-up">
          <CardContent className="p-6 text-center">
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
            <p className="font-semibold text-foreground">Placa nao encontrada</p>
            <p className="text-sm text-muted-foreground">Verifique se digitou corretamente ou tente novamente.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4 animate-fade-up">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-secondary" />
                Dados do Veiculo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Placa</span>
                  <p className="font-mono font-bold">{result.placa}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Marca</span>
                  <p className="font-medium">{result.marca}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Modelo</span>
                  <p className="font-medium">{result.modelo}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Ano</span>
                  <p className="font-medium tabular-nums">{result.ano}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Cor</span>
                  <p className="font-medium">{result.cor || "Nao informado"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Situacao</span>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={
                        result.situacao.toLowerCase().includes("restri") || result.situacao.toLowerCase().includes("irregular")
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-success/10 text-success border-success/20"
                      }
                    >
                      {result.situacao}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Municipio/UF</span>
                  <p className="font-medium">{[result.municipio, result.uf].filter(Boolean).join(" / ") || "Nao informado"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Fonte</span>
                  <p className="font-medium uppercase">{result.source}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Consulta</span>
                  <p className="font-medium">{result.placaConsultada}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                FIPE
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFipe ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium">Consultando FIPE...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Buscando valor de referencia para marca, modelo e ano.
                  </p>
                </div>
              ) : result.valorFipe ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Valor FIPE</span>
                    <p className="text-xl font-bold tabular-nums">{result.valorFipe}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Codigo FIPE</span>
                    <p className="font-medium tabular-nums">{result.codigoFipe}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Mes referencia</span>
                    <p className="font-medium">{result.mesReferenciaFipe || "Nao informado"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Combustivel</span>
                    <p className="font-medium">{result.combustivelFipe || "Nao informado"}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <span className="text-muted-foreground text-xs">Fonte</span>
                    <p className="font-medium uppercase">{result.sourceFipe || "FIPE"}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4">
                  <p className="text-sm font-medium">FIPE indisponivel para este resultado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fipeMessage || "Nao foi possivel localizar a referencia FIPE para os dados retornados."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className={result.multas === null ? "border-white/10" : result.multas > 0 ? "border-warning/30" : "border-success/30"}>
              <CardContent className="p-4 flex items-center gap-3">
                {result.multas === null ? (
                  <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                ) : result.multas > 0 ? (
                  <AlertTriangle className="h-6 w-6 text-warning" />
                ) : (
                  <CheckCircle className="h-6 w-6 text-success" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Multas</p>
                  <p className="text-lg font-bold tabular-nums">{result.multas ?? "Nao informado"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className={result.debitos && result.debitos !== "R$ 0,00" ? "border-warning/30" : "border-white/10"}>
              <CardContent className="p-4 flex items-center gap-3">
                {result.debitos ? (
                  result.debitos === "R$ 0,00" ? <CheckCircle className="h-6 w-6 text-success" /> : <AlertTriangle className="h-6 w-6 text-warning" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Debitos / IPVA</p>
                  <p className="text-lg font-bold tabular-nums">{result.debitos ?? "Nao informado"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className={availabilityClass(result.leilao)}>
              <CardContent className="p-4 flex items-center gap-3">
                {result.leilao === null ? (
                  <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                ) : result.leilao ? (
                  <XCircle className="h-6 w-6 text-destructive" />
                ) : (
                  <CheckCircle className="h-6 w-6 text-success" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Historico Leilao</p>
                  <p className="text-sm font-bold">
                    {result.leilao === null ? "Nao informado" : result.leilao ? "Registro encontrado" : "Sem registro"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={availabilityClass(result.roubo)}>
              <CardContent className="p-4 flex items-center gap-3">
                {result.roubo === null ? (
                  <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                ) : result.roubo ? (
                  <XCircle className="h-6 w-6 text-destructive" />
                ) : (
                  <CheckCircle className="h-6 w-6 text-success" />
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Roubo / Furto</p>
                  <p className="text-sm font-bold">
                    {result.roubo === null ? "Nao informado" : result.roubo ? "Alerta!" : "Sem registro"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Salvar consulta vinculada ao estoque</p>
              <div className="flex gap-2 flex-wrap">
                <Select value={veiculoVinculado} onValueChange={setVeiculoVinculado}>
                  <SelectTrigger className="flex-1 min-w-0">
                    <SelectValue placeholder="Selecione um veiculo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {veiculosDisponiveis.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.modelo} {v.ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={salvarConsulta} size="default">
                  <Save className="h-4 w-4 mr-1" /> Salvar consulta
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
