import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createEmptyAppState, type AppStateResourcePatch, type AppStateSnapshot } from "../src/lib/app-state";

const SESSION_COOKIE_NAME = "autocrm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PBKDF2_ITERATIONS = 120_000;
const APP_STATE_DEFAULTS = createEmptyAppState();

export type PlatformRole = "platform_admin" | "owner" | "seller";
export type TenantStatus = "trial" | "active" | "past_due" | "blocked" | "closed";

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
  expiresAt: string;
}

type MemberRow = {
  id: number;
  nome: string;
  email: string;
  papel: "owner" | "seller";
  ativo: number;
  meta_mensal: number | null;
  criado_em: string;
};

let dbInstance: DatabaseSync | null = null;
let initializedPath: string | null = null;

function getDatabasePath() {
  return process.env.DATABASE_PATH ?? join(process.cwd(), "data", "autocrm.sqlite");
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
  return createHash("sha256").update(token).digest("hex");
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

    create table if not exists audit_log (
      id integer primary key autoincrement,
      tenant_id integer references tenants(id) on delete cascade,
      actor_user_id integer references users(id) on delete set null,
      action text not null,
      payload_json text not null default '{}',
      created_at text not null default current_timestamp
    );

    create index if not exists idx_memberships_tenant on memberships (tenant_id);
    create index if not exists idx_memberships_user on memberships (user_id);
    create index if not exists idx_sessions_user on sessions (user_id);
    create index if not exists idx_sessions_membership on sessions (membership_id);
    create index if not exists idx_tenants_status on tenants (status);
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
  dbInstance = null;
  initializedPath = null;
}

export function getDatabase() {
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
  createSchema(db);
  runMigrations(db);
  ensurePlatformAdmin(db);

  dbInstance = db;
  initializedPath = path;
  return db;
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}; ${isProd ? "Secure; " : ""}`.trim();
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function createTenantWithOwner(input: {
  storeName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  trialDays: number;
  maxUsers: number;
}) {
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
      insert into tenants (name, slug, status, plan_code, max_users, trial_ends_at, created_at, updated_at)
      values (?, ?, 'trial', 'starter', ?, ?, ?, ?)
      returning id
    `).get(
      input.storeName.trim(),
      input.slug.trim().toLowerCase(),
      Math.max(1, input.maxUsers),
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

function getTenantLimit(db: DatabaseSync, tenantId: number) {
  const row = db.prepare("select max_users from tenants where id = ?").get(tenantId) as { max_users: number } | undefined;
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return row.max_users;
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
  const maxUsers = getTenantLimit(db, input.tenantId);
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

export function createSellerForTenant(actor: AuthenticatedSession, input: {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
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

export function createTenantUserForPlatform(storeId: number, input: {
  name: string;
  email: string;
  password: string;
  role: "owner" | "seller";
  salesGoalMonthly?: number | null;
}) {
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
}) {
  const db = getDatabase();
  const current = db.prepare("select trial_ends_at, max_users from tenants where id = ?").get(storeId) as {
    trial_ends_at: string;
    max_users: number;
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
  const activeUsers = countActiveMemberships(db, storeId);
  if (nextMaxUsers < activeUsers) {
    throw new Error(`A loja ja possui ${activeUsers} usuarios ativos.`);
  }

    db.prepare(`
      update tenants
      set status = coalesce(?, status),
          max_users = ?,
          trial_ends_at = ?,
          updated_at = ?
      where id = ?
    `).run(patch.status ?? null, nextMaxUsers, nextTrialEndsAt, nowIso(), storeId);

    writeAuditLog(db, {
      tenantId: storeId,
      action: "tenant.updated",
      payload: {
        status: patch.status ?? null,
        extendTrialDays: patch.extendTrialDays ?? null,
        trialDays: patch.trialDays ?? null,
        maxUsers: nextMaxUsers,
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
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code
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
    tenant_name: string;
    tenant_slug: string;
    tenant_status: TenantStatus;
    trial_ends_at: string;
    plan_code: string;
  } | undefined;
}

export function authenticateUser(email: string, password: string, metadata?: { ip?: string; userAgent?: string }) {
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
        tenant_name: string;
        tenant_slug: string;
        tenant_status: TenantStatus;
        trial_ends_at: string;
        plan_code: string;
      }
    | undefined;
  expiresAt: string;
}): AuthenticatedSession {
  return {
    sessionId: input.sessionId,
    userId: input.user.id,
    membershipId: input.membership?.membership_id ?? null,
    email: input.user.email,
    name: input.user.name,
    role: input.user.platform_role === "platform_admin" ? "platform_admin" : (input.membership?.role ?? "seller"),
    tenantId: input.membership?.tenant_id ?? null,
    tenantName: input.membership?.tenant_name ?? null,
    tenantSlug: input.membership?.tenant_slug ?? null,
    tenantStatus: input.membership?.tenant_status ?? null,
    trialEndsAt: input.membership?.trial_ends_at ?? null,
    planCode: input.membership?.plan_code ?? null,
    salesGoalMonthly: input.membership?.sales_goal_monthly ?? null,
    expiresAt: input.expiresAt,
  };
}

export function getSessionFromCookie(cookieHeader: string | undefined) {
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
      t.id as tenant_id,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.status as tenant_status,
      t.trial_ends_at,
      t.plan_code
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
    tenant_id: number | null;
    tenant_name: string | null;
    tenant_slug: string | null;
    tenant_status: TenantStatus | null;
    trial_ends_at: string | null;
    plan_code: string | null;
  } | undefined;

  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  if (row.tenant_status === "trial" && row.trial_ends_at && new Date(row.trial_ends_at).getTime() <= Date.now()) {
    db.prepare("update tenants set status = 'past_due', updated_at = ? where id = ?").run(nowIso(), row.tenant_id);
    row.tenant_status = "past_due";
  }

  if (row.tenant_status === "blocked" || row.tenant_status === "closed") {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      membershipId: row.membership_id,
      email: row.email,
      name: row.name,
      role: row.platform_role === "platform_admin" ? "platform_admin" : ((row.membership_role ?? "seller") as PlatformRole),
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      tenantStatus: row.tenant_status,
      trialEndsAt: row.trial_ends_at,
      planCode: row.plan_code,
      salesGoalMonthly: row.sales_goal_monthly,
      expiresAt: row.expires_at,
    };
  }

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    email: row.email,
    name: row.name,
    role: row.platform_role === "platform_admin" ? "platform_admin" : ((row.membership_role ?? "seller") as PlatformRole),
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    trialEndsAt: row.trial_ends_at,
    planCode: row.plan_code,
    salesGoalMonthly: row.sales_goal_monthly,
    expiresAt: row.expires_at,
  };
}

export function revokeSession(sessionId: number) {
  getDatabase().prepare("update sessions set revoked_at = ? where id = ?").run(nowIso(), sessionId);
}

export function listStores() {
  const rows = getDatabase().prepare(`
    select
      t.id,
      t.name,
      t.slug,
      t.status,
      t.plan_code,
      t.max_users,
      t.trial_ends_at,
      (
        select count(*)
        from memberships m
        where m.tenant_id = t.id and m.active = 1
      ) as users_count,
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

export function listPlatformAuditEvents(limit = 20) {
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

export function listTenantAuditEvents(actor: AuthenticatedSession, limit = 20) {
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

export function listTenantMembersByTenantId(tenantId: number) {
  const rows = getDatabase().prepare(`
    select
      m.id,
      u.name as nome,
      u.email,
      m.role as papel,
      m.active as ativo,
      m.sales_goal_monthly as meta_mensal,
      m.created_at as criado_em
    from memberships m
    join users u on u.id = m.user_id
    where m.tenant_id = ?
    order by case when m.role = 'owner' then 0 else 1 end, u.name asc
  `).all(tenantId) as MemberRow[];

  return rows;
}

export function listTenantMembers(actor: AuthenticatedSession) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  return listTenantMembersByTenantId(actor.tenantId);
}

export function getTenantAppState(actor: AuthenticatedSession) {
  if (!actor.tenantId) {
    return createEmptyAppState();
  }

  const row = getDatabase().prepare(`
    select veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json
    from tenant_state
    where tenant_id = ?
  `).get(actor.tenantId) as Record<string, string> | undefined;

  const vendedores = listTenantMembers(actor).map((member) => ({
    id: String(member.id),
    nome: member.nome,
    metaMensal: member.meta_mensal ?? undefined,
  }));

  if (!row) {
    return createEmptyAppState({ vendedores });
  }

  return createEmptyAppState({
    vendedores,
    veiculos: parseJson(row.veiculos_json, APP_STATE_DEFAULTS.veiculos),
    leads: parseJson(row.leads_json, APP_STATE_DEFAULTS.leads),
    vendas: parseJson(row.vendas_json, APP_STATE_DEFAULTS.vendas),
    consultas: parseJson(row.consultas_json, APP_STATE_DEFAULTS.consultas),
    tarefasPosVenda: parseJson(row.tarefas_json, APP_STATE_DEFAULTS.tarefasPosVenda),
    custos: parseJson(row.custos_json, APP_STATE_DEFAULTS.custos),
    configPrecos: { ...APP_STATE_DEFAULTS.configPrecos, ...parseJson(row.config_json, {}) },
    memoriaLoja: { ...APP_STATE_DEFAULTS.memoriaLoja, ...parseJson(row.memoria_json, {}) },
  });
}

export function updateTenantAppState(actor: AuthenticatedSession, patch: AppStateResourcePatch) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }

  if (actor.role === "seller" && (patch.configPrecos !== undefined || patch.memoriaLoja !== undefined)) {
    throw new Error("Seller nao pode alterar configuracoes administrativas da loja.");
  }

  const db = getDatabase();
  db.prepare(`
    insert into tenant_state (
      tenant_id, veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json, created_at, updated_at
    )
    values (?, '[]', '[]', '[]', '[]', '[]', '[]', '{}', '{}', ?, ?)
    on conflict(tenant_id) do nothing
  `).run(actor.tenantId, nowIso(), nowIso());

  const statements = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      column: resourceKey(key as keyof Omit<AppStateSnapshot, "vendedores">),
      value: JSON.stringify(value),
    }));

  if (!statements.length) {
    return getTenantAppState(actor);
  }

  db.exec("begin");
  try {
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
          daysRemaining,
        }
      : null,
    permissions: {
      canManagePlatform: session.role === "platform_admin",
      canManageTeam: session.role === "owner",
    },
    expiresAt: session.expiresAt,
  };
}
