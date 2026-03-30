import type { NfeDestinatario, NfeInfo } from "@/store/types";

export interface NfeConfigData {
  focusApiKey: string;
  ambiente: "homologacao" | "producao";
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual: string;
  regimeTributario: "1" | "2" | "3";
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
}

export interface NfeConfigView extends Omit<NfeConfigData, "focusApiKey"> {
  focusApiKey: string;
  hasSavedApiKey?: boolean;
  focusApiKeyMasked?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? "Erro na requisicao.");
  }
  return json as T;
}

export async function getNfeConfig(): Promise<{ config: NfeConfigView | null; enabled: boolean; configured: boolean }> {
  return request("/api/nfe/config");
}

export async function saveNfeConfig(config: NfeConfigData): Promise<{ success: true }> {
  return request("/api/nfe/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export interface EmitirNfeInput {
  vendaId: string;
  compradorNome: string;
  compradorCpfCnpj: string;
  compradorEmail?: string;
  compradorLogradouro: string;
  compradorNumero: string;
  compradorComplemento?: string;
  compradorBairro: string;
  compradorMunicipio: string;
  compradorCodigoMunicipio?: string;
  compradorUf: string;
  compradorCep: string;
  indicadorInscricaoEstadualDestinatario: NfeDestinatario["indicadorInscricaoEstadual"];
  inscricaoEstadualDestinatario?: string;
  formaPagamento: string;
}

export interface EmitirNfeResult {
  success: true;
  alreadyExists?: boolean;
  nfe: NfeInfo;
  venda: { id: string; nfe: NfeInfo };
}

export async function emitirNfe(input: EmitirNfeInput): Promise<EmitirNfeResult> {
  return request("/api/nfe/emitir", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function consultarNfe(vendaId: string, ref?: string): Promise<{ success: true; nfe: NfeInfo; venda?: { id: string; nfe: NfeInfo } }> {
  const params = new URLSearchParams({ vendaId });
  if (ref) params.set("ref", ref);
  return request(`/api/nfe/status?${params.toString()}`, {
    method: "GET",
  });
}

export async function cancelarNfe(vendaId: string, justificativa: string, ref?: string): Promise<{ success: true; nfe: NfeInfo }> {
  return request("/api/nfe/cancelar", {
    method: "POST",
    body: JSON.stringify({ vendaId, ref, justificativa }),
  });
}
