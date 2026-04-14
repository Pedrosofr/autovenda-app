export const CONSULTATION_MODULE_IDS = [
  "placa",
  "fipe",
  "leilao",
  "multas",
  "debitos",
  "roubo_furto",
  "essencial",
  "completa",
] as const;

export type ConsultationModuleId = (typeof CONSULTATION_MODULE_IDS)[number];

export type ConsultationExecutionStatus =
  | "completed"
  | "partial"
  | "not_found"
  | "provider_unavailable"
  | "pending_integration"
  | "failed";

export interface ConsultationModuleDefinition {
  id: ConsultationModuleId;
  title: string;
  shortTitle: string;
  description: string;
  priceCents: number;
  providerKey: string;
  availability: "live" | "preparing";
  kind: "module" | "bundle";
  requiresPlate?: boolean;
  requiresVehicleIdentity?: boolean;
  includedModuleIds?: ConsultationModuleId[];
}

export interface ConsultationVehicleSummary {
  placa?: string;
  placaConsultada?: string;
  marca?: string;
  modelo?: string;
  ano?: string;
  cor?: string;
  situacao?: string;
  municipio?: string;
  uf?: string;
  source?: string;
}

export interface ConsultationModuleResult {
  moduleId: ConsultationModuleId;
  title: string;
  priceCents: number;
  providerKey: string;
  status: ConsultationExecutionStatus;
  message?: string;
  data?: Record<string, unknown>;
  executedAt: string;
}

export interface ConsultationExecutionQuery {
  plate?: string;
  marca?: string;
  modelo?: string;
  ano?: string;
}

export interface ConsultationExecutionResponse {
  query: ConsultationExecutionQuery;
  requestedModuleIds: ConsultationModuleId[];
  expandedModuleIds: ConsultationModuleId[];
  totalPriceCents: number;
  vehicle?: ConsultationVehicleSummary | null;
  results: ConsultationModuleResult[];
}

export interface StoredConsultationSummary {
  title: string;
  subtitle?: string;
  statusLabel: string;
}

export const CONSULTATION_MODULE_MAP: Record<ConsultationModuleId, ConsultationModuleDefinition> = {
  placa: {
    id: "placa",
    title: "Consulta por placa",
    shortTitle: "Placa",
    description: "Retorna dados basicos do veiculo para iniciar o atendimento.",
    priceCents: 1290,
    providerKey: "sinesp-api",
    availability: "live",
    kind: "module",
    requiresPlate: true,
  },
  fipe: {
    id: "fipe",
    title: "Tabela FIPE",
    shortTitle: "FIPE",
    description: "Busca valor de referencia, codigo FIPE e combustivel.",
    priceCents: 490,
    providerKey: "fipe-oficial",
    availability: "live",
    kind: "module",
    requiresVehicleIdentity: true,
  },
  leilao: {
    id: "leilao",
    title: "Historico de leilao",
    shortTitle: "Leilao",
    description: "Preparado para integrar alertas de historico de leilao por API.",
    priceCents: 1490,
    providerKey: "pending-provider",
    availability: "preparing",
    kind: "module",
    requiresPlate: true,
  },
  multas: {
    id: "multas",
    title: "Multas",
    shortTitle: "Multas",
    description: "Preparado para consultar ocorrencias e quantidade de multas por API.",
    priceCents: 990,
    providerKey: "pending-provider",
    availability: "preparing",
    kind: "module",
    requiresPlate: true,
  },
  debitos: {
    id: "debitos",
    title: "Debitos e IPVA",
    shortTitle: "Debitos",
    description: "Preparado para validar debitos, IPVA e pendencias financeiras.",
    priceCents: 1190,
    providerKey: "pending-provider",
    availability: "preparing",
    kind: "module",
    requiresPlate: true,
  },
  roubo_furto: {
    id: "roubo_furto",
    title: "Roubo e furto",
    shortTitle: "Roubo/Furto",
    description: "Preparado para checar alertas de roubo e furto em provedor futuro.",
    priceCents: 890,
    providerKey: "pending-provider",
    availability: "preparing",
    kind: "module",
    requiresPlate: true,
  },
  essencial: {
    id: "essencial",
    title: "Consulta essencial",
    shortTitle: "Essencial",
    description: "Pacote de pre-lancamento com consulta por placa e referencia FIPE.",
    priceCents: 1590,
    providerKey: "bundle",
    availability: "live",
    kind: "bundle",
    requiresPlate: true,
    includedModuleIds: ["placa", "fipe"],
  },
  completa: {
    id: "completa",
    title: "Consulta completa",
    shortTitle: "Completa",
    description: "Pacote unico com todos os modulos disponiveis e os futuros conectores.",
    priceCents: 4990,
    providerKey: "bundle",
    availability: "live",
    kind: "bundle",
    requiresPlate: true,
    includedModuleIds: ["placa", "fipe", "leilao", "multas", "debitos", "roubo_furto"],
  },
};

export const CONSULTATION_MODULES = CONSULTATION_MODULE_IDS.map((id) => CONSULTATION_MODULE_MAP[id]);

export function expandConsultationModules(moduleIds: ConsultationModuleId[]) {
  const expanded = new Set<ConsultationModuleId>();

  moduleIds.forEach((moduleId) => {
    const definition = CONSULTATION_MODULE_MAP[moduleId];
    if (!definition) return;

    if (definition.kind === "bundle" && definition.includedModuleIds) {
      definition.includedModuleIds.forEach((includedId) => expanded.add(includedId));
      return;
    }

    expanded.add(moduleId);
  });

  return CONSULTATION_MODULE_IDS.filter((id) => expanded.has(id) && id !== "completa");
}

export function formatConsultationPrice(priceCents: number) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function buildConsultationSummary(response: ConsultationExecutionResponse): StoredConsultationSummary {
  const primaryVehicle = response.vehicle;
  const completedCount = response.results.filter((item) => item.status === "completed").length;
  const pendingCount = response.results.filter((item) => item.status === "pending_integration").length;

  return {
    title: primaryVehicle?.placa || [primaryVehicle?.marca, primaryVehicle?.modelo].filter(Boolean).join(" ") || "Consulta veicular",
    subtitle: [primaryVehicle?.modelo, primaryVehicle?.ano].filter(Boolean).join(" • ") || undefined,
    statusLabel:
      completedCount > 0 && pendingCount > 0
        ? "Parcial"
        : completedCount > 0
        ? "Concluida"
        : pendingCount > 0
        ? "Preparada para API"
        : "Sem retorno",
  };
}
