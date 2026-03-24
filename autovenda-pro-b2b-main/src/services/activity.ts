export interface AuditEvent {
  id: number;
  action: string;
  createdAt: string;
  tenantId: number | null;
  tenantName: string | null;
  actorName: string | null;
  payload: Record<string, unknown>;
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
    throw new Error((body as { error?: string }).error ?? "Nao foi possivel carregar as movimentacoes.");
  }

  return body as T;
}

export async function fetchPlatformActivity() {
  return request<{ events: AuditEvent[] }>("/api/platform/activity", { method: "GET" });
}

export async function fetchTenantActivity() {
  return request<{ events: AuditEvent[] }>("/api/tenant/activity", { method: "GET" });
}
