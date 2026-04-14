// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBackendRequest } from "../../server/backend";
import {
  authenticateUser,
  createSellerForTenant,
  createTenantWithOwner,
  getTenantAppState,
  listTenantMembers,
  resetDatabaseConnectionForTests,
  updateTenantAppState,
} from "../../server/database";

async function apiRequest(input: {
  cookie?: string;
  method: string;
  path: string;
  body?: unknown;
}) {
  return handleBackendRequest({
    method: input.method,
    path: input.path,
    headers: {
      cookie: input.cookie ?? "",
      origin: "http://localhost:8082",
    },
    body: input.body,
  });
}

describe("Autorizacao e isolamento multi-tenant", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-authz-"));
    process.env.DATABASE_PATH = join(tempDir, "rozzcar.sqlite");
    process.env.APP_BASE_URL = "http://localhost:8082";
    process.env.PLATFORM_ADMIN_EMAIL = "admin@plataforma.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "123456";
    process.env.PLATFORM_ADMIN_NAME = "Admin Plataforma";
    resetDatabaseConnectionForTests();
  });

  afterEach(() => {
    resetDatabaseConnectionForTests();
    delete process.env.DATABASE_PATH;
    delete process.env.APP_BASE_URL;
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    delete process.env.PLATFORM_ADMIN_NAME;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("retorna apenas o estado da loja autenticada em /api/app/state", async () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    createTenantWithOwner({
      storeName: "Mega Motors",
      slug: "mega-motors",
      ownerName: "Rafael",
      ownerEmail: "rafael@megamotors.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerA = authenticateUser("julia@autoprime.com", "123456");
    const ownerB = authenticateUser("rafael@megamotors.com", "123456");
    if (!ownerA || !ownerB) throw new Error("Falha ao autenticar owners.");

    updateTenantAppState(ownerA.session, {
      veiculos: [
        {
          id: "veh-a",
          fotos: [],
          fotosDestaque: [],
          modelo: "Compass Longitude",
          ano: "2023",
          custo: "90000",
          valorVenda: "109900",
          status: "disponivel",
          createdAt: "2026-04-13T10:00:00.000Z",
        },
      ],
      leads: [
        {
          id: "lead-a",
          nome: "Cliente A",
          telefone: "11999999999",
          interesse: "Compass Longitude",
          origem: "manual",
          status: "novo",
          vendedorId: "",
          historico: [],
          createdAt: "2026-04-13T10:00:00.000Z",
        },
      ],
    });

    updateTenantAppState(ownerB.session, {
      veiculos: [
        {
          id: "veh-b",
          fotos: [],
          fotosDestaque: [],
          modelo: "Corolla XEi",
          ano: "2022",
          custo: "82000",
          valorVenda: "94900",
          status: "disponivel",
          createdAt: "2026-04-13T11:00:00.000Z",
        },
      ],
      leads: [
        {
          id: "lead-b",
          nome: "Cliente B",
          telefone: "11888888888",
          interesse: "Corolla XEi",
          origem: "manual",
          status: "novo",
          vendedorId: "",
          historico: [],
          createdAt: "2026-04-13T11:00:00.000Z",
        },
      ],
    });

    const responseA = await apiRequest({
      cookie: ownerA.cookieHeader,
      method: "GET",
      path: "/api/app/state",
    });

    const responseB = await apiRequest({
      cookie: ownerB.cookieHeader,
      method: "GET",
      path: "/api/app/state",
    });

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);

    const bodyA = responseA.body as {
      state: {
        veiculos: Array<{ id: string }>;
        leads: Array<{ id: string }>;
      };
    };
    const bodyB = responseB.body as {
      state: {
        veiculos: Array<{ id: string }>;
        leads: Array<{ id: string }>;
      };
    };

    expect(bodyA.state.veiculos.map((item) => item.id)).toEqual(["veh-a"]);
    expect(bodyA.state.leads.map((item) => item.id)).toEqual(["lead-a"]);
    expect(bodyB.state.veiculos.map((item) => item.id)).toEqual(["veh-b"]);
    expect(bodyB.state.leads.map((item) => item.id)).toEqual(["lead-b"]);
  });

  it("retorna 403 quando seller tenta alterar permissoes da equipe", async () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerAuth = authenticateUser("julia@autoprime.com", "123456");
    if (!ownerAuth) throw new Error("Falha ao autenticar owner.");

    createSellerForTenant(ownerAuth.session, {
      name: "Mario",
      email: "mario@autoprime.com",
      password: "654321",
      role: "seller",
    });

    const sellerAuth = authenticateUser("mario@autoprime.com", "654321");
    if (!sellerAuth) throw new Error("Falha ao autenticar seller.");

    const members = await listTenantMembers(ownerAuth.session);
    const seller = members.find((member) => member.email === "mario@autoprime.com");
    if (!seller) throw new Error("Seller nao encontrado na loja.");

    const response = await apiRequest({
      cookie: sellerAuth.cookieHeader,
      method: "PATCH",
      path: `/api/tenant/members/${seller.id}/permissions`,
      body: {
        verCreditos: false,
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: "Acesso restrito ao owner da loja.",
    });
  });

  it("retorna 403 quando seller tenta acessar consultas ou NF-e", async () => {
    const { tenantId } = createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerAuth = authenticateUser("julia@autoprime.com", "123456");
    if (!ownerAuth) throw new Error("Falha ao autenticar owner.");

    createSellerForTenant(ownerAuth.session, {
      name: "Mario",
      email: "mario@autoprime.com",
      password: "654321",
      role: "seller",
    });

    const sellerAuth = authenticateUser("mario@autoprime.com", "654321");
    if (!sellerAuth) throw new Error("Falha ao autenticar seller.");

    const consultaResponse = await apiRequest({
      cookie: sellerAuth.cookieHeader,
      method: "GET",
      path: "/api/consultas/catalogo",
    });

    const nfeResponse = await apiRequest({
      cookie: sellerAuth.cookieHeader,
      method: "GET",
      path: "/api/nfe/config",
    });

    expect(tenantId).toBeGreaterThan(0);
    expect(consultaResponse.status).toBe(403);
    expect(nfeResponse.status).toBe(403);
    expect(consultaResponse.body).toMatchObject({
      error: "Acesso restrito ao owner da loja.",
    });
    expect(nfeResponse.body).toMatchObject({
      error: "Acesso restrito ao owner da loja.",
    });
  });

  it("remove vendas, consultas e custos do escopo do seller e ignora escrita desses recursos", async () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerAuth = authenticateUser("julia@autoprime.com", "123456");
    if (!ownerAuth) throw new Error("Falha ao autenticar owner.");

    createSellerForTenant(ownerAuth.session, {
      name: "Mario",
      email: "mario@autoprime.com",
      password: "654321",
      role: "seller",
    });

    const sellerAuth = authenticateUser("mario@autoprime.com", "654321");
    if (!sellerAuth) throw new Error("Falha ao autenticar seller.");

    const ownerMembershipId = ownerAuth.session.membershipId;
    const sellerMembershipId = sellerAuth.session.membershipId;
    if (!ownerMembershipId || !sellerMembershipId) throw new Error("Memberships nao encontrados.");

    updateTenantAppState(ownerAuth.session, {
      leads: [
        {
          id: "lead-owner",
          nome: "Cliente Owner",
          telefone: "11911111111",
          interesse: "Compass",
          origem: "manual",
          data: "2026-04-13T10:00:00.000Z",
          vendedorId: String(ownerMembershipId),
          status: "novo",
          historico: [],
          anotacoes: "",
        },
        {
          id: "lead-seller",
          nome: "Cliente Seller",
          telefone: "11922222222",
          interesse: "Corolla",
          origem: "manual",
          data: "2026-04-13T11:00:00.000Z",
          vendedorId: String(sellerMembershipId),
          status: "novo",
          historico: [],
          anotacoes: "",
        },
      ],
      vendas: [
        {
          id: "sale-owner",
          veiculoId: "veh-owner",
          vendedorId: String(ownerMembershipId),
          valor: 88900,
          data: "2026-04-13T10:00:00.000Z",
        },
        {
          id: "sale-seller",
          veiculoId: "veh-seller",
          vendedorId: String(sellerMembershipId),
          valor: 97900,
          data: "2026-04-13T11:00:00.000Z",
        },
      ],
      consultas: [
        {
          id: "consulta-owner",
          placa: "ABC1D23",
          data: "2026-04-13T09:00:00.000Z",
          consultaTitulo: "Consulta owner",
          statusLabel: "Concluida",
          moduleIds: ["consulta_fipe"],
          totalPriceCents: 990,
          resultados: [],
        },
      ],
      custos: [
        {
          id: "cost-owner",
          veiculoId: "veh-owner",
          categoria: "mecanica",
          descricao: "Troca de pneus",
          valor: 1800,
          data: "2026-04-13T12:00:00.000Z",
          criadoEm: "2026-04-13T12:00:00.000Z",
        },
      ],
    });

    const sellerState = getTenantAppState(sellerAuth.session);
    expect(sellerState.vendedores.map((item) => item.id)).toEqual([String(sellerMembershipId)]);
    expect(sellerState.leads.map((item) => item.id)).toEqual(["lead-seller"]);
    expect(sellerState.vendas).toEqual([]);
    expect(sellerState.consultas).toEqual([]);
    expect(sellerState.custos).toEqual([]);

    updateTenantAppState(sellerAuth.session, {
      leads: sellerState.leads.map((lead) =>
        lead.id === "lead-seller"
          ? { ...lead, anotacoes: "Atualizado pelo seller" }
          : lead,
      ),
      vendas: [
        {
          id: "sale-seller",
          veiculoId: "veh-seller",
          vendedorId: String(sellerMembershipId),
          valor: 99500,
          data: "2026-04-13T11:00:00.000Z",
        },
      ],
      consultas: [
        {
          id: "consulta-seller",
          placa: "XYZ9K88",
          data: "2026-04-13T13:00:00.000Z",
          consultaTitulo: "Tentativa seller",
          statusLabel: "Concluida",
          moduleIds: ["consulta_fipe"],
          totalPriceCents: 990,
          resultados: [],
        },
      ],
      custos: [
        {
          id: "cost-seller",
          veiculoId: "veh-seller",
          categoria: "lavagem",
          descricao: "Tentativa seller",
          valor: 100,
          data: "2026-04-13T13:00:00.000Z",
          criadoEm: "2026-04-13T13:00:00.000Z",
        },
      ],
    });

    const ownerState = getTenantAppState(ownerAuth.session);
    expect(ownerState.leads.map((item) => item.id).sort()).toEqual(["lead-owner", "lead-seller"]);
    expect(ownerState.vendas.map((item) => item.id).sort()).toEqual(["sale-owner", "sale-seller"]);
    expect(ownerState.consultas.map((item) => item.id)).toEqual(["consulta-owner"]);
    expect(ownerState.custos.map((item) => item.id)).toEqual(["cost-owner"]);
    expect(ownerState.leads.find((item) => item.id === "lead-owner")?.nome).toBe("Cliente Owner");
    expect(ownerState.leads.find((item) => item.id === "lead-seller")?.anotacoes).toBe("Atualizado pelo seller");
    expect(ownerState.vendas.find((item) => item.id === "sale-owner")?.valor).toBe(88900);
    expect(ownerState.vendas.find((item) => item.id === "sale-seller")?.valor).toBe(97900);
  });

  it("permite exclusao da propria conta e invalida a sessao atual", async () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerAuth = authenticateUser("julia@autoprime.com", "123456");
    if (!ownerAuth) throw new Error("Falha ao autenticar owner.");

    const deleteResponse = await apiRequest({
      cookie: ownerAuth.cookieHeader,
      method: "DELETE",
      path: "/api/account",
    });
    expect(deleteResponse.status).toBe(200);

    const sessionResponse = await apiRequest({
      cookie: ownerAuth.cookieHeader,
      method: "GET",
      path: "/api/auth/session",
    });
    expect(sessionResponse.status).toBe(401);

    const newLogin = authenticateUser("julia@autoprime.com", "123456");
    expect(newLogin).toBeNull();
  });
});
