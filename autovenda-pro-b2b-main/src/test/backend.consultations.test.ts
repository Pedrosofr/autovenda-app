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

describe("Persistencia de consultas", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-consultations-"));
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

  it("faz backfill das consultas legadas em consultas_json para a tabela vehicle_consultations", () => {
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
    db.prepare("update tenant_state set consultas_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "consult-1",
          placa: "ABC1D23",
          veiculoId: "veh-1",
          data: "2026-04-13T10:00:00.000Z",
          consultaTitulo: "Consulta completa",
          statusLabel: "Concluida",
          moduleIds: ["consulta_fipe"],
          totalPriceCents: 990,
          resultados: [],
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.consultas).toHaveLength(1);
    expect(state.consultas[0]?.id).toBe("consult-1");
    expect(state.consultas[0]?.consultaTitulo).toBe("Consulta completa");

    const rows = db.prepare("select id, tenant_id, placa, veiculo_id from vehicle_consultations where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      placa: string;
      veiculo_id: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.placa).toBe("ABC1D23");
    expect(rows[0]?.veiculo_id).toBe("veh-1");

    const legacy = db.prepare("select consultas_json from tenant_state where tenant_id = ?").get(tenantId) as { consultas_json: string };
    expect(legacy.consultas_json).toBe("[]");
  });

  it("grava consultas novas diretamente na tabela vehicle_consultations", () => {
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
      consultas: [
        {
          id: "consult-2",
          placa: "XYZ9K88",
          veiculoId: "veh-2",
          data: "2026-04-13T11:00:00.000Z",
          consultaTitulo: "Consulta FIPE",
          statusLabel: "Concluida",
          moduleIds: ["consulta_fipe"],
          totalPriceCents: 990,
          resultados: [],
        },
      ],
    });

    const db = getDatabase();
    const row = db.prepare("select placa, veiculo_id, data_json from vehicle_consultations where id = ?").get("consult-2") as {
      placa: string;
      veiculo_id: string;
      data_json: string;
    };

    expect(row.placa).toBe("XYZ9K88");
    expect(row.veiculo_id).toBe("veh-2");
    const parsed = JSON.parse(row.data_json) as { consultaTitulo?: string; totalPriceCents?: number };
    expect(parsed.consultaTitulo).toBe("Consulta FIPE");
    expect(parsed.totalPriceCents).toBe(990);
  });
});
