import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { Pool } from "pg";
import { checkDatabaseHealth } from "../server/database";

type TableSpec = {
  table: string;
  columns: string[];
  resetSequence?: boolean;
};

const TABLES: TableSpec[] = [
  {
    table: "users",
    columns: ["id", "email", "password_hash", "name", "platform_role", "active", "created_at", "updated_at"],
    resetSequence: true,
  },
  {
    table: "tenants",
    columns: ["id", "name", "slug", "status", "plan_code", "max_users", "max_vehicles", "trial_ends_at", "nfe_enabled", "nfe_config_json", "created_at", "updated_at"],
    resetSequence: true,
  },
  {
    table: "memberships",
    columns: ["id", "tenant_id", "user_id", "role", "active", "sales_goal_monthly", "seller_permissions", "created_at", "updated_at"],
    resetSequence: true,
  },
  {
    table: "sessions",
    columns: ["id", "user_id", "membership_id", "token_hash", "expires_at", "revoked_at", "ip_address", "user_agent", "created_at"],
    resetSequence: true,
  },
  {
    table: "tenant_state",
    columns: ["tenant_id", "veiculos_json", "leads_json", "vendas_json", "consultas_json", "tarefas_json", "custos_json", "config_json", "memoria_json", "created_at", "updated_at"],
  },
  {
    table: "audit_log",
    columns: ["id", "tenant_id", "actor_user_id", "action", "payload_json", "created_at"],
    resetSequence: true,
  },
  {
    table: "password_reset_tokens",
    columns: ["id", "user_id", "token_hash", "expires_at", "used_at", "created_at"],
    resetSequence: true,
  },
];

function getSourcePath() {
  const configured = process.env.SQLITE_MIGRATION_PATH ?? process.env.DATABASE_PATH;
  if (!configured) {
    throw new Error("Configure SQLITE_MIGRATION_PATH ou DATABASE_PATH para apontar para o SQLite de origem.");
  }
  return resolve(configured);
}

function quoteColumns(columns: string[]) {
  return columns.map((column) => `"${column}"`).join(", ");
}

async function main() {
  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    throw new Error("Configure DIRECT_URL ou DATABASE_URL para o Postgres de destino.");
  }

  await checkDatabaseHealth();

  const sqlite = new DatabaseSync(getSourcePath(), { open: true });
  const pool = new Pool({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query("begin");
    await pool.query("truncate table password_reset_tokens, audit_log, sessions, tenant_state, memberships, tenants, users restart identity cascade");

    for (const spec of TABLES) {
      const rows = sqlite.prepare(`select ${spec.columns.join(", ")} from ${spec.table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        continue;
      }

      const columnList = quoteColumns(spec.columns);

      for (const row of rows) {
        const values = spec.columns.map((column) => row[column] ?? null);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        await pool.query(
          `insert into ${spec.table} (${columnList}) values (${placeholders})`,
          values,
        );
      }

      if (spec.resetSequence) {
        await pool.query(
          `select setval(pg_get_serial_sequence($1, 'id'), coalesce((select max(id) from ${spec.table}), 1), true)`,
          [spec.table],
        );
      }
    }

    await pool.query("commit");

    console.log(
      JSON.stringify({
        status: "ok",
        source: getSourcePath(),
        destination: "postgres",
        tables: TABLES.map((item) => item.table),
      }),
    );
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
