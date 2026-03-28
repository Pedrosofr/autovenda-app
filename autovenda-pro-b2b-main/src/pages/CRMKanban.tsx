import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  CalendarClock,
  Car,
  CheckCircle2,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/store/appStore";
import type { Lead, LeadSource, LeadStatus } from "@/store/types";

type LeadViewMode = "ativos" | "arquivados" | "lixeira";

const statusLabels: Record<LeadStatus, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  proposta: "Proposta",
  aprovacao: "Aprovacao",
  test_drive: "Test-drive",
  reservado: "Reservado",
  fechado: "Fechado",
  perdido: "Perdido",
};

const statusColors: Record<LeadStatus, string> = {
  novo: "bg-secondary/10 text-secondary",
  em_contato: "bg-primary/10 text-primary",
  proposta: "bg-violet-500/10 text-violet-500",
  aprovacao: "bg-indigo-500/10 text-indigo-500",
  test_drive: "bg-sky-500/10 text-sky-500",
  reservado: "bg-amber-500/10 text-amber-500",
  fechado: "bg-success/10 text-success",
  perdido: "bg-destructive/10 text-destructive",
};

const sourceLabels: Record<LeadSource, string> = {
  manual: "Manual",
  marketplace: "Marketplace",
  whatsapp: "WhatsApp",
  meta_ads: "Meta Ads",
};

const sourceColors: Record<LeadSource, string> = {
  manual: "bg-muted text-muted-foreground",
  marketplace: "bg-blue-500/10 text-blue-400",
  whatsapp: "bg-emerald-500/10 text-emerald-400",
  meta_ads: "bg-purple-500/10 text-purple-400",
};

const INTEREST_OPTIONS = ["Financiamento", "A vista", "Troca"] as const;

function parseMoney(value: string) {
  return parseFloat(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;
}

function buildHistoryEntry(message: string) {
  return `${new Date().toLocaleString("pt-BR")} - ${message}`;
}

function prependHistory(history: string[], message: string) {
  return [buildHistoryEntry(message), ...history].slice(0, 20);
}

function formatDateTimeLabel(value?: string) {
  if (!value) return "Nao agendado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao agendado";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CRMKanban() {
  const { user } = useAuth();
  const {
    leads,
    vendedores,
    veiculos,
    addLead,
    updateLead,
    updateVeiculo,
    addVenda,
    archiveLead,
    trashLead,
    restoreLead,
    removeLead,
    clearDeletedLeads,
  } = useAppStore();

  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [selectedNotes, setSelectedNotes] = useState("");
  const [viewMode, setViewMode] = useState<LeadViewMode>("ativos");
  const [newLead, setNewLead] = useState({
    nome: "",
    telefone: "",
    interesse: INTEREST_OPTIONS[0] as string,
    origem: "manual" as LeadSource,
    veiculoId: "none",
    vendedorId: "",
  });

  const sellerMembershipId = user?.role === "seller" ? user.membershipId : null;
  const scopedLeads = sellerMembershipId
    ? leads.filter((lead) => lead.vendedorId === sellerMembershipId)
    : leads;

  const veiculoNome = useMemo(
    () => Object.fromEntries(veiculos.map((v) => [v.id, `${v.modelo} ${v.ano}`.trim()])),
    [veiculos],
  );
  const veiculoMap = useMemo(
    () => Object.fromEntries(veiculos.map((v) => [v.id, v])),
    [veiculos],
  );
  const availableVehicles = useMemo(
    () => veiculos.filter((vehicle) => !vehicle.archivedAt && !vehicle.deletedAt && vehicle.status !== "vendido"),
    [veiculos],
  );

  const visibleLeads = useMemo(() => {
    if (viewMode === "arquivados") return scopedLeads.filter((lead) => lead.archivedAt && !lead.deletedAt);
    if (viewMode === "lixeira") return scopedLeads.filter((lead) => lead.deletedAt);
    return scopedLeads.filter((lead) => !lead.archivedAt && !lead.deletedAt);
  }, [scopedLeads, viewMode]);

  const counts = useMemo(
    () => ({
      ativos: scopedLeads.filter((lead) => !lead.archivedAt && !lead.deletedAt).length,
      arquivados: scopedLeads.filter((lead) => lead.archivedAt && !lead.deletedAt).length,
      lixeira: scopedLeads.filter((lead) => lead.deletedAt).length,
    }),
    [scopedLeads],
  );

  const operationalCards = useMemo(
    () => [
      {
        label: "Em andamento",
        value: scopedLeads.filter((lead) => ["novo", "em_contato", "proposta", "test_drive"].includes(lead.status)).length,
        icon: Users,
      },
      {
        label: "Reservas",
        value: scopedLeads.filter((lead) => lead.status === "reservado").length,
        icon: CalendarClock,
      },
      {
        label: "Fechados",
        value: scopedLeads.filter((lead) => lead.status === "fechado").length,
        icon: CheckCircle2,
      },
      {
        label: "Perdidos",
        value: scopedLeads.filter((lead) => lead.status === "perdido").length,
        icon: TrendingUp,
      },
    ],
    [scopedLeads],
  );

  const vendedorNome = (id: string) => vendedores.find((v) => v.id === id)?.nome ?? "Nao definido";
  const interesseLead = (lead: Lead) =>
    [lead.veiculoTexto, lead.interesse].filter(Boolean).join(" · ") || "Nao definido";
  const veiculoSelecionado = selected?.veiculoId ? veiculoMap[selected.veiculoId] : undefined;

  const updateSelectedLead = (leadId: string, data: Partial<Lead>) => {
    updateLead(leadId, data);
    setSelected((prev) => (prev?.id === leadId ? { ...prev, ...data } : prev));
  };

  const handleStatusChange = (lead: Lead, nextStatus: LeadStatus) => {
    if (lead.status === nextStatus) return;

    const patch: Partial<Lead> = {
      status: nextStatus,
      historico: prependHistory(lead.historico, `Status alterado para ${statusLabels[nextStatus]}`),
    };

    if ((nextStatus === "perdido" || nextStatus === "em_contato") && lead.veiculoId) {
      const linkedVehicle = veiculoMap[lead.veiculoId];
      if (linkedVehicle?.status === "reservado") {
        updateVeiculo(linkedVehicle.id, { status: "disponivel" });
      }
      patch.reservadoAte = undefined;
    }

    if (nextStatus === "perdido" && !lead.motivoPerda) {
      patch.motivoPerda = "";
    }

    updateSelectedLead(lead.id, patch);
  };

  const add = () => {
    if (!newLead.nome || !newLead.telefone) return;

    const veiculoId = newLead.veiculoId === "none" ? undefined : newLead.veiculoId;
    const veiculoTexto = veiculoId ? veiculoNome[veiculoId] : undefined;

    addLead({
      nome: newLead.nome,
      telefone: newLead.telefone,
      interesse: newLead.interesse,
      origem: newLead.origem,
      veiculoId,
      veiculoTexto,
      vendedorId: sellerMembershipId || newLead.vendedorId || vendedores[0]?.id || "",
      data: new Date().toISOString().slice(0, 10),
      status: "novo",
      historico: [buildHistoryEntry(`Lead criado via ${sourceLabels[newLead.origem]}`)],
      anotacoes: "",
      proximaAcao: "Primeiro contato",
      proximaAcaoEm: new Date().toISOString().slice(0, 10),
    });

    setNewLead({
      nome: "",
      telefone: "",
      interesse: INTEREST_OPTIONS[0],
      origem: "manual",
      veiculoId: "none",
      vendedorId: "",
    });
    setShowNew(false);
  };

  const handleArchive = (lead: Lead) => {
    archiveLead(lead.id);
    if (selected?.id === lead.id) setSelected(null);
  };

  const handleTrash = (lead: Lead) => {
    if (lead.veiculoId) {
      const linkedVehicle = veiculoMap[lead.veiculoId];
      if (linkedVehicle?.status === "reservado") {
        updateVeiculo(linkedVehicle.id, { status: "disponivel" });
      }
    }
    trashLead(lead.id);
    if (selected?.id === lead.id) setSelected(null);
  };

  const handleRestore = (lead: Lead) => {
    restoreLead(lead.id);
    if (selected?.id === lead.id) setSelected(null);
  };

  const handlePermanentDelete = (lead: Lead) => {
    if (!window.confirm(`Excluir permanentemente o lead "${lead.nome}"?`)) return;
    removeLead(lead.id);
    if (selected?.id === lead.id) setSelected(null);
  };

  const handleClearTrash = () => {
    if (!counts.lixeira) return;
    if (!window.confirm("Excluir todos os leads da lixeira permanentemente?")) return;
    clearDeletedLeads();
    if (selected?.deletedAt) setSelected(null);
  };

  const handleReserveVehicle = (lead: Lead) => {
    if (!lead.veiculoId) return;
    const linkedVehicle = veiculoMap[lead.veiculoId];
    if (!linkedVehicle || linkedVehicle.status !== "disponivel") return;

    updateVeiculo(linkedVehicle.id, { status: "reservado" });
    updateSelectedLead(lead.id, {
      status: "reservado",
      reservadoAte: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      historico: prependHistory(lead.historico, `Veiculo ${linkedVehicle.modelo} reservado para este lead`),
    });
  };

  const handleReleaseVehicle = (lead: Lead) => {
    if (!lead.veiculoId) return;
    const linkedVehicle = veiculoMap[lead.veiculoId];
    if (!linkedVehicle || linkedVehicle.status !== "reservado") return;

    updateVeiculo(linkedVehicle.id, { status: "disponivel" });
    updateSelectedLead(lead.id, {
      status: "em_contato",
      reservadoAte: undefined,
      historico: prependHistory(lead.historico, `Reserva do veiculo ${linkedVehicle.modelo} liberada`),
    });
  };

  const handleConvertToSale = (lead: Lead) => {
    if (!lead.veiculoId) return;
    const linkedVehicle = veiculoMap[lead.veiculoId];
    if (!linkedVehicle || linkedVehicle.status === "vendido") return;

    addVenda(linkedVehicle.id, lead.vendedorId, parseMoney(linkedVehicle.valorVenda));
    updateSelectedLead(lead.id, {
      status: "fechado",
      reservadoAte: undefined,
      valorProposta: parseMoney(linkedVehicle.valorVenda),
      historico: prependHistory(lead.historico, `Venda confirmada para o veiculo ${linkedVehicle.modelo}`),
    });
  };

  useEffect(() => {
    setSelectedNotes(selected?.anotacoes ?? "");
  }, [selected]);

  useEffect(() => {
    if (!showNew) return;

    setNewLead((current) => {
      if (current.veiculoId === "none") return current;
      const existsInStock = availableVehicles.some((vehicle) => vehicle.id === current.veiculoId);
      return existsInStock ? current : { ...current, veiculoId: "none" };
    });
  }, [availableVehicles, showNew]);

  const persistSelectedNotes = () => {
    if (!selected) return;
    if ((selected.anotacoes ?? "") === selectedNotes) return;
    updateSelectedLead(selected.id, { anotacoes: selectedNotes });
  };

  const renderLeadActions = (lead: Lead) => (
    <div className="flex items-center justify-end gap-1">
      {viewMode === "ativos" && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              handleArchive(lead);
            }}
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              handleTrash(lead);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
      {viewMode !== "ativos" && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          onClick={(event) => {
            event.stopPropagation();
            handleRestore(lead);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      {viewMode === "lixeira" && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            handlePermanentDelete(lead);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fluxo comercial simples: atendimento, reserva, venda e pos-venda sem retrabalho.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["ativos", "arquivados", "lixeira"] as LeadViewMode[]).map((mode) => (
            <Button key={mode} variant={viewMode === mode ? "default" : "outline"} size="sm" onClick={() => setViewMode(mode)}>
              {mode === "ativos" ? "Ativos" : mode === "arquivados" ? "Arquivados" : "Lixeira"}
              <span className="ml-1 opacity-70">{counts[mode]}</span>
            </Button>
          ))}
          {viewMode === "lixeira" && counts.lixeira > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearTrash}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir tudo
            </Button>
          )}
          {viewMode === "ativos" && (
            <Button onClick={() => setShowNew(true)} size="lg">
              <Plus className="h-5 w-5 mr-2" /> Novo Lead
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {operationalCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Interesse</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[150px] text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLeads.map((lead) => (
              <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(lead)}>
                <TableCell className="font-medium">{lead.nome}</TableCell>
                <TableCell>{lead.telefone}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={sourceColors[lead.origem]}>
                    {sourceLabels[lead.origem]}
                  </Badge>
                </TableCell>
                <TableCell>{interesseLead(lead)}</TableCell>
                <TableCell>{lead.data}</TableCell>
                <TableCell>{vendedorNome(lead.vendedorId)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[lead.status]}>
                    {statusLabels[lead.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{renderLeadActions(lead)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visibleLeads.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {viewMode === "ativos" && "Nenhum lead ativo."}
            {viewMode === "arquivados" && "Nenhum lead arquivado."}
            {viewMode === "lixeira" && "A lixeira esta vazia."}
          </div>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {visibleLeads.map((lead) => (
          <button key={lead.id} type="button" className="w-full rounded-xl border bg-card p-4 text-left" onClick={() => setSelected(lead)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{lead.nome}</p>
                <p className="text-sm text-muted-foreground mt-1">{lead.telefone}</p>
              </div>
              <Badge variant="outline" className={statusColors[lead.status]}>
                {statusLabels[lead.status]}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className={sourceColors[lead.origem]}>
                {sourceLabels[lead.origem]}
              </Badge>
              <span className="text-xs text-muted-foreground">{lead.data}</span>
            </div>
            <p className="text-sm mt-3 text-foreground/80">{interesseLead(lead)}</p>
            <div className="flex items-center justify-between gap-2 mt-3">
              <span className="text-xs text-muted-foreground">{vendedorNome(lead.vendedorId)}</span>
              {renderLeadActions(lead)}
            </div>
          </button>
        ))}
        {visibleLeads.length === 0 && (
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm">
            {viewMode === "ativos" && "Nenhum lead ativo."}
            {viewMode === "arquivados" && "Nenhum lead arquivado."}
            {viewMode === "lixeira" && "A lixeira esta vazia."}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => { persistSelectedNotes(); setSelected(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.nome}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Telefone</span>
                  <p className="font-medium">{selected.telefone}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Origem</span>
                  <p className="font-medium">{sourceLabels[selected.origem]}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Interesse</span>
                  <p className="font-medium">{interesseLead(selected)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Vendedor</span>
                  <p className="font-medium">{vendedorNome(selected.vendedorId)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Status</span>
                  <Select value={selected.status} onValueChange={(value) => handleStatusChange(selected, value as LeadStatus)}>
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(statusLabels) as LeadStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Proxima acao</span>
                  <Input
                    className="mt-1"
                    value={selected.proximaAcao ?? ""}
                    onChange={(event) => updateSelectedLead(selected.id, { proximaAcao: event.target.value })}
                    placeholder="Ex.: ligar e enviar proposta"
                  />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Data da proxima acao</span>
                  <Input
                    className="mt-1"
                    type="date"
                    value={selected.proximaAcaoEm ?? ""}
                    onChange={(event) => updateSelectedLead(selected.id, { proximaAcaoEm: event.target.value || undefined })}
                  />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Valor da proposta</span>
                  <Input
                    className="mt-1"
                    type="number"
                    min="0"
                    value={selected.valorProposta ?? ""}
                    onChange={(event) => updateSelectedLead(selected.id, { valorProposta: event.target.value ? Number(event.target.value) : null })}
                    placeholder="Ex.: 68900"
                  />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Test-drive em</span>
                  <Input
                    className="mt-1"
                    type="datetime-local"
                    value={selected.testDriveAt ? selected.testDriveAt.slice(0, 16) : ""}
                    onChange={(event) =>
                      updateSelectedLead(selected.id, {
                        testDriveAt: event.target.value ? new Date(event.target.value).toISOString() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Reserva ate</span>
                  <Input
                    className="mt-1"
                    type="date"
                    value={selected.reservadoAte ?? ""}
                    onChange={(event) => updateSelectedLead(selected.id, { reservadoAte: event.target.value || undefined })}
                  />
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Motivo da perda</span>
                  <Input
                    className="mt-1"
                    value={selected.motivoPerda ?? ""}
                    onChange={(event) => updateSelectedLead(selected.id, { motivoPerda: event.target.value || undefined })}
                    placeholder="Preencha se o lead for perdido"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Resumo operacional</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {selected.proximaAcao ? `Proximo passo: ${selected.proximaAcao}.` : "Defina o proximo passo para este lead."}
                  {selected.proximaAcaoEm ? ` Prazo: ${formatDateTimeLabel(selected.proximaAcaoEm)}.` : ""}
                </p>
                {selected.testDriveAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">Test-drive marcado para {formatDateTimeLabel(selected.testDriveAt)}.</p>
                ) : null}
              </div>

              <div>
                <Label className="text-xs">Historico</Label>
                <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                  {selected.historico.length > 0 ? selected.historico.map((entry, index) => (
                    <div key={`${selected.id}-history-${index}`} className="text-sm bg-muted/50 px-3 py-1.5 rounded-md">
                      {entry}
                    </div>
                  )) : (
                    <div className="text-sm bg-muted/50 px-3 py-1.5 rounded-md">Sem historico ainda.</div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs">Anotacoes</Label>
                <Textarea
                  value={selectedNotes}
                  onChange={(event) => setSelectedNotes(event.target.value)}
                  onBlur={persistSelectedNotes}
                  placeholder="Anotacoes..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              {veiculoSelecionado && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-xs">Fluxo comercial</Label>
                      <p className="text-sm font-medium mt-1">{veiculoSelecionado.modelo} {veiculoSelecionado.ano}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{veiculoSelecionado.status}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={veiculoSelecionado.status !== "disponivel"}
                      onClick={() => handleReserveVehicle(selected)}
                    >
                      <CalendarClock className="h-4 w-4 mr-2" /> Reservar
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={veiculoSelecionado.status !== "reservado"}
                      onClick={() => handleReleaseVehicle(selected)}
                    >
                      <Car className="h-4 w-4 mr-2" /> Liberar
                    </Button>
                    <Button
                      className="justify-start"
                      disabled={veiculoSelecionado.status === "vendido"}
                      onClick={() => handleConvertToSale(selected)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Converter em venda
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A reserva atualiza o estoque. A venda fecha o lead, marca o veiculo como vendido e cria o checklist inicial do pos-venda.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={() => window.open(`tel:${selected.telefone.replace(/\D/g, "")}`)}>
                  <Phone className="h-4 w-4 mr-1" /> Ligar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => window.open(`https://wa.me/55${selected.telefone.replace(/\D/g, "")}`, "_blank")}
                >
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {!selected.archivedAt && !selected.deletedAt && (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => handleArchive(selected)}>
                      <Archive className="h-4 w-4 mr-2" /> Arquivar
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => handleTrash(selected)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Lixeira
                    </Button>
                  </>
                )}
                {(selected.archivedAt || selected.deletedAt) && (
                  <Button variant="outline" className="flex-1" onClick={() => handleRestore(selected)}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Restaurar
                  </Button>
                )}
                {selected.deletedAt && (
                  <Button variant="destructive" className="flex-1" onClick={() => handlePermanentDelete(selected)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={newLead.nome} onChange={(event) => setNewLead({ ...newLead, nome: event.target.value })} placeholder="Nome completo" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={newLead.telefone} onChange={(event) => setNewLead({ ...newLead, telefone: event.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={newLead.origem} onValueChange={(value) => setNewLead({ ...newLead, origem: value as LeadSource })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(sourceLabels) as LeadSource[]).map((source) => (
                    <SelectItem key={source} value={source}>
                      {sourceLabels[source]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Veiculo</Label>
              <Select
                value={newLead.veiculoId}
                onValueChange={(value) => setNewLead({ ...newLead, veiculoId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um veiculo do estoque" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nao definido</SelectItem>
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {veiculoNome[vehicle.id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Interesse</Label>
              <Select value={newLead.interesse} onValueChange={(value) => setNewLead({ ...newLead, interesse: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de interesse" />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_OPTIONS.map((interest) => (
                    <SelectItem key={interest} value={interest}>
                      {interest}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              {sellerMembershipId ? (
                <>
                  <Label>Vendedor responsavel</Label>
                  <Input value={vendedorNome(sellerMembershipId)} readOnly className="bg-muted/40" />
                </>
              ) : (
                <>
                  <Label>Vendedor</Label>
                  <Select value={newLead.vendedorId} onValueChange={(value) => setNewLead({ ...newLead, vendedorId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((vendedor) => (
                        <SelectItem key={vendedor.id} value={vendedor.id}>
                          {vendedor.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <Button onClick={add} className="w-full" disabled={!newLead.nome || !newLead.telefone}>
              <Plus className="h-4 w-4 mr-1" /> Cadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
