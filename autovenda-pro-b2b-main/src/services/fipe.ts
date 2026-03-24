export interface FipeLookupResult {
  valor: string;
  marca: string;
  modelo: string;
  anoModelo: number;
  combustivel: string;
  codigoFipe: string;
  mesReferencia: string;
  autenticacao?: string;
  tipoVeiculo: number;
  siglaCombustivel: string;
  dataConsulta: string;
  source: "fipe-oficial";
}

export interface FipeSuggestion {
  label: string;
  value: string;
}

async function getFipeJson<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);

  const res = await fetch(`${path}?${query.toString()}`, {
    method: "GET",
    credentials: "same-origin",
  });

  if (res.status === 404) {
    return null;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? "Nao foi possivel consultar a FIPE.",
    );
  }

  return body as T;
}

export async function fetchFipeByText(
  marca: string,
  modelo: string,
  ano: string,
): Promise<FipeLookupResult | null> {
  if (!modelo?.trim() || !ano?.trim()) {
    return null;
  }

  return getFipeJson<FipeLookupResult>("/api/fipe/lookup", {
    marca: marca.trim(),
    modelo: modelo.trim(),
    ano: ano.trim(),
    tipo: "carro",
  });
}

export async function fetchFipeBrandSuggestions(query: string) {
  if (query.trim().length < 2) {
    return [];
  }

  return (
    await getFipeJson<FipeSuggestion[]>("/api/fipe/marcas", {
      q: query.trim(),
      tipo: "carro",
    })
  ) ?? [];
}

export async function fetchFipeModelSuggestions(marca: string, query: string) {
  if (marca.trim().length < 2 || query.trim().length < 2) {
    return [];
  }

  return (
    await getFipeJson<FipeSuggestion[]>("/api/fipe/modelos", {
      marca: marca.trim(),
      q: query.trim(),
      tipo: "carro",
    })
  ) ?? [];
}
