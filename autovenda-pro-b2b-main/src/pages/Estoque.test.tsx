// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  tenant: {
    id: "10",
    name: "Loja Centro",
    slug: "loja-centro",
    status: "active" as const,
    trialEndsAt: new Date().toISOString(),
    planCode: "starter",
    nfeEnabled: false,
    nfeConfigured: false,
    daysRemaining: 12,
  },
  user: {
    id: "1",
    email: "owner@loja.local",
    name: "Sandra",
    role: "owner" as const,
  },
}));

const storeMocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: () => storeMocks.state,
}));

vi.mock("@/components/NFeEmitirDialog", () => ({
  NFeEmitirDialog: () => null,
}));

vi.mock("@/services/gemini", () => ({
  analyzeVehicleWithGemini: vi.fn(),
  generateVehicleDescriptionsWithGemini: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import Estoque from "@/pages/Estoque";
import { defaultConfigPrecos, defaultMemoriaLoja } from "@/store/types";

function createStoreState() {
  return {
    veiculos: [
      {
        id: "veiculo-1",
        modelo: "Corolla Cross XRE",
        ano: "2024",
        valorVenda: "123990",
        custo: "110000",
        fotos: [],
        fotosDestaque: [],
        status: "disponivel" as const,
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ],
    vendas: [],
    vendedores: [
      {
        id: "vendedor-1",
        nome: "Sandra",
      },
    ],
    memoriaLoja: defaultMemoriaLoja,
    configPrecos: defaultConfigPrecos,
    addVeiculo: vi.fn(),
    updateVeiculo: vi.fn(),
    trashVeiculo: vi.fn(),
    restoreVeiculo: vi.fn(),
    removeVeiculo: vi.fn(),
    clearDeletedVeiculos: vi.fn(),
    registrarAprendizadoLoja: vi.fn(),
    refreshRemoteState: vi.fn(),
  };
}

describe("Estoque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.state = createStoreState();
  });

  it("shows reserve and sold actions on vehicle cards without the archive button", () => {
    render(<Estoque />);

    expect(screen.getByRole("button", { name: "Reservar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar vendido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument();
  });
});
