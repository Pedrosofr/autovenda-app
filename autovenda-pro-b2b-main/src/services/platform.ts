export interface PlatformStoreSummary {
  id: number;
  name: string;
  slug: string;
  status: "trial" | "active" | "past_due" | "blocked" | "closed";
  plan_code: string;
  max_users: number;
  trial_ends_at: string;
  users_count: number;
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
}) {
  return request<{ success: true; stores: PlatformStoreSummary[] }>("/api/platform/stores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePlatformStore(
  storeId: number,
  payload: { status?: PlatformStoreSummary["status"]; extendTrialDays?: number; trialDays?: number; maxUsers?: number },
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
