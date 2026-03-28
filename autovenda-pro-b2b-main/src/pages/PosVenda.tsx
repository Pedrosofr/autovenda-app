import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Droplets,
  FileText,
  Key,
  ListChecks,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Wrench,
} from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { TarefaPosVendaCategoria } from "@/store/types";

const CHECKLIST_PADRAO: {
  titulo: string;
  categoria: TarefaPosVendaCategoria;
  icon: ReactNode;
}[] = [
  { titulo: "Entregar documento do veiculo", categoria: "documento", icon: <FileText className="h-4 w-4" /> },
  { titulo: "Transferir propriedade (DUT)", categoria: "documento", icon: <ClipboardList className="h-4 w-4" /> },
  { titulo: "Entregar chave reserva", categoria: "entrega", icon: <Key className="h-4 w-4" /> },
  { titulo: "Higienizacao completa", categoria: "limpeza", icon: <Droplets className="h-4 w-4" /> },
  { titulo: "Polimento e cristalizacao", categoria: "limpeza", icon: <Sparkles className="h-4 w-4" /> },
  { titulo: "Pintar peca / retoque pintura", categoria: "reparo", icon: <Wrench className="h-4 w-4" /> },
  { titulo: "Trocar / calibrar pneus", categoria: "reparo", icon: <Wrench className="h-4 w-4" /> },
  { titulo: "Consertar retrovisor", categoria: "reparo", icon: <Wrench className="h-4 w-4" /> },
  { titulo: "Revisao mecanica geral", categoria: "reparo", icon: <ShieldCheck className="h-4 w-4" /> },
  { titulo: "Pagar multas pendentes", categoria: "multa", icon: <AlertTriangle className="h-4 w-4" /> },
  { titulo: "Pagar IPVA / licenciamento", categoria: "multa", icon: <Receipt className="h-4 w-4" /> },
  { titulo: "Entregar veiculo ao cliente", categoria: "entrega", icon: <Truck className="h-4 w-4" /> },
];

const CATEGORIA_CORES: Record<TarefaPosVendaCategoria, string> = {
  documento: "text-blue-400",
  reparo: "text-orange-400",
  limpeza: "text-cyan-400",
  multa: "text-red-400",
  entrega: "text-green-400",
  outro: "text-purple-400",
};

export default function PosVenda() {
  const {
    vendas,
    veiculos,
    vendedores,
    tarefasPosVenda,
    addTarefaPosVenda,
    updateTarefaPosVenda,
    removeTarefaPosVenda,
  } = useAppStore();

  const [dialogVendaId, setDialogVendaId] = useState<string | null>(null);
  const [checklistSelecionados, setChecklistSelecionados] = useState<Set<string>>(new Set());
  const [tarefaCustom, setTarefaCustom] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const vendasAtivas = useMemo(() => {
    return vendas
      .map((venda) => {
        const veiculo = veiculos.find((item) => item.id === venda.veiculoId);
        const vendedor = vendedores.find((item) => item.id === venda.vendedorId);
        const tarefas = tarefasPosVenda.filter((item) => item.vendaId === venda.id);
        const pendentes = tarefas.filter((item) => item.status !== "concluida");
        const concluidas = tarefas.filter((item) => item.status === "concluida");
        const progresso = tarefas.length > 0 ? Math.round((concluidas.length / tarefas.length) * 100) : -1;

        return { venda, veiculo, vendedor, tarefas, pendentes, concluidas, progresso };
      })
      .sort((a, b) => {
        if (a.pendentes.length > 0 && b.pendentes.length === 0) return -1;
        if (a.pendentes.length === 0 && b.pendentes.length > 0) return 1;
        return new Date(b.venda.data).getTime() - new Date(a.venda.data).getTime();
      });
  }, [vendas, veiculos, vendedores, tarefasPosVenda]);

  const totalPendentes = useMemo(
    () => tarefasPosVenda.filter((item) => item.status !== "concluida").length,
    [tarefasPosVenda],
  );

  function toggleExpandido(vendaId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(vendaId)) next.delete(vendaId);
      else next.add(vendaId);
      return next;
    });
  }

  function toggleChecklist(titulo: string) {
    setChecklistSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(titulo)) next.delete(titulo);
      else next.add(titulo);
      return next;
    });
  }

  function handleConfirmarChecklist() {
    if (!dialogVendaId) return;
    const venda = vendas.find((item) => item.id === dialogVendaId);
    if (!venda) return;

    checklistSelecionados.forEach((titulo) => {
      const item = CHECKLIST_PADRAO.find((checklist) => checklist.titulo === titulo);
      addTarefaPosVenda({
        vendaId: dialogVendaId,
        veiculoId: venda.veiculoId,
        titulo,
        categoria: item?.categoria ?? "outro",
      });
    });

    if (tarefaCustom.trim()) {
      addTarefaPosVenda({
        vendaId: dialogVendaId,
        veiculoId: venda.veiculoId,
        titulo: tarefaCustom.trim(),
        categoria: "outro",
      });
    }

    setChecklistSelecionados(new Set());
    setTarefaCustom("");
    setDialogVendaId(null);
  }

  function handleToggleConcluida(tarefaId: string, concluida: boolean) {
    if (concluida) {
      updateTarefaPosVenda(tarefaId, { status: "pendente", concluidoEm: undefined });
      return;
    }

    updateTarefaPosVenda(tarefaId, {
      status: "concluida",
      concluidoEm: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ListChecks className="h-7 w-7 text-secondary" />
          Pos-venda
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Checklist de pendencias para cada veiculo vendido.</p>
      </div>

      {totalPendentes > 0 && (
        <div className="animate-fade-up flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-400" />
          <p className="text-sm text-yellow-200">
            <span className="font-bold">{totalPendentes}</span>{" "}
            {totalPendentes === 1 ? "pendencia para resolver" : "pendencias para resolver"}
          </p>
        </div>
      )}

      {vendas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Car className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>Nenhuma venda registrada ainda.</p>
            <p className="mt-1 text-xs">Marque veiculos como vendidos no estoque para iniciar o checklist.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {vendasAtivas.map((item, index) => {
            const temPendencias = item.pendentes.length > 0;
            const semTarefas = item.tarefas.length === 0;
            const tudoOk = item.tarefas.length > 0 && item.pendentes.length === 0;
            const aberto = expandidos.has(item.venda.id);

            return (
              <Card
                key={item.venda.id}
                className={`animate-fade-up stagger-${Math.min(index + 1, 5)} border ${
                  temPendencias
                    ? "border-yellow-500/20"
                    : tudoOk
                      ? "border-emerald-500/20"
                      : "border-border"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => toggleExpandido(item.venda.id)}
                    >
                      {aberto ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div
                        className={`rounded-xl p-2.5 ${
                          temPendencias
                            ? "bg-yellow-500/10"
                            : tudoOk
                              ? "bg-emerald-500/10"
                              : "bg-muted/50"
                        }`}
                      >
                        <Car
                          className={`h-5 w-5 ${
                            temPendencias
                              ? "text-yellow-400"
                              : tudoOk
                                ? "text-emerald-400"
                                : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base">{item.veiculo?.modelo ?? "Veiculo"}</CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Vendido em {new Date(item.venda.data).toLocaleDateString("pt-BR")}
                          {item.vendedor ? ` · Vendedor: ${item.vendedor.nome}` : ""}
                        </p>
                      </div>
                    </button>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {item.progresso >= 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                item.progresso === 100
                                  ? "bg-emerald-400"
                                  : item.progresso > 50
                                    ? "bg-yellow-400"
                                    : "bg-orange-400"
                              }`}
                              style={{ width: `${item.progresso}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                            {item.progresso}%
                          </span>
                        </div>
                      )}

                      {tudoOk && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Tudo OK
                        </Badge>
                      )}

                      {temPendencias && (
                        <Badge
                          variant="outline"
                          className="border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                        >
                          {item.pendentes.length} {item.pendentes.length === 1 ? "pendente" : "pendentes"}
                        </Badge>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 border-secondary/30 text-secondary hover:bg-secondary/10 sm:w-auto"
                        onClick={() => {
                          setDialogVendaId(item.venda.id);
                          setChecklistSelecionados(new Set());
                          setTarefaCustom("");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {aberto && item.tarefas.length > 0 && (
                  <CardContent className="space-y-1.5 pt-0">
                    {item.tarefas.map((tarefa) => {
                      const concluida = tarefa.status === "concluida";
                      const corCategoria = CATEGORIA_CORES[tarefa.categoria];
                      const itemChecklist = CHECKLIST_PADRAO.find((checklist) => checklist.titulo === tarefa.titulo);

                      return (
                        <div
                          key={tarefa.id}
                          className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                            concluida
                              ? "border-emerald-500/10 bg-emerald-500/5"
                              : "border-transparent bg-muted/20 hover:border-secondary/20"
                          }`}
                          onClick={() => handleToggleConcluida(tarefa.id, concluida)}
                        >
                          {concluida ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-secondary" />
                          )}

                          <span className={`shrink-0 ${concluida ? "text-emerald-400/50" : corCategoria}`}>
                            {itemChecklist?.icon ?? <ClipboardList className="h-4 w-4" />}
                          </span>

                          <span
                            className={`flex-1 text-sm ${
                              concluida ? "text-muted-foreground line-through" : "text-foreground"
                            }`}
                          >
                            {tarefa.titulo}
                          </span>

                          {tarefa.concluidoEm && (
                            <span className="shrink-0 text-[10px] text-emerald-400/60">
                              {new Date(tarefa.concluidoEm).toLocaleDateString("pt-BR")}
                            </span>
                          )}

                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              removeTarefaPosVenda(tarefa.id);
                            }}
                            className="shrink-0 text-muted-foreground/30 transition-colors sm:text-transparent sm:group-hover:text-muted-foreground hover:!text-red-400"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </CardContent>
                )}

                {aberto && semTarefas && (
                  <CardContent className="pt-0">
                    <button
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/20 py-4 text-sm text-muted-foreground transition-colors hover:border-secondary/30 hover:text-secondary"
                      onClick={() => {
                        setDialogVendaId(item.venda.id);
                        setChecklistSelecionados(new Set());
                        setTarefaCustom("");
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Criar checklist de pendencias
                    </button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogVendaId !== null}
        onOpenChange={(open) => {
          if (!open) setDialogVendaId(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto border-border bg-card sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-secondary" />
              Selecione as pendencias
            </DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Marque tudo que precisa ser feito antes de finalizar esta venda.
            </p>
          </DialogHeader>

          <div className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {CHECKLIST_PADRAO.map((item) => {
              const selecionado = checklistSelecionados.has(item.titulo);
              const jaExiste = tarefasPosVenda.some(
                (tarefa) => tarefa.vendaId === dialogVendaId && tarefa.titulo === item.titulo,
              );

              return (
                <button
                  key={item.titulo}
                  onClick={() => !jaExiste && toggleChecklist(item.titulo)}
                  disabled={jaExiste}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all ${
                    jaExiste
                      ? "cursor-not-allowed bg-muted/10 opacity-30"
                      : selecionado
                        ? "border-secondary/30 bg-secondary/10"
                        : "border-transparent bg-muted/20 hover:border-muted-foreground/20"
                  }`}
                >
                  {jaExiste ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  ) : selecionado ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={`shrink-0 ${CATEGORIA_CORES[item.categoria]}`}>{item.icon}</span>
                  <span className="flex-1 text-sm text-foreground">{item.titulo}</span>
                  {jaExiste && <span className="text-[10px] text-muted-foreground">Ja adicionada</span>}
                </button>
              );
            })}

            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-2 text-xs text-muted-foreground">Outra pendencia?</p>
              <Input
                placeholder="Ex.: trocar tapetes, instalar som..."
                value={tarefaCustom}
                onChange={(event) => setTarefaCustom(event.target.value)}
              />
            </div>
          </div>

          <Button
            className="mt-2 w-full gap-2 bg-secondary hover:bg-secondary/80"
            onClick={handleConfirmarChecklist}
            disabled={checklistSelecionados.size === 0 && !tarefaCustom.trim()}
          >
            <Plus className="h-4 w-4" />
            Adicionar {checklistSelecionados.size + (tarefaCustom.trim() ? 1 : 0)}{" "}
            {checklistSelecionados.size + (tarefaCustom.trim() ? 1 : 0) === 1 ? "pendencia" : "pendencias"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
