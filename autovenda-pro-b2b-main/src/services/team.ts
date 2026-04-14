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

export interface TeamInvite {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  meta_mensal: number | null;
  status: "pending" | "expired" | "accepted" | "revoked";
  expires_em: string;
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
  return request<{ members: TeamMember[]; invites: TeamInvite[] }>("/api/tenant/team", {
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

export async function inviteTeamMember(payload: {
  name: string;
  email: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  return request<{ success: true; inviteUrl: string; members: TeamMember[]; invites: TeamInvite[] }>("/api/tenant/invites", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeTeamInvite(inviteId: number) {
  return request<{ success: true; members: TeamMember[]; invites: TeamInvite[] }>(`/api/tenant/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export async function updateMemberPermissions(memberId: number, permissions: Record<string, boolean>) {
  return request<{ success: true }>(`/api/tenant/members/${memberId}/permissions`, {
    method: "PATCH",
    body: JSON.stringify(permissions),
  });
}
