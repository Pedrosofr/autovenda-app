// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  user: {
    id: "1",
    email: "owner@loja.local",
    name: "Sandra",
    role: "owner" as const,
    membershipId: "vendedor-1",
  },
  loading: false,
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

vi.mock("@/components/dashboard/DashboardCharts", () => ({
  default: () => <div>Dashboard Charts</div>,
}));

import Dashboard from "@/pages/Dashboard";

function createStoreState(vendedoresCount = 1) {
  return {
    veiculos: [],
    vendas: [],
    leads: [
      {
        id: "lead-1",
        nome: "Cliente 1",
        telefone: "11999999999",
        interesse: "Compass",
        origem: "manual",
        data: "2026-04-13T10:00:00.000Z",
        vendedorId: "vendedor-1",
        status: "em_contato",
        historico: [],
        anotacoes: "",
      },
    ],
    vendedores: Array.from({ length: vendedoresCount }, (_, index) => ({
      id: `vendedor-${index + 1}`,
      nome: index === 0 ? "Sandra" : "Mario",
      metaMensal: 5,
    })),
    loadingRemoteState: false,
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = {
      id: "1",
      email: "owner@loja.local",
      name: "Sandra",
      role: "owner",
      membershipId: "vendedor-1",
    };
    authMocks.loading = false;
  });

  it("mostra onboarding para montar a equipe quando o owner ainda esta sozinho", async () => {
    storeMocks.state = createStoreState(1);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sua loja ja entrou. Agora monte a equipe.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Convidar equipe/i })).toHaveAttribute("href", "/equipe");
  });

  it("nao mostra onboarding quando a loja ja tem mais de um vendedor", async () => {
    storeMocks.state = createStoreState(2);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Dashboard Charts")).toBeInTheDocument();
    expect(screen.queryByText("Sua loja ja entrou. Agora monte a equipe.")).not.toBeInTheDocument();
  });

  it("foca o dashboard em metas operacionais e nao em lucro", async () => {
    storeMocks.state = createStoreState(2);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Meta de Carros")).toBeInTheDocument();
    expect(screen.getByText("Leads Atendidos")).toBeInTheDocument();
    expect(screen.getByText("Meta de Leads")).toBeInTheDocument();
    expect(screen.queryByText("Lucro Bruto")).not.toBeInTheDocument();
  });
});
