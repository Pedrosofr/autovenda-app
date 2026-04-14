export interface PlatformStoreSummary {
  id: number;
  name: string;
  slug: string;
  status: "trial" | "active" | "past_due" | "blocked" | "closed";
  plan_code: string;
  max_users: number;
  max_vehicles: number;
  trial_ends_at: string;
  nfe_enabled: number;
  nfe_configured: number;
  users_count: number;
  vehicles_count: number;
  owner_name: string | null;
  owner_email: string | null;
}

export interface PlatformStoreMember {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  ativo: number;
  meta_mensal: number | null;
  criado_em: string;
}

export interface PlatformStoreNfeConfig {
  focusApiKey: string;
  focusApiKeyMasked: string;
  hasSavedApiKey: boolean;
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

export interface PlatformStoreNfeSettings {
  enabled: boolean;
  configured: boolean;
  config: PlatformStoreNfeConfig | null;
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? "Nao foi possivel concluir a operacao.");
  }

  return body as T;
}

export async function fetchPlatformStores() {
  return request<{ stores: PlatformStoreSummary[] }>("/api/platform/stores", {
    method: "GET",
  });
}

export async function createPlatformStore(payload: {
  storeName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  trialDays: number;
  maxUsers: number;
  maxVehicles: number;
}) {
  return request<{ success: true; stores: PlatformStoreSummary[] }>("/api/platform/stores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePlatformStore(
  storeId: number,
  payload: { status?: PlatformStoreSummary["status"]; extendTrialDays?: number; trialDays?: number; maxUsers?: number; maxVehicles?: number; nfeEnabled?: boolean },
) {
  return request<{ success: true; stores: PlatformStoreSummary[] }>(`/api/platform/stores/${storeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchPlatformStoreUsers(storeId: number) {
  return request<{ members: PlatformStoreMember[] }>(`/api/platform/stores/${storeId}/team`, {
    method: "GET",
  });
}

export async function createPlatformStoreUser(
  storeId: number,
  payload: {
    name: string;
    email: string;
    password: string;
    role: "owner" | "seller";
    salesGoalMonthly?: number | null;
  },
) {
  return request<{ success: true; members: PlatformStoreMember[] }>(`/api/platform/stores/${storeId}/team`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPlatformStoreNfeConfig(storeId: number) {
  return request<PlatformStoreNfeSettings>(`/api/platform/stores/${storeId}/nfe-config`, {
    method: "GET",
  });
}

export async function updatePlatformStoreNfeConfig(
  storeId: number,
  payload: Omit<PlatformStoreNfeConfig, "focusApiKeyMasked" | "hasSavedApiKey">,
) {
  return request<{ success: true } & PlatformStoreNfeSettings>(`/api/platform/stores/${storeId}/nfe-config`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
