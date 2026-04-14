// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  user: {
    id: "1",
    membershipId: "10",
    email: "owner@loja.local",
    name: "Loja Centro",
    role: "owner" as "platform_admin" | "owner" | "seller",
  },
  tenant: {
    id: "10",
    name: "Loja Centro",
    slug: "loja-centro",
    status: "past_due" as "trial" | "active" | "past_due" | "blocked" | "closed",
    trialEndsAt: new Date().toISOString(),
    planCode: "starter",
    daysRemaining: 0,
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
  loading: false,
  isPlatformAdmin: false,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
  hasRole: (role: string | null, allowedRoles: string[]) => (role ? allowedRoles.includes(role) : false),
}));

import { ProtectedRoute } from "@/components/ProtectedRoute";

describe("ProtectedRoute", () => {
  it("shows the expired trial screen for past_due tenants", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Painel</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Trial expirado")).toBeInTheDocument();
    expect(screen.getByText(/periodo de teste da sua loja terminou/i)).toBeInTheDocument();
    expect(screen.queryByText("Painel")).not.toBeInTheDocument();
  });

  it("redirects the seller away from owner-only routes", () => {
    authMocks.tenant.status = "trial";
    authMocks.user.role = "seller";
    authMocks.permissions.canManageTeam = false;

    render(
      <MemoryRouter initialEntries={["/creditos"]}>
        <Routes>
          <Route
            path="/creditos"
            element={
              <ProtectedRoute allowRoles={["owner"]}>
                <div>Financeiro</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Financeiro")).not.toBeInTheDocument();
  });
});
