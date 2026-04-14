// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  user: null as null | { role: "platform_admin" | "owner" | "seller" },
}));

const serviceMocks = vi.hoisted(() => ({
  signupRequest: vi.fn(),
  acceptInviteRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: authMocks.login,
    user: authMocks.user,
  }),
}));

vi.mock("@/services/auth", async () => {
  const actual = await vi.importActual<typeof import("@/services/auth")>("@/services/auth");
  return {
    ...actual,
    signupRequest: serviceMocks.signupRequest,
    acceptInviteRequest: serviceMocks.acceptInviteRequest,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import Login from "@/pages/Login";

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = null;
  });

  it("redirects platform admin to the platform console after login", async () => {
    authMocks.login.mockResolvedValue({
      authenticated: true,
      user: {
        id: "1",
        email: "admin@rozzcar.com",
        name: "Admin",
        role: "platform_admin",
      },
      tenant: null,
      permissions: {
        canManagePlatform: true,
        canManageTeam: false,
      },
      expiresAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/platform" element={<div>Platform Console</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "admin@rozzcar.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("Platform Console")).toBeInTheDocument();
    });
  });

  it("creates a store from signup and redirects the owner to the dashboard", async () => {
    serviceMocks.signupRequest.mockResolvedValue({
      authenticated: true,
      user: {
        id: "2",
        email: "owner@autoprime.com",
        name: "Julia",
        role: "owner",
      },
      tenant: {
        id: "10",
        name: "Auto Prime",
        slug: "auto-prime",
        status: "trial",
        trialEndsAt: new Date().toISOString(),
        planCode: "starter",
        daysRemaining: 7,
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
      expiresAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Criar minha loja/i }));

    fireEvent.change(screen.getByLabelText("Nome da loja"), {
      target: { value: "Auto Prime" },
    });
    fireEvent.change(screen.getByLabelText("Seu nome"), {
      target: { value: "Julia" },
    });
    fireEvent.change(screen.getByLabelText(/^E-mail$/), {
      target: { value: "owner@autoprime.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Senha$/), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Criar loja e entrar/i }));

    await waitFor(() => {
      expect(serviceMocks.signupRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          storeName: "Auto Prime",
          slug: "auto-prime",
          ownerName: "Julia",
          ownerEmail: "owner@autoprime.com",
        }),
      );
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("accepts an invite from the login screen and redirects to the dashboard", async () => {
    serviceMocks.acceptInviteRequest.mockResolvedValue({
      authenticated: true,
      user: {
        id: "3",
        email: "seller@autoprime.com",
        name: "Mario",
        role: "seller",
      },
      tenant: {
        id: "10",
        name: "Auto Prime",
        slug: "auto-prime",
        status: "trial",
        trialEndsAt: new Date().toISOString(),
        planCode: "starter",
        daysRemaining: 7,
      },
      permissions: {
        canManagePlatform: false,
        canManageTeam: false,
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
      expiresAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter initialEntries={["/?invite=token-123&email=seller%40autoprime.com&name=Mario&store=Auto%20Prime&role=seller"]}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Crie sua senha/i), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Criar senha e entrar/i }));

    await waitFor(() => {
      expect(serviceMocks.acceptInviteRequest).toHaveBeenCalledWith({
        token: "token-123",
        password: "123456",
      });
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });
});
