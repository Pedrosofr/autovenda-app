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
  updateVendaNfe,
} from "../../server/database";

describe("Persistencia de vendas", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-sales-"));
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

  it("faz backfill das vendas legadas em vendas_json para a tabela sales", () => {
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
    db.prepare("update tenant_state set vendas_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "sale-1",
          veiculoId: "veh-1",
          vendedorId: "1",
          valor: 88900,
          data: "2026-04-13T10:00:00.000Z",
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.vendas).toHaveLength(1);
    expect(state.vendas[0]?.id).toBe("sale-1");

    const rows = db.prepare("select id, tenant_id, veiculo_id, valor from sales where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      veiculo_id: string;
      valor: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("sale-1");
    expect(rows[0]?.veiculo_id).toBe("veh-1");
    expect(Number(rows[0]?.valor)).toBe(88900);

    const legacy = db.prepare("select vendas_json from tenant_state where tenant_id = ?").get(tenantId) as { vendas_json: string };
    expect(legacy.vendas_json).toBe("[]");
  });

  it("grava vendas novas e atualiza NF-e diretamente na tabela sales", () => {
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
      vendas: [
        {
          id: "sale-2",
          veiculoId: "veh-2",
          vendedorId: "1",
          valor: 97900,
          data: "2026-04-13T11:00:00.000Z",
          custo: {
            custoAquisicao: 80000,
          },
        },
      ],
    });

    const updated = updateVendaNfe(auth.session.tenantId!, "sale-2", {
      status: "autorizada",
      ref: "nfe-ref-1",
      numero: "123",
    });

    const db = getDatabase();
    const row = db.prepare("select valor, data_json from sales where id = ?").get("sale-2") as {
      valor: number;
      data_json: string;
    };

    expect(Number(row.valor)).toBe(97900);
    const parsed = JSON.parse(row.data_json) as {
      nfe?: { status?: string; ref?: string; numero?: string };
      custo?: { custoAquisicao?: number };
    };
    expect(parsed.custo?.custoAquisicao).toBe(80000);
    expect(parsed.nfe?.status).toBe("autorizada");
    expect(parsed.nfe?.ref).toBe("nfe-ref-1");
    expect(parsed.nfe?.numero).toBe("123");
    expect((updated as { nfe?: { status?: string } }).nfe?.status).toBe("autorizada");
  });
});
