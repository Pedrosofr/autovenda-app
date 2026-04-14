// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
          max_vehicles: 30,
          nfe_enabled: 1,
          nfe_configured: 1,
          vehicles_count: 12,
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

  it("renders the platform console shell with creation and access controls", async () => {
    render(<PlatformConsole />);

    expect(await screen.findByRole("heading", { name: /Lojas, owners e trial em um painel unico/i })).toBeInTheDocument();
    expect(await screen.findByText(/Nenhuma movimentacao registrada ainda/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ir para login da loja/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Nova loja/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da loja")).toBeInTheDocument();
    expect(screen.getByLabelText("Identificador")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Trial inicial (dias)")).toHaveValue(7);
    expect(screen.getByLabelText("Limite inicial de usuarios")).toHaveValue(5);
    expect(screen.getByLabelText("Limite inicial de veiculos ativos")).toHaveValue(30);
    expect(screen.getByRole("button", { name: /Criar loja/i })).toBeInTheDocument();
  });
});
