export interface TeamMember {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  ativo: number;
  meta_mensal: number | null;
  seller_permissions: string | null;
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

export async function fetchTeamMembers() {
  return request<{ members: TeamMember[] }>("/api/tenant/team", {
    method: "GET",
  });
}

export async function createSeller(payload: {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  return request<{ success: true; members: TeamMember[] }>("/api/tenant/team", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMemberPermissions(memberId: number, permissions: Record<string, boolean>) {
  return request<{ success: true }>(`/api/tenant/members/${memberId}/permissions`, {
    method: "PATCH",
    body: JSON.stringify(permissions),
  });
}
