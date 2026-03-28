import type { Veiculo, Lead, Vendedor, Venda, ConsultaVeicular, TarefaPosVenda, CustoReparo, ConfiguracaoPrecos, MemoriaLoja } from "./types";
import { defaultConfigPrecos, defaultMemoriaLoja } from "./types";

const KEYS = {
  veiculos: "rozzcar_veiculos",
  leads: "rozzcar_leads",
  vendedores: "rozzcar_vendedores",
  vendas: "rozzcar_vendas",
  consultas: "rozzcar_consultas",
  tarefasPosVenda: "rozzcar_tarefas_pos_venda",
  custos: "rozzcar_custos",
  configPrecos: "rozzcar_config_precos",
  memoriaLoja: "rozzcar_memoria_loja",
} as const;

const WRITE_DELAY_MS = 180;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, string>();

function flushKey(key: string) {
  const value = pendingValues.get(key);
  if (value === undefined) return;
  localStorage.setItem(key, value);
  pendingValues.delete(key);
  const timeoutId = pendingWrites.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    pendingWrites.delete(key);
  }
}

function scheduleWrite(key: string, data: unknown) {
  const previous = pendingWrites.get(key);
  if (previous) {
    clearTimeout(previous);
  }

  pendingValues.set(key, JSON.stringify(data));
  const timeoutId = setTimeout(() => flushKey(key), WRITE_DELAY_MS);
  pendingWrites.set(key, timeoutId);
}

if (typeof window !== "undefined") {
  const flushAll = () => {
    Array.from(pendingValues.keys()).forEach(flushKey);
  };

  window.addEventListener("beforeunload", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushAll();
    }
  });
}

export function loadVeiculos(): Veiculo[] {
  try {
    const raw = localStorage.getItem(KEYS.veiculos);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVeiculos(data: Veiculo[]) {
  scheduleWrite(KEYS.veiculos, data);
}

export function loadLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(KEYS.leads);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLeads(data: Lead[]) {
  scheduleWrite(KEYS.leads, data);
}

export function loadVendedores(): Vendedor[] {
  try {
    const raw = localStorage.getItem(KEYS.vendedores);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVendedores(data: Vendedor[]) {
  scheduleWrite(KEYS.vendedores, data);
}

export function loadVendas(): Venda[] {
  try {
    const raw = localStorage.getItem(KEYS.vendas);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveVendas(data: Venda[]) {
  scheduleWrite(KEYS.vendas, data);
}

export function loadConsultas(): ConsultaVeicular[] {
  try {
    const raw = localStorage.getItem(KEYS.consultas);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConsultas(data: ConsultaVeicular[]) {
  scheduleWrite(KEYS.consultas, data);
}

export function loadTarefasPosVenda(): TarefaPosVenda[] {
  try {
    const raw = localStorage.getItem(KEYS.tarefasPosVenda);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTarefasPosVenda(data: TarefaPosVenda[]) {
  scheduleWrite(KEYS.tarefasPosVenda, data);
}

export function loadCustos(): CustoReparo[] {
  try {
    const raw = localStorage.getItem(KEYS.custos);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustos(data: CustoReparo[]) {
  scheduleWrite(KEYS.custos, data);
}

export function loadConfigPrecos(): ConfiguracaoPrecos {
  try {
    const raw = localStorage.getItem(KEYS.configPrecos);
    return raw ? { ...defaultConfigPrecos, ...JSON.parse(raw) } : { ...defaultConfigPrecos };
  } catch {
    return { ...defaultConfigPrecos };
  }
}

export function saveConfigPrecos(data: ConfiguracaoPrecos) {
  scheduleWrite(KEYS.configPrecos, data);
}

export function loadMemoriaLoja(): MemoriaLoja {
  try {
    const raw = localStorage.getItem(KEYS.memoriaLoja);
    return raw ? { ...defaultMemoriaLoja, ...JSON.parse(raw) } : { ...defaultMemoriaLoja };
  } catch {
    return { ...defaultMemoriaLoja };
  }
}

export function saveMemoriaLoja(data: MemoriaLoja) {
  scheduleWrite(KEYS.memoriaLoja, data);
}
