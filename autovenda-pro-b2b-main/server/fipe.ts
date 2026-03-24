import {
  normalizeFipeText,
  pickBestFipeBrand,
  pickBestFipeModel,
  pickBestFipeYear,
} from "../src/lib/fipe";

type OfficialFipeOption = {
  Label: string;
  Value: string | number;
};

type OfficialFipeModelResponse = {
  Modelos?: OfficialFipeOption[];
  Anos?: OfficialFipeOption[];
  erro?: string;
};

type OfficialFipeValueResponse = {
  Valor?: string;
  Marca?: string;
  Modelo?: string;
  AnoModelo?: number;
  Combustivel?: string;
  CodigoFipe?: string;
  MesReferencia?: string;
  Autenticacao?: string;
  TipoVeiculo?: number;
  SiglaCombustivel?: string;
  DataConsulta?: string;
  erro?: string;
  codigo?: string;
};

export type FipeVehicleType = "carro" | "moto" | "caminhao";

export type FipeSuggestion = {
  label: string;
  value: string;
};

export type FipeLookupResult = {
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
};

const OFFICIAL_FIPE_BASE = "https://veiculos.fipe.org.br/api/veiculos";
const VEHICLE_TYPE_CODE: Record<FipeVehicleType, string> = {
  carro: "1",
  moto: "2",
  caminhao: "3",
};
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const requestCache = new Map<string, { expiresAt: number; value: unknown }>();

function asFormData(data: Record<string, string>) {
  const form = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    form.set(key, value);
  });
  return form;
}

async function postOfficialFipe<T>(path: string, data?: Record<string, string>) {
  const response = await fetch(`${OFFICIAL_FIPE_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
    },
    body: data ? asFormData(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar FIPE oficial (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

async function getCached<T>(key: string, loader: () => Promise<T>) {
  const now = Date.now();
  const cached = requestCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  requestCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    value,
  });
  return value;
}

async function fetchReferenceCode() {
  return getCached("fipe:reference", async () => {
    const references = await postOfficialFipe<{ Codigo: number; Mes: string }[]>(
      "ConsultarTabelaDeReferencia",
    );
    return String(references[0]?.Codigo ?? "");
  });
}

function toOptions(items: OfficialFipeOption[] | undefined) {
  return (items ?? []).map((item) => ({
    label: String(item.Label ?? ""),
    value: String(item.Value ?? ""),
  }));
}

async function fetchBrands(referenceCode: string, vehicleTypeCode: string) {
  return getCached(`fipe:brands:${referenceCode}:${vehicleTypeCode}`, async () =>
    toOptions(
      await postOfficialFipe<OfficialFipeOption[]>("ConsultarMarcas", {
        codigoTabelaReferencia: referenceCode,
        codigoTipoVeiculo: vehicleTypeCode,
      }),
    ),
  );
}

async function fetchModels(referenceCode: string, vehicleTypeCode: string, brandCode: string) {
  return getCached(`fipe:models:${referenceCode}:${vehicleTypeCode}:${brandCode}`, async () => {
    const response = await postOfficialFipe<OfficialFipeModelResponse>("ConsultarModelos", {
      codigoTabelaReferencia: referenceCode,
      codigoTipoVeiculo: vehicleTypeCode,
      codigoMarca: brandCode,
    });
    return toOptions(response.Modelos);
  });
}

function rankSuggestions(options: FipeSuggestion[], query: string, limit = 8) {
  const normalizedQuery = normalizeFipeText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  if (!normalizedQuery) {
    return [];
  }

  return options
    .map((item) => {
      const normalizedLabel = normalizeFipeText(item.label);
      let score = 0;

      if (normalizedLabel.startsWith(normalizedQuery)) {
        score += 100;
      } else if (normalizedLabel.includes(normalizedQuery)) {
        score += 70;
      }

      for (const token of queryTokens) {
        if (normalizedLabel.startsWith(token)) {
          score += token.length >= 4 ? 18 : 6;
        } else if (normalizedLabel.includes(token)) {
          score += token.length >= 4 ? 10 : 4;
        }
      }

      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export async function suggestFipeBrands(params: {
  query: string;
  tipo?: FipeVehicleType;
  limit?: number;
}) {
  const query = params.query.trim();
  if (query.length < 2) {
    return [];
  }

  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();

  if (!referenceCode) {
    return [];
  }

  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  return rankSuggestions(brands, query, params.limit ?? 8);
}

export async function suggestFipeModels(params: {
  marca: string;
  query: string;
  tipo?: FipeVehicleType;
  limit?: number;
}) {
  const marca = params.marca.trim();
  const query = params.query.trim();
  if (marca.length < 2 || query.length < 2) {
    return [];
  }

  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();

  if (!referenceCode) {
    return [];
  }

  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  const brand = pickBestFipeBrand(brands, marca, query);
  if (!brand) {
    return [];
  }

  const models = await fetchModels(referenceCode, vehicleTypeCode, String(brand.value));
  return rankSuggestions(models, query, params.limit ?? 8);
}

export async function lookupFipeByText(params: {
  marca: string;
  modelo: string;
  ano: string;
  tipo?: FipeVehicleType;
}) {
  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();

  if (!referenceCode) {
    return null;
  }

  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  const brand = pickBestFipeBrand(
    brands,
    params.marca,
    params.modelo,
  );

  if (!brand) {
    return null;
  }

  const models = await fetchModels(referenceCode, vehicleTypeCode, String(brand.value));
  const model = pickBestFipeModel(
    models,
    params.modelo,
  );

  if (!model) {
    return null;
  }

  const years = await postOfficialFipe<OfficialFipeOption[]>("ConsultarAnoModelo", {
    codigoTabelaReferencia: referenceCode,
    codigoTipoVeiculo: vehicleTypeCode,
    codigoMarca: String(brand.value),
    codigoModelo: String(model.value),
  });
  const year = pickBestFipeYear(toOptions(years), params.ano, params.modelo);

  if (!year) {
    return null;
  }

  const [anoModelo, codigoTipoCombustivel] = String(year.value).split("-");
  const value = await postOfficialFipe<OfficialFipeValueResponse>("ConsultarValorComTodosParametros", {
    codigoTabelaReferencia: referenceCode,
    codigoMarca: String(brand.value),
    codigoModelo: String(model.value),
    codigoTipoVeiculo: vehicleTypeCode,
    anoModelo,
    codigoTipoCombustivel,
    tipoVeiculo: tipo,
    modeloCodigoExterno: "",
    tipoConsulta: "tradicional",
  });

  if (value.erro || !value.Valor || !value.CodigoFipe) {
    return null;
  }

  return {
    valor: value.Valor,
    marca: value.Marca ?? brand.label,
    modelo: value.Modelo ?? model.label,
    anoModelo: value.AnoModelo ?? Number(anoModelo),
    combustivel: value.Combustivel ?? year.label.replace(/^\d{4}\s*/, ""),
    codigoFipe: value.CodigoFipe,
    mesReferencia: value.MesReferencia ?? "",
    autenticacao: value.Autenticacao,
    tipoVeiculo: value.TipoVeiculo ?? Number(vehicleTypeCode),
    siglaCombustivel: value.SiglaCombustivel ?? "",
    dataConsulta: value.DataConsulta ?? "",
    source: "fipe-oficial" as const,
  } satisfies FipeLookupResult;
}
