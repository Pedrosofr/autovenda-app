// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const nfeMocks = vi.hoisted(() => ({
  getNfeConfig: vi.fn(),
  consultarNfe: vi.fn(),
  downloadNfeAsset: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  refreshRemoteState: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    tenant: {
      id: "10",
      name: "Loja Centro",
      slug: "loja-centro",
      status: "active" as const,
      trialEndsAt: new Date().toISOString(),
      planCode: "starter",
      nfeEnabled: true,
      nfeConfigured: true,
      daysRemaining: 12,
    },
    user: {
      id: "1",
      email: "owner@loja.local",
      name: "Sandra",
      role: "owner" as const,
    },
  }),
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
        nfe: {
          ref: "nfe-1",
          status: "autorizada" as const,
          numero: "1234",
          serie: "1",
          chave: "35190330290856000160550010000000011000000010",
          danfeUrl: "/api/nfe/danfe?vendaId=venda-1",
          xmlUrl: "/api/nfe/xml?vendaId=venda-1",
          ultimaAtualizacaoEm: "2026-03-29T10:00:00.000Z",
        },
      },
      {
        id: "venda-2",
        veiculoId: "veiculo-2",
        vendedorId: "vendedor-1",
        valor: 89990,
        data: "2026-03-27",
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
      {
        id: "veiculo-2",
        modelo: "T-Cross Comfortline",
        ano: "2023",
        valorVenda: "89990",
        custo: "80000",
        fotos: [],
        fotosDestaque: [],
        status: "vendido" as const,
        createdAt: "2026-03-02T10:00:00.000Z",
      },
    ],
    vendedores: [
      {
        id: "vendedor-1",
        nome: "Sandra",
      },
    ],
    refreshRemoteState: storeMocks.refreshRemoteState,
  }),
}));

vi.mock("@/services/nfe", () => ({
  getNfeConfig: nfeMocks.getNfeConfig,
  consultarNfe: nfeMocks.consultarNfe,
  downloadNfeAsset: nfeMocks.downloadNfeAsset,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import NFeConfig from "@/pages/NFeConfig";

describe("NFeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nfeMocks.getNfeConfig.mockResolvedValue({
      enabled: true,
      configured: true,
      config: null,
    });
  });

  it("renders an operational notas fiscais page with white-label invoice actions", async () => {
    render(
      <MemoryRouter>
        <NFeConfig />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Notas fiscais/i })).toBeInTheDocument();
    expect(screen.getByText("Corolla Cross XRE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Emitir nota/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar PDF/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar XML/i })).toBeInTheDocument();
    expect(screen.queryByText(/NF-e com Focus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Integracao Focus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Credencial de emissao/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/CNPJ/i)).not.toBeInTheDocument();
  });

  it("shows a pending configuration notice when the module is not yet configured", async () => {
    nfeMocks.getNfeConfig.mockResolvedValueOnce({
      enabled: true,
      configured: false,
      config: null,
    });

    render(
      <MemoryRouter>
        <NFeConfig />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Configuracao pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/O cadastro fiscal da loja esta sendo configurado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salvar dados fiscais/i })).not.toBeInTheDocument();
  });

  it("shows an inactive module notice when nfe is not enabled", async () => {
    nfeMocks.getNfeConfig.mockResolvedValueOnce({
      enabled: false,
      configured: false,
      config: null,
    });

    render(
      <MemoryRouter>
        <NFeConfig />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Modulo fiscal inativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Entre em contato com o suporte para ativar/i)).toBeInTheDocument();
  });
});
