// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const platformMocks = vi.hoisted(() => ({
  fetchPlatformStores: vi.fn(),
  createPlatformStore: vi.fn(),
  updatePlatformStore: vi.fn(),
  fetchPlatformStoreUsers: vi.fn(),
  createPlatformStoreUser: vi.fn(),
  fetchPlatformStoreNfeConfig: vi.fn(),
  updatePlatformStoreNfeConfig: vi.fn(),
}));

const activityMocks = vi.hoisted(() => ({
  fetchPlatformActivity: vi.fn(),
}));

vi.mock("@/services/platform", () => ({
  fetchPlatformStores: platformMocks.fetchPlatformStores,
  createPlatformStore: platformMocks.createPlatformStore,
  updatePlatformStore: platformMocks.updatePlatformStore,
  fetchPlatformStoreUsers: platformMocks.fetchPlatformStoreUsers,
  createPlatformStoreUser: platformMocks.createPlatformStoreUser,
  fetchPlatformStoreNfeConfig: platformMocks.fetchPlatformStoreNfeConfig,
  updatePlatformStoreNfeConfig: platformMocks.updatePlatformStoreNfeConfig,
}));

vi.mock("@/services/activity", () => ({
  fetchPlatformActivity: activityMocks.fetchPlatformActivity,
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
          nfe_enabled: 1,
          nfe_configured: 1,
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

    platformMocks.fetchPlatformStoreNfeConfig.mockResolvedValue({
      enabled: true,
      configured: true,
      config: {
        focusApiKey: "",
        focusApiKeyMasked: "focu****************3456",
        hasSavedApiKey: true,
        ambiente: "homologacao",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Capa Repasses Ltda",
        nomeFantasia: "Capa",
        inscricaoEstadual: "123456789",
        regimeTributario: "1",
        logradouro: "Rua Central",
        numero: "120",
        complemento: "",
        bairro: "Centro",
        municipio: "Sao Paulo",
        codigoMunicipio: "3550308",
        uf: "SP",
        cep: "01001000",
        telefone: "11999990000",
        email: "fiscal@capa.com",
      },
    });

    activityMocks.fetchPlatformActivity.mockResolvedValue({
      events: [],
    });
  });

  it("opens store management with editable trial, max users, addon state and private NF-e fields", async () => {
    render(<PlatformConsole />);

    fireEvent.click(await screen.findByRole("button", { name: "Gerenciar" }));

    expect(await screen.findByLabelText("Dias de trial")).toHaveValue(7);
    expect(screen.getByLabelText("Limite de usuarios")).toHaveValue(3);
    expect((await screen.findAllByText("Addon ativo")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Configuracao salva").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("API key da Focus")).toHaveValue("");
    expect(screen.getByText("API key salva: focu****************3456")).toBeInTheDocument();
    expect(screen.getByLabelText("Razao social")).toHaveValue("Capa Repasses Ltda");
    expect(screen.getAllByText("Acesso total").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Somente vendedor").length).toBeGreaterThan(0);
  });
});
