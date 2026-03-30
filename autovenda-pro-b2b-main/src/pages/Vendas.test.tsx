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
  refreshRemoteState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: () => ({
    vendas: [
      {
        id: "venda-1",
        veiculoId: "veiculo-1",
        vendedorId: "vendedor-1",
        valor: 123990,
        data: "2026-03-28",
      },
    ],
    veiculos: [
      {
        id: "veiculo-1",
        modelo: "Corolla Cross XRE",
        ano: "2024",
        valorVenda: "123990",
        custo: "110000",
        fotos: [],
        fotosDestaque: [],
        status: "vendido" as const,
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ],
    vendedores: [
      {
        id: "vendedor-1",
        nome: "Sandra",
      },
    ],
    tarefasPosVenda: [
      {
        id: "task-1",
        vendaId: "venda-1",
        veiculoId: "veiculo-1",
        titulo: "Entregar documento",
        categoria: "documento" as const,
        status: "pendente" as const,
        criadoEm: "2026-03-28T10:00:00.000Z",
      },
    ],
    refreshRemoteState: storeMocks.refreshRemoteState,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import Vendas from "@/pages/Vendas";

describe("Vendas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the registered sales with vehicle, seller and revenue data", () => {
    render(<Vendas />);

    expect(screen.getByRole("heading", { name: "Vendas" })).toBeInTheDocument();
    expect(screen.getAllByText("Corolla Cross XRE")).toHaveLength(2);
    expect(screen.getByText(/Vendedor:\s*Sandra/)).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s*123\.990,00/)).not.toHaveLength(0);
    expect(screen.getByText("1 pendencia aberta")).toBeInTheDocument();
  });
});
