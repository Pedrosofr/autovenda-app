// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const platformMocks = vi.hoisted(() => ({
  fetchPlatformStores: vi.fn(),
  createPlatformStore: vi.fn(),
  updatePlatformStore: vi.fn(),
  fetchPlatformStoreUsers: vi.fn(),
  createPlatformStoreUser: vi.fn(),
}));

vi.mock("@/services/platform", () => ({
  fetchPlatformStores: platformMocks.fetchPlatformStores,
  createPlatformStore: platformMocks.createPlatformStore,
  updatePlatformStore: platformMocks.updatePlatformStore,
  fetchPlatformStoreUsers: platformMocks.fetchPlatformStoreUsers,
  createPlatformStoreUser: platformMocks.createPlatformStoreUser,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import PlatformConsole from "@/pages/PlatformConsole";

describe("PlatformConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    platformMocks.fetchPlatformStores.mockResolvedValue({
      stores: [
        {
          id: 1,
          name: "Capa Repasses",
          slug: "capa-repasses",
          status: "trial",
          plan_code: "starter",
          trial_ends_at: "2026-04-14T00:00:00.000Z",
          users_count: 1,
          max_users: 3,
          owner_name: "Rafael",
          owner_email: "rafael@loja.com",
        },
      ],
    });

    platformMocks.fetchPlatformStoreUsers.mockResolvedValue({
      members: [
        {
          id: 10,
          nome: "Rafael",
          email: "rafael@loja.com",
          papel: "owner",
          ativo: 1,
          meta_mensal: null,
          criado_em: "2026-03-23T00:00:00.000Z",
        },
      ],
    });
  });

  it("opens store management with editable trial, max users and role selection", async () => {
    render(<PlatformConsole />);

    fireEvent.click(await screen.findByRole("button", { name: "Gerenciar" }));

    expect(await screen.findByLabelText("Dias de trial")).toHaveValue(7);
    expect(screen.getByLabelText("Limite de usuarios")).toHaveValue(3);
    expect(screen.getByText("Acesso total")).toBeInTheDocument();
    expect(screen.getByText("Somente vendedor")).toBeInTheDocument();
  });
});
