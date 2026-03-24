import type { AppStateResourcePatch, AppStateSnapshot } from "@/lib/app-state";

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
    throw new Error((body as { error?: string }).error ?? "Nao foi possivel sincronizar os dados.");
  }

  return body as T;
}

export async function fetchAppState() {
  return request<{ state: AppStateSnapshot }>("/api/app/state", {
    method: "GET",
  });
}

export async function updateAppState(patch: AppStateResourcePatch) {
  return request<{ state: AppStateSnapshot }>("/api/app/state", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
