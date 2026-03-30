// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleBackendRequest } from "../../server/backend";
import {
  authenticateUser,
  createSellerForTenant,
  createTenantWithOwner,
  getTenantAppState,
  resetDatabaseConnectionForTests,
  toggleNfeEnabled,
  updateNfeConfig,
  updateTenantAppState,
  type AuthenticatedSession,
  type NfeConfigData,
} from "../../server/database";

const VALID_CONFIG: NfeConfigData = {
  focusApiKey: "focus_live_secret_123456",
  ambiente: "homologacao",
  cnpj: "12.345.678/0001-90",
  razaoSocial: "Loja Centro Veiculos Ltda",
  nomeFantasia: "Loja Centro",
  inscricaoEstadual: "123456789",
  regimeTributario: "1",
  logradouro: "Rua das Laranjeiras",
  numero: "100",
  complemento: "Sala 2",
  bairro: "Centro",
  municipio: "Sao Paulo",
  codigoMunicipio: "3550308",
  uf: "SP",
  cep: "01001-000",
  telefone: "(11) 99999-0000",
  email: "fiscal@lojacentro.com.br",
};

function mockFocusResponse(status: number, body: Record<string, unknown>) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
  } as Response;
}

async function apiRequest(input: {
  cookie: string;
  method: string;
  path: string;
  body?: unknown;
}) {
  return handleBackendRequest({
    method: input.method,
    path: input.path,
    headers: {
      cookie: input.cookie,
      origin: "http://localhost:8080",
    },
    body: input.body,
  });
}

function createTenantContext() {
  const slug = `loja-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const ownerEmail = `${slug}@teste.com`;
  const ownerPassword = "123456";

  const { tenantId } = createTenantWithOwner({
    storeName: "Loja Teste",
    slug,
    ownerName: "Sandra",
    ownerEmail,
    ownerPassword,
    trialDays: 15,
    maxUsers: 5,
  });

  const auth = authenticateUser(ownerEmail, ownerPassword);
  if (!auth) {
    throw new Error("Falha ao autenticar owner de teste.");
  }

  return {
    tenantId,
    ownerSession: auth.session,
    ownerCookie: auth.cookieHeader,
  };
}

function seedVenda(ownerSession: AuthenticatedSession, overrides?: {
  vendaNfe?: Record<string, unknown>;
}) {
  updateTenantAppState(ownerSession, {
    veiculos: [
      {
        id: "veiculo-1",
        fotos: [],
        fotosDestaque: [],
        modelo: "Corolla Cross XRE",
        marca: "Toyota",
        ano: "2024",
        cor: "Branco",
        custo: "110000",
        valorVenda: "123990",
        status: "vendido",
        createdAt: "2026-03-20T10:00:00.000Z",
      },
    ],
    vendas: [
      {
        id: "venda-1",
        veiculoId: "veiculo-1",
        vendedorId: "vendedor-1",
        valor: 123990,
        data: "2026-03-28T12:00:00.000Z",
        ...(overrides?.vendaNfe ? { nfe: overrides.vendaNfe } : {}),
      },
    ],
  });
}

describe("NF-e backend", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-nfe-"));
    process.env.DATABASE_PATH = join(tempDir, "rozzcar.sqlite");
    process.env.APP_BASE_URL = "http://localhost:8080";
    process.env.PLATFORM_ADMIN_EMAIL = "admin@plataforma.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "123456";
    process.env.PLATFORM_ADMIN_NAME = "Admin Plataforma";
    resetDatabaseConnectionForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetDatabaseConnectionForTests();
    delete process.env.DATABASE_PATH;
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    delete process.env.PLATFORM_ADMIN_NAME;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("protege a leitura da configuracao e mascara a chave da Focus para o owner", async () => {
    const { ownerSession, ownerCookie, tenantId } = createTenantContext();
    toggleNfeEnabled(tenantId, true);
    updateNfeConfig(ownerSession, VALID_CONFIG);

    createSellerForTenant(ownerSession, {
      name: "Vendedor",
      email: "seller@teste.com",
      password: "123456",
      role: "seller",
    });
    const sellerAuth = authenticateUser("seller@teste.com", "123456");
    if (!sellerAuth) throw new Error("Falha ao autenticar seller de teste.");

    const ownerResponse = await apiRequest({
      cookie: ownerCookie,
      method: "GET",
      path: "/api/nfe/config",
    });
    const ownerBody = ownerResponse.body as {
      enabled: boolean;
      configured: boolean;
      config: {
        focusApiKey: string;
        focusApiKeyMasked: string;
        hasSavedApiKey: boolean;
      };
    };

    expect(ownerResponse.status).toBe(200);
    expect(ownerBody.enabled).toBe(true);
    expect(ownerBody.configured).toBe(true);
    expect(ownerBody.config.focusApiKey).toBe("");
    expect(ownerBody.config.hasSavedApiKey).toBe(true);
    expect(ownerBody.config.focusApiKeyMasked).toContain("focus");
    expect(ownerBody.config.focusApiKeyMasked).not.toBe(VALID_CONFIG.focusApiKey);

    const sellerResponse = await apiRequest({
      cookie: sellerAuth.cookieHeader,
      method: "GET",
      path: "/api/nfe/config",
    });

    expect(sellerResponse.status).toBe(403);
  });

  it("emite usando o valor e a descricao salvos no servidor, nao o payload do navegador", async () => {
    const { ownerSession, ownerCookie, tenantId } = createTenantContext();
    toggleNfeEnabled(tenantId, true);
    updateNfeConfig(ownerSession, VALID_CONFIG);
    seedVenda(ownerSession);

    const fetchMock = vi.fn().mockResolvedValue(
      mockFocusResponse(202, {
        status: "processando_autorizacao",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest({
      cookie: ownerCookie,
      method: "POST",
      path: "/api/nfe/emitir",
      body: {
        vendaId: "venda-1",
        compradorNome: "Cliente Teste",
        compradorCpfCnpj: "12345678901",
        compradorEmail: "cliente@teste.com",
        compradorLogradouro: "Rua das Flores",
        compradorNumero: "123",
        compradorBairro: "Centro",
        compradorMunicipio: "Sao Paulo",
        compradorUf: "SP",
        compradorCep: "01001000",
        formaPagamento: "03",
        valorTotal: 1,
        descricaoProduto: "ALTERADO PELO NAVEGADOR",
      },
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const focusPayload = JSON.parse(String(requestInit.body));
    const body = response.body as { success: true; nfe: Record<string, unknown> };

    expect(response.status).toBe(202);
    expect(focusPayload.items[0].descricao).toBe("Corolla Cross XRE - 2024 - Branco");
    expect(focusPayload.items[0].valor_unitario_comercial).toBe("123990.00");
    expect(focusPayload.formas_pagamento[0].forma_pagamento).toBe("03");
    expect(body.nfe.descricaoProduto).toBe("Corolla Cross XRE - 2024 - Branco");
    expect(body.nfe.valorTotal).toBe(123990);
  });

  it("nao cria uma nova NF-e quando a venda ja tem uma nota pendente", async () => {
    const { ownerSession, ownerCookie, tenantId } = createTenantContext();
    toggleNfeEnabled(tenantId, true);
    updateNfeConfig(ownerSession, VALID_CONFIG);
    seedVenda(ownerSession, {
      vendaNfe: {
        ref: "nfe_1_venda-1",
        status: "pendente",
        compradorNome: "Cliente Teste",
        compradorCpfCnpj: "12345678901",
        formaPagamento: "01",
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest({
      cookie: ownerCookie,
      method: "POST",
      path: "/api/nfe/emitir",
      body: {
        vendaId: "venda-1",
        compradorNome: "Cliente Teste",
        compradorCpfCnpj: "12345678901",
        compradorLogradouro: "Rua das Flores",
        compradorNumero: "123",
        compradorBairro: "Centro",
        compradorMunicipio: "Sao Paulo",
        compradorUf: "SP",
        compradorCep: "01001000",
        formaPagamento: "01",
      },
    });
    const body = response.body as { success: true; alreadyExists: boolean; nfe: { ref: string; status: string } };

    expect(response.status).toBe(200);
    expect(body.alreadyExists).toBe(true);
    expect(body.nfe.ref).toBe("nfe_1_venda-1");
    expect(body.nfe.status).toBe("pendente");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sincroniza o status com a Focus e salva links absolutos do DANFE e XML", async () => {
    const { ownerSession, ownerCookie, tenantId } = createTenantContext();
    toggleNfeEnabled(tenantId, true);
    updateNfeConfig(ownerSession, VALID_CONFIG);
    seedVenda(ownerSession, {
      vendaNfe: {
        ref: "nfe_1_venda-1",
        status: "pendente",
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      mockFocusResponse(200, {
        status: "autorizado",
        numero: "123",
        serie: "1",
        chave_nfe: "35123456789012345678901234567890123456789012",
        caminho_danfe: "/arquivos/development/danfe.pdf",
        caminho_xml_nota_fiscal: "/arquivos/development/nfe.xml",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest({
      cookie: ownerCookie,
      method: "GET",
      path: "/api/nfe/status?vendaId=venda-1",
    });
    const body = response.body as { success: true; nfe: { status: string; danfeUrl: string; xmlUrl: string } };
    const venda = getTenantAppState(ownerSession).vendas.find((item) => item.id === "venda-1");

    expect(response.status).toBe(200);
    expect(body.nfe.status).toBe("autorizada");
    expect(body.nfe.danfeUrl).toBe("https://homologacao.focusnfe.com.br/arquivos/development/danfe.pdf");
    expect(body.nfe.xmlUrl).toBe("https://homologacao.focusnfe.com.br/arquivos/development/nfe.xml");
    expect(venda?.nfe?.status).toBe("autorizada");
  });

  it("preserva os metadados ja emitidos ao cancelar a NF-e", async () => {
    const { ownerSession, ownerCookie, tenantId } = createTenantContext();
    toggleNfeEnabled(tenantId, true);
    updateNfeConfig(ownerSession, VALID_CONFIG);
    seedVenda(ownerSession, {
      vendaNfe: {
        ref: "nfe_1_venda-1",
        status: "autorizada",
        numero: "456",
        serie: "1",
        chave: "35123456789012345678901234567890123456789012",
        danfeUrl: "https://homologacao.focusnfe.com.br/arquivos/development/danfe.pdf",
        xmlUrl: "https://homologacao.focusnfe.com.br/arquivos/development/nfe.xml",
        emitidaEm: "2026-03-28T12:30:00.000Z",
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      mockFocusResponse(200, {
        status: "cancelado",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest({
      cookie: ownerCookie,
      method: "POST",
      path: "/api/nfe/cancelar",
      body: {
        vendaId: "venda-1",
        justificativa: "Cancelamento solicitado pelo cliente.",
      },
    });
    const body = response.body as { success: true; nfe: { status: string; numero: string; chave: string } };
    const venda = getTenantAppState(ownerSession).vendas.find((item) => item.id === "venda-1");

    expect(response.status).toBe(200);
    expect(body.nfe.status).toBe("cancelada");
    expect(body.nfe.numero).toBe("456");
    expect(body.nfe.chave).toBe("35123456789012345678901234567890123456789012");
    expect(venda?.nfe?.status).toBe("cancelada");
    expect(venda?.nfe?.danfeUrl).toBe("https://homologacao.focusnfe.com.br/arquivos/development/danfe.pdf");
    expect(venda?.nfe?.emitidaEm).toBe("2026-03-28T12:30:00.000Z");
  });
});
