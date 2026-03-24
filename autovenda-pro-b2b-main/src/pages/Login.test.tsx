// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  user: null as null | { role: "platform_admin" | "owner" | "seller" },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: authMocks.login,
    user: authMocks.user,
  }),
}));

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
        email: "admin@autocrm.local",
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
      target: { value: "admin@autocrm.local" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("Platform Console")).toBeInTheDocument();
    });
  });
});
