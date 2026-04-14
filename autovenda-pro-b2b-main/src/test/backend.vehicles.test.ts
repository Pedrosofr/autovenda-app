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

describe("Persistencia de veiculos", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-vehicles-"));
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

  it("faz backfill do estoque legado em veiculos_json para a tabela vehicles", () => {
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
    db.prepare("update tenant_state set veiculos_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "veh-1",
          fotos: [],
          fotosDestaque: [],
          modelo: "Cruze LT",
          marca: "Chevrolet",
          ano: "2023",
          custo: "70000",
          valorVenda: "82900",
          status: "disponivel",
          createdAt: "2026-04-13T10:00:00.000Z",
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.veiculos).toHaveLength(1);
    expect(state.veiculos[0]?.modelo).toBe("Cruze LT");

    const rows = db.prepare("select id, tenant_id, modelo from vehicles where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      modelo: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("veh-1");
    expect(rows[0]?.modelo).toBe("Cruze LT");

    const legacy = db.prepare("select veiculos_json from tenant_state where tenant_id = ?").get(tenantId) as { veiculos_json: string };
    expect(legacy.veiculos_json).toBe("[]");
  });

  it("grava atualizacoes do estoque diretamente na tabela vehicles", () => {
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
      veiculos: [
        {
          id: "veh-2",
          fotos: [],
          fotosDestaque: [],
          modelo: "Corolla XEi",
          marca: "Toyota",
          ano: "2022",
          custo: "82000",
          valorVenda: "94900",
          status: "reservado",
          createdAt: "2026-04-13T11:00:00.000Z",
        },
      ],
    });

    const db = getDatabase();
    const row = db.prepare("select modelo, status, valor_venda from vehicles where id = ?").get("veh-2") as {
      modelo: string;
      status: string;
      valor_venda: string;
    };

    expect(row.modelo).toBe("Corolla XEi");
    expect(row.status).toBe("reservado");
    expect(row.valor_venda).toBe("94900");
  });

  it("bloqueia quando a loja excede o limite de veiculos ativos do plano", () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
      maxVehicles: 1,
    });

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    expect(() =>
      updateTenantAppState(auth.session, {
        veiculos: [
          {
            id: "veh-10",
            fotos: [],
            fotosDestaque: [],
            modelo: "HB20 Comfort",
            ano: "2023",
            custo: "50000",
            valorVenda: "58900",
            status: "disponivel",
            createdAt: "2026-04-13T11:00:00.000Z",
          },
          {
            id: "veh-11",
            fotos: [],
            fotosDestaque: [],
            modelo: "Onix LT",
            ano: "2022",
            custo: "52000",
            valorVenda: "60900",
            status: "disponivel",
            createdAt: "2026-04-13T11:10:00.000Z",
          },
        ],
      }),
    ).toThrowError(/limite de 1 veiculos ativos/i);
  });
});
