// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  user: {
    id: "1",
    email: "owner@loja.local",
    name: "Loja Centro",
    role: "owner" as "platform_admin" | "owner" | "seller",
  },
  tenant: {
    id: "10",
    name: "Loja Centro",
    slug: "loja-centro",
    status: "trial" as const,
    trialEndsAt: new Date().toISOString(),
    planCode: "starter",
    nfeEnabled: true,
    daysRemaining: 6,
  },
  permissions: {
    canManagePlatform: false,
    canManageTeam: true,
    sellerPermissions: {
      verCRM: true,
      verEstoque: true,
      adicionarVeiculo: true,
      editarVeiculo: true,
      excluirVeiculo: true,
      verConsulta: true,
      verPosVenda: true,
      verCustos: true,
      verCreditos: true,
    },
  },
  isPlatformAdmin: false,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

import AppLayout from "@/components/AppLayout";

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user.role = "owner";
    authMocks.tenant.nfeEnabled = true;
    authMocks.permissions.canManageTeam = true;
  });

  it("shows team management for owners and hides the platform console", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>Painel</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Vendas")).toBeInTheDocument();
    expect(screen.getByText("Equipe")).toBeInTheDocument();
    expect(screen.getByText("Notas fiscais")).toBeInTheDocument();
    expect(screen.queryByText("Lojas")).not.toBeInTheDocument();
  });

  it("hides the invoice addon entry when NF-e is disabled for the store", () => {
    authMocks.tenant.nfeEnabled = false;

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>Painel</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Notas fiscais")).not.toBeInTheDocument();
  });

  it("hides owner-only modules for sellers", () => {
    authMocks.user.role = "seller";
    authMocks.permissions.canManageTeam = false;

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>Painel</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Vendas")).not.toBeInTheDocument();
    expect(screen.queryByText("Consulta Veicular")).not.toBeInTheDocument();
    expect(screen.queryByText("Custos")).not.toBeInTheDocument();
    expect(screen.queryByText("Créditos")).not.toBeInTheDocument();
    expect(screen.queryByText("Equipe")).not.toBeInTheDocument();
    expect(screen.queryByText("Notas fiscais")).not.toBeInTheDocument();
    expect(screen.getByText("CRM Leads")).toBeInTheDocument();
    expect(screen.getByText("Estoque")).toBeInTheDocument();
    expect(screen.getByText("Pós-Venda")).toBeInTheDocument();
  });
});
