import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { createEmptyAppState, type AppStateResourcePatch, type AppStateSnapshot } from "../src/lib/app-state";
import type { ConsultaVeicular, CustoReparo, Lead, TarefaPosVenda, Veiculo, Venda, Vendedor } from "../src/store/types";

const SESSION_COOKIE_NAME = "rozzcar_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 120_000;
const APP_STATE_DEFAULTS = createEmptyAppState();
const NFE_KEY_ENCRYPTION_PREFIX = "enc:v1:";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

export type PlatformRole = "platform_admin" | "owner" | "seller";
export type TenantStatus = "trial" | "active" | "past_due" | "blocked" | "closed";

export interface SellerPermissions {
  verCRM: boolean;
  verEstoque: boolean;
  adicionarVeiculo: boolean;
  editarVeiculo: boolean;
  excluirVeiculo: boolean;
  verConsulta: boolean;
  verPosVenda: boolean;
  verCustos: boolean;
  verCreditos: boolean;
}

export const DEFAULT_SELLER_PERMISSIONS: SellerPermissions = {
  verCRM: true,
  verEstoque: true,
  adicionarVeiculo: true,
  editarVeiculo: true,
  excluirVeiculo: true,
  verConsulta: true,
  verPosVenda: true,
  verCustos: true,
  verCreditos: true,
};

function parseSellerPermissions(raw: string | null | undefined): SellerPermissions {
  if (!raw) return { ...DEFAULT_SELLER_PERMISSIONS };
  try {
    const parsed = JSON.parse(raw) as Partial<SellerPermissions>;
    return { ...DEFAULT_SELLER_PERMISSIONS, ...parsed };
  } catch {
    return { ...DEFAULT_SELLER_PERMISSIONS };
  }
}

function getSellerScopeMembershipId(actor: AuthenticatedSession) {
  if (actor.role !== "seller" || actor.membershipId === null) return null;
  return String(actor.membershipId);
}

function scopeAppStateForActor(actor: AuthenticatedSession, snapshot: AppStateSnapshot): AppStateSnapshot {
  const sellerMembershipId = getSellerScopeMembershipId(actor);
  if (!sellerMembershipId) return snapshot;

  return {
    ...snapshot,
    vendedores: snapshot.vendedores.filter((vendedor) => vendedor.id === sellerMembershipId),
    leads: snapshot.leads.filter((lead) => lead.vendedorId === sellerMembershipId),
    vendas: [],
    consultas: [],
    custos: [],
  };
}

function scopeVendedoresForActor(actor: AuthenticatedSession, vendedores: Vendedor[]) {
  const sellerMembershipId = getSellerScopeMembershipId(actor);
  if (!sellerMembershipId) return vendedores;
  return vendedores.filter((vendedor) => vendedor.id === sellerMembershipId);
}

function normalizeSellerLeadsForSync(actor: AuthenticatedSession, leads: Lead[]) {
  const sellerMembershipId = getSellerScopeMembershipId(actor);
  if (!sellerMembershipId) return leads;
  return leads.map((lead) => ({ ...lead, vendedorId: sellerMembershipId }));
}

function normalizeSellerSalesForSync(actor: AuthenticatedSession, sales: Venda[]) {
  const sellerMembershipId = getSellerScopeMembershipId(actor);
  if (!sellerMembershipId) return sales;
  return sales.map((sale) => ({ ...sale, vendedorId: sellerMembershipId }));
}

function restrictPatchForActor(actor: AuthenticatedSession, patch: AppStateResourcePatch): AppStateResourcePatch {
  if (actor.role !== "seller") return patch;

  return {
    ...patch,
    vendas: undefined,
    consultas: undefined,
    custos: undefined,
  };
}

function mergeSellerScopedResourceByVendor<T extends { vendedorId: string }>(
  actor: AuthenticatedSession,
  existingItems: T[],
  nextItems: T[],
) {
  const sellerMembershipId = getSellerScopeMembershipId(actor);
  if (!sellerMembershipId) return nextItems;

  return [
    ...existingItems.filter((item) => item.vendedorId !== sellerMembershipId),
    ...nextItems.map((item) => ({ ...item, vendedorId: sellerMembershipId })),
  ];
}

export interface AuthenticatedSession {
  sessionId: number;
  userId: number;
  membershipId: number | null;
  email: string;
  name: string;
  role: PlatformRole;
  tenantId: number | null;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantStatus: TenantStatus | null;
  trialEndsAt: string | null;
  planCode: string | null;
  salesGoalMonthly: number | null;
  sellerPermissions: SellerPermissions;
  nfeEnabled: boolean;
  nfeConfigured: boolean;
  expiresAt: string;
}

type MemberRow = {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  ativo: number;
  meta_mensal: number | null;
  seller_permissions: string | null;
  criado_em: string;
};

type InviteRow = {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  meta_mensal: number | null;
  status: "pending" | "expired" | "accepted" | "revoked";
  expires_em: string;
  criado_em: string;
};

type VehicleTableRow = {
  id: string | number;
  tenant_id: string | number;
  modelo: string | null;
  marca: string | null;
  ano: string | null;
  status: string | null;
  valor_venda: string | null;
  archived_at: string | Date | null;
  deleted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type LeadTableRow = {
  id: string | number;
  tenant_id: string | number;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  status: string | null;
  vendedor_id: string | null;
  veiculo_id: string | null;
  archived_at: string | Date | null;
  deleted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type SaleTableRow = {
  id: string | number;
  tenant_id: string | number;
  veiculo_id: string | null;
  vendedor_id: string | null;
  valor: number | string | null;
  data: string | Date | null;
  archived_at: string | Date | null;
  deleted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type CostTableRow = {
  id: string | number;
  tenant_id: string | number;
  veiculo_id: string | null;
  categoria: string | null;
  valor: number | string | null;
  data: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type PostSaleTaskTableRow = {
  id: string | number;
  tenant_id: string | number;
  venda_id: string | null;
  veiculo_id: string | null;
  categoria: string | null;
  status: string | null;
  responsavel: string | null;
  concluido_em: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type ConsultationTableRow = {
  id: string | number;
  tenant_id: string | number;
  placa: string | null;
  veiculo_id: string | null;
  data: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  data_json: string;
};

type Awaitable<T> = T | Promise<T>;

let dbInstance: DatabaseSync | null = null;
let initializedPath: string | null = null;
let pgPool: Pool | null = null;
let pgInitPromise: Promise<Pool> | null = null;
let warnedMissingSessionSecret = false;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET obrigatorio em producao.");
  }
  if (!warnedMissingSessionSecret) {
    warnedMissingSessionSecret = true;
    console.warn("[Auth] SESSION_SECRET ausente fora de producao. Usando fallback inseguro apenas para desenvolvimento.");
  }
  return "dev-insecure-session-secret";
}

function getNfeEncryptionKey() {
  const configured = process.env.NFE_CONFIG_ENCRYPTION_KEY?.trim();
  const material = configured || getSessionSecret();
  return createHash("sha256").update(material).digest();
}

function encryptNfeApiKey(value: string) {
  const plain = value.trim();
  if (!plain || plain.startsWith(NFE_KEY_ENCRYPTION_PREFIX)) return plain;
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getNfeEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${NFE_KEY_ENCRYPTION_PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

function decryptNfeApiKey(value: string) {
  const raw = value.trim();
  if (!raw || !raw.startsWith(NFE_KEY_ENCRYPTION_PREFIX)) return raw;
  const encoded = raw.slice(NFE_KEY_ENCRYPTION_PREFIX.length);
  const [ivHex, payloadHex, tagHex] = encoded.split(":");
  if (!ivHex || !payloadHex || !tagHex) return "";
  const iv = Buffer.from(ivHex, "hex");
  const payload = Buffer.from(payloadHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  if (iv.length !== IV_BYTE_LENGTH || authTag.length !== AUTH_TAG_BYTE_LENGTH) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", getNfeEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

const POSTGRES_SCHEMA_SQL = `
  create table if not exists users (
    id bigint generated by default as identity primary key,
    email text not null unique,
    password_hash text not null,
    name text not null,
    platform_role text not null default 'tenant_user' check (platform_role in ('platform_admin', 'tenant_user')),
    active boolean not null default true,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists tenants (
    id bigint generated by default as identity primary key,
    name text not null,
    slug text not null unique,
    status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'blocked', 'closed')),
    plan_code text not null default 'starter',
    max_users integer not null default 10,
    max_vehicles integer not null default 30,
    trial_ends_at timestamptz not null,
    nfe_enabled boolean not null default false,
    nfe_config_json text,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists memberships (
    id bigint generated by default as identity primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    user_id bigint not null references users(id) on delete cascade,
    role text not null check (role in ('owner', 'seller')),
    active boolean not null default true,
    sales_goal_monthly integer,
    seller_permissions text,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    unique (tenant_id, user_id)
  );

  create table if not exists sessions (
    id bigint generated by default as identity primary key,
    user_id bigint not null references users(id) on delete cascade,
    membership_id bigint references memberships(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    ip_address text,
    user_agent text,
    created_at timestamptz not null default current_timestamp
  );

  create table if not exists tenant_state (
    tenant_id bigint primary key references tenants(id) on delete cascade,
    veiculos_json text not null default '[]',
    leads_json text not null default '[]',
    vendas_json text not null default '[]',
    consultas_json text not null default '[]',
    tarefas_json text not null default '[]',
    custos_json text not null default '[]',
    config_json text not null default '{}',
    memoria_json text not null default '{}',
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists vehicles (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    modelo text,
    marca text,
    ano text,
    status text,
    valor_venda text,
    archived_at timestamptz,
    deleted_at timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists leads (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    nome text,
    telefone text,
    origem text,
    status text,
    vendedor_id text,
    veiculo_id text,
    archived_at timestamptz,
    deleted_at timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists sales (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    veiculo_id text,
    vendedor_id text,
    valor numeric,
    data timestamptz,
    archived_at timestamptz,
    deleted_at timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists costs (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    veiculo_id text,
    categoria text,
    valor numeric,
    data timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists post_sale_tasks (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    venda_id text,
    veiculo_id text,
    categoria text,
    status text,
    responsavel text,
    concluido_em timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists vehicle_consultations (
    id text primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    placa text,
    veiculo_id text,
    data timestamptz,
    data_json text not null,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists audit_log (
    id bigint generated by default as identity primary key,
    tenant_id bigint references tenants(id) on delete cascade,
    actor_user_id bigint references users(id) on delete set null,
    action text not null,
    payload_json text not null default '{}',
    created_at timestamptz not null default current_timestamp
  );

  create table if not exists password_reset_tokens (
    id bigint generated by default as identity primary key,
    user_id bigint not null references users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default current_timestamp
  );

  create table if not exists tenant_invites (
    id bigint generated by default as identity primary key,
    tenant_id bigint not null references tenants(id) on delete cascade,
    name text not null,
    email text not null,
    role text not null check (role in ('owner', 'seller')),
    sales_goal_monthly integer,
    invited_by_user_id bigint references users(id) on delete set null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
  );

  create table if not exists api_rate_limits (
    key text primary key,
    window_started_at timestamptz not null,
    hit_count integer not null default 0,
    updated_at timestamptz not null default current_timestamp
  );

  create index if not exists idx_memberships_tenant on memberships (tenant_id);
  create index if not exists idx_memberships_user on memberships (user_id);
  create index if not exists idx_sessions_user on sessions (user_id);
  create index if not exists idx_sessions_membership on sessions (membership_id);
  create index if not exists idx_tenants_status on tenants (status);
  create index if not exists idx_vehicles_tenant on vehicles (tenant_id);
  create index if not exists idx_vehicles_tenant_status on vehicles (tenant_id, status);
  create index if not exists idx_leads_tenant on leads (tenant_id);
  create index if not exists idx_leads_tenant_status on leads (tenant_id, status);
  create index if not exists idx_sales_tenant on sales (tenant_id);
  create index if not exists idx_sales_tenant_data on sales (tenant_id, data);
  create index if not exists idx_costs_tenant on costs (tenant_id);
  create index if not exists idx_costs_tenant_veiculo on costs (tenant_id, veiculo_id);
  create index if not exists idx_post_sale_tasks_tenant on post_sale_tasks (tenant_id);
  create index if not exists idx_post_sale_tasks_tenant_venda on post_sale_tasks (tenant_id, venda_id);
  create index if not exists idx_vehicle_consultations_tenant on vehicle_consultations (tenant_id);
  create index if not exists idx_vehicle_consultations_tenant_data on vehicle_consultations (tenant_id, data);
  create index if not exists idx_reset_tokens_user on password_reset_tokens (user_id);
  create index if not exists idx_tenant_invites_tenant on tenant_invites (tenant_id);
  create index if not exists idx_tenant_invites_email on tenant_invites (email);
  create index if not exists idx_tenant_invites_expires on tenant_invites (expires_at);
  create index if not exists idx_users_email on users (email);
  create index if not exists idx_audit_log_tenant on audit_log (tenant_id);
  create index if not exists idx_api_rate_limits_updated_at on api_rate_limits (updated_at);
`;

function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function asIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(String(value)).toISOString();
}

function asBool(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1" || value.toLowerCase() === "t";
  return false;
}

async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient,
) {
  const executor = client ?? await getPgPool();
  const result = await executor.query<T>(text, params);
  return result;
}

async function withPgTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const pool = await getPgPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function writeAuditLogPg(input: {
  tenantId?: number | null;
  actorUserId?: number | null;
  action: string;
  payload?: Record<string, unknown>;
}, client?: PoolClient) {
  await pgQuery(
    `insert into audit_log (tenant_id, actor_user_id, action, payload_json, created_at)
     values ($1, $2, $3, $4, $5)`,
    [input.tenantId ?? null, input.actorUserId ?? null, input.action, JSON.stringify(input.payload ?? {}), nowIso()],
    client,
  );
}

async function ensurePlatformAdminPg(pool: Pool) {
  const email = normalizeEmail(getEnv("PLATFORM_ADMIN_EMAIL"));
  const existingResult = await pool.query<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [email],
  );
  const existing = existingResult.rows[0];

  const rawPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  const hashFromEnv = process.env.PLATFORM_ADMIN_PASSWORD_HASH?.trim();
  const passwordHash = rawPassword
    ? hashPassword(rawPassword)
    : hashFromEnv
      ? hashFromEnv
      : null;

  if (!passwordHash) {
    throw new Error("Configure PLATFORM_ADMIN_PASSWORD ou PLATFORM_ADMIN_PASSWORD_HASH.");
  }

  if (!existing) {
    await pool.query(
      `insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
       values ($1, $2, $3, 'platform_admin', true, $4, $5)`,
      [email, passwordHash, "Platform Admin", nowIso(), nowIso()],
    );
    return;
  }

  await pool.query(
    `update users
     set password_hash = $1, name = 'Platform Admin', platform_role = 'platform_admin', active = true, updated_at = $2
     where id = $3`,
    [passwordHash, nowIso(), existing.id],
  );
}

async function getPgPool() {
  if (pgPool) return pgPool;
  if (pgInitPromise) return pgInitPromise;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  pgInitPromise = (async () => {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      ssl: { rejectUnauthorized: false },
    });

    await pool.query(POSTGRES_SCHEMA_SQL);
    await ensurePlatformAdminPg(pool);
    pgPool = pool;
    return pool;
  })();

  return pgInitPromise;
}

function getDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.VERCEL) return "/tmp/rozzcar.sqlite";
  return join(process.cwd(), "data", "rozzcar.sqlite");
}

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel ${name} nao configurada.`);
  }
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function writeAuditLog(db: DatabaseSync, input: {
  tenantId?: number | null;
  actorUserId?: number | null;
  action: string;
  payload?: Record<string, unknown>;
}) {
  db.prepare(`
    insert into audit_log (tenant_id, actor_user_id, action, payload_json, created_at)
    values (?, ?, ?, ?, ?)
  `).run(
    input.tenantId ?? null,
    input.actorUserId ?? null,
    input.action,
    JSON.stringify(input.payload ?? {}),
    nowIso(),
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isLegacySha256Hash(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("pbkdf2$")) {
    const [, iterationText, salt, expectedHash] = storedHash.split("$");
    const iterations = Number(iterationText);
    const derived = pbkdf2Sync(password, salt, iterations, 32, "sha256");
    const expected = Buffer.from(expectedHash, "hex");
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }

  if (isLegacySha256Hash(storedHash)) {
    const inputHash = createHash("sha256").update(password).digest("hex");
    return timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
  }

  return false;
}

function hashToken(token: string) {
  return createHmac("sha256", getSessionSecret()).update(token).digest("hex");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function resourceKey(column: keyof Omit<AppStateSnapshot, "vendedores">) {
  return {
    veiculos: "veiculos_json",
    leads: "leads_json",
    vendas: "vendas_json",
    consultas: "consultas_json",
    tarefasPosVenda: "tarefas_json",
    custos: "custos_json",
    configPrecos: "config_json",
    memoriaLoja: "memoria_json",
  }[column];
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    pragma foreign_keys = on;
    pragma journal_mode = wal;

    create table if not exists users (
      id integer primary key autoincrement,
      email text not null unique,
      password_hash text not null,
      name text not null,
      platform_role text not null default 'tenant_user' check (platform_role in ('platform_admin', 'tenant_user')),
      active integer not null default 1,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists tenants (
      id integer primary key autoincrement,
      name text not null,
      slug text not null unique,
      status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'blocked', 'closed')),
      plan_code text not null default 'starter',
      max_users integer not null default 10,
      max_vehicles integer not null default 30,
      trial_ends_at text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists memberships (
      id integer primary key autoincrement,
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer not null references users(id) on delete cascade,
      role text not null check (role in ('owner', 'seller')),
      active integer not null default 1,
      sales_goal_monthly integer,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      unique (tenant_id, user_id)
    );

    create table if not exists sessions (
      id integer primary key autoincrement,
      user_id integer not null references users(id) on delete cascade,
      membership_id integer references memberships(id) on delete cascade,
      token_hash text not null unique,
      expires_at text not null,
      revoked_at text,
      ip_address text,
      user_agent text,
      created_at text not null default current_timestamp
    );

    create table if not exists tenant_state (
      tenant_id integer primary key references tenants(id) on delete cascade,
      veiculos_json text not null default '[]',
      leads_json text not null default '[]',
      vendas_json text not null default '[]',
      consultas_json text not null default '[]',
      tarefas_json text not null default '[]',
      custos_json text not null default '[]',
      config_json text not null default '{}',
      memoria_json text not null default '{}',
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists vehicles (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      modelo text,
      marca text,
      ano text,
      status text,
      valor_venda text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists leads (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      nome text,
      telefone text,
      origem text,
      status text,
      vendedor_id text,
      veiculo_id text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists sales (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      veiculo_id text,
      vendedor_id text,
      valor real,
      data text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists costs (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      veiculo_id text,
      categoria text,
      valor real,
      data text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists post_sale_tasks (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      venda_id text,
      veiculo_id text,
      categoria text,
      status text,
      responsavel text,
      concluido_em text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists vehicle_consultations (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      placa text,
      veiculo_id text,
      data text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists vehicle_consultations (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      placa text,
      veiculo_id text,
      data text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists post_sale_tasks (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      venda_id text,
      veiculo_id text,
      categoria text,
      status text,
      responsavel text,
      concluido_em text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists costs (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      veiculo_id text,
      categoria text,
      valor real,
      data text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists audit_log (
      id integer primary key autoincrement,
      tenant_id integer references tenants(id) on delete cascade,
      actor_user_id integer references users(id) on delete set null,
      action text not null,
      payload_json text not null default '{}',
      created_at text not null default current_timestamp
    );

    create table if not exists password_reset_tokens (
      id integer primary key autoincrement,
      user_id integer not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at text not null,
      used_at text,
      created_at text not null default current_timestamp
    );

    create table if not exists tenant_invites (
      id integer primary key autoincrement,
      tenant_id integer not null references tenants(id) on delete cascade,
      name text not null,
      email text not null,
      role text not null check (role in ('owner', 'seller')),
      sales_goal_monthly integer,
      invited_by_user_id integer references users(id) on delete set null,
      token_hash text not null unique,
      expires_at text not null,
      accepted_at text,
      revoked_at text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists api_rate_limits (
      key text primary key,
      window_started_at text not null,
      hit_count integer not null default 0,
      updated_at text not null default current_timestamp
    );

    create index if not exists idx_memberships_tenant on memberships (tenant_id);
    create index if not exists idx_memberships_user on memberships (user_id);
    create index if not exists idx_sessions_user on sessions (user_id);
    create index if not exists idx_sessions_membership on sessions (membership_id);
    create index if not exists idx_tenants_status on tenants (status);
    create index if not exists idx_vehicles_tenant on vehicles (tenant_id);
    create index if not exists idx_vehicles_tenant_status on vehicles (tenant_id, status);
    create index if not exists idx_leads_tenant on leads (tenant_id);
    create index if not exists idx_leads_tenant_status on leads (tenant_id, status);
    create index if not exists idx_sales_tenant on sales (tenant_id);
    create index if not exists idx_sales_tenant_data on sales (tenant_id, data);
    create index if not exists idx_costs_tenant on costs (tenant_id);
    create index if not exists idx_costs_tenant_veiculo on costs (tenant_id, veiculo_id);
    create index if not exists idx_post_sale_tasks_tenant on post_sale_tasks (tenant_id);
    create index if not exists idx_post_sale_tasks_tenant_venda on post_sale_tasks (tenant_id, venda_id);
    create index if not exists idx_vehicle_consultations_tenant on vehicle_consultations (tenant_id);
    create index if not exists idx_vehicle_consultations_tenant_data on vehicle_consultations (tenant_id, data);
    create index if not exists idx_vehicle_consultations_tenant on vehicle_consultations (tenant_id);
    create index if not exists idx_vehicle_consultations_tenant_data on vehicle_consultations (tenant_id, data);
    create index if not exists idx_post_sale_tasks_tenant on post_sale_tasks (tenant_id);
    create index if not exists idx_post_sale_tasks_tenant_venda on post_sale_tasks (tenant_id, venda_id);
    create index if not exists idx_costs_tenant on costs (tenant_id);
    create index if not exists idx_costs_tenant_veiculo on costs (tenant_id, veiculo_id);
    create index if not exists idx_reset_tokens_user on password_reset_tokens (user_id);
    create index if not exists idx_tenant_invites_tenant on tenant_invites (tenant_id);
    create index if not exists idx_tenant_invites_email on tenant_invites (email);
    create index if not exists idx_tenant_invites_expires on tenant_invites (expires_at);
    create index if not exists idx_users_email on users (email);
    create index if not exists idx_audit_log_tenant on audit_log (tenant_id);
    create index if not exists idx_api_rate_limits_updated_at on api_rate_limits (updated_at);
  `);
}

function hasColumn(db: DatabaseSync, table: string, column: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function runMigrations(db: DatabaseSync) {
  if (!hasColumn(db, "tenants", "max_users")) {
    db.exec("alter table tenants add column max_users integer not null default 10;");
  }
  if (!hasColumn(db, "tenants", "max_vehicles")) {
    db.exec("alter table tenants add column max_vehicles integer not null default 30;");
  }
  if (!hasColumn(db, "memberships", "seller_permissions")) {
    db.exec("alter table memberships add column seller_permissions text;");
  }
  if (!hasColumn(db, "tenants", "nfe_enabled")) {
    db.exec("alter table tenants add column nfe_enabled integer not null default 0;");
  }
  if (!hasColumn(db, "tenants", "nfe_config_json")) {
    db.exec("alter table tenants add column nfe_config_json text;");
  }
  db.exec(`
    create table if not exists vehicles (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      modelo text,
      marca text,
      ano text,
      status text,
      valor_venda text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists leads (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      nome text,
      telefone text,
      origem text,
      status text,
      vendedor_id text,
      veiculo_id text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists sales (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      veiculo_id text,
      vendedor_id text,
      valor real,
      data text,
      archived_at text,
      deleted_at text,
      data_json text not null,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create table if not exists api_rate_limits (
      key text primary key,
      window_started_at text not null,
      hit_count integer not null default 0,
      updated_at text not null default current_timestamp
    );
    create table if not exists tenant_invites (
      id integer primary key autoincrement,
      tenant_id integer not null references tenants(id) on delete cascade,
      name text not null,
      email text not null,
      role text not null check (role in ('owner', 'seller')),
      sales_goal_monthly integer,
      invited_by_user_id integer references users(id) on delete set null,
      token_hash text not null unique,
      expires_at text not null,
      accepted_at text,
      revoked_at text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );
    create index if not exists idx_api_rate_limits_updated_at on api_rate_limits (updated_at);
    create index if not exists idx_vehicles_tenant on vehicles (tenant_id);
    create index if not exists idx_vehicles_tenant_status on vehicles (tenant_id, status);
    create index if not exists idx_leads_tenant on leads (tenant_id);
    create index if not exists idx_leads_tenant_status on leads (tenant_id, status);
    create index if not exists idx_sales_tenant on sales (tenant_id);
    create index if not exists idx_sales_tenant_data on sales (tenant_id, data);
    create index if not exists idx_tenant_invites_tenant on tenant_invites (tenant_id);
    create index if not exists idx_tenant_invites_email on tenant_invites (email);
    create index if not exists idx_tenant_invites_expires on tenant_invites (expires_at);
  `);
}

function ensurePlatformAdmin(db: DatabaseSync) {
  const email = normalizeEmail(getEnv("PLATFORM_ADMIN_EMAIL"));
  const existing = db
    .prepare("select id, password_hash from users where email = ?")
    .get(email) as { id: number; password_hash: string } | undefined;

  const rawPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  const hashFromEnv = process.env.PLATFORM_ADMIN_PASSWORD_HASH?.trim();
  const passwordHash = rawPassword
    ? hashPassword(rawPassword)
    : hashFromEnv
      ? hashFromEnv
      : null;

  if (!passwordHash) {
    throw new Error("Configure PLATFORM_ADMIN_PASSWORD ou PLATFORM_ADMIN_PASSWORD_HASH.");
  }

  if (!existing) {
    db.prepare(`
      insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
      values (?, ?, ?, 'platform_admin', 1, ?, ?)
    `).run(email, passwordHash, "Platform Admin", nowIso(), nowIso());
    return;
  }

  db.prepare(`
    update users
    set password_hash = ?, name = 'Platform Admin', platform_role = 'platform_admin', active = 1, updated_at = ?
    where id = ?
  `).run(passwordHash, nowIso(), existing.id);
}

export function resetDatabaseConnectionForTests() {
  if (dbInstance) {
    dbInstance.close();
  }
  if (pgPool) {
    void pgPool.end();
  }
  dbInstance = null;
  initializedPath = null;
  pgPool = null;
  pgInitPromise = null;
}

export function getDatabase() {
  if (shouldUsePostgres()) {
    throw new Error("getDatabase nao esta disponivel em modo Postgres.");
  }
  const path = getDatabasePath();
  if (dbInstance && initializedPath === path) {
    return dbInstance;
  }

  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  // WAL mode: permite leituras simultâneas durante escritas (essencial para múltiplos usuários)
  db.exec("PRAGMA journal_mode=WAL;");
  // Espera até 8 segundos se o banco estiver ocupado em vez de falhar imediatamente
  db.exec("PRAGMA busy_timeout=8000;");
  // Mais rápido com WAL, ainda seguro contra corrupção
  db.exec("PRAGMA synchronous=NORMAL;");
  // Cache de 8MB em memória para leituras mais rápidas
  db.exec("PRAGMA cache_size=-8000;");

  createSchema(db);
  runMigrations(db);
  ensurePlatformAdmin(db);

  dbInstance = db;
  initializedPath = path;
  return db;
}

export function getDatabaseMode() {
  return shouldUsePostgres() ? "postgres" : "sqlite";
}

export async function checkDatabaseHealth() {
  if (shouldUsePostgres()) {
    const result = await pgQuery<{ ok: number }>("select 1 as ok");
    return {
      mode: "postgres" as const,
      status: result.rows[0]?.ok === 1 ? "ok" as const : "error" as const,
    };
  }

  const row = getDatabase().prepare("select 1 as ok").get() as { ok: number };
  return {
    mode: "sqlite" as const,
    status: row.ok === 1 ? "ok" as const : "error" as const,
  };
}

export async function enforceDistributedRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStartedAtMs = Math.floor(now / windowMs) * windowMs;
  const windowStartedAt = new Date(windowStartedAtMs).toISOString();
  const updatedAt = nowIso();

  if (shouldUsePostgres()) {
    const result = await pgQuery<{ hit_count: number; window_started_at: string }>(
      `insert into api_rate_limits (key, window_started_at, hit_count, updated_at)
       values ($1, $2, 1, $3)
       on conflict (key) do update set
         hit_count = case
           when api_rate_limits.window_started_at = excluded.window_started_at then api_rate_limits.hit_count + 1
           else 1
         end,
         window_started_at = excluded.window_started_at,
         updated_at = excluded.updated_at
       returning hit_count, window_started_at`,
      [key, windowStartedAt, updatedAt],
    );

    const row = result.rows[0];
    if (!row || row.hit_count <= limit) {
      return null;
    }

    return Math.max(1, Math.ceil(((new Date(row.window_started_at).getTime() + windowMs) - now) / 1000));
  }

  const db = getDatabase();
  const row = db.prepare(
    "select key, window_started_at, hit_count from api_rate_limits where key = ?",
  ).get(key) as { key: string; window_started_at: string; hit_count: number } | undefined;

  if (!row) {
    db.prepare(
      "insert into api_rate_limits (key, window_started_at, hit_count, updated_at) values (?, ?, 1, ?)",
    ).run(key, windowStartedAt, updatedAt);
    return null;
  }

  const sameWindow = row.window_started_at === windowStartedAt;
  const nextHitCount = sameWindow ? row.hit_count + 1 : 1;

  db.prepare(
    "update api_rate_limits set window_started_at = ?, hit_count = ?, updated_at = ? where key = ?",
  ).run(windowStartedAt, nextHitCount, updatedAt, key);

  if (nextHitCount <= limit) {
    return null;
  }

  return Math.max(1, Math.ceil(((new Date(windowStartedAt).getTime() + windowMs) - now) / 1000));
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "Secure; " : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}; ${secure}`.trim();
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function createTenantWithOwner(input: {
  storeName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  trialDays: number;
  maxUsers: number;
  maxVehicles?: number;
}): Awaitable<{ tenantId: number }> {
  if (shouldUsePostgres()) {
    return pgCreateTenantWithOwner(input);
  }
  const db = getDatabase();
  const existingUser = db.prepare("select id from users where email = ?").get(normalizeEmail(input.ownerEmail)) as { id: number } | undefined;
  if (existingUser) {
    throw new Error("Ja existe um usuario com esse e-mail.");
  }

  const existingStore = db.prepare("select id from tenants where slug = ?").get(input.slug.trim().toLowerCase()) as { id: number } | undefined;
  if (existingStore) {
    throw new Error("Ja existe uma loja com esse identificador.");
  }

  const trialEndsAt = new Date(Date.now() + Math.max(1, input.trialDays) * 86_400_000).toISOString();
  const createdAt = nowIso();

  db.exec("begin");
  try {
    const tenantResult = db.prepare(`
      insert into tenants (name, slug, status, plan_code, max_users, max_vehicles, trial_ends_at, created_at, updated_at)
      values (?, ?, 'trial', 'starter', ?, ?, ?, ?, ?)
      returning id
    `).get(
      input.storeName.trim(),
      input.slug.trim().toLowerCase(),
      Math.max(1, input.maxUsers),
      Math.max(1, input.maxVehicles ?? 30),
      trialEndsAt,
      createdAt,
      createdAt,
    ) as { id: number };

    const userResult = db.prepare(`
      insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
      values (?, ?, ?, 'tenant_user', 1, ?, ?)
      returning id
    `).get(
      normalizeEmail(input.ownerEmail),
      hashPassword(input.ownerPassword),
      input.ownerName.trim(),
      createdAt,
      createdAt,
    ) as { id: number };

    db.prepare(`
      insert into memberships (tenant_id, user_id, role, active, created_at, updated_at)
      values (?, ?, 'owner', 1, ?, ?)
    `).run(tenantResult.id, userResult.id, createdAt, createdAt);

      db.prepare(`
        insert into tenant_state (
          tenant_id, veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json, created_at, updated_at
        ) values (?, '[]', '[]', '[]', '[]', '[]', '[]', '{}', '{}', ?, ?)
      `).run(tenantResult.id, createdAt, createdAt);

      writeAuditLog(db, {
        tenantId: tenantResult.id,
        actorUserId: userResult.id,
        action: "tenant.created",
        payload: {
          storeName: input.storeName.trim(),
          slug: input.slug.trim().toLowerCase(),
          trialDays: Math.max(1, input.trialDays),
          maxUsers: Math.max(1, input.maxUsers),
          maxVehicles: Math.max(1, input.maxVehicles ?? 30),
        },
      });

      db.exec("commit");
      return { tenantId: tenantResult.id };
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function countActiveMemberships(db: DatabaseSync, tenantId: number) {
  const row = db.prepare(`
    select count(*) as total
    from memberships
    where tenant_id = ? and active = 1
  `).get(tenantId) as { total: number };
  return row.total;
}

function countOpenInvites(db: DatabaseSync, tenantId: number) {
  const row = db.prepare(`
    select count(*) as total
    from tenant_invites
    where tenant_id = ?
      and accepted_at is null
      and revoked_at is null
      and datetime(expires_at) > datetime('now')
  `).get(tenantId) as { total: number };
  return row.total;
}

function getTenantUserLimit(db: DatabaseSync, tenantId: number) {
  const row = db.prepare("select max_users from tenants where id = ?").get(tenantId) as { max_users: number } | undefined;
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return row.max_users;
}

function getTenantVehicleLimit(db: DatabaseSync, tenantId: number) {
  const row = db.prepare("select max_vehicles from tenants where id = ?").get(tenantId) as { max_vehicles: number } | undefined;
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return row.max_vehicles;
}

function countActiveVehiclesFromList(vehicles: Veiculo[]) {
  return vehicles.filter((vehicle) => !vehicle.archivedAt && !vehicle.deletedAt && vehicle.status !== "vendido").length;
}

function countActiveVehiclesByTenantSqlite(db: DatabaseSync, tenantId: number) {
  const row = db.prepare(`
    select count(*) as total
    from vehicles
    where tenant_id = ?
      and archived_at is null
      and deleted_at is null
      and coalesce(status, 'disponivel') <> 'vendido'
  `).get(tenantId) as { total: number };
  return Number(row.total ?? 0);
}

function mapInviteStatus(row: {
  accepted_at?: string | null;
  revoked_at?: string | null;
  expires_em: string;
}): InviteRow["status"] {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_em).getTime() <= Date.now()) return "expired";
  return "pending";
}

function hydrateVehicle(row: VehicleTableRow): Veiculo {
  const parsed = parseJson<Partial<Veiculo>>(row.data_json, {});
  return {
    ...parsed,
    id: String(row.id),
    modelo: parsed.modelo ?? row.modelo ?? "",
    marca: parsed.marca ?? row.marca ?? undefined,
    ano: parsed.ano ?? row.ano ?? "",
    status: (parsed.status ?? row.status ?? "disponivel") as Veiculo["status"],
    valorVenda: parsed.valorVenda ?? row.valor_venda ?? "",
    createdAt: parsed.createdAt ?? asIso(row.created_at),
    archivedAt: parsed.archivedAt ?? (row.archived_at ? asIso(row.archived_at) : undefined),
    deletedAt: parsed.deletedAt ?? (row.deleted_at ? asIso(row.deleted_at) : undefined),
    fotos: parsed.fotos ?? [],
    fotosDestaque: parsed.fotosDestaque ?? [],
    custo: parsed.custo ?? "",
  };
}

function vehicleValues(vehicle: Veiculo) {
  const now = nowIso();
  return {
    id: vehicle.id,
    modelo: vehicle.modelo,
    marca: vehicle.marca ?? null,
    ano: vehicle.ano,
    status: vehicle.status,
    valorVenda: vehicle.valorVenda,
    archivedAt: vehicle.archivedAt ?? null,
    deletedAt: vehicle.deletedAt ?? null,
    createdAt: vehicle.createdAt ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(vehicle),
  };
}

function hydrateLead(row: LeadTableRow): Lead {
  const parsed = parseJson<Partial<Lead>>(row.data_json, {});
  return {
    ...parsed,
    id: String(row.id),
    nome: parsed.nome ?? row.nome ?? "",
    telefone: parsed.telefone ?? row.telefone ?? "",
    interesse: parsed.interesse ?? "",
    origem: (parsed.origem ?? row.origem ?? "manual") as Lead["origem"],
    vendedorId: parsed.vendedorId ?? row.vendedor_id ?? "",
    veiculoId: parsed.veiculoId ?? row.veiculo_id ?? undefined,
    data: parsed.data ?? asIso(row.created_at),
    status: (parsed.status ?? row.status ?? "novo") as Lead["status"],
    historico: parsed.historico ?? [],
    anotacoes: parsed.anotacoes ?? "",
    archivedAt: parsed.archivedAt ?? (row.archived_at ? asIso(row.archived_at) : undefined),
    deletedAt: parsed.deletedAt ?? (row.deleted_at ? asIso(row.deleted_at) : undefined),
  };
}

function leadValues(lead: Lead) {
  const now = nowIso();
  return {
    id: lead.id,
    nome: lead.nome,
    telefone: lead.telefone,
    origem: lead.origem,
    status: lead.status,
    vendedorId: lead.vendedorId,
    veiculoId: lead.veiculoId ?? null,
    archivedAt: lead.archivedAt ?? null,
    deletedAt: lead.deletedAt ?? null,
    createdAt: lead.data ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(lead),
  };
}

function hydrateSale(row: SaleTableRow): Venda {
  const parsed = parseJson<Partial<Venda>>(row.data_json, {});
  return {
    ...parsed,
    id: String(row.id),
    veiculoId: parsed.veiculoId ?? row.veiculo_id ?? "",
    vendedorId: parsed.vendedorId ?? row.vendedor_id ?? "",
    valor: parsed.valor ?? Number(row.valor ?? 0),
    data: parsed.data ?? (row.data ? asIso(row.data) : asIso(row.created_at)),
  };
}

function saleValues(sale: Venda) {
  const now = nowIso();
  return {
    id: sale.id,
    veiculoId: sale.veiculoId,
    vendedorId: sale.vendedorId,
    valor: sale.valor,
    data: sale.data,
    createdAt: sale.data ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(sale),
  };
}

function hydrateCost(row: CostTableRow): CustoReparo {
  return {
    ...parseJson(row.data_json, {}),
    id: String(row.id),
    veiculoId: row.veiculo_id ?? "",
    categoria: (row.categoria ?? "outro") as CustoReparo["categoria"],
    valor: row.valor === null || row.valor === undefined ? 0 : Number(row.valor),
    data: row.data ? asIso(row.data) : asIso(row.created_at),
    criadoEm: asIso(row.created_at),
  } as CustoReparo;
}

function costValues(cost: CustoReparo) {
  const now = nowIso();
  return {
    id: cost.id,
    veiculoId: cost.veiculoId,
    categoria: cost.categoria,
    valor: cost.valor,
    data: cost.data,
    createdAt: cost.criadoEm ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(cost),
  };
}

function hydratePostSaleTask(row: PostSaleTaskTableRow): TarefaPosVenda {
  return {
    ...parseJson(row.data_json, {}),
    id: String(row.id),
    vendaId: row.venda_id ?? "",
    veiculoId: row.veiculo_id ?? "",
    categoria: (row.categoria ?? "outro") as TarefaPosVenda["categoria"],
    status: (row.status ?? "pendente") as TarefaPosVenda["status"],
    responsavel: row.responsavel ?? undefined,
    criadoEm: asIso(row.created_at),
    concluidoEm: row.concluido_em ? asIso(row.concluido_em) : undefined,
  } as TarefaPosVenda;
}

function postSaleTaskValues(task: TarefaPosVenda) {
  const now = nowIso();
  return {
    id: task.id,
    vendaId: task.vendaId,
    veiculoId: task.veiculoId,
    categoria: task.categoria,
    status: task.status,
    responsavel: task.responsavel ?? null,
    concluidoEm: task.concluidoEm ?? null,
    createdAt: task.criadoEm ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(task),
  };
}

function hydrateConsultation(row: ConsultationTableRow): ConsultaVeicular {
  return {
    ...parseJson(row.data_json, {}),
    id: String(row.id),
    placa: row.placa ?? "",
    veiculoId: row.veiculo_id ?? undefined,
    data: row.data ? asIso(row.data) : asIso(row.created_at),
  } as ConsultaVeicular;
}

function consultationValues(consultation: ConsultaVeicular) {
  const now = nowIso();
  return {
    id: consultation.id,
    placa: consultation.placa,
    veiculoId: consultation.veiculoId ?? null,
    data: consultation.data,
    createdAt: consultation.data ?? now,
    updatedAt: now,
    dataJson: JSON.stringify(consultation),
  };
}

function mergeSaleWithNfe(current: Venda, nfe: Record<string, unknown>): Venda {
  const incoming = nfe as Partial<NonNullable<Venda["nfe"]>>;
  return {
    ...current,
    nfe: {
      status: incoming.status ?? current.nfe?.status ?? "pendente",
      ...current.nfe,
      ...incoming,
    },
  };
}

function createTenantMembership(db: DatabaseSync, input: {
  tenantId: number;
  name: string;
  email: string;
  password: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const existingUser = db.prepare("select id from users where email = ?").get(normalizedEmail) as { id: number } | undefined;
  if (existingUser) {
    throw new Error("Ja existe um usuario com esse e-mail.");
  }

  const activeUsers = countActiveMemberships(db, input.tenantId);
  const maxUsers = getTenantUserLimit(db, input.tenantId);
  if (activeUsers >= maxUsers) {
    throw new Error(`A loja atingiu o limite de ${maxUsers} usuarios.`);
  }

  const createdAt = nowIso();
  db.exec("begin");
  try {
    const userResult = db.prepare(`
      insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
      values (?, ?, ?, 'tenant_user', 1, ?, ?)
      returning id
    `).get(normalizedEmail, hashPassword(input.password), input.name.trim(), createdAt, createdAt) as { id: number };

      db.prepare(`
        insert into memberships (tenant_id, user_id, role, active, sales_goal_monthly, created_at, updated_at)
        values (?, ?, ?, 1, ?, ?, ?)
      `).run(input.tenantId, userResult.id, input.role, input.salesGoalMonthly ?? null, createdAt, createdAt);

      writeAuditLog(db, {
        tenantId: input.tenantId,
        actorUserId: userResult.id,
        action: "tenant.user.created",
        payload: {
          email: normalizedEmail,
          role: input.role,
          salesGoalMonthly: input.salesGoalMonthly ?? null,
        },
      });

      db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

const INVITE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function createTenantInviteRecord(db: DatabaseSync, actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode convidar usuarios.");
  }

  const normalizedEmail = normalizeEmail(input.email);
  const existingUser = db.prepare("select id from users where email = ?").get(normalizedEmail) as { id: number } | undefined;
  if (existingUser) {
    throw new Error("Ja existe um usuario com esse e-mail.");
  }

  const maxUsers = getTenantUserLimit(db, actor.tenantId);
  const activeUsers = countActiveMemberships(db, actor.tenantId);
  const openInvites = countOpenInvites(db, actor.tenantId);
  if (activeUsers + openInvites >= maxUsers) {
    throw new Error(`A loja atingiu o limite de ${maxUsers} acessos entre usuarios ativos e convites pendentes.`);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString();

  db.exec("begin");
  try {
    db.prepare(`
      update tenant_invites
      set revoked_at = ?, updated_at = ?
      where tenant_id = ?
        and email = ?
        and accepted_at is null
        and revoked_at is null
    `).run(createdAt, createdAt, actor.tenantId, normalizedEmail);

    const invite = db.prepare(`
      insert into tenant_invites (
        tenant_id, name, email, role, sales_goal_monthly, invited_by_user_id, token_hash, expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      returning id
    `).get(
      actor.tenantId,
      input.name.trim(),
      normalizedEmail,
      input.role,
      input.salesGoalMonthly ?? null,
      actor.userId,
      tokenHash,
      expiresAt,
      createdAt,
      createdAt,
    ) as { id: number };

    writeAuditLog(db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "tenant.invite.created",
      payload: {
        inviteId: invite.id,
        email: normalizedEmail,
        role: input.role,
        salesGoalMonthly: input.salesGoalMonthly ?? null,
      },
    });

    db.exec("commit");

    return {
      id: invite.id,
      token,
      email: normalizedEmail,
      expiresAt,
      tenantName: actor.tenantName ?? "",
      role: input.role,
      name: input.name.trim(),
    };
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function revokeTenantInviteRecord(db: DatabaseSync, actor: AuthenticatedSession, inviteId: number) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode cancelar convites.");
  }

  const invite = db.prepare(`
    select id, email, accepted_at, revoked_at, expires_at
    from tenant_invites
    where id = ? and tenant_id = ?
  `).get(inviteId, actor.tenantId) as {
    id: number;
    email: string;
    accepted_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  } | undefined;

  if (!invite) {
    throw new Error("Convite nao encontrado nesta loja.");
  }
  if (invite.accepted_at) {
    throw new Error("Esse convite ja foi aceito.");
  }
  if (invite.revoked_at) {
    return;
  }

  const timestamp = nowIso();
  db.prepare("update tenant_invites set revoked_at = ?, updated_at = ? where id = ?")
    .run(timestamp, timestamp, inviteId);

  writeAuditLog(db, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "tenant.invite.revoked",
    payload: { inviteId, email: invite.email },
  });
}

function listTenantInvitesByTenantIdSqlite(db: DatabaseSync, tenantId: number): InviteRow[] {
  const rows = db.prepare(`
    select
      id,
      name as nome,
      email,
      role as papel,
      sales_goal_monthly as meta_mensal,
      expires_at as expires_em,
      accepted_at,
      revoked_at,
      created_at as criado_em
    from tenant_invites
    where tenant_id = ?
    order by created_at desc
  `).all(tenantId) as Array<{
    id: number;
    nome: string;
    email: string;
    papel: "owner" | "seller";
    meta_mensal: number | null;
    expires_em: string;
    accepted_at: string | null;
    revoked_at: string | null;
    criado_em: string;
  }>;

  return rows.map((row) => ({
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    meta_mensal: row.meta_mensal ?? null,
    status: mapInviteStatus(row),
    expires_em: asIso(row.expires_em),
    criado_em: asIso(row.criado_em),
  }));
}

function listVehiclesByTenantIdSqlite(db: DatabaseSync, tenantId: number): Veiculo[] {
  const rows = db.prepare(`
    select id, tenant_id, modelo, marca, ano, status, valor_venda, archived_at, deleted_at, created_at, updated_at, data_json
    from vehicles
    where tenant_id = ?
    order by datetime(created_at) desc, id desc
  `).all(tenantId) as VehicleTableRow[];
  return rows.map(hydrateVehicle);
}

function syncVehiclesTableSqlite(db: DatabaseSync, tenantId: number, vehicles: Veiculo[]) {
  db.prepare("delete from vehicles where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into vehicles (
      id, tenant_id, modelo, marca, ano, status, valor_venda, archived_at, deleted_at, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const vehicle of vehicles) {
    const values = vehicleValues(vehicle);
    statement.run(
      values.id,
      tenantId,
      values.modelo,
      values.marca,
      values.ano,
      values.status,
      values.valorVenda,
      values.archivedAt,
      values.deletedAt,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensureVehiclesBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from vehicles where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacyVehicles = parseJson<Veiculo[]>(legacyRaw, []);
  if (!legacyVehicles.length) return;

  db.exec("begin");
  try {
    syncVehiclesTableSqlite(db, tenantId, legacyVehicles);
    db.prepare("update tenant_state set veiculos_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function listLeadsByTenantIdSqlite(db: DatabaseSync, tenantId: number): Lead[] {
  const rows = db.prepare(`
    select id, tenant_id, nome, telefone, origem, status, vendedor_id, veiculo_id, archived_at, deleted_at, created_at, updated_at, data_json
    from leads
    where tenant_id = ?
    order by datetime(created_at) desc, id desc
  `).all(tenantId) as LeadTableRow[];
  return rows.map(hydrateLead);
}

function syncLeadsTableSqlite(db: DatabaseSync, tenantId: number, leads: Lead[]) {
  db.prepare("delete from leads where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into leads (
      id, tenant_id, nome, telefone, origem, status, vendedor_id, veiculo_id, archived_at, deleted_at, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lead of leads) {
    const values = leadValues(lead);
    statement.run(
      values.id,
      tenantId,
      values.nome,
      values.telefone,
      values.origem,
      values.status,
      values.vendedorId,
      values.veiculoId,
      values.archivedAt,
      values.deletedAt,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensureLeadsBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from leads where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacyLeads = parseJson<Lead[]>(legacyRaw, []);
  if (!legacyLeads.length) return;

  db.exec("begin");
  try {
    syncLeadsTableSqlite(db, tenantId, legacyLeads);
    db.prepare("update tenant_state set leads_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function listSalesByTenantIdSqlite(db: DatabaseSync, tenantId: number): Venda[] {
  const rows = db.prepare(`
    select id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, created_at, updated_at, data_json
    from sales
    where tenant_id = ?
    order by datetime(coalesce(data, created_at)) desc, id desc
  `).all(tenantId) as SaleTableRow[];
  return rows.map(hydrateSale);
}

function syncSalesTableSqlite(db: DatabaseSync, tenantId: number, sales: Venda[]) {
  db.prepare("delete from sales where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into sales (
      id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sale of sales) {
    const values = saleValues(sale);
    statement.run(
      values.id,
      tenantId,
      values.veiculoId,
      values.vendedorId,
      values.valor,
      values.data,
      null,
      null,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensureSalesBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from sales where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacySales = parseJson<Venda[]>(legacyRaw, []);
  if (!legacySales.length) return;

  db.exec("begin");
  try {
    syncSalesTableSqlite(db, tenantId, legacySales);
    db.prepare("update tenant_state set vendas_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function listCostsByTenantIdSqlite(db: DatabaseSync, tenantId: number): CustoReparo[] {
  const rows = db.prepare(`
    select id, tenant_id, veiculo_id, categoria, valor, data, created_at, updated_at, data_json
    from costs
    where tenant_id = ?
    order by datetime(coalesce(data, created_at)) desc, id desc
  `).all(tenantId) as CostTableRow[];
  return rows.map(hydrateCost);
}

function syncCostsTableSqlite(db: DatabaseSync, tenantId: number, costs: CustoReparo[]) {
  db.prepare("delete from costs where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into costs (
      id, tenant_id, veiculo_id, categoria, valor, data, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cost of costs) {
    const values = costValues(cost);
    statement.run(
      values.id,
      tenantId,
      values.veiculoId,
      values.categoria,
      values.valor,
      values.data,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensureCostsBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from costs where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacyCosts = parseJson<CustoReparo[]>(legacyRaw, []);
  if (!legacyCosts.length) return;

  db.exec("begin");
  try {
    syncCostsTableSqlite(db, tenantId, legacyCosts);
    db.prepare("update tenant_state set custos_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function listPostSaleTasksByTenantIdSqlite(db: DatabaseSync, tenantId: number): TarefaPosVenda[] {
  const rows = db.prepare(`
    select id, tenant_id, venda_id, veiculo_id, categoria, status, responsavel, concluido_em, created_at, updated_at, data_json
    from post_sale_tasks
    where tenant_id = ?
    order by datetime(created_at) desc, id desc
  `).all(tenantId) as PostSaleTaskTableRow[];
  return rows.map(hydratePostSaleTask);
}

function syncPostSaleTasksTableSqlite(db: DatabaseSync, tenantId: number, tasks: TarefaPosVenda[]) {
  db.prepare("delete from post_sale_tasks where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into post_sale_tasks (
      id, tenant_id, venda_id, veiculo_id, categoria, status, responsavel, concluido_em, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const task of tasks) {
    const values = postSaleTaskValues(task);
    statement.run(
      values.id,
      tenantId,
      values.vendaId,
      values.veiculoId,
      values.categoria,
      values.status,
      values.responsavel,
      values.concluidoEm,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensurePostSaleTasksBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from post_sale_tasks where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacyTasks = parseJson<TarefaPosVenda[]>(legacyRaw, []);
  if (!legacyTasks.length) return;

  db.exec("begin");
  try {
    syncPostSaleTasksTableSqlite(db, tenantId, legacyTasks);
    db.prepare("update tenant_state set tarefas_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function listConsultationsByTenantIdSqlite(db: DatabaseSync, tenantId: number): ConsultaVeicular[] {
  const rows = db.prepare(`
    select id, tenant_id, placa, veiculo_id, data, created_at, updated_at, data_json
    from vehicle_consultations
    where tenant_id = ?
    order by datetime(coalesce(data, created_at)) desc, id desc
  `).all(tenantId) as ConsultationTableRow[];
  return rows.map(hydrateConsultation);
}

function syncConsultationsTableSqlite(db: DatabaseSync, tenantId: number, consultations: ConsultaVeicular[]) {
  db.prepare("delete from vehicle_consultations where tenant_id = ?").run(tenantId);
  const statement = db.prepare(`
    insert into vehicle_consultations (
      id, tenant_id, placa, veiculo_id, data, data_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const consultation of consultations) {
    const values = consultationValues(consultation);
    statement.run(
      values.id,
      tenantId,
      values.placa,
      values.veiculoId,
      values.data,
      values.dataJson,
      values.createdAt,
      values.updatedAt,
    );
  }
}

function ensureConsultationsBackfilledSqlite(db: DatabaseSync, tenantId: number, legacyRaw: string | undefined) {
  const count = db.prepare("select count(*) as total from vehicle_consultations where tenant_id = ?").get(tenantId) as { total: number };
  if (Number(count.total) > 0) return;
  const legacyConsultations = parseJson<ConsultaVeicular[]>(legacyRaw, []);
  if (!legacyConsultations.length) return;

  db.exec("begin");
  try {
    syncConsultationsTableSqlite(db, tenantId, legacyConsultations);
    db.prepare("update tenant_state set consultas_json = ?, updated_at = ? where tenant_id = ?")
      .run("[]", nowIso(), tenantId);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

function updateSaleNfeSqlite(db: DatabaseSync, tenantId: number, vendaId: string, nfe: Record<string, unknown>) {
  const row = db.prepare(`
    select id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, created_at, updated_at, data_json
    from sales
    where tenant_id = ? and id = ?
  `).get(tenantId, vendaId) as SaleTableRow | undefined;
  if (!row) throw new Error("Venda nao encontrada.");

  const current = hydrateSale(row);
  const merged = mergeSaleWithNfe(current, nfe);

  const values = saleValues(merged);
  db.prepare(`
    update sales
    set veiculo_id = ?, vendedor_id = ?, valor = ?, data = ?, data_json = ?, updated_at = ?
    where tenant_id = ? and id = ?
  `).run(
    values.veiculoId,
    values.vendedorId,
    values.valor,
    values.data,
    values.dataJson,
    values.updatedAt,
    tenantId,
    vendaId,
  );

  return merged as unknown as Record<string, unknown>;
}

export function createSellerForTenant(actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgCreateSellerForTenant(actor, input);
  }
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode criar usuarios da loja.");
  }

  const db = getDatabase();
  createTenantMembership(db, {
    tenantId: actor.tenantId,
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role ?? "seller",
    salesGoalMonthly: input.salesGoalMonthly,
  });
}

export function createInviteForTenant(actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}): Awaitable<{
  id: number;
  token: string;
  email: string;
  expiresAt: string;
  tenantName: string;
  role: "owner" | "seller";
  name: string;
}> {
  if (shouldUsePostgres()) {
    return pgCreateInviteForTenant(actor, input);
  }
  return createTenantInviteRecord(getDatabase(), actor, {
    ...input,
    role: input.role ?? "seller",
  });
}

export function revokeInviteForTenant(actor: AuthenticatedSession, inviteId: number): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgRevokeInviteForTenant(actor, inviteId);
  }
  revokeTenantInviteRecord(getDatabase(), actor, inviteId);
}

export function createTenantUserForPlatform(storeId: number, input: {
  name: string;
  email: string;
  password: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgCreateTenantUserForPlatform(storeId, input);
  }
  const db = getDatabase();
  createTenantMembership(db, {
    tenantId: storeId,
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
    salesGoalMonthly: input.salesGoalMonthly,
  });
}

export function updateStoreStatus(storeId: number, patch: {
  status?: TenantStatus;
  extendTrialDays?: number;
  trialDays?: number;
  maxUsers?: number;
  maxVehicles?: number;
}): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgUpdateStoreStatus(storeId, patch);
  }
  const db = getDatabase();
  const current = db.prepare("select trial_ends_at, max_users, max_vehicles from tenants where id = ?").get(storeId) as {
    trial_ends_at: string;
    max_users: number;
    max_vehicles: number;
  } | undefined;
  if (!current) {
    throw new Error("Loja nao encontrada.");
  }

  const nextTrialEndsAt = patch.trialDays !== undefined
    ? new Date(Date.now() + Math.max(1, patch.trialDays) * 86_400_000).toISOString()
    : patch.extendTrialDays
      ? new Date(new Date(current.trial_ends_at).getTime() + patch.extendTrialDays * 86_400_000).toISOString()
      : current.trial_ends_at;

  const nextMaxUsers = patch.maxUsers === undefined ? current.max_users : Math.max(1, patch.maxUsers);
  const nextMaxVehicles = patch.maxVehicles === undefined ? current.max_vehicles : Math.max(1, patch.maxVehicles);
  const activeUsers = countActiveMemberships(db, storeId);
  const activeVehicles = countActiveVehiclesByTenantSqlite(db, storeId);
  if (nextMaxUsers < activeUsers) {
    throw new Error(`A loja ja possui ${activeUsers} usuarios ativos.`);
  }
  if (nextMaxVehicles < activeVehicles) {
    throw new Error(`A loja ja possui ${activeVehicles} veiculos ativos.`);
  }

    db.prepare(`
      update tenants
      set status = coalesce(?, status),
          max_users = ?,
          max_vehicles = ?,
          trial_ends_at = ?,
          updated_at = ?
      where id = ?
    `).run(patch.status ?? null, nextMaxUsers, nextMaxVehicles, nextTrialEndsAt, nowIso(), storeId);

    writeAuditLog(db, {
      tenantId: storeId,
      action: "tenant.updated",
      payload: {
        status: patch.status ?? null,
        extendTrialDays: patch.extendTrialDays ?? null,
        trialDays: patch.trialDays ?? null,
        maxUsers: nextMaxUsers,
        maxVehicles: nextMaxVehicles,
      },
    });
  }

function getMembershipForUser(db: DatabaseSync, userId: number) {
  return db.prepare(`
    select
      m.id as membership_id,
      m.tenant_id,
      m.role,
      m.sales_goal_monthly,
      m.seller_permissions,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code,
      t.nfe_enabled,
      case
        when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then 1
        else 0
      end as nfe_configured
    from memberships m
    join tenants t on t.id = m.tenant_id
    where m.user_id = ? and m.active = 1
    order by case when m.role = 'owner' then 0 else 1 end, m.id asc
    limit 1
  `).get(userId) as {
    membership_id: number;
    tenant_id: number;
    role: "owner" | "seller";
    sales_goal_monthly: number | null;
    seller_permissions: string | null;
    tenant_name: string;
    tenant_slug: string;
    tenant_status: TenantStatus;
    trial_ends_at: string;
    plan_code: string;
    nfe_enabled: number;
    nfe_configured: number;
  } | undefined;
}

export function authenticateUser(
  email: string,
  password: string,
  metadata?: { ip?: string; userAgent?: string },
): Awaitable<{ session: AuthenticatedSession; cookieHeader: string } | null> {
  if (shouldUsePostgres()) {
    return pgAuthenticateUser(email, password, metadata);
  }
  const db = getDatabase();
  const user = db.prepare(`
    select id, email, password_hash, name, platform_role, active
    from users
    where email = ?
  `).get(normalizeEmail(email)) as {
    id: number;
    email: string;
    password_hash: string;
    name: string;
    platform_role: "platform_admin" | "tenant_user";
    active: number;
  } | undefined;

  if (!user?.active || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  let membership = undefined;
  let role: PlatformRole = "platform_admin";

  if (user.platform_role !== "platform_admin") {
    membership = getMembershipForUser(db, user.id);
    if (!membership) {
      return null;
    }
    role = membership.role;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const sessionRow = db.prepare(`
    insert into sessions (user_id, membership_id, token_hash, expires_at, ip_address, user_agent, created_at)
    values (?, ?, ?, ?, ?, ?, ?)
    returning id
  `).get(
    user.id,
    membership?.membership_id ?? null,
    tokenHash,
    expiresAt,
    metadata?.ip ?? null,
    metadata?.userAgent ?? null,
    nowIso(),
  ) as { id: number };

  writeAuditLog(db, {
    tenantId: membership?.tenant_id ?? null,
    actorUserId: user.id,
    action: "auth.login",
    payload: {
      role,
      sessionId: sessionRow.id,
      ip: metadata?.ip ?? null,
    },
  });

  return {
    session: buildSessionPayload({
      sessionId: sessionRow.id,
      user,
      membership,
      expiresAt,
    }),
    cookieHeader: serializeCookie(SESSION_COOKIE_NAME, sessionToken, Math.floor(SESSION_TTL_MS / 1000)),
  };
}

function buildSessionPayload(input: {
  sessionId: number;
  user: {
    id: number;
    email: string;
    name: string;
    platform_role: "platform_admin" | "tenant_user";
  };
  membership:
    | {
        membership_id: number;
        tenant_id: number;
        role: "owner" | "seller";
        sales_goal_monthly: number | null;
        seller_permissions: string | null;
        tenant_name: string;
        tenant_slug: string;
        tenant_status: TenantStatus;
        trial_ends_at: string;
        plan_code: string;
        nfe_enabled: number;
        nfe_configured: number;
      }
    | undefined;
  expiresAt: string;
}): AuthenticatedSession {
  const role = input.user.platform_role === "platform_admin" ? "platform_admin" : (input.membership?.role ?? "seller");
  return {
    sessionId: input.sessionId,
    userId: input.user.id,
    membershipId: input.membership?.membership_id ?? null,
    email: input.user.email,
    name: input.user.name,
    role,
    tenantId: input.membership?.tenant_id ?? null,
    tenantName: input.membership?.tenant_name ?? null,
    tenantSlug: input.membership?.tenant_slug ?? null,
    tenantStatus: input.membership?.tenant_status ?? null,
    trialEndsAt: input.membership?.trial_ends_at ? asIso(input.membership.trial_ends_at) : null,
    planCode: input.membership?.plan_code ?? null,
    nfeEnabled: asBool(input.membership?.nfe_enabled),
    nfeConfigured: asBool(input.membership?.nfe_configured),
    salesGoalMonthly: input.membership?.sales_goal_monthly ?? null,
    sellerPermissions: role === "seller"
      ? parseSellerPermissions(input.membership?.seller_permissions)
      : { ...DEFAULT_SELLER_PERMISSIONS },
    expiresAt: asIso(input.expiresAt),
  };
}

export function getSessionFromCookie(cookieHeader: string | undefined): Awaitable<AuthenticatedSession | null> {
  if (shouldUsePostgres()) {
    return pgGetSessionFromCookie(cookieHeader);
  }
  const raw = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  const token = raw?.slice(`${SESSION_COOKIE_NAME}=`.length);
  if (!token) return null;

  const db = getDatabase();
  const row = db.prepare(`
    select
      s.id as session_id,
      s.expires_at,
      s.revoked_at,
      u.id as user_id,
      u.email,
      u.name,
      u.platform_role,
      m.id as membership_id,
      m.role as membership_role,
      m.sales_goal_monthly,
      m.seller_permissions,
      t.id as tenant_id,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code,
      t.nfe_enabled,
      case
        when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then 1
        else 0
      end as nfe_configured
    from sessions s
    join users u on u.id = s.user_id
    left join memberships m on m.id = s.membership_id
    left join tenants t on t.id = m.tenant_id
    where s.token_hash = ?
  `).get(hashToken(token)) as {
    session_id: number;
    expires_at: string;
    revoked_at: string | null;
    user_id: number;
    email: string;
    name: string;
    platform_role: "platform_admin" | "tenant_user";
    membership_id: number | null;
    membership_role: "owner" | "seller" | null;
    sales_goal_monthly: number | null;
    seller_permissions: string | null;
    tenant_id: number | null;
    tenant_name: string | null;
    tenant_slug: string | null;
    tenant_status: TenantStatus | null;
    trial_ends_at: string | null;
    plan_code: string | null;
    nfe_enabled: number | null;
    nfe_configured: number | null;
  } | undefined;

  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  if (row.tenant_status === "trial" && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()) {
    db.prepare("update tenants set status = 'past_due', updated_at = ? where id = ?").run(nowIso(), row.tenant_id);
    row.tenant_status = "past_due";
  }

  if (row.tenant_status === "blocked" || row.tenant_status === "closed") {
    const blockedRole = row.platform_role === "platform_admin" ? "platform_admin" : ((row.membership_role ?? "seller") as PlatformRole);
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      membershipId: row.membership_id,
      email: row.email,
      name: row.name,
      role: blockedRole,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      tenantStatus: row.tenant_status,
      trialEndsAt: row.trial_ends_at,
      planCode: row.plan_code,
      nfeEnabled: !!row.nfe_enabled,
      nfeConfigured: !!row.nfe_configured,
      salesGoalMonthly: row.sales_goal_monthly,
      sellerPermissions: blockedRole === "seller"
        ? parseSellerPermissions(row.seller_permissions)
        : { ...DEFAULT_SELLER_PERMISSIONS },
      expiresAt: row.expires_at,
    };
  }

  const activeRole = row.platform_role === "platform_admin" ? "platform_admin" : ((row.membership_role ?? "seller") as PlatformRole);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    email: row.email,
    name: row.name,
    role: activeRole,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    trialEndsAt: row.trial_ends_at,
    planCode: row.plan_code,
    nfeEnabled: !!row.nfe_enabled,
    nfeConfigured: !!row.nfe_configured,
    salesGoalMonthly: row.sales_goal_monthly,
    sellerPermissions: activeRole === "seller"
      ? parseSellerPermissions(row.seller_permissions)
      : { ...DEFAULT_SELLER_PERMISSIONS },
    expiresAt: row.expires_at,
  };
}

export function revokeSession(sessionId: number): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgRevokeSession(sessionId);
  }
  getDatabase().prepare("update sessions set revoked_at = ? where id = ?").run(nowIso(), sessionId);
}

export function revokeAllSessionsForUser(userId: number): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgRevokeAllSessionsForUser(userId);
  }
  getDatabase().prepare("update sessions set revoked_at = ? where user_id = ? and revoked_at is null").run(nowIso(), userId);
}

export function deleteAccount(session: AuthenticatedSession): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgDeleteAccount(session);
  }
  const db = getDatabase();
  const timestamp = nowIso();
  db.prepare("update sessions set revoked_at = ? where user_id = ? and revoked_at is null").run(timestamp, session.userId);
  db.prepare("update memberships set active = 0, updated_at = ? where user_id = ? and active = 1").run(timestamp, session.userId);
  db.prepare("update users set active = 0, updated_at = ? where id = ?").run(timestamp, session.userId);
  writeAuditLog(db, {
    tenantId: session.tenantId ?? null,
    actorUserId: session.userId,
    action: "auth.account_deleted",
    payload: { selfService: true },
  });
}

export function listStores(): Awaitable<Array<Record<string, unknown>>> {
  if (shouldUsePostgres()) {
    return pgListStores();
  }
  const rows = getDatabase().prepare(`
    select
      t.id,
      t.name,
      t.slug,
      t.status,
      t.plan_code,
      t.max_users,
      t.max_vehicles,
      t.trial_ends_at,
      t.nfe_enabled,
      case
        when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then 1
        else 0
      end as nfe_configured,
      (
        select count(*)
        from memberships m
        where m.tenant_id = t.id and m.active = 1
      ) as users_count,
      (
        select count(*)
        from vehicles v
        where v.tenant_id = t.id
          and v.archived_at is null
          and v.deleted_at is null
          and coalesce(v.status, 'disponivel') <> 'vendido'
      ) as vehicles_count,
      (
        select u.name
        from memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner'
        order by m.id asc
        limit 1
      ) as owner_name,
      (
        select u.email
        from memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner'
        order by m.id asc
        limit 1
      ) as owner_email
    from tenants t
    order by t.created_at desc
  `).all() as Array<Record<string, unknown>>;

  return rows;
}

type AuditRow = {
  id: number;
  action: string;
  payload_json: string;
  created_at: string;
  tenant_id: number | null;
  tenant_name: string | null;
  actor_name: string | null;
};

export function listPlatformAuditEvents(limit = 20): Awaitable<Array<Record<string, unknown>>> {
  if (shouldUsePostgres()) {
    return pgListPlatformAuditEvents(limit);
  }
  const rows = getDatabase().prepare(`
    select
      a.id,
      a.action,
      a.payload_json,
      a.created_at,
      a.tenant_id,
      t.name as tenant_name,
      u.name as actor_name
    from audit_log a
    left join tenants t on t.id = a.tenant_id
    left join users u on u.id = a.actor_user_id
    order by a.created_at desc, a.id desc
    limit ?
  `).all(limit) as AuditRow[];

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    actorName: row.actor_name,
  }));
}

export function listTenantAuditEvents(actor: AuthenticatedSession, limit = 20): Awaitable<Array<Record<string, unknown>>> {
  if (shouldUsePostgres()) {
    return pgListTenantAuditEvents(actor, limit);
  }
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  const rows = getDatabase().prepare(`
    select
      a.id,
      a.action,
      a.payload_json,
      a.created_at,
      a.tenant_id,
      t.name as tenant_name,
      u.name as actor_name
    from audit_log a
    left join tenants t on t.id = a.tenant_id
    left join users u on u.id = a.actor_user_id
    where a.tenant_id = ?
    order by a.created_at desc, a.id desc
    limit ?
  `).all(actor.tenantId, limit) as AuditRow[];

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    actorName: row.actor_name,
  }));
}

export function listTenantMembersByTenantId(tenantId: number): Awaitable<MemberRow[]> {
  if (shouldUsePostgres()) {
    return pgListTenantMembersByTenantId(tenantId);
  }
  const rows = getDatabase().prepare(`
    select
      m.id,
      u.name as nome,
      u.email,
      m.role as papel,
      m.active as ativo,
      m.sales_goal_monthly as meta_mensal,
      m.seller_permissions,
      m.created_at as criado_em
    from memberships m
    join users u on u.id = m.user_id
    where m.tenant_id = ?
    order by case when m.role = 'owner' then 0 else 1 end, u.name asc
  `).all(tenantId) as MemberRow[];

  return rows;
}

export function listTenantInvitesByTenantId(tenantId: number): Awaitable<InviteRow[]> {
  if (shouldUsePostgres()) {
    return pgListTenantInvitesByTenantId(tenantId);
  }
  return listTenantInvitesByTenantIdSqlite(getDatabase(), tenantId);
}

export function updateMemberPermissions(
  actor: AuthenticatedSession,
  memberId: number,
  permissions: Partial<SellerPermissions>,
): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgUpdateMemberPermissions(actor, memberId, permissions);
  }
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode alterar permissoes.");
  }

  const db = getDatabase();
  const member = db.prepare(
    "select id, role, tenant_id from memberships where id = ? and tenant_id = ?",
  ).get(memberId, actor.tenantId) as { id: number; role: string; tenant_id: number } | undefined;

  if (!member) {
    throw new Error("Membro nao encontrado nesta loja.");
  }

  if (member.role === "owner") {
    throw new Error("Nao e possivel restringir permissoes de um owner.");
  }

  const current = db.prepare("select seller_permissions from memberships where id = ?")
    .get(memberId) as { seller_permissions: string | null } | undefined;

  const merged: SellerPermissions = {
    ...parseSellerPermissions(current?.seller_permissions),
    ...permissions,
  };

  db.prepare("update memberships set seller_permissions = ?, updated_at = ? where id = ?")
    .run(JSON.stringify(merged), nowIso(), memberId);
}

export function listTenantMembers(actor: AuthenticatedSession): Awaitable<MemberRow[]> {
  if (shouldUsePostgres()) {
    return pgListTenantMembers(actor);
  }
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  return listTenantMembersByTenantId(actor.tenantId);
}

export function listTenantInvites(actor: AuthenticatedSession): Awaitable<InviteRow[]> {
  if (shouldUsePostgres()) {
    return pgListTenantInvites(actor);
  }
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  return listTenantInvitesByTenantIdSqlite(getDatabase(), actor.tenantId);
}

export function getTenantAppState(actor: AuthenticatedSession): Awaitable<AppStateSnapshot> {
  if (shouldUsePostgres()) {
    return pgGetTenantAppState(actor);
  }
  if (!actor.tenantId) {
    return createEmptyAppState();
  }

  const row = getDatabase().prepare(`
    select veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json
    from tenant_state
    where tenant_id = ?
  `).get(actor.tenantId) as Record<string, string> | undefined;

  const vendedores = (listTenantMembersByTenantId(actor.tenantId) as MemberRow[]).map((member: MemberRow) => ({
    id: String(member.id),
    nome: member.nome,
    metaMensal: member.meta_mensal ?? undefined,
  }));
  const scopedVendedores = scopeVendedoresForActor(actor, vendedores);

  if (!row) {
    return createEmptyAppState({ vendedores: scopedVendedores });
  }

  ensureVehiclesBackfilledSqlite(getDatabase(), actor.tenantId, row.veiculos_json);
  ensureLeadsBackfilledSqlite(getDatabase(), actor.tenantId, row.leads_json);
  ensureSalesBackfilledSqlite(getDatabase(), actor.tenantId, row.vendas_json);
  ensureConsultationsBackfilledSqlite(getDatabase(), actor.tenantId, row.consultas_json);
  ensurePostSaleTasksBackfilledSqlite(getDatabase(), actor.tenantId, row.tarefas_json);
  ensureCostsBackfilledSqlite(getDatabase(), actor.tenantId, row.custos_json);

  return scopeAppStateForActor(actor, createEmptyAppState({
    vendedores,
    veiculos: listVehiclesByTenantIdSqlite(getDatabase(), actor.tenantId),
    leads: listLeadsByTenantIdSqlite(getDatabase(), actor.tenantId),
    vendas: listSalesByTenantIdSqlite(getDatabase(), actor.tenantId),
    consultas: listConsultationsByTenantIdSqlite(getDatabase(), actor.tenantId),
    tarefasPosVenda: listPostSaleTasksByTenantIdSqlite(getDatabase(), actor.tenantId),
    custos: listCostsByTenantIdSqlite(getDatabase(), actor.tenantId),
    configPrecos: { ...APP_STATE_DEFAULTS.configPrecos, ...parseJson(row.config_json, {}) },
    memoriaLoja: { ...APP_STATE_DEFAULTS.memoriaLoja, ...parseJson(row.memoria_json, {}) },
  }));
}

export function updateTenantAppState(actor: AuthenticatedSession, patch: AppStateResourcePatch): Awaitable<AppStateSnapshot> {
  if (shouldUsePostgres()) {
    return pgUpdateTenantAppState(actor, restrictPatchForActor(actor, patch));
  }
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  if (actor.role === "seller" && (patch.configPrecos !== undefined || patch.memoriaLoja !== undefined)) {
    throw new Error("Seller nao pode alterar configuracoes administrativas da loja.");
  }

  const effectivePatch = restrictPatchForActor(actor, patch);

  const db = getDatabase();
  db.prepare(`
    insert into tenant_state (
      tenant_id, veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json, created_at, updated_at
    )
    values (?, '[]', '[]', '[]', '[]', '[]', '[]', '{}', '{}', ?, ?)
    on conflict(tenant_id) do nothing
  `).run(actor.tenantId, nowIso(), nowIso());

  const ALLOWED_COLUMNS = new Set([
    "veiculos_json", "leads_json", "vendas_json", "consultas_json",
    "tarefas_json", "custos_json", "config_json", "memoria_json",
  ]);

  const statements = Object.entries(effectivePatch)
    .filter(([key, value]) => key !== "veiculos" && key !== "leads" && key !== "vendas" && key !== "consultas" && key !== "custos" && key !== "tarefasPosVenda" && value !== undefined)
    .map(([key, value]) => ({
      column: resourceKey(key as keyof Omit<AppStateSnapshot, "vendedores">),
      value: JSON.stringify(value),
    }))
    .filter((s) => s.column && ALLOWED_COLUMNS.has(s.column));

  if (!statements.length && effectivePatch.veiculos === undefined && effectivePatch.leads === undefined && effectivePatch.vendas === undefined && effectivePatch.consultas === undefined && effectivePatch.custos === undefined && effectivePatch.tarefasPosVenda === undefined) {
    return getTenantAppState(actor);
  }

  const scopedLeadsPatch = effectivePatch.leads !== undefined
    ? mergeSellerScopedResourceByVendor(
        actor,
        listLeadsByTenantIdSqlite(db, actor.tenantId),
        normalizeSellerLeadsForSync(actor, effectivePatch.leads),
      )
    : undefined;

  const scopedSalesPatch = effectivePatch.vendas !== undefined
    ? mergeSellerScopedResourceByVendor(
        actor,
        listSalesByTenantIdSqlite(db, actor.tenantId),
        normalizeSellerSalesForSync(actor, effectivePatch.vendas),
      )
    : undefined;

  db.exec("begin");
  try {
    if (effectivePatch.veiculos !== undefined) {
      const maxVehicles = getTenantVehicleLimit(db, actor.tenantId);
      const nextActiveVehicles = countActiveVehiclesFromList(effectivePatch.veiculos);
      if (nextActiveVehicles > maxVehicles) {
        throw new Error(`A loja atingiu o limite de ${maxVehicles} veiculos ativos no plano atual.`);
      }
      syncVehiclesTableSqlite(db, actor.tenantId, effectivePatch.veiculos);
      db.prepare("update tenant_state set veiculos_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    if (scopedLeadsPatch !== undefined) {
      syncLeadsTableSqlite(db, actor.tenantId, scopedLeadsPatch);
      db.prepare("update tenant_state set leads_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    if (scopedSalesPatch !== undefined) {
      syncSalesTableSqlite(db, actor.tenantId, scopedSalesPatch);
      db.prepare("update tenant_state set vendas_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    if (effectivePatch.consultas !== undefined) {
      syncConsultationsTableSqlite(db, actor.tenantId, effectivePatch.consultas);
      db.prepare("update tenant_state set consultas_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    if (effectivePatch.custos !== undefined) {
      syncCostsTableSqlite(db, actor.tenantId, effectivePatch.custos);
      db.prepare("update tenant_state set custos_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    if (effectivePatch.tarefasPosVenda !== undefined) {
      syncPostSaleTasksTableSqlite(db, actor.tenantId, effectivePatch.tarefasPosVenda);
      db.prepare("update tenant_state set tarefas_json = ?, updated_at = ? where tenant_id = ?")
        .run("[]", nowIso(), actor.tenantId);
    }
    for (const statement of statements) {
      db.prepare(`update tenant_state set ${statement.column} = ?, updated_at = ? where tenant_id = ?`).run(
        statement.value,
        nowIso(),
        actor.tenantId,
      );
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }

  writeAuditLog(db, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "tenant.state.updated",
    payload: {
      resources: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined),
      role: actor.role,
    },
  });

  return getTenantAppState(actor);
}

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutos

export function createPasswordResetToken(email: string): Awaitable<{ token: string; userName: string } | null> {
  if (shouldUsePostgres()) {
    return pgCreatePasswordResetToken(email);
  }
  const db = getDatabase();
  const normalizedEmail = normalizeEmail(email);
  const user = db.prepare("select id, name from users where email = ? and active = 1").get(normalizedEmail) as { id: number; name: string } | undefined;
  if (!user) return null;

  // Invalida tokens anteriores nao usados
  db.prepare("update password_reset_tokens set used_at = ? where user_id = ? and used_at is null").run(nowIso(), user.id);

  const token = randomBytes(32).toString("base64url");
  const tokenH = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  db.prepare("insert into password_reset_tokens (user_id, token_hash, expires_at, created_at) values (?, ?, ?, ?)").run(user.id, tokenH, expiresAt, nowIso());

  writeAuditLog(db, { actorUserId: user.id, action: "auth.password_reset_requested" });

  return { token, userName: user.name };
}

export function resetPasswordWithToken(token: string, newPassword: string): Awaitable<boolean> {
  if (shouldUsePostgres()) {
    return pgResetPasswordWithToken(token, newPassword);
  }
  const db = getDatabase();
  const tokenH = hashToken(token);

  const row = db.prepare(`
    select id, user_id, expires_at, used_at
    from password_reset_tokens
    where token_hash = ?
  `).get(tokenH) as { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;

  if (!row) return false;
  if (row.used_at) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  const newHash = hashPassword(newPassword);
  db.prepare("update users set password_hash = ?, updated_at = ? where id = ?").run(newHash, nowIso(), row.user_id);
  db.prepare("update password_reset_tokens set used_at = ? where id = ?").run(nowIso(), row.id);

  // Revoga todas as sessoes ativas do usuario
  db.prepare("update sessions set revoked_at = ? where user_id = ? and revoked_at is null").run(nowIso(), row.user_id);

  writeAuditLog(db, { actorUserId: row.user_id, action: "auth.password_reset_completed" });

  return true;
}

export function acceptInviteWithToken(
  token: string,
  input: { password: string; metadata?: { ip?: string; userAgent?: string } },
): Awaitable<{ session: AuthenticatedSession; cookieHeader: string } | null> {
  if (shouldUsePostgres()) {
    return pgAcceptInviteWithToken(token, input);
  }

  const db = getDatabase();
  const tokenH = hashToken(token);
  const invite = db.prepare(`
    select id, tenant_id, name, email, role, sales_goal_monthly, expires_at, accepted_at, revoked_at
    from tenant_invites
    where token_hash = ?
  `).get(tokenH) as {
    id: number;
    tenant_id: number;
    name: string;
    email: string;
    role: "owner" | "seller";
    sales_goal_monthly: number | null;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  } | undefined;

  if (!invite || invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const tenant = db.prepare("select status from tenants where id = ?").get(invite.tenant_id) as { status: TenantStatus } | undefined;
  if (!tenant || tenant.status === "blocked" || tenant.status === "closed") {
    throw new Error("Essa loja nao pode receber novos acessos agora.");
  }

  const existingUser = db.prepare("select id from users where email = ?").get(invite.email) as { id: number } | undefined;
  if (existingUser) {
    throw new Error("Ja existe um usuario com esse e-mail. Use a recuperacao de senha.");
  }

  const activeUsers = countActiveMemberships(db, invite.tenant_id);
  const maxUsers = getTenantUserLimit(db, invite.tenant_id);
  if (activeUsers >= maxUsers) {
    throw new Error(`A loja atingiu o limite de ${maxUsers} usuarios.`);
  }

  const timestamp = nowIso();
  db.exec("begin");
  try {
    const userResult = db.prepare(`
      insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
      values (?, ?, ?, 'tenant_user', 1, ?, ?)
      returning id
    `).get(invite.email, hashPassword(input.password), invite.name, timestamp, timestamp) as { id: number };

    db.prepare(`
      insert into memberships (tenant_id, user_id, role, active, sales_goal_monthly, created_at, updated_at)
      values (?, ?, ?, 1, ?, ?, ?)
    `).run(invite.tenant_id, userResult.id, invite.role, invite.sales_goal_monthly ?? null, timestamp, timestamp);

    db.prepare("update tenant_invites set accepted_at = ?, updated_at = ? where id = ?")
      .run(timestamp, timestamp, invite.id);

    writeAuditLog(db, {
      tenantId: invite.tenant_id,
      actorUserId: userResult.id,
      action: "tenant.invite.accepted",
      payload: {
        inviteId: invite.id,
        email: invite.email,
        role: invite.role,
      },
    });

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }

  return authenticateUser(invite.email, input.password, input.metadata);
}

export interface NfeConfigData {
  focusApiKey: string;
  ambiente: "homologacao" | "producao";
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual: string;
  regimeTributario: "1" | "2" | "3";
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
}

export interface StoreNfeSettings {
  enabled: boolean;
  configured: boolean;
  config: NfeConfigData | null;
}

function encryptNfeConfig(config: NfeConfigData): NfeConfigData {
  return {
    ...config,
    focusApiKey: encryptNfeApiKey(config.focusApiKey),
  };
}

function decryptNfeConfig(config: NfeConfigData | null): NfeConfigData | null {
  if (!config) return null;
  return {
    ...config,
    focusApiKey: decryptNfeApiKey(config.focusApiKey),
  };
}

export function getNfeConfig(tenantId: number): Awaitable<NfeConfigData | null> {
  if (shouldUsePostgres()) {
    return pgGetNfeConfig(tenantId);
  }
  const row = getDatabase()
    .prepare("select nfe_config_json from tenants where id = ?")
    .get(tenantId) as { nfe_config_json: string | null } | undefined;
  if (!row?.nfe_config_json) return null;
  return decryptNfeConfig(parseJson<NfeConfigData | null>(row.nfe_config_json, null));
}

export function getStoreNfeSettings(storeId: number): Awaitable<StoreNfeSettings> {
  if (shouldUsePostgres()) {
    return pgGetStoreNfeSettings(storeId);
  }
  const row = getDatabase()
    .prepare("select nfe_enabled, nfe_config_json from tenants where id = ?")
    .get(storeId) as { nfe_enabled: number; nfe_config_json: string | null } | undefined;

  if (!row) {
    throw new Error("Loja nao encontrada.");
  }

  return {
    enabled: !!row.nfe_enabled,
    configured: !!row.nfe_config_json?.trim(),
    config: row.nfe_config_json ? decryptNfeConfig(parseJson<NfeConfigData | null>(row.nfe_config_json, null)) : null,
  };
}

export function updateNfeConfig(actor: AuthenticatedSession, config: NfeConfigData): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgUpdateNfeConfig(actor, config);
  }
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode configurar NF-e.");
  }
  getDatabase()
    .prepare("update tenants set nfe_config_json = ?, updated_at = ? where id = ?")
    .run(JSON.stringify(encryptNfeConfig(config)), nowIso(), actor.tenantId);
  writeAuditLog(getDatabase(), {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "tenant.nfe_config_updated",
  });
}

export function updateStoreNfeConfig(storeId: number, config: NfeConfigData, actorUserId?: number | null): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgUpdateStoreNfeConfig(storeId, config, actorUserId);
  }
  const db = getDatabase();
  const tenant = db.prepare("select id from tenants where id = ?").get(storeId) as { id: number } | undefined;
  if (!tenant) {
    throw new Error("Loja nao encontrada.");
  }

  db.prepare("update tenants set nfe_config_json = ?, updated_at = ? where id = ?")
    .run(JSON.stringify(encryptNfeConfig(config)), nowIso(), storeId);

  writeAuditLog(db, {
    tenantId: storeId,
    actorUserId: actorUserId ?? null,
    action: "tenant.nfe_config_updated",
    payload: {
      actorScope: "platform_admin",
    },
  });
}

export function toggleNfeEnabled(storeId: number, enabled: boolean): Awaitable<void> {
  if (shouldUsePostgres()) {
    return pgToggleNfeEnabled(storeId, enabled);
  }
  const db = getDatabase();
  const tenant = db.prepare("select id from tenants where id = ?").get(storeId) as { id: number } | undefined;
  if (!tenant) throw new Error("Loja nao encontrada.");
  db.prepare("update tenants set nfe_enabled = ?, updated_at = ? where id = ?")
    .run(enabled ? 1 : 0, nowIso(), storeId);
  writeAuditLog(db, {
    tenantId: storeId,
    action: "tenant.nfe_toggled",
    payload: { enabled },
  });
}

export function updateVendaNfe(
  tenantId: number,
  vendaId: string,
  nfe: Record<string, unknown>,
): Awaitable<Record<string, unknown> | null> {
  if (shouldUsePostgres()) {
    return pgUpdateVendaNfe(tenantId, vendaId, nfe);
  }
  const db = getDatabase();
  const row = db.prepare("select vendas_json from tenant_state where tenant_id = ?").get(tenantId) as { vendas_json: string } | undefined;
  ensureSalesBackfilledSqlite(db, tenantId, row?.vendas_json);
  return updateSaleNfeSqlite(db, tenantId, vendaId, nfe);
}

async function pgCountActiveMemberships(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<{ total: string }>(
    `select count(*)::text as total from memberships where tenant_id = $1 and active = true`,
    [tenantId],
    client,
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function pgCountActiveVehicles(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<{ total: string }>(
    `select count(*)::text as total
     from vehicles
     where tenant_id = $1
       and archived_at is null
       and deleted_at is null
       and coalesce(status, 'disponivel') <> 'vendido'`,
    [tenantId],
    client,
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function pgGetTenantUserLimit(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<{ max_users: number }>(
    "select max_users from tenants where id = $1",
    [tenantId],
    client,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return Number(row.max_users);
}

async function pgGetTenantVehicleLimit(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<{ max_vehicles: number }>(
    "select max_vehicles from tenants where id = $1",
    [tenantId],
    client,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return Number(row.max_vehicles);
}

async function pgCountOpenInvites(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<{ total: string }>(
    `select count(*)::text as total
     from tenant_invites
     where tenant_id = $1
       and accepted_at is null
       and revoked_at is null
       and expires_at > now()`,
    [tenantId],
    client,
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function pgCreateTenantMembership(input: {
  tenantId: number;
  name: string;
  email: string;
  password: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  return withPgTransaction(async (client) => {
    const normalizedEmail = normalizeEmail(input.email);
    const existingUserResult = await pgQuery<{ id: string }>(
      "select id from users where email = $1",
      [normalizedEmail],
      client,
    );
    if (existingUserResult.rows[0]) {
      throw new Error("Ja existe um usuario com esse e-mail.");
    }

    const activeUsers = await pgCountActiveMemberships(input.tenantId, client);
    const maxUsers = await pgGetTenantUserLimit(input.tenantId, client);
    if (activeUsers >= maxUsers) {
      throw new Error(`A loja atingiu o limite de ${maxUsers} usuarios.`);
    }

    const createdAt = nowIso();
    const userResult = await pgQuery<{ id: string }>(
      `insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
       values ($1, $2, $3, 'tenant_user', true, $4, $5)
       returning id`,
      [normalizedEmail, hashPassword(input.password), input.name.trim(), createdAt, createdAt],
      client,
    );

    const userId = Number(userResult.rows[0].id);
    await pgQuery(
      `insert into memberships (tenant_id, user_id, role, active, sales_goal_monthly, created_at, updated_at)
       values ($1, $2, $3, true, $4, $5, $6)`,
      [input.tenantId, userId, input.role, input.salesGoalMonthly ?? null, createdAt, createdAt],
      client,
    );

    await writeAuditLogPg({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "tenant.user.created",
      payload: {
        email: normalizedEmail,
        role: input.role,
        salesGoalMonthly: input.salesGoalMonthly ?? null,
      },
    }, client);
  });
}

async function pgCreateInviteForTenant(actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode convidar usuarios.");
  }

  return withPgTransaction(async (client) => {
    const normalizedEmail = normalizeEmail(input.email);
    const existingUserResult = await pgQuery<{ id: string }>(
      "select id from users where email = $1",
      [normalizedEmail],
      client,
    );
    if (existingUserResult.rows[0]) {
      throw new Error("Ja existe um usuario com esse e-mail.");
    }

    const maxUsers = await pgGetTenantUserLimit(actor.tenantId!, client);
    const activeUsers = await pgCountActiveMemberships(actor.tenantId!, client);
    const openInvites = await pgCountOpenInvites(actor.tenantId!, client);
    if (activeUsers + openInvites >= maxUsers) {
      throw new Error(`A loja atingiu o limite de ${maxUsers} acessos entre usuarios ativos e convites pendentes.`);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString();

    await pgQuery(
      `update tenant_invites
       set revoked_at = $1, updated_at = $2
       where tenant_id = $3
         and email = $4
         and accepted_at is null
         and revoked_at is null`,
      [createdAt, createdAt, actor.tenantId, normalizedEmail],
      client,
    );

    const inviteResult = await pgQuery<{ id: string }>(
      `insert into tenant_invites (
        tenant_id, name, email, role, sales_goal_monthly, invited_by_user_id, token_hash, expires_at, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id`,
      [
        actor.tenantId,
        input.name.trim(),
        normalizedEmail,
        input.role ?? "seller",
        input.salesGoalMonthly ?? null,
        actor.userId,
        tokenHash,
        expiresAt,
        createdAt,
        createdAt,
      ],
      client,
    );

    const inviteId = Number(inviteResult.rows[0].id);
    await writeAuditLogPg({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "tenant.invite.created",
      payload: {
        inviteId,
        email: normalizedEmail,
        role: input.role ?? "seller",
        salesGoalMonthly: input.salesGoalMonthly ?? null,
      },
    }, client);

    return {
      id: inviteId,
      token,
      email: normalizedEmail,
      expiresAt,
      tenantName: actor.tenantName ?? "",
      role: input.role ?? "seller",
      name: input.name.trim(),
    };
  });
}

async function pgRevokeInviteForTenant(actor: AuthenticatedSession, inviteId: number) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode cancelar convites.");
  }

  const inviteResult = await pgQuery<{
    id: string;
    email: string;
    accepted_at: Date | string | null;
    revoked_at: Date | string | null;
  }>(
    `select id, email, accepted_at, revoked_at
     from tenant_invites
     where id = $1 and tenant_id = $2`,
    [inviteId, actor.tenantId],
  );
  const invite = inviteResult.rows[0];
  if (!invite) {
    throw new Error("Convite nao encontrado nesta loja.");
  }
  if (invite.accepted_at) {
    throw new Error("Esse convite ja foi aceito.");
  }
  if (invite.revoked_at) {
    return;
  }

  await pgQuery("update tenant_invites set revoked_at = $1, updated_at = $2 where id = $3", [nowIso(), nowIso(), inviteId]);
  await writeAuditLogPg({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "tenant.invite.revoked",
    payload: { inviteId, email: invite.email },
  });
}

async function pgCreateTenantWithOwner(input: {
  storeName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  trialDays: number;
  maxUsers: number;
  maxVehicles?: number;
}) {
  const trialEndsAt = new Date(Date.now() + Math.max(1, input.trialDays) * 86_400_000).toISOString();
  const createdAt = nowIso();

  return withPgTransaction(async (client) => {
    const existingUser = await pgQuery<{ id: string }>(
      "select id from users where email = $1",
      [normalizeEmail(input.ownerEmail)],
      client,
    );
    if (existingUser.rows[0]) {
      throw new Error("Ja existe um usuario com esse e-mail.");
    }

    const existingStore = await pgQuery<{ id: string }>(
      "select id from tenants where slug = $1",
      [input.slug.trim().toLowerCase()],
      client,
    );
    if (existingStore.rows[0]) {
      throw new Error("Ja existe uma loja com esse identificador.");
    }

    const tenantResult = await pgQuery<{ id: string }>(
      `insert into tenants (name, slug, status, plan_code, max_users, max_vehicles, trial_ends_at, created_at, updated_at)
       values ($1, $2, 'trial', 'starter', $3, $4, $5, $6, $7)
       returning id`,
      [input.storeName.trim(), input.slug.trim().toLowerCase(), Math.max(1, input.maxUsers), Math.max(1, input.maxVehicles ?? 30), trialEndsAt, createdAt, createdAt],
      client,
    );
    const tenantId = Number(tenantResult.rows[0].id);

    const userResult = await pgQuery<{ id: string }>(
      `insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
       values ($1, $2, $3, 'tenant_user', true, $4, $5)
       returning id`,
      [normalizeEmail(input.ownerEmail), hashPassword(input.ownerPassword), input.ownerName.trim(), createdAt, createdAt],
      client,
    );
    const userId = Number(userResult.rows[0].id);

    await pgQuery(
      `insert into memberships (tenant_id, user_id, role, active, created_at, updated_at)
       values ($1, $2, 'owner', true, $3, $4)`,
      [tenantId, userId, createdAt, createdAt],
      client,
    );

    await pgQuery(
      `insert into tenant_state (
        tenant_id, veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json, created_at, updated_at
      ) values ($1, '[]', '[]', '[]', '[]', '[]', '[]', '{}', '{}', $2, $3)`,
      [tenantId, createdAt, createdAt],
      client,
    );

    await writeAuditLogPg({
      tenantId,
      actorUserId: userId,
      action: "tenant.created",
      payload: {
        storeName: input.storeName.trim(),
        slug: input.slug.trim().toLowerCase(),
        trialDays: Math.max(1, input.trialDays),
        maxUsers: Math.max(1, input.maxUsers),
        maxVehicles: Math.max(1, input.maxVehicles ?? 30),
      },
    }, client);

    return { tenantId };
  });
}

async function pgCreateSellerForTenant(actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode criar usuarios da loja.");
  }

  return pgCreateTenantMembership({
    tenantId: actor.tenantId,
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role ?? "seller",
    salesGoalMonthly: input.salesGoalMonthly,
  });
}

async function pgCreateTenantUserForPlatform(storeId: number, input: {
  name: string;
  email: string;
  password: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
  return pgCreateTenantMembership({
    tenantId: storeId,
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
    salesGoalMonthly: input.salesGoalMonthly,
  });
}

async function pgUpdateStoreStatus(storeId: number, patch: {
  status?: TenantStatus;
  extendTrialDays?: number;
  trialDays?: number;
  maxUsers?: number;
  maxVehicles?: number;
}) {
  const currentResult = await pgQuery<{ trial_ends_at: Date | string; max_users: number; max_vehicles: number }>(
    "select trial_ends_at, max_users, max_vehicles from tenants where id = $1",
    [storeId],
  );
  const current = currentResult.rows[0];
  if (!current) {
    throw new Error("Loja nao encontrada.");
  }

  const currentTrialEndsAt = asIso(current.trial_ends_at);
  const nextTrialEndsAt = patch.trialDays !== undefined
    ? new Date(Date.now() + Math.max(1, patch.trialDays) * 86_400_000).toISOString()
    : patch.extendTrialDays
      ? new Date(new Date(currentTrialEndsAt).getTime() + patch.extendTrialDays * 86_400_000).toISOString()
      : currentTrialEndsAt;

  const nextMaxUsers = patch.maxUsers === undefined ? Number(current.max_users) : Math.max(1, patch.maxUsers);
  const nextMaxVehicles = patch.maxVehicles === undefined ? Number(current.max_vehicles) : Math.max(1, patch.maxVehicles);
  const activeUsers = await pgCountActiveMemberships(storeId);
  const activeVehicles = await pgCountActiveVehicles(storeId);
  if (nextMaxUsers < activeUsers) {
    throw new Error(`A loja ja possui ${activeUsers} usuarios ativos.`);
  }
  if (nextMaxVehicles < activeVehicles) {
    throw new Error(`A loja ja possui ${activeVehicles} veiculos ativos.`);
  }

  await pgQuery(
    `update tenants
     set status = coalesce($1, status),
         max_users = $2,
         max_vehicles = $3,
         trial_ends_at = $4,
         updated_at = $5
     where id = $6`,
    [patch.status ?? null, nextMaxUsers, nextMaxVehicles, nextTrialEndsAt, nowIso(), storeId],
  );

  await writeAuditLogPg({
    tenantId: storeId,
    action: "tenant.updated",
    payload: {
      status: patch.status ?? null,
      extendTrialDays: patch.extendTrialDays ?? null,
      trialDays: patch.trialDays ?? null,
      maxUsers: nextMaxUsers,
      maxVehicles: nextMaxVehicles,
    },
  });
}

async function pgGetMembershipForUser(userId: number) {
  const result = await pgQuery<{
    membership_id: string;
    tenant_id: string;
    role: "owner" | "seller";
    sales_goal_monthly: number | null;
    seller_permissions: string | null;
    tenant_name: string;
    tenant_slug: string;
    tenant_status: TenantStatus;
    trial_ends_at: Date | string;
    plan_code: string;
    nfe_enabled: boolean;
    nfe_configured: boolean;
  }>(
    `select
      m.id as membership_id,
      m.tenant_id,
      m.role,
      m.sales_goal_monthly,
      m.seller_permissions,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code,
      t.nfe_enabled,
      case when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then true else false end as nfe_configured
     from memberships m
     join tenants t on t.id = m.tenant_id
     where m.user_id = $1 and m.active = true
     order by case when m.role = 'owner' then 0 else 1 end, m.id asc
     limit 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) return undefined;
  return {
    ...row,
    membership_id: Number(row.membership_id),
    tenant_id: Number(row.tenant_id),
    trial_ends_at: asIso(row.trial_ends_at),
    nfe_enabled: asBool(row.nfe_enabled) ? 1 : 0,
    nfe_configured: asBool(row.nfe_configured) ? 1 : 0,
  };
}

async function pgAuthenticateUser(email: string, password: string, metadata?: { ip?: string; userAgent?: string }) {
  const userResult = await pgQuery<{
    id: string;
    email: string;
    password_hash: string;
    name: string;
    platform_role: "platform_admin" | "tenant_user";
    active: boolean;
  }>(
    `select id, email, password_hash, name, platform_role, active
     from users
     where email = $1`,
    [normalizeEmail(email)],
  );
  const userRow = userResult.rows[0];
  if (!userRow?.active || !verifyPassword(password, userRow.password_hash)) {
    return null;
  }

  const user = { ...userRow, id: Number(userRow.id) };
  let membership = undefined;
  let role: PlatformRole = "platform_admin";

  if (user.platform_role !== "platform_admin") {
    membership = await pgGetMembershipForUser(user.id);
    if (!membership) {
      return null;
    }
    role = membership.role;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const sessionResult = await pgQuery<{ id: string }>(
    `insert into sessions (user_id, membership_id, token_hash, expires_at, ip_address, user_agent, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [user.id, membership?.membership_id ?? null, tokenHash, expiresAt, metadata?.ip ?? null, metadata?.userAgent ?? null, nowIso()],
  );
  const sessionId = Number(sessionResult.rows[0].id);

  await writeAuditLogPg({
    tenantId: membership?.tenant_id ?? null,
    actorUserId: user.id,
    action: "auth.login",
    payload: {
      role,
      sessionId,
      ip: metadata?.ip ?? null,
    },
  });

  return {
    session: buildSessionPayload({
      sessionId,
      user,
      membership,
      expiresAt,
    }),
    cookieHeader: serializeCookie(SESSION_COOKIE_NAME, sessionToken, Math.floor(SESSION_TTL_MS / 1000)),
  };
}

async function pgGetSessionFromCookie(cookieHeader: string | undefined) {
  const raw = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  const token = raw?.slice(`${SESSION_COOKIE_NAME}=`.length);
  if (!token) return null;

  const result = await pgQuery<{
    session_id: string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
    user_id: string;
    email: string;
    name: string;
    platform_role: "platform_admin" | "tenant_user";
    membership_id: string | null;
    membership_role: "owner" | "seller" | null;
    sales_goal_monthly: number | null;
    seller_permissions: string | null;
    tenant_id: string | null;
    tenant_name: string | null;
    tenant_slug: string | null;
    tenant_status: TenantStatus | null;
    trial_ends_at: Date | string | null;
    plan_code: string | null;
    nfe_enabled: boolean | null;
    nfe_configured: boolean | null;
  }>(
    `select
      s.id as session_id,
      s.expires_at,
      s.revoked_at,
      u.id as user_id,
      u.email,
      u.name,
      u.platform_role,
      m.id as membership_id,
      m.role as membership_role,
      m.sales_goal_monthly,
      m.seller_permissions,
      t.id as tenant_id,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code,
      t.nfe_enabled,
      case when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then true else false end as nfe_configured
     from sessions s
     join users u on u.id = s.user_id
     left join memberships m on m.id = s.membership_id
     left join tenants t on t.id = m.tenant_id
     where s.token_hash = $1`,
    [hashToken(token)],
  );

  const row = result.rows[0];
  if (!row || row.revoked_at || new Date(asIso(row.expires_at)).getTime() <= Date.now()) {
    return null;
  }

  if (row.tenant_status === "trial" && row.trial_ends_at && new Date(asIso(row.trial_ends_at)).getTime() <= Date.now()) {
    await pgQuery("update tenants set status = 'past_due', updated_at = $1 where id = $2", [nowIso(), row.tenant_id]);
    row.tenant_status = "past_due";
  }

  const activeRole = row.platform_role === "platform_admin" ? "platform_admin" : ((row.membership_role ?? "seller") as PlatformRole);
  return {
    sessionId: Number(row.session_id),
    userId: Number(row.user_id),
    membershipId: row.membership_id ? Number(row.membership_id) : null,
    email: row.email,
    name: row.name,
    role: activeRole,
    tenantId: row.tenant_id ? Number(row.tenant_id) : null,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    trialEndsAt: row.trial_ends_at ? asIso(row.trial_ends_at) : null,
    planCode: row.plan_code,
    nfeEnabled: asBool(row.nfe_enabled),
    nfeConfigured: asBool(row.nfe_configured),
    salesGoalMonthly: row.sales_goal_monthly,
    sellerPermissions: activeRole === "seller" ? parseSellerPermissions(row.seller_permissions) : { ...DEFAULT_SELLER_PERMISSIONS },
    expiresAt: asIso(row.expires_at),
  };
}

async function pgRevokeSession(sessionId: number) {
  await pgQuery("update sessions set revoked_at = $1 where id = $2", [nowIso(), sessionId]);
}

async function pgRevokeAllSessionsForUser(userId: number) {
  await pgQuery("update sessions set revoked_at = $1 where user_id = $2 and revoked_at is null", [nowIso(), userId]);
}

async function pgDeleteAccount(session: AuthenticatedSession) {
  const timestamp = nowIso();
  await pgQuery("update sessions set revoked_at = $1 where user_id = $2 and revoked_at is null", [timestamp, session.userId]);
  await pgQuery("update memberships set active = false, updated_at = $1 where user_id = $2 and active = true", [timestamp, session.userId]);
  await pgQuery("update users set active = false, updated_at = $1 where id = $2", [timestamp, session.userId]);
  await writeAuditLogPg({
    tenantId: session.tenantId ?? null,
    actorUserId: session.userId,
    action: "auth.account_deleted",
    payload: { selfService: true },
  });
}

type PgStoreRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan_code: string;
  max_users: number;
  max_vehicles: number;
  trial_ends_at: string | Date;
  nfe_enabled: number;
  nfe_configured: number;
  users_count: number;
  vehicles_count: number;
  owner_name: string | null;
  owner_email: string | null;
};

async function pgListStores() {
  const result = await pgQuery<PgStoreRow>(`
    select
      t.id,
      t.name,
      t.slug,
      t.status,
      t.plan_code,
      t.max_users,
      t.max_vehicles,
      t.trial_ends_at,
      case when t.nfe_enabled then 1 else 0 end as nfe_enabled,
      case when t.nfe_config_json is not null and trim(t.nfe_config_json) <> '' then 1 else 0 end as nfe_configured,
      (
        select count(*)
        from memberships m
        where m.tenant_id = t.id and m.active = true
      )::int as users_count,
      (
        select count(*)
        from vehicles v
        where v.tenant_id = t.id
          and v.archived_at is null
          and v.deleted_at is null
          and coalesce(v.status, 'disponivel') <> 'vendido'
      )::int as vehicles_count,
      (
        select u.name
        from memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner'
        order by m.id asc
        limit 1
      ) as owner_name,
      (
        select u.email
        from memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = t.id and m.role = 'owner'
        order by m.id asc
        limit 1
      ) as owner_email
    from tenants t
    order by t.created_at desc
  `);

  return result.rows.map((row: PgStoreRow) => ({
    ...row,
    id: Number(row.id),
    trial_ends_at: asIso(row.trial_ends_at),
  }));
}

function mapAuditRows(rows: AuditRow[]) {
  return rows.map((row) => ({
    id: Number(row.id),
    action: row.action,
    payload: parseJson(row.payload_json, {}),
    createdAt: asIso(row.created_at),
    tenantId: row.tenant_id ? Number(row.tenant_id) : null,
    tenantName: row.tenant_name,
    actorName: row.actor_name,
  }));
}

async function pgListPlatformAuditEvents(limit = 20) {
  const result = await pgQuery<AuditRow>(
    `select
      a.id,
      a.action,
      a.payload_json,
      a.created_at,
      a.tenant_id,
      t.name as tenant_name,
      u.name as actor_name
     from audit_log a
     left join tenants t on t.id = a.tenant_id
     left join users u on u.id = a.actor_user_id
     order by a.created_at desc, a.id desc
     limit $1`,
    [limit],
  );
  return mapAuditRows(result.rows);
}

async function pgListTenantAuditEvents(actor: AuthenticatedSession, limit = 20) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  const result = await pgQuery<AuditRow>(
    `select
      a.id,
      a.action,
      a.payload_json,
      a.created_at,
      a.tenant_id,
      t.name as tenant_name,
      u.name as actor_name
     from audit_log a
     left join tenants t on t.id = a.tenant_id
     left join users u on u.id = a.actor_user_id
     where a.tenant_id = $1
     order by a.created_at desc, a.id desc
     limit $2`,
    [actor.tenantId, limit],
  );
  return mapAuditRows(result.rows);
}

async function pgListTenantMembersByTenantId(tenantId: number) {
  const result = await pgQuery<MemberRow>(
    `select
      m.id,
      u.name as nome,
      u.email,
      m.role as papel,
      case when m.active then 1 else 0 end as ativo,
      m.sales_goal_monthly as meta_mensal,
      m.seller_permissions,
      m.created_at as criado_em
     from memberships m
     join users u on u.id = m.user_id
     where m.tenant_id = $1
     order by case when m.role = 'owner' then 0 else 1 end, u.name asc`,
    [tenantId],
  );
  return result.rows.map((row: MemberRow) => ({
    ...row,
    id: Number(row.id),
    ativo: Number(row.ativo),
    criado_em: asIso(row.criado_em),
  }));
}

async function pgListTenantInvitesByTenantId(tenantId: number) {
  const result = await pgQuery<{
    id: string;
    nome: string;
    email: string;
    papel: "owner" | "seller";
    meta_mensal: number | null;
    expires_em: Date | string;
    accepted_at: Date | string | null;
    revoked_at: Date | string | null;
    criado_em: Date | string;
  }>(
    `select
      id,
      name as nome,
      email,
      role as papel,
      sales_goal_monthly as meta_mensal,
      expires_at as expires_em,
      accepted_at,
      revoked_at,
      created_at as criado_em
     from tenant_invites
     where tenant_id = $1
     order by created_at desc`,
    [tenantId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    meta_mensal: row.meta_mensal ?? null,
    status: mapInviteStatus({
      accepted_at: row.accepted_at ? asIso(row.accepted_at) : null,
      revoked_at: row.revoked_at ? asIso(row.revoked_at) : null,
      expires_em: asIso(row.expires_em),
    }),
    expires_em: asIso(row.expires_em),
    criado_em: asIso(row.criado_em),
  }));
}

async function pgUpdateMemberPermissions(
  actor: AuthenticatedSession,
  memberId: number,
  permissions: Partial<SellerPermissions>,
) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode alterar permissoes.");
  }

  const memberResult = await pgQuery<{ id: string; role: string; tenant_id: string }>(
    "select id, role, tenant_id from memberships where id = $1 and tenant_id = $2",
    [memberId, actor.tenantId],
  );
  const member = memberResult.rows[0];
  if (!member) {
    throw new Error("Membro nao encontrado nesta loja.");
  }
  if (member.role === "owner") {
    throw new Error("Nao e possivel restringir permissoes de um owner.");
  }

  const currentResult = await pgQuery<{ seller_permissions: string | null }>(
    "select seller_permissions from memberships where id = $1",
    [memberId],
  );
  const merged: SellerPermissions = {
    ...parseSellerPermissions(currentResult.rows[0]?.seller_permissions),
    ...permissions,
  };

  await pgQuery(
    "update memberships set seller_permissions = $1, updated_at = $2 where id = $3",
    [JSON.stringify(merged), nowIso(), memberId],
  );
}

async function pgListTenantMembers(actor: AuthenticatedSession) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }
  return pgListTenantMembersByTenantId(actor.tenantId);
}

async function pgListTenantInvites(actor: AuthenticatedSession) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }
  return pgListTenantInvitesByTenantId(actor.tenantId);
}

async function pgListVehiclesByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<VehicleTableRow>(
    `select id, tenant_id, modelo, marca, ano, status, valor_venda, archived_at, deleted_at, created_at, updated_at, data_json
     from vehicles
     where tenant_id = $1
     order by created_at desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydrateVehicle);
}

async function pgSyncVehiclesTable(tenantId: number, vehicles: Veiculo[], client: PoolClient) {
  await pgQuery("delete from vehicles where tenant_id = $1", [tenantId], client);
  for (const vehicle of vehicles) {
    const values = vehicleValues(vehicle);
    await pgQuery(
      `insert into vehicles (
        id, tenant_id, modelo, marca, ano, status, valor_venda, archived_at, deleted_at, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        values.id,
        tenantId,
        values.modelo,
        values.marca,
        values.ano,
        values.status,
        values.valorVenda,
        values.archivedAt,
        values.deletedAt,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsureVehiclesBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from vehicles where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacyVehicles = parseJson<Veiculo[]>(legacyRaw, []);
  if (!legacyVehicles.length) return;

  if (client) {
    await pgSyncVehiclesTable(tenantId, legacyVehicles, client);
    await pgQuery("update tenant_state set veiculos_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncVehiclesTable(tenantId, legacyVehicles, tx);
    await pgQuery("update tenant_state set veiculos_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgListLeadsByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<LeadTableRow>(
    `select id, tenant_id, nome, telefone, origem, status, vendedor_id, veiculo_id, archived_at, deleted_at, created_at, updated_at, data_json
     from leads
     where tenant_id = $1
     order by created_at desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydrateLead);
}

async function pgSyncLeadsTable(tenantId: number, leads: Lead[], client: PoolClient) {
  await pgQuery("delete from leads where tenant_id = $1", [tenantId], client);
  for (const lead of leads) {
    const values = leadValues(lead);
    await pgQuery(
      `insert into leads (
        id, tenant_id, nome, telefone, origem, status, vendedor_id, veiculo_id, archived_at, deleted_at, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        values.id,
        tenantId,
        values.nome,
        values.telefone,
        values.origem,
        values.status,
        values.vendedorId,
        values.veiculoId,
        values.archivedAt,
        values.deletedAt,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsureLeadsBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from leads where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacyLeads = parseJson<Lead[]>(legacyRaw, []);
  if (!legacyLeads.length) return;

  if (client) {
    await pgSyncLeadsTable(tenantId, legacyLeads, client);
    await pgQuery("update tenant_state set leads_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncLeadsTable(tenantId, legacyLeads, tx);
    await pgQuery("update tenant_state set leads_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgListSalesByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<SaleTableRow>(
    `select id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, created_at, updated_at, data_json
     from sales
     where tenant_id = $1
     order by coalesce(data, created_at) desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydrateSale);
}

async function pgSyncSalesTable(tenantId: number, sales: Venda[], client: PoolClient) {
  await pgQuery("delete from sales where tenant_id = $1", [tenantId], client);
  for (const sale of sales) {
    const values = saleValues(sale);
    await pgQuery(
      `insert into sales (
        id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, null, null, $7, $8, $9)`,
      [
        values.id,
        tenantId,
        values.veiculoId,
        values.vendedorId,
        values.valor,
        values.data,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsureSalesBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from sales where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacySales = parseJson<Venda[]>(legacyRaw, []);
  if (!legacySales.length) return;

  if (client) {
    await pgSyncSalesTable(tenantId, legacySales, client);
    await pgQuery("update tenant_state set vendas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncSalesTable(tenantId, legacySales, tx);
    await pgQuery("update tenant_state set vendas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgListCostsByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<CostTableRow>(
    `select id, tenant_id, veiculo_id, categoria, valor, data, created_at, updated_at, data_json
     from costs
     where tenant_id = $1
     order by coalesce(data, created_at) desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydrateCost);
}

async function pgSyncCostsTable(tenantId: number, costs: CustoReparo[], client: PoolClient) {
  await pgQuery("delete from costs where tenant_id = $1", [tenantId], client);
  for (const cost of costs) {
    const values = costValues(cost);
    await pgQuery(
      `insert into costs (
        id, tenant_id, veiculo_id, categoria, valor, data, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        values.id,
        tenantId,
        values.veiculoId,
        values.categoria,
        values.valor,
        values.data,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsureCostsBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from costs where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacyCosts = parseJson<CustoReparo[]>(legacyRaw, []);
  if (!legacyCosts.length) return;

  if (client) {
    await pgSyncCostsTable(tenantId, legacyCosts, client);
    await pgQuery("update tenant_state set custos_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncCostsTable(tenantId, legacyCosts, tx);
    await pgQuery("update tenant_state set custos_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgListPostSaleTasksByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<PostSaleTaskTableRow>(
    `select id, tenant_id, venda_id, veiculo_id, categoria, status, responsavel, concluido_em, created_at, updated_at, data_json
     from post_sale_tasks
     where tenant_id = $1
     order by created_at desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydratePostSaleTask);
}

async function pgSyncPostSaleTasksTable(tenantId: number, tasks: TarefaPosVenda[], client: PoolClient) {
  await pgQuery("delete from post_sale_tasks where tenant_id = $1", [tenantId], client);
  for (const task of tasks) {
    const values = postSaleTaskValues(task);
    await pgQuery(
      `insert into post_sale_tasks (
        id, tenant_id, venda_id, veiculo_id, categoria, status, responsavel, concluido_em, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        values.id,
        tenantId,
        values.vendaId,
        values.veiculoId,
        values.categoria,
        values.status,
        values.responsavel,
        values.concluidoEm,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsurePostSaleTasksBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from post_sale_tasks where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacyTasks = parseJson<TarefaPosVenda[]>(legacyRaw, []);
  if (!legacyTasks.length) return;

  if (client) {
    await pgSyncPostSaleTasksTable(tenantId, legacyTasks, client);
    await pgQuery("update tenant_state set tarefas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncPostSaleTasksTable(tenantId, legacyTasks, tx);
    await pgQuery("update tenant_state set tarefas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgListConsultationsByTenantId(tenantId: number, client?: PoolClient) {
  const result = await pgQuery<ConsultationTableRow>(
    `select id, tenant_id, placa, veiculo_id, data, created_at, updated_at, data_json
     from vehicle_consultations
     where tenant_id = $1
     order by coalesce(data, created_at) desc, id desc`,
    [tenantId],
    client,
  );
  return result.rows.map(hydrateConsultation);
}

async function pgSyncConsultationsTable(tenantId: number, consultations: ConsultaVeicular[], client: PoolClient) {
  await pgQuery("delete from vehicle_consultations where tenant_id = $1", [tenantId], client);
  for (const consultation of consultations) {
    const values = consultationValues(consultation);
    await pgQuery(
      `insert into vehicle_consultations (
        id, tenant_id, placa, veiculo_id, data, data_json, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        values.id,
        tenantId,
        values.placa,
        values.veiculoId,
        values.data,
        values.dataJson,
        values.createdAt,
        values.updatedAt,
      ],
      client,
    );
  }
}

async function pgEnsureConsultationsBackfilled(tenantId: number, legacyRaw: string | undefined, client?: PoolClient) {
  const countResult = await pgQuery<{ total: string }>(
    "select count(*)::text as total from vehicle_consultations where tenant_id = $1",
    [tenantId],
    client,
  );
  if (Number(countResult.rows[0]?.total ?? 0) > 0) return;

  const legacyConsultations = parseJson<ConsultaVeicular[]>(legacyRaw, []);
  if (!legacyConsultations.length) return;

  if (client) {
    await pgSyncConsultationsTable(tenantId, legacyConsultations, client);
    await pgQuery("update tenant_state set consultas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], client);
    return;
  }

  await withPgTransaction(async (tx) => {
    await pgSyncConsultationsTable(tenantId, legacyConsultations, tx);
    await pgQuery("update tenant_state set consultas_json = $1, updated_at = $2 where tenant_id = $3", ["[]", nowIso(), tenantId], tx);
  });
}

async function pgUpdateSaleNfe(tenantId: number, vendaId: string, nfe: Record<string, unknown>) {
  const result = await pgQuery<SaleTableRow>(
    `select id, tenant_id, veiculo_id, vendedor_id, valor, data, archived_at, deleted_at, created_at, updated_at, data_json
     from sales
     where tenant_id = $1 and id = $2`,
    [tenantId, vendaId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Venda nao encontrada.");

  const current = hydrateSale(row);
  const merged = mergeSaleWithNfe(current, nfe);
  const values = saleValues(merged);

  await pgQuery(
    `update sales
     set veiculo_id = $1, vendedor_id = $2, valor = $3, data = $4, data_json = $5, updated_at = $6
     where tenant_id = $7 and id = $8`,
    [
      values.veiculoId,
      values.vendedorId,
      values.valor,
      values.data,
      values.dataJson,
      values.updatedAt,
      tenantId,
      vendaId,
    ],
  );

  return merged as unknown as Record<string, unknown>;
}

async function pgGetTenantAppState(actor: AuthenticatedSession) {
  if (!actor.tenantId) {
    return createEmptyAppState();
  }

  const result = await pgQuery<Record<string, string | Date>>(
    `select veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json
     from tenant_state
     where tenant_id = $1`,
    [actor.tenantId],
  );
  const row = result.rows[0] as Record<string, string> | undefined;
  const vendedores = (await pgListTenantMembers(actor)).map((member) => ({
    id: String(member.id),
    nome: member.nome,
    metaMensal: member.meta_mensal ?? undefined,
  }));
  const scopedVendedores = scopeVendedoresForActor(actor, vendedores);

  if (!row) {
    return createEmptyAppState({ vendedores: scopedVendedores });
  }

  await pgEnsureVehiclesBackfilled(actor.tenantId, row.veiculos_json);
  await pgEnsureLeadsBackfilled(actor.tenantId, row.leads_json);
  await pgEnsureSalesBackfilled(actor.tenantId, row.vendas_json);
  await pgEnsureConsultationsBackfilled(actor.tenantId, row.consultas_json);
  await pgEnsurePostSaleTasksBackfilled(actor.tenantId, row.tarefas_json);
  await pgEnsureCostsBackfilled(actor.tenantId, row.custos_json);

  return scopeAppStateForActor(actor, createEmptyAppState({
    vendedores,
    veiculos: await pgListVehiclesByTenantId(actor.tenantId),
    leads: await pgListLeadsByTenantId(actor.tenantId),
    vendas: await pgListSalesByTenantId(actor.tenantId),
    consultas: await pgListConsultationsByTenantId(actor.tenantId),
    tarefasPosVenda: await pgListPostSaleTasksByTenantId(actor.tenantId),
    custos: await pgListCostsByTenantId(actor.tenantId),
    configPrecos: { ...APP_STATE_DEFAULTS.configPrecos, ...parseJson(row.config_json, {}) },
    memoriaLoja: { ...APP_STATE_DEFAULTS.memoriaLoja, ...parseJson(row.memoria_json, {}) },
  }));
}

async function pgUpdateTenantAppState(actor: AuthenticatedSession, patch: AppStateResourcePatch) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }
  if (actor.role === "seller" && (patch.configPrecos !== undefined || patch.memoriaLoja !== undefined)) {
    throw new Error("Seller nao pode alterar configuracoes administrativas da loja.");
  }
  const effectivePatch = restrictPatchForActor(actor, patch);

  await pgQuery(
    `insert into tenant_state (
      tenant_id, veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json, created_at, updated_at
    ) values ($1, '[]', '[]', '[]', '[]', '[]', '[]', '{}', '{}', $2, $3)
    on conflict (tenant_id) do nothing`,
    [actor.tenantId, nowIso(), nowIso()],
  );

  const statements = Object.entries(effectivePatch)
    .filter(([key, value]) => key !== "veiculos" && key !== "leads" && key !== "vendas" && key !== "consultas" && key !== "custos" && key !== "tarefasPosVenda" && value !== undefined)
    .map(([key, value]) => ({
      column: resourceKey(key as keyof Omit<AppStateSnapshot, "vendedores">),
      value: JSON.stringify(value),
    }))
    .filter((statement): statement is { column: string; value: string } => Boolean(statement.column));

  if (!statements.length && effectivePatch.veiculos === undefined && effectivePatch.leads === undefined && effectivePatch.vendas === undefined && effectivePatch.consultas === undefined && effectivePatch.custos === undefined && effectivePatch.tarefasPosVenda === undefined) {
    return pgGetTenantAppState(actor);
  }

  await withPgTransaction(async (client) => {
    if (effectivePatch.veiculos !== undefined) {
      const maxVehicles = await pgGetTenantVehicleLimit(actor.tenantId!, client);
      const nextActiveVehicles = countActiveVehiclesFromList(effectivePatch.veiculos);
      if (nextActiveVehicles > maxVehicles) {
        throw new Error(`A loja atingiu o limite de ${maxVehicles} veiculos ativos no plano atual.`);
      }
      await pgSyncVehiclesTable(actor.tenantId!, effectivePatch.veiculos, client);
      await pgQuery(
        "update tenant_state set veiculos_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    if (effectivePatch.leads !== undefined) {
      const scopedLeadsPatch = mergeSellerScopedResourceByVendor(
        actor,
        await pgListLeadsByTenantId(actor.tenantId!, client),
        normalizeSellerLeadsForSync(actor, effectivePatch.leads),
      );
      await pgSyncLeadsTable(actor.tenantId!, scopedLeadsPatch, client);
      await pgQuery(
        "update tenant_state set leads_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    if (effectivePatch.vendas !== undefined) {
      const scopedSalesPatch = mergeSellerScopedResourceByVendor(
        actor,
        await pgListSalesByTenantId(actor.tenantId!, client),
        normalizeSellerSalesForSync(actor, effectivePatch.vendas),
      );
      await pgSyncSalesTable(actor.tenantId!, scopedSalesPatch, client);
      await pgQuery(
        "update tenant_state set vendas_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    if (effectivePatch.consultas !== undefined) {
      await pgSyncConsultationsTable(actor.tenantId!, effectivePatch.consultas, client);
      await pgQuery(
        "update tenant_state set consultas_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    if (effectivePatch.custos !== undefined) {
      await pgSyncCostsTable(actor.tenantId!, effectivePatch.custos, client);
      await pgQuery(
        "update tenant_state set custos_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    if (effectivePatch.tarefasPosVenda !== undefined) {
      await pgSyncPostSaleTasksTable(actor.tenantId!, effectivePatch.tarefasPosVenda, client);
      await pgQuery(
        "update tenant_state set tarefas_json = $1, updated_at = $2 where tenant_id = $3",
        ["[]", nowIso(), actor.tenantId],
        client,
      );
    }
    for (const statement of statements) {
      await pgQuery(
        `update tenant_state set ${statement.column} = $1, updated_at = $2 where tenant_id = $3`,
        [statement.value, nowIso(), actor.tenantId],
        client,
      );
    }
    await writeAuditLogPg({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "tenant.state.updated",
      payload: {
        resources: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined),
        role: actor.role,
      },
    }, client);
  });

  return pgGetTenantAppState(actor);
}

async function pgCreatePasswordResetToken(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const result = await pgQuery<{ id: string; name: string }>(
    "select id, name from users where email = $1 and active = true",
    [normalizedEmail],
  );
  const user = result.rows[0];
  if (!user) return null;

  await pgQuery(
    "update password_reset_tokens set used_at = $1 where user_id = $2 and used_at is null",
    [nowIso(), user.id],
  );

  const token = randomBytes(32).toString("base64url");
  const tokenH = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  await pgQuery(
    "insert into password_reset_tokens (user_id, token_hash, expires_at, created_at) values ($1, $2, $3, $4)",
    [user.id, tokenH, expiresAt, nowIso()],
  );
  await writeAuditLogPg({ actorUserId: Number(user.id), action: "auth.password_reset_requested" });
  return { token, userName: user.name };
}

async function pgResetPasswordWithToken(token: string, newPassword: string) {
  const tokenH = hashToken(token);
  const result = await pgQuery<{ id: string; user_id: string; expires_at: Date | string; used_at: Date | string | null }>(
    `select id, user_id, expires_at, used_at
     from password_reset_tokens
     where token_hash = $1`,
    [tokenH],
  );
  const row = result.rows[0];
  if (!row) return false;
  if (row.used_at) return false;
  if (new Date(asIso(row.expires_at)).getTime() < Date.now()) return false;

  const newHash = hashPassword(newPassword);
  await pgQuery("update users set password_hash = $1, updated_at = $2 where id = $3", [newHash, nowIso(), row.user_id]);
  await pgQuery("update password_reset_tokens set used_at = $1 where id = $2", [nowIso(), row.id]);
  await pgQuery("update sessions set revoked_at = $1 where user_id = $2 and revoked_at is null", [nowIso(), row.user_id]);
  await writeAuditLogPg({ actorUserId: Number(row.user_id), action: "auth.password_reset_completed" });
  return true;
}

async function pgAcceptInviteWithToken(
  token: string,
  input: { password: string; metadata?: { ip?: string; userAgent?: string } },
) {
  const tokenH = hashToken(token);
  const inviteResult = await pgQuery<{
    id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: "owner" | "seller";
    sales_goal_monthly: number | null;
    expires_at: Date | string;
    accepted_at: Date | string | null;
    revoked_at: Date | string | null;
    tenant_status: TenantStatus;
  }>(
    `select i.id, i.tenant_id, i.name, i.email, i.role, i.sales_goal_monthly, i.expires_at, i.accepted_at, i.revoked_at, t.status as tenant_status
     from tenant_invites i
     join tenants t on t.id = i.tenant_id
     where i.token_hash = $1`,
    [tokenH],
  );
  const invite = inviteResult.rows[0];
  if (!invite || invite.accepted_at || invite.revoked_at || new Date(asIso(invite.expires_at)).getTime() <= Date.now()) {
    return null;
  }
  if (invite.tenant_status === "blocked" || invite.tenant_status === "closed") {
    throw new Error("Essa loja nao pode receber novos acessos agora.");
  }

  await withPgTransaction(async (client) => {
    const existingUserResult = await pgQuery<{ id: string }>(
      "select id from users where email = $1",
      [invite.email],
      client,
    );
    if (existingUserResult.rows[0]) {
      throw new Error("Ja existe um usuario com esse e-mail. Use a recuperacao de senha.");
    }

    const activeUsers = await pgCountActiveMemberships(Number(invite.tenant_id), client);
    const maxUsers = await pgGetTenantUserLimit(Number(invite.tenant_id), client);
    if (activeUsers >= maxUsers) {
      throw new Error(`A loja atingiu o limite de ${maxUsers} usuarios.`);
    }

    const timestamp = nowIso();
    const userResult = await pgQuery<{ id: string }>(
      `insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
       values ($1, $2, $3, 'tenant_user', true, $4, $5)
       returning id`,
      [invite.email, hashPassword(input.password), invite.name, timestamp, timestamp],
      client,
    );

    await pgQuery(
      `insert into memberships (tenant_id, user_id, role, active, sales_goal_monthly, created_at, updated_at)
       values ($1, $2, $3, true, $4, $5, $6)`,
      [invite.tenant_id, userResult.rows[0].id, invite.role, invite.sales_goal_monthly ?? null, timestamp, timestamp],
      client,
    );

    await pgQuery(
      "update tenant_invites set accepted_at = $1, updated_at = $2 where id = $3",
      [timestamp, timestamp, invite.id],
      client,
    );

    await writeAuditLogPg({
      tenantId: Number(invite.tenant_id),
      actorUserId: Number(userResult.rows[0].id),
      action: "tenant.invite.accepted",
      payload: {
        inviteId: Number(invite.id),
        email: invite.email,
        role: invite.role,
      },
    }, client);
  });

  return authenticateUser(invite.email, input.password, input.metadata);
}

async function pgGetNfeConfig(tenantId: number) {
  const result = await pgQuery<{ nfe_config_json: string | null }>(
    "select nfe_config_json from tenants where id = $1",
    [tenantId],
  );
  const row = result.rows[0];
  if (!row?.nfe_config_json) return null;
  return decryptNfeConfig(parseJson<NfeConfigData | null>(row.nfe_config_json, null));
}

async function pgGetStoreNfeSettings(storeId: number): Promise<StoreNfeSettings> {
  const result = await pgQuery<{ nfe_enabled: boolean; nfe_config_json: string | null }>(
    "select nfe_enabled, nfe_config_json from tenants where id = $1",
    [storeId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return {
    enabled: asBool(row.nfe_enabled),
    configured: !!row.nfe_config_json?.trim(),
    config: row.nfe_config_json ? decryptNfeConfig(parseJson<NfeConfigData | null>(row.nfe_config_json, null)) : null,
  };
}

async function pgUpdateNfeConfig(actor: AuthenticatedSession, config: NfeConfigData) {
  if (!actor.tenantId || actor.role !== "owner") {
    throw new Error("Somente o owner pode configurar NF-e.");
  }
  await pgQuery("update tenants set nfe_config_json = $1, updated_at = $2 where id = $3", [JSON.stringify(encryptNfeConfig(config)), nowIso(), actor.tenantId]);
  await writeAuditLogPg({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "tenant.nfe_config_updated",
  });
}

async function pgUpdateStoreNfeConfig(storeId: number, config: NfeConfigData, actorUserId?: number | null) {
  const result = await pgQuery<{ id: string }>("select id from tenants where id = $1", [storeId]);
  if (!result.rows[0]) {
    throw new Error("Loja nao encontrada.");
  }
  await pgQuery("update tenants set nfe_config_json = $1, updated_at = $2 where id = $3", [JSON.stringify(encryptNfeConfig(config)), nowIso(), storeId]);
  await writeAuditLogPg({
    tenantId: storeId,
    actorUserId: actorUserId ?? null,
    action: "tenant.nfe_config_updated",
    payload: { actorScope: "platform_admin" },
  });
}

async function pgToggleNfeEnabled(storeId: number, enabled: boolean) {
  const result = await pgQuery<{ id: string }>("select id from tenants where id = $1", [storeId]);
  if (!result.rows[0]) throw new Error("Loja nao encontrada.");
  await pgQuery("update tenants set nfe_enabled = $1, updated_at = $2 where id = $3", [enabled, nowIso(), storeId]);
  await writeAuditLogPg({ tenantId: storeId, action: "tenant.nfe_toggled", payload: { enabled } });
}

async function pgUpdateVendaNfe(tenantId: number, vendaId: string, nfe: Record<string, unknown>) {
  const result = await pgQuery<{ vendas_json: string }>("select vendas_json from tenant_state where tenant_id = $1", [tenantId]);
  await pgEnsureSalesBackfilled(tenantId, result.rows[0]?.vendas_json);
  return pgUpdateSaleNfe(tenantId, vendaId, nfe);
}

export function sessionToResponse(session: AuthenticatedSession) {
  const daysRemaining = session.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(session.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return {
    authenticated: true,
    user: {
      id: String(session.userId),
      membershipId: session.membershipId ? String(session.membershipId) : null,
      email: session.email,
      name: session.name,
      role: session.role,
      salesGoalMonthly: session.salesGoalMonthly,
    },
    tenant: session.tenantId
      ? {
          id: String(session.tenantId),
          name: session.tenantName,
          slug: session.tenantSlug,
          status: session.tenantStatus,
          trialEndsAt: session.trialEndsAt,
          planCode: session.planCode,
          nfeEnabled: session.nfeEnabled,
          nfeConfigured: session.nfeConfigured,
          daysRemaining,
        }
      : null,
    permissions: {
      canManagePlatform: session.role === "platform_admin",
      canManageTeam: session.role === "owner",
      sellerPermissions: session.sellerPermissions,
    },
    expiresAt: session.expiresAt,
  };
}
