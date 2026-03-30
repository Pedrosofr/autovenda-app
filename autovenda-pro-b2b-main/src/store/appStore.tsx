import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  Veiculo,
  Lead,
  Vendedor,
  Venda,
  VendaCusto,
  ConsultaVeicular,
  TarefaPosVenda,
  CustoReparo,
  ConfiguracaoPrecos,
  MemoriaLoja,
} from "./types";
import { createEmptyAppState, type AppStateSnapshot } from "@/lib/app-state";
import { fetchAppState, updateAppState } from "@/services/app-state";
import { useAuth } from "@/lib/auth";

interface AppState {
  veiculos: Veiculo[];
  leads: Lead[];
  vendedores: Vendedor[];
  vendas: Venda[];
  consultas: ConsultaVeicular[];
  tarefasPosVenda: TarefaPosVenda[];
  custos: CustoReparo[];
  configPrecos: ConfiguracaoPrecos;
  memoriaLoja: MemoriaLoja;
}

interface AppStore extends AppState {
  loadingRemoteState: boolean;
  refreshRemoteState: () => Promise<void>;
  setVeiculos: React.Dispatch<React.SetStateAction<Veiculo[]>>;
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  addVeiculo: (v: Omit<Veiculo, "id" | "createdAt">) => void;
  updateVeiculo: (id: string, data: Partial<Veiculo>) => void;
  archiveVeiculo: (id: string) => void;
  trashVeiculo: (id: string) => void;
  restoreVeiculo: (id: string) => void;
  removeVeiculo: (id: string) => void;
  clearDeletedVeiculos: () => void;
  addLead: (l: Omit<Lead, "id">) => void;
  updateLead: (id: string, data: Partial<Lead>) => void;
  archiveLead: (id: string) => void;
  trashLead: (id: string) => void;
  restoreLead: (id: string) => void;
  removeLead: (id: string) => void;
  clearDeletedLeads: () => void;
  addVenda: (veiculoId: string, vendedorId: string, valor: number) => void;
  updateVendaCusto: (vendaId: string, custo: VendaCusto) => void;
  addConsulta: (c: Omit<ConsultaVeicular, "id">) => void;
  addTarefaPosVenda: (t: Omit<TarefaPosVenda, "id" | "criadoEm" | "status">) => void;
  updateTarefaPosVenda: (id: string, data: Partial<TarefaPosVenda>) => void;
  removeTarefaPosVenda: (id: string) => void;
  addCusto: (c: Omit<CustoReparo, "id" | "criadoEm">) => void;
  removeCusto: (id: string) => void;
  updateConfigPrecos: (cfg: ConfiguracaoPrecos) => void;
  updateMemoriaLoja: (data: Partial<MemoriaLoja>) => void;
  registrarAprendizadoLoja: (entrada: {
    modelo: string;
    titulo: string;
    descricao: string;
    categoria: string;
  }) => void;
}

const AppContext = createContext<AppStore | null>(null);
const EMPTY_STATE = createEmptyAppState();

function serialize(value: unknown) {
  return JSON.stringify(value);
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, tenant, user, isPlatformAdmin } = useAuth();
  const [veiculos, setVeiculos] = useState<Veiculo[]>(EMPTY_STATE.veiculos);
  const [leads, setLeads] = useState<Lead[]>(EMPTY_STATE.leads);
  const [vendedores, setVendedores] = useState<Vendedor[]>(EMPTY_STATE.vendedores);
  const [vendas, setVendas] = useState<Venda[]>(EMPTY_STATE.vendas);
  const [consultas, setConsultas] = useState<ConsultaVeicular[]>(EMPTY_STATE.consultas);
  const [tarefasPosVenda, setTarefasPosVenda] = useState<TarefaPosVenda[]>(EMPTY_STATE.tarefasPosVenda);
  const [custos, setCustos] = useState<CustoReparo[]>(EMPTY_STATE.custos);
  const [configPrecos, setConfigPrecos] = useState<ConfiguracaoPrecos>(EMPTY_STATE.configPrecos);
  const [memoriaLoja, setMemoriaLoja] = useState<MemoriaLoja>(EMPTY_STATE.memoriaLoja);
  const [loadingRemoteState, setLoadingRemoteState] = useState(true);
  const [remoteReady, setRemoteReady] = useState(false);
  const lastSyncedRef = useRef<Record<string, string>>({});

  const applySnapshot = useCallback((snapshot: AppStateSnapshot) => {
    setVeiculos(snapshot.veiculos);
    setLeads(snapshot.leads);
    setVendedores(snapshot.vendedores);
    setVendas(snapshot.vendas);
    setConsultas(snapshot.consultas);
    setTarefasPosVenda(snapshot.tarefasPosVenda);
    setCustos(snapshot.custos);
    setConfigPrecos(snapshot.configPrecos);
    setMemoriaLoja(snapshot.memoriaLoja);
    lastSyncedRef.current = {
      veiculos: serialize(snapshot.veiculos),
      leads: serialize(snapshot.leads),
      vendas: serialize(snapshot.vendas),
      consultas: serialize(snapshot.consultas),
      tarefasPosVenda: serialize(snapshot.tarefasPosVenda),
      custos: serialize(snapshot.custos),
      configPrecos: serialize(snapshot.configPrecos),
      memoriaLoja: serialize(snapshot.memoriaLoja),
    };
  }, []);

  const refreshRemoteState = useCallback(async () => {
    if (!tenant || isPlatformAdmin || !user) {
      applySnapshot(EMPTY_STATE);
      setLoadingRemoteState(false);
      setRemoteReady(true);
      return;
    }

    setLoadingRemoteState(true);
    setRemoteReady(false);

    try {
      const { state } = await fetchAppState();
      applySnapshot(state);
      setRemoteReady(true);
    } catch {
      // Em falhas temporarias do backend, preservamos o estado atual para nao apagar a tela.
      setRemoteReady(false);
    } finally {
      setLoadingRemoteState(false);
    }
  }, [applySnapshot, isPlatformAdmin, tenant, user]);

  useEffect(() => {
    if (authLoading) return;
    void refreshRemoteState();
  }, [authLoading, refreshRemoteState]);

  const syncResource = useCallback(
    <K extends keyof Omit<AppStateSnapshot, "vendedores">>(key: K, value: AppStateSnapshot[K]) => {
      if (authLoading || !tenant || !user || isPlatformAdmin || !remoteReady) return;
      const serialized = serialize(value);
      if (lastSyncedRef.current[key] === serialized) return;

      lastSyncedRef.current[key] = serialized;
      void updateAppState({ [key]: value } as Partial<AppStateSnapshot>).catch(() => {
        lastSyncedRef.current[key] = "";
        toast.error("Falha ao salvar. Verifique sua conexao.", { id: "sync-error", duration: 4000 });
      });
    },
    [authLoading, isPlatformAdmin, remoteReady, tenant, user],
  );

  useEffect(() => {
    syncResource("veiculos", veiculos);
  }, [syncResource, veiculos]);

  useEffect(() => {
    syncResource("leads", leads);
  }, [leads, syncResource]);

  useEffect(() => {
    syncResource("vendas", vendas);
  }, [syncResource, vendas]);

  useEffect(() => {
    syncResource("consultas", consultas);
  }, [consultas, syncResource]);

  useEffect(() => {
    syncResource("tarefasPosVenda", tarefasPosVenda);
  }, [syncResource, tarefasPosVenda]);

  useEffect(() => {
    syncResource("custos", custos);
  }, [custos, syncResource]);

  useEffect(() => {
    syncResource("configPrecos", configPrecos);
  }, [configPrecos, syncResource]);

  useEffect(() => {
    syncResource("memoriaLoja", memoriaLoja);
  }, [memoriaLoja, syncResource]);

  const addVeiculo = useCallback((v: Omit<Veiculo, "id" | "createdAt">) => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    setVeiculos((prev) => [{ ...v, id, createdAt } as Veiculo, ...prev]);
  }, []);

  const updateVeiculo = useCallback((id: string, data: Partial<Veiculo>) => {
    setVeiculos((prev) => prev.map((v) => (v.id === id ? { ...v, ...data } : v)));
  }, []);

  const archiveVeiculo = useCallback((id: string) => {
    const now = new Date().toISOString();
    setVeiculos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, archivedAt: now, deletedAt: undefined } : v)),
    );
  }, []);

  const trashVeiculo = useCallback((id: string) => {
    const now = new Date().toISOString();
    setVeiculos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, deletedAt: now, archivedAt: undefined } : v)),
    );
  }, []);

  const restoreVeiculo = useCallback((id: string) => {
    setVeiculos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, archivedAt: undefined, deletedAt: undefined } : v)),
    );
  }, []);

  const removeVeiculo = useCallback((id: string) => {
    setVeiculos((prev) => prev.filter((v) => v.id !== id));
    setVendas((prev) => prev.filter((venda) => venda.veiculoId !== id));
    setConsultas((prev) => prev.filter((consulta) => consulta.veiculoId !== id));
    setTarefasPosVenda((prev) => prev.filter((tarefa) => tarefa.veiculoId !== id));
    setLeads((prev) =>
      prev.map((lead) =>
        lead.veiculoId === id
          ? { ...lead, veiculoId: undefined, veiculoTexto: lead.interesse || "Veiculo removido" }
          : lead,
      ),
    );
  }, []);

  const clearDeletedVeiculos = useCallback(() => {
    const ids = new Set(veiculos.filter((v) => v.deletedAt).map((v) => v.id));
    if (ids.size === 0) return;
    setVeiculos((prev) => prev.filter((v) => !v.deletedAt));
    setVendas((prev) => prev.filter((venda) => !ids.has(venda.veiculoId)));
    setConsultas((prev) => prev.filter((consulta) => !consulta.veiculoId || !ids.has(consulta.veiculoId)));
    setTarefasPosVenda((prev) => prev.filter((tarefa) => !ids.has(tarefa.veiculoId)));
    setLeads((prev) =>
      prev.map((lead) =>
        lead.veiculoId && ids.has(lead.veiculoId)
          ? { ...lead, veiculoId: undefined, veiculoTexto: lead.interesse || "Veiculo removido" }
          : lead,
      ),
    );
  }, [veiculos]);

  const addLead = useCallback((l: Omit<Lead, "id">) => {
    const id = crypto.randomUUID();
    setLeads((prev) => [{ ...l, id } as Lead, ...prev]);
  }, []);

  const updateLead = useCallback((id: string, data: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
  }, []);

  const archiveLead = useCallback((id: string) => {
    const now = new Date().toISOString();
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, archivedAt: now, deletedAt: undefined } : lead)),
    );
  }, []);

  const trashLead = useCallback((id: string) => {
    const now = new Date().toISOString();
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, deletedAt: now, archivedAt: undefined } : lead)),
    );
  }, []);

  const restoreLead = useCallback((id: string) => {
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, archivedAt: undefined, deletedAt: undefined } : lead)),
    );
  }, []);

  const removeLead = useCallback((id: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  }, []);

  const clearDeletedLeads = useCallback(() => {
    setLeads((prev) => prev.filter((lead) => !lead.deletedAt));
  }, []);

  const addVenda = useCallback((veiculoId: string, vendedorId: string, valor: number) => {
    const data = new Date().toISOString().slice(0, 10);
    const vendaId = crypto.randomUUID();
    setVendas((prev) => [
      ...prev,
      { id: vendaId, veiculoId, vendedorId, valor, data },
    ]);
    setVeiculos((prev) =>
      prev.map((x) =>
        x.id === veiculoId
          ? {
              ...x,
              status: "vendido" as const,
              vendidoEm: data,
              vendedorId,
            }
          : x,
      ),
    );
  }, []);

  const updateVendaCusto = useCallback((vendaId: string, custo: VendaCusto) => {
    setVendas((prev) => prev.map((v) => (v.id === vendaId ? { ...v, custo } : v)));
  }, []);

  const addConsulta = useCallback((c: Omit<ConsultaVeicular, "id">) => {
    const id = crypto.randomUUID();
    setConsultas((prev) => [{ ...c, id } as ConsultaVeicular, ...prev]);
  }, []);

  const addTarefaPosVenda = useCallback((t: Omit<TarefaPosVenda, "id" | "criadoEm" | "status">) => {
    const id = crypto.randomUUID();
    const criadoEm = new Date().toISOString();
    setTarefasPosVenda((prev) => [{ ...t, id, criadoEm, status: "pendente" } as TarefaPosVenda, ...prev]);
  }, []);

  const updateTarefaPosVenda = useCallback((id: string, data: Partial<TarefaPosVenda>) => {
    setTarefasPosVenda((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
  }, []);

  const removeTarefaPosVenda = useCallback((id: string) => {
    setTarefasPosVenda((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addCusto = useCallback((c: Omit<CustoReparo, "id" | "criadoEm">) => {
    const id = crypto.randomUUID();
    const criadoEm = new Date().toISOString();
    setCustos((prev) => [{ ...c, id, criadoEm } as CustoReparo, ...prev]);
  }, []);

  const removeCusto = useCallback((id: string) => {
    setCustos((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateConfigPrecos = useCallback((cfg: ConfiguracaoPrecos) => {
    setConfigPrecos(cfg);
  }, []);

  const updateMemoriaLoja = useCallback((data: Partial<MemoriaLoja>) => {
    setMemoriaLoja((prev) => ({
      ...prev,
      ...data,
      atualizadoEm: new Date().toISOString(),
    }));
  }, []);

  const registrarAprendizadoLoja = useCallback((entrada: {
    modelo: string;
    titulo: string;
    descricao: string;
    categoria: string;
  }) => {
    setMemoriaLoja((prev) => {
      const trechoFinal = entrada.descricao
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(-2)
        .join(" ");

      const frasesRecorrentes = Array.from(
        new Set([trechoFinal, ...prev.frasesRecorrentes].filter(Boolean)),
      ).slice(0, 8);

      const focosComerciais = Array.from(
        new Set([
          ...prev.focosComerciais,
          ...(entrada.descricao.toLowerCase().includes("financi") ? ["financiamento"] : []),
          ...(entrada.descricao.toLowerCase().includes("troca") ? ["troca"] : []),
          ...(entrada.descricao.toLowerCase().includes("agende") ? ["agendamento"] : []),
          ...(entrada.descricao.toLowerCase().includes("whatsapp") ? ["whatsapp"] : []),
        ]),
      ).slice(0, 8);

      const categoriasMaisUsadas = Array.from(
        new Set([entrada.categoria, ...prev.categoriasMaisUsadas].filter(Boolean)),
      ).slice(0, 6);

      const exemplosRecentes = [
        {
          modelo: entrada.modelo,
          titulo: entrada.titulo,
          descricao: entrada.descricao,
          categoria: entrada.categoria,
          criadoEm: new Date().toISOString(),
        },
        ...prev.exemplosRecentes,
      ].slice(0, 6);

      return {
        ...prev,
        focosComerciais,
        frasesRecorrentes,
        categoriasMaisUsadas,
        exemplosRecentes,
        atualizadoEm: new Date().toISOString(),
      };
    });
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      veiculos,
      leads,
      vendedores,
      vendas,
      consultas,
      tarefasPosVenda,
      custos,
      configPrecos,
      memoriaLoja,
      loadingRemoteState,
      refreshRemoteState,
      setVeiculos,
      setLeads,
      addVeiculo,
      updateVeiculo,
      archiveVeiculo,
      trashVeiculo,
      restoreVeiculo,
      removeVeiculo,
      clearDeletedVeiculos,
      addLead,
      updateLead,
      archiveLead,
      trashLead,
      restoreLead,
      removeLead,
      clearDeletedLeads,
      addVenda,
      updateVendaCusto,
      addConsulta,
      addTarefaPosVenda,
      updateTarefaPosVenda,
      removeTarefaPosVenda,
      addCusto,
      removeCusto,
      updateConfigPrecos,
      updateMemoriaLoja,
      registrarAprendizadoLoja,
    }),
    [
      addConsulta,
      addCusto,
      addLead,
      addTarefaPosVenda,
      addVeiculo,
      addVenda,
      archiveLead,
      archiveVeiculo,
      clearDeletedLeads,
      clearDeletedVeiculos,
      configPrecos,
      consultas,
      custos,
      leads,
      loadingRemoteState,
      memoriaLoja,
      refreshRemoteState,
      registrarAprendizadoLoja,
      removeCusto,
      removeLead,
      removeTarefaPosVenda,
      removeVeiculo,
      restoreLead,
      restoreVeiculo,
      tarefasPosVenda,
      trashLead,
      trashVeiculo,
      updateConfigPrecos,
      updateLead,
      updateMemoriaLoja,
      updateTarefaPosVenda,
      updateVeiculo,
      updateVendaCusto,
      veiculos,
      vendedores,
      vendas,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
