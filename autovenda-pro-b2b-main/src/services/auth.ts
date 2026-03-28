export type UserRole = "platform_admin" | "owner" | "seller";

export interface SellerPermissions {
  verCRM: boolean;
  verEstoque: boolean;
  adicionarVeiculo: boolean;
  editarVeiculo: boolean;
  excluirVeiculo: boolean;
  verConsulta: boolean;
  verPosVenda: boolean;
  verCustos: boolean;
  verCreditos: boolean;
}

export const DEFAULT_SELLER_PERMISSIONS: SellerPermissions = {
  verCRM: true,
  verEstoque: true,
  adicionarVeiculo: true,
  editarVeiculo: true,
  excluirVeiculo: true,
  verConsulta: true,
  verPosVenda: true,
  verCustos: true,
  verCreditos: true,
};
export type TenantStatus = "trial" | "active" | "past_due" | "blocked" | "closed";

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  trialEndsAt: string | null;
  planCode: string | null;
  daysRemaining: number | null;
}

export interface AuthSession {
  authenticated: true;
  user: {
    id: string;
    membershipId: string | null;
    email: string;
    name: string;
    role: UserRole;
    salesGoalMonthly?: number | null;
  };
  tenant: AuthTenant | null;
  permissions: {
    canManagePlatform: boolean;
    canManageTeam: boolean;
    sellerPermissions: SellerPermissions;
  };
  expiresAt: string;
}

async function request<T>(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? "Falha na autenticacao.");
  }

  return json as T;
}

export async function loginRequest(email: string, password: string) {
  return request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function validateSession() {
  return request<AuthSession>("/api/auth/session", {
    method: "GET",
  });
}

export async function logoutRequest() {
  return request<{ success: true }>("/api/auth/logout", {
    method: "POST",
  });
}
