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
    nfeConfigured: true,
    daysRemaining: 12,
  },
  refreshSession: vi.fn().mockResolvedValue(null),
}));

const nfeMocks = vi.hoisted(() => ({
  getNfeConfig: vi.fn(),
  saveNfeConfig: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

vi.mock("@/services/nfe", () => ({
  getNfeConfig: nfeMocks.getNfeConfig,
  saveNfeConfig: nfeMocks.saveNfeConfig,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import NFeConfig from "@/pages/NFeConfig";

describe("NFeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nfeMocks.getNfeConfig.mockResolvedValue({
      enabled: false,
      configured: true,
      config: {
        focusApiKey: "",
        hasSavedApiKey: true,
        focusApiKeyMasked: "focus********3456",
        ambiente: "homologacao",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Loja Centro Veiculos Ltda",
        nomeFantasia: "Loja Centro",
        inscricaoEstadual: "123456789",
        regimeTributario: "1",
        logradouro: "Rua das Flores",
        numero: "100",
        complemento: "",
        bairro: "Centro",
        municipio: "Sao Paulo",
        codigoMunicipio: "3550308",
        uf: "SP",
        cep: "01001-000",
        telefone: "",
        email: "",
      },
    });
  });

  it("mostra a chave mascarada e orienta quando o modulo ainda nao esta ativo", async () => {
    render(<NFeConfig />);

    expect(await screen.findByText(/Chave atual protegida/i)).toBeInTheDocument();
    expect(screen.getByText(/modulo ainda nao esta ativo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar configuracao da NF-e/i })).toBeEnabled();
  });
});
