// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticateUser,
  createTenantWithOwner,
  resetDatabaseConnectionForTests,
  updateStoreStatus,
  updateTenantAppState,
} from "../../server/database";

describe("Limites administrativos da loja", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-store-limits-"));
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

  it("nao permite reduzir o limite de veiculos abaixo do estoque ativo atual", () => {
    const { tenantId } = createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
      maxVehicles: 5,
    });

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    updateTenantAppState(auth.session, {
      veiculos: [
        {
          id: "veh-1",
          fotos: [],
          fotosDestaque: [],
          modelo: "Cruze LT",
          ano: "2023",
          custo: "70000",
          valorVenda: "82900",
          status: "disponivel",
          createdAt: "2026-04-13T10:00:00.000Z",
        },
        {
          id: "veh-2",
          fotos: [],
          fotosDestaque: [],
          modelo: "Corolla XEi",
          ano: "2022",
          custo: "82000",
          valorVenda: "94900",
          status: "reservado",
          createdAt: "2026-04-13T11:00:00.000Z",
        },
      ],
    });

    expect(() => updateStoreStatus(tenantId, { maxVehicles: 1 })).toThrowError(/2 veiculos ativos/i);
  });
});
