import type {
  ConsultationExecutionQuery,
  ConsultationExecutionResponse,
  ConsultationModuleId,
} from "@/lib/consulta-modules";

type ExecuteConsultaPayload = ConsultationExecutionQuery & {
  moduleIds: ConsultationModuleId[];
};

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
    throw new Error((body as { error?: string }).error ?? "Nao foi possivel executar a consulta.");
  }

  return body as T;
}

export async function executeConsultation(payload: ExecuteConsultaPayload) {
  return request<ConsultationExecutionResponse>("/api/consultas/executar", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
