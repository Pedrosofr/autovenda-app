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

describe("Persistencia de custos", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-costs-"));
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

  it("faz backfill dos custos legados em custos_json para a tabela costs", () => {
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
    db.prepare("update tenant_state set custos_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "cost-1",
          veiculoId: "veh-1",
          categoria: "mecanica",
          descricao: "Troca de amortecedor",
          valor: 1850,
          data: "2026-04-13T10:00:00.000Z",
          criadoEm: "2026-04-13T10:00:00.000Z",
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.custos).toHaveLength(1);
    expect(state.custos[0]?.id).toBe("cost-1");
    expect(state.custos[0]?.descricao).toBe("Troca de amortecedor");

    const rows = db.prepare("select id, tenant_id, veiculo_id, categoria, valor from costs where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      veiculo_id: string;
      categoria: string;
      valor: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.veiculo_id).toBe("veh-1");
    expect(rows[0]?.categoria).toBe("mecanica");
    expect(Number(rows[0]?.valor)).toBe(1850);

    const legacy = db.prepare("select custos_json from tenant_state where tenant_id = ?").get(tenantId) as { custos_json: string };
    expect(legacy.custos_json).toBe("[]");
  });

  it("grava custos novos diretamente na tabela costs", () => {
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
      custos: [
        {
          id: "cost-2",
          veiculoId: "veh-2",
          categoria: "pintura",
          descricao: "Pintura lateral",
          valor: 2300,
          data: "2026-04-13T11:00:00.000Z",
          criadoEm: "2026-04-13T11:00:00.000Z",
        },
      ],
    });

    const db = getDatabase();
    const row = db.prepare("select categoria, valor, data_json from costs where id = ?").get("cost-2") as {
      categoria: string;
      valor: number;
      data_json: string;
    };

    expect(row.categoria).toBe("pintura");
    expect(Number(row.valor)).toBe(2300);
    const parsed = JSON.parse(row.data_json) as { descricao?: string; veiculoId?: string };
    expect(parsed.descricao).toBe("Pintura lateral");
    expect(parsed.veiculoId).toBe("veh-2");
  });
});
