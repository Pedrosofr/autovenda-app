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

describe("Persistencia de tarefas pos-venda", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-post-sale-tasks-"));
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

  it("faz backfill das tarefas legadas em tarefas_json para a tabela post_sale_tasks", () => {
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
    db.prepare("update tenant_state set tarefas_json = ? where tenant_id = ?").run(
      JSON.stringify([
        {
          id: "task-1",
          vendaId: "sale-1",
          veiculoId: "veh-1",
          titulo: "Entregar documento",
          categoria: "documento",
          status: "pendente",
          responsavel: "Julia",
          criadoEm: "2026-04-13T10:00:00.000Z",
        },
      ]),
      tenantId,
    );

    const auth = authenticateUser("julia@autoprime.com", "123456");
    if (!auth) throw new Error("Falha ao autenticar owner.");

    const state = getTenantAppState(auth.session);
    expect(state.tarefasPosVenda).toHaveLength(1);
    expect(state.tarefasPosVenda[0]?.id).toBe("task-1");
    expect(state.tarefasPosVenda[0]?.titulo).toBe("Entregar documento");

    const rows = db.prepare("select id, tenant_id, venda_id, categoria, status from post_sale_tasks where tenant_id = ?").all(tenantId) as Array<{
      id: string;
      tenant_id: number;
      venda_id: string;
      categoria: string;
      status: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.venda_id).toBe("sale-1");
    expect(rows[0]?.categoria).toBe("documento");
    expect(rows[0]?.status).toBe("pendente");

    const legacy = db.prepare("select tarefas_json from tenant_state where tenant_id = ?").get(tenantId) as { tarefas_json: string };
    expect(legacy.tarefas_json).toBe("[]");
  });

  it("grava tarefas novas diretamente na tabela post_sale_tasks", () => {
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
      tarefasPosVenda: [
        {
          id: "task-2",
          vendaId: "sale-2",
          veiculoId: "veh-2",
          titulo: "Agendar entrega",
          descricao: "Confirmar horario com o cliente",
          categoria: "entrega",
          status: "em_andamento",
          responsavel: "Mario",
          criadoEm: "2026-04-13T11:00:00.000Z",
        },
      ],
    });

    const db = getDatabase();
    const row = db.prepare("select categoria, status, responsavel, data_json from post_sale_tasks where id = ?").get("task-2") as {
      categoria: string;
      status: string;
      responsavel: string;
      data_json: string;
    };

    expect(row.categoria).toBe("entrega");
    expect(row.status).toBe("em_andamento");
    expect(row.responsavel).toBe("Mario");
    const parsed = JSON.parse(row.data_json) as { titulo?: string; descricao?: string };
    expect(parsed.titulo).toBe("Agendar entrega");
    expect(parsed.descricao).toBe("Confirmar horario com o cliente");
  });
});
