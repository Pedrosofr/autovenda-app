import { formatPlate, getPlateCandidates, isValidPlate, normalizePlate } from "@/lib/placa";

export interface VeiculoPlacaResponse {
  placa: string;
  placaConsultada: string;
  marca: string;
  modelo: string;
  ano: string;
  cor?: string;
  situacao: string;
  municipio?: string;
  uf?: string;
  source: string;
  raw?: Record<string, unknown>;
}

export async function fetchVeiculoByPlaca(placa: string): Promise<VeiculoPlacaResponse> {
  const normalized = normalizePlate(placa);
  if (!isValidPlate(normalized)) {
    throw new Error("Placa invalida. Use o formato antigo ou Mercosul.");
  }

  const query = new URLSearchParams({
    plate: normalized,
    candidates: getPlateCandidates(normalized).join(","),
  });

  const res = await fetch(`/api/consultas/placa?${query.toString()}`, {
    method: "GET",
    credentials: "same-origin",
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ??
      (res.status === 404 ? "Placa nao encontrada." : "Nao foi possivel consultar a placa."),
    );
  }

  const data = body as VeiculoPlacaResponse;
  return {
    ...data,
    placa: formatPlate(data.placa || normalized),
    placaConsultada: formatPlate(data.placaConsultada || normalized),
  };
}
