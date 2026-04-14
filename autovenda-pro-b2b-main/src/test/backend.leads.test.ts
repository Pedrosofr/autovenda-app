// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticateUser,
  createTenantWithOwner,
  getDatabase,
  getTenantAppState,
  resetDatabaseConnectionForTests,
  updateTenantAppState,
} from "../../server/database";

describe("Persistencia de leads", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-leads-"));
    process.env.DATABASE_PATH = join(tempDir, "rozzcar.sqlite");
    process.env.PLATFORM_ADMIN_EMAIL = "admin@plataforma.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "123456";
    process.env.PLATFORM_ADMIN_NAME = "Admin Plataforma";
    resetDatabaseConnectionForTests();
  });

  afterEach(() => {
    resetDatabaseConnectionForTests();
    delete process.env.DATABASE_PATH;
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    delete process.env.PLATFORM_ADMIN_NAME;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("faz backfill do crm legado em leads_json para a tabela leads", () => {
    const { tenantId } = createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const db = getDatabase();
    db.prepare("update tenant_state set leads_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "lead-1",
          nome: "Carlos",
          telefone: "(11) 99999-0000",
          interesse: "Financiamento",
          origem: "whatsapp",
          data: "2026-04-13T10:00:00.000Z",
          vendedorId: "1",
          status: "novo",
          historico: [],
          anotacoes: "",
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.leads).toHaveLength(1);
    expect(state.leads[0]?.nome).toBe("Carlos");

    const rows = db.prepare("select id, tenant_id, nome, origem from leads where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      nome: string;
      origem: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("lead-1");
    expect(rows[0]?.nome).toBe("Carlos");
    expect(rows[0]?.origem).toBe("whatsapp");

    const legacy = db.prepare("select leads_json from tenant_state where tenant_id = ?").get(tenantId) as { leads_json: string };
    expect(legacy.leads_json).toBe("[]");
  });

  it("grava atualizacoes do crm diretamente na tabela leads", () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    updateTenantAppState(auth.session, {
      leads: [
        {
          id: "lead-2",
          nome: "Marina",
          telefone: "(11) 98888-1234",
          interesse: "Troca",
          origem: "manual",
          data: "2026-04-13T11:00:00.000Z",
          vendedorId: "1",
          status: "proposta",
          historico: ["2026-04-13 11:00 - Lead criado"],
          anotacoes: "Cliente quer trocar o usado.",
          valorProposta: 78000,
        },
      ],
    });

    const db = getDatabase();
    const row = db.prepare("select nome, status, origem from leads where id = ?").get("lead-2") as {
      nome: string;
      status: string;
      origem: string;
    };

    expect(row.nome).toBe("Marina");
    expect(row.status).toBe("proposta");
    expect(row.origem).toBe("manual");
  });
});
