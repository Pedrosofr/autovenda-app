// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/PEDROSO/Downloads/autovenda-pro-b2b-main/autovenda-pro-b2b-main/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/PEDROSO/Downloads/autovenda-pro-b2b-main/autovenda-pro-b2b-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/PEDROSO/Downloads/autovenda-pro-b2b-main/autovenda-pro-b2b-main/node_modules/lovable-tagger/dist/index.js";

// server/backend.ts
import { createRequire } from "node:module";

// src/lib/fipe.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "de",
  "do",
  "da",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "mi"
]);
var BRAND_ALIASES = {
  volkswagen: [
    "vw",
    "volkswagen",
    "volks",
    "volksvagen",
    "volksvagem",
    "volkvagem",
    "volkwagen",
    "wolkswagen"
  ],
  chevrolet: ["gm", "chevrolet"],
  citroen: ["citroen"]
};
function stripDiacritics(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeFipeText(value) {
  return stripDiacritics(value).toLowerCase().replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value) {
  return normalizeFipeText(value).split(" ").filter((token) => token && !STOPWORDS.has(token));
}
function tokenOverlapScore(queryTokens, candidateTokens) {
  let score = 0;
  for (const token of queryTokens) {
    if (candidateTokens.includes(token)) {
      score += token.length >= 4 ? 7 : 3;
      continue;
    }
    if (candidateTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))) {
      score += token.length >= 4 ? 4 : 2;
    }
  }
  return score;
}
function scoreOption(query, candidate) {
  const normalizedQuery = normalizeFipeText(query);
  const normalizedCandidate = normalizeFipeText(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }
  let score = 0;
  if (normalizedQuery === normalizedCandidate) {
    score += 100;
  } else if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    score += 45;
  }
  score += tokenOverlapScore(tokenize(query), tokenize(candidate));
  const queryHead = tokenize(query)[0];
  const candidateHead = tokenize(candidate)[0];
  if (queryHead && candidateHead && queryHead === candidateHead) {
    score += 10;
  }
  return score;
}
function expandBrandQuery(marca, modelo) {
  const base = normalizeFipeText(`${marca} ${modelo}`);
  const queries = /* @__PURE__ */ new Set([base, normalizeFipeText(marca)]);
  Object.entries(BRAND_ALIASES).forEach(([canonical, aliases]) => {
    if (aliases.some((alias) => base.includes(alias))) {
      queries.add(canonical);
      aliases.forEach((alias) => queries.add(alias));
    }
  });
  return Array.from(queries).filter(Boolean);
}
function pickBestFipeBrand(brands, marca, modelo) {
  const queries = expandBrandQuery(marca, modelo);
  let best = null;
  for (const item of brands) {
    const candidateLabel = String(item.label);
    const score = Math.max(...queries.map((query) => scoreOption(query, candidateLabel)));
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best && best.score > 0 ? best.item : null;
}
function pickBestFipeModel(models, modelo) {
  let best = null;
  for (const item of models) {
    const score = scoreOption(modelo, String(item.label));
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best && best.score >= 10 ? best.item : null;
}
function inferFuelPreference(modelo) {
  const normalized = normalizeFipeText(modelo);
  if (/(diesel|tdi|hdi|dci|cdi)\b/.test(normalized)) return "diesel";
  if (/(hibrido|hibrida|hybrid|hev|phev)\b/.test(normalized)) return "hibrido";
  if (/(alcool|etanol)\b/.test(normalized)) return "alcool";
  if (/(flex|total flex|t flex|e flex)\b/.test(normalized)) return "flex";
  return "flex";
}
var FUEL_SCORE = {
  diesel: ["diesel"],
  hibrido: ["hibrido"],
  alcool: ["alcool"],
  flex: ["flex", "gasolina"]
};
function pickBestFipeYear(years, ano, modelo) {
  const targetYear = (ano.match(/\d{4}/)?.[0] ?? "").trim();
  const fuelPreference = inferFuelPreference(modelo);
  const candidates = years.filter((item) => {
    if (!targetYear) return true;
    return normalizeFipeText(String(item.label)).startsWith(targetYear);
  });
  if (!candidates.length) {
    return null;
  }
  const preferredFuelOrder = FUEL_SCORE[fuelPreference] ?? ["flex", "gasolina", "diesel", "alcool", "hibrido"];
  for (const fuel of preferredFuelOrder) {
    const match = candidates.find((item) => normalizeFipeText(String(item.label)).includes(fuel));
    if (match) return match;
  }
  return candidates[0];
}

// server/fipe.ts
var OFFICIAL_FIPE_BASE = "https://veiculos.fipe.org.br/api/veiculos";
var VEHICLE_TYPE_CODE = {
  carro: "1",
  moto: "2",
  caminhao: "3"
};
var CACHE_TTL_MS = 1e3 * 60 * 60 * 6;
var requestCache = /* @__PURE__ */ new Map();
function asFormData(data) {
  const form = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    form.set(key, value);
  });
  return form;
}
async function postOfficialFipe(path2, data) {
  const response = await fetch(`${OFFICIAL_FIPE_BASE}/${path2}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json"
    },
    body: data ? asFormData(data) : void 0
  });
  if (!response.ok) {
    throw new Error(`Falha ao consultar FIPE oficial (${response.status}).`);
  }
  return response.json();
}
async function getCached(key, loader) {
  const now = Date.now();
  const cached = requestCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await loader();
  requestCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    value
  });
  return value;
}
async function fetchReferenceCode() {
  return getCached("fipe:reference", async () => {
    const references = await postOfficialFipe(
      "ConsultarTabelaDeReferencia"
    );
    return String(references[0]?.Codigo ?? "");
  });
}
function toOptions(items) {
  return (items ?? []).map((item) => ({
    label: String(item.Label ?? ""),
    value: String(item.Value ?? "")
  }));
}
async function fetchBrands(referenceCode, vehicleTypeCode) {
  return getCached(
    `fipe:brands:${referenceCode}:${vehicleTypeCode}`,
    async () => toOptions(
      await postOfficialFipe("ConsultarMarcas", {
        codigoTabelaReferencia: referenceCode,
        codigoTipoVeiculo: vehicleTypeCode
      })
    )
  );
}
async function fetchModels(referenceCode, vehicleTypeCode, brandCode) {
  return getCached(`fipe:models:${referenceCode}:${vehicleTypeCode}:${brandCode}`, async () => {
    const response = await postOfficialFipe("ConsultarModelos", {
      codigoTabelaReferencia: referenceCode,
      codigoTipoVeiculo: vehicleTypeCode,
      codigoMarca: brandCode
    });
    return toOptions(response.Modelos);
  });
}
function rankSuggestions(options, query, limit = 8) {
  const normalizedQuery = normalizeFipeText(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (!normalizedQuery) {
    return [];
  }
  return options.map((item) => {
    const normalizedLabel = normalizeFipeText(item.label);
    let score = 0;
    if (normalizedLabel.startsWith(normalizedQuery)) {
      score += 100;
    } else if (normalizedLabel.includes(normalizedQuery)) {
      score += 70;
    }
    for (const token of queryTokens) {
      if (normalizedLabel.startsWith(token)) {
        score += token.length >= 4 ? 18 : 6;
      } else if (normalizedLabel.includes(token)) {
        score += token.length >= 4 ? 10 : 4;
      }
    }
    return { item, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label)).slice(0, limit).map((entry) => entry.item);
}
async function suggestFipeBrands(params) {
  const query = params.query.trim();
  if (query.length < 2) {
    return [];
  }
  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();
  if (!referenceCode) {
    return [];
  }
  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  return rankSuggestions(brands, query, params.limit ?? 8);
}
async function suggestFipeModels(params) {
  const marca = params.marca.trim();
  const query = params.query.trim();
  if (marca.length < 2 || query.length < 2) {
    return [];
  }
  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();
  if (!referenceCode) {
    return [];
  }
  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  const brand = pickBestFipeBrand(brands, marca, query);
  if (!brand) {
    return [];
  }
  const models = await fetchModels(referenceCode, vehicleTypeCode, String(brand.value));
  return rankSuggestions(models, query, params.limit ?? 8);
}
async function lookupFipeByText(params) {
  const tipo = params.tipo ?? "carro";
  const vehicleTypeCode = VEHICLE_TYPE_CODE[tipo];
  const referenceCode = await fetchReferenceCode();
  if (!referenceCode) {
    return null;
  }
  const brands = await fetchBrands(referenceCode, vehicleTypeCode);
  const brand = pickBestFipeBrand(
    brands,
    params.marca,
    params.modelo
  );
  if (!brand) {
    return null;
  }
  const models = await fetchModels(referenceCode, vehicleTypeCode, String(brand.value));
  const model = pickBestFipeModel(
    models,
    params.modelo
  );
  if (!model) {
    return null;
  }
  const years = await postOfficialFipe("ConsultarAnoModelo", {
    codigoTabelaReferencia: referenceCode,
    codigoTipoVeiculo: vehicleTypeCode,
    codigoMarca: String(brand.value),
    codigoModelo: String(model.value)
  });
  const year = pickBestFipeYear(toOptions(years), params.ano, params.modelo);
  if (!year) {
    return null;
  }
  const [anoModelo, codigoTipoCombustivel] = String(year.value).split("-");
  const value = await postOfficialFipe("ConsultarValorComTodosParametros", {
    codigoTabelaReferencia: referenceCode,
    codigoMarca: String(brand.value),
    codigoModelo: String(model.value),
    codigoTipoVeiculo: vehicleTypeCode,
    anoModelo,
    codigoTipoCombustivel,
    tipoVeiculo: tipo,
    modeloCodigoExterno: "",
    tipoConsulta: "tradicional"
  });
  if (value.erro || !value.Valor || !value.CodigoFipe) {
    return null;
  }
  return {
    valor: value.Valor,
    marca: value.Marca ?? brand.label,
    modelo: value.Modelo ?? model.label,
    anoModelo: value.AnoModelo ?? Number(anoModelo),
    combustivel: value.Combustivel ?? year.label.replace(/^\d{4}\s*/, ""),
    codigoFipe: value.CodigoFipe,
    mesReferencia: value.MesReferencia ?? "",
    autenticacao: value.Autenticacao,
    tipoVeiculo: value.TipoVeiculo ?? Number(vehicleTypeCode),
    siglaCombustivel: value.SiglaCombustivel ?? "",
    dataConsulta: value.DataConsulta ?? "",
    source: "fipe-oficial"
  };
}

// server/database.ts
import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// src/store/types.ts
var defaultMemoriaLoja = {
  tomDeVoz: "consultivo",
  focosComerciais: ["financiamento", "troca", "agilidade", "confianca"],
  gatilhosFixos: [
    "Aceitamos financiamento",
    "Avaliamos seu usado na troca",
    "Fale conosco para mais informacoes"
  ],
  frasesRecorrentes: [],
  categoriasMaisUsadas: [],
  exemplosRecentes: [],
  atualizadoEm: (/* @__PURE__ */ new Date()).toISOString()
};
var defaultConfigPrecos = {
  pinturaPorPeca: 300,
  pneuPequeno: 200,
  pneuGrande: 300,
  higienizacaoPequeno: 500,
  higienizacaoGrande: 700,
  polimentoPequeno: 250,
  polimentoGrande: 350,
  margemLucroPercent: 15,
  telefoneLoja: ""
};

// src/lib/app-state.ts
function createEmptyAppState(overrides) {
  return {
    veiculos: [],
    leads: [],
    vendedores: [],
    vendas: [],
    consultas: [],
    tarefasPosVenda: [],
    custos: [],
    configPrecos: { ...defaultConfigPrecos },
    memoriaLoja: { ...defaultMemoriaLoja },
    ...overrides
  };
}

// server/database.ts
var SESSION_COOKIE_NAME = "autocrm_session";
var SESSION_TTL_MS = 1e3 * 60 * 60 * 24 * 7;
var PBKDF2_ITERATIONS = 12e4;
var APP_STATE_DEFAULTS = createEmptyAppState();
var dbInstance = null;
var initializedPath = null;
function getDatabasePath() {
  return process.env.DATABASE_PATH ?? join(process.cwd(), "data", "autocrm.sqlite");
}
function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel ${name} nao configurada.`);
  }
  return value;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function writeAuditLog(db, input) {
  db.prepare(`
    insert into audit_log (tenant_id, actor_user_id, action, payload_json, created_at)
    values (?, ?, ?, ?, ?)
  `).run(
    input.tenantId ?? null,
    input.actorUserId ?? null,
    input.action,
    JSON.stringify(input.payload ?? {}),
    nowIso()
  );
}
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
function isLegacySha256Hash(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derived}`;
}
function verifyPassword(password, storedHash) {
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
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function parseJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function resourceKey(column) {
  return {
    veiculos: "veiculos_json",
    leads: "leads_json",
    vendas: "vendas_json",
    consultas: "consultas_json",
    tarefasPosVenda: "tarefas_json",
    custos: "custos_json",
    configPrecos: "config_json",
    memoriaLoja: "memoria_json"
  }[column];
}
function createSchema(db) {
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
function hasColumn(db, table, column) {
  const columns = db.prepare(`pragma table_info(${table})`).all();
  return columns.some((item) => item.name === column);
}
function runMigrations(db) {
  if (!hasColumn(db, "tenants", "max_users")) {
    db.exec("alter table tenants add column max_users integer not null default 10;");
  }
}
function ensurePlatformAdmin(db) {
  const email = normalizeEmail(getEnv("PLATFORM_ADMIN_EMAIL"));
  const existing = db.prepare("select id, password_hash from users where email = ?").get(email);
  const rawPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  const hashFromEnv = process.env.PLATFORM_ADMIN_PASSWORD_HASH?.trim();
  const passwordHash = rawPassword ? hashPassword(rawPassword) : hashFromEnv ? hashFromEnv : null;
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
function getDatabase() {
  const path2 = getDatabasePath();
  if (dbInstance && initializedPath === path2) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  mkdirSync(dirname(path2), { recursive: true });
  const db = new DatabaseSync(path2);
  createSchema(db);
  runMigrations(db);
  ensurePlatformAdmin(db);
  dbInstance = db;
  initializedPath = path2;
  return db;
}
function serializeCookie(name, value, maxAgeSeconds) {
  const isProd = process.env.NODE_ENV === "production";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}; ${isProd ? "Secure; " : ""}`.trim();
}
function clearSessionCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
function createTenantWithOwner(input) {
  const db = getDatabase();
  const existingUser = db.prepare("select id from users where email = ?").get(normalizeEmail(input.ownerEmail));
  if (existingUser) {
    throw new Error("Ja existe um usuario com esse e-mail.");
  }
  const existingStore = db.prepare("select id from tenants where slug = ?").get(input.slug.trim().toLowerCase());
  if (existingStore) {
    throw new Error("Ja existe uma loja com esse identificador.");
  }
  const trialEndsAt = new Date(Date.now() + Math.max(1, input.trialDays) * 864e5).toISOString();
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
      createdAt
    );
    const userResult = db.prepare(`
      insert into users (email, password_hash, name, platform_role, active, created_at, updated_at)
      values (?, ?, ?, 'tenant_user', 1, ?, ?)
      returning id
    `).get(
      normalizeEmail(input.ownerEmail),
      hashPassword(input.ownerPassword),
      input.ownerName.trim(),
      createdAt,
      createdAt
    );
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
        maxUsers: Math.max(1, input.maxUsers)
      }
    });
    db.exec("commit");
    return { tenantId: tenantResult.id };
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
function countActiveMemberships(db, tenantId) {
  const row = db.prepare(`
    select count(*) as total
    from memberships
    where tenant_id = ? and active = 1
  `).get(tenantId);
  return row.total;
}
function getTenantLimit(db, tenantId) {
  const row = db.prepare("select max_users from tenants where id = ?").get(tenantId);
  if (!row) {
    throw new Error("Loja nao encontrada.");
  }
  return row.max_users;
}
function createTenantMembership(db, input) {
  const normalizedEmail = normalizeEmail(input.email);
  const existingUser = db.prepare("select id from users where email = ?").get(normalizedEmail);
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
    `).get(normalizedEmail, hashPassword(input.password), input.name.trim(), createdAt, createdAt);
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
        salesGoalMonthly: input.salesGoalMonthly ?? null
      }
    });
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
function createSellerForTenant(actor, input) {
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
    salesGoalMonthly: input.salesGoalMonthly
  });
}
function createTenantUserForPlatform(storeId, input) {
  const db = getDatabase();
  createTenantMembership(db, {
    tenantId: storeId,
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
    salesGoalMonthly: input.salesGoalMonthly
  });
}
function updateStoreStatus(storeId, patch) {
  const db = getDatabase();
  const current = db.prepare("select trial_ends_at, max_users from tenants where id = ?").get(storeId);
  if (!current) {
    throw new Error("Loja nao encontrada.");
  }
  const nextTrialEndsAt = patch.trialDays !== void 0 ? new Date(Date.now() + Math.max(1, patch.trialDays) * 864e5).toISOString() : patch.extendTrialDays ? new Date(new Date(current.trial_ends_at).getTime() + patch.extendTrialDays * 864e5).toISOString() : current.trial_ends_at;
  const nextMaxUsers = patch.maxUsers === void 0 ? current.max_users : Math.max(1, patch.maxUsers);
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
      maxUsers: nextMaxUsers
    }
  });
}
function getMembershipForUser(db, userId) {
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
  `).get(userId);
}
function authenticateUser(email, password, metadata) {
  const db = getDatabase();
  const user = db.prepare(`
    select id, email, password_hash, name, platform_role, active
    from users
    where email = ?
  `).get(normalizeEmail(email));
  if (!user?.active || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  let membership = void 0;
  let role = "platform_admin";
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
    nowIso()
  );
  writeAuditLog(db, {
    tenantId: membership?.tenant_id ?? null,
    actorUserId: user.id,
    action: "auth.login",
    payload: {
      role,
      sessionId: sessionRow.id,
      ip: metadata?.ip ?? null
    }
  });
  return {
    session: buildSessionPayload({
      sessionId: sessionRow.id,
      user,
      membership,
      expiresAt
    }),
    cookieHeader: serializeCookie(SESSION_COOKIE_NAME, sessionToken, Math.floor(SESSION_TTL_MS / 1e3))
  };
}
function buildSessionPayload(input) {
  return {
    sessionId: input.sessionId,
    userId: input.user.id,
    membershipId: input.membership?.membership_id ?? null,
    email: input.user.email,
    name: input.user.name,
    role: input.user.platform_role === "platform_admin" ? "platform_admin" : input.membership?.role ?? "seller",
    tenantId: input.membership?.tenant_id ?? null,
    tenantName: input.membership?.tenant_name ?? null,
    tenantSlug: input.membership?.tenant_slug ?? null,
    tenantStatus: input.membership?.tenant_status ?? null,
    trialEndsAt: input.membership?.trial_ends_at ?? null,
    planCode: input.membership?.plan_code ?? null,
    salesGoalMonthly: input.membership?.sales_goal_monthly ?? null,
    expiresAt: input.expiresAt
  };
}
function getSessionFromCookie(cookieHeader) {
  const raw = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
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
  `).get(hashToken(token));
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
      role: row.platform_role === "platform_admin" ? "platform_admin" : row.membership_role ?? "seller",
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      tenantStatus: row.tenant_status,
      trialEndsAt: row.trial_ends_at,
      planCode: row.plan_code,
      salesGoalMonthly: row.sales_goal_monthly,
      expiresAt: row.expires_at
    };
  }
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    membershipId: row.membership_id,
    email: row.email,
    name: row.name,
    role: row.platform_role === "platform_admin" ? "platform_admin" : row.membership_role ?? "seller",
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    trialEndsAt: row.trial_ends_at,
    planCode: row.plan_code,
    salesGoalMonthly: row.sales_goal_monthly,
    expiresAt: row.expires_at
  };
}
function revokeSession(sessionId) {
  getDatabase().prepare("update sessions set revoked_at = ? where id = ?").run(nowIso(), sessionId);
}
function listStores() {
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
  `).all();
  return rows;
}
function listPlatformAuditEvents(limit = 20) {
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
  `).all(limit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    actorName: row.actor_name
  }));
}
function listTenantAuditEvents(actor, limit = 20) {
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
  `).all(actor.tenantId, limit);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    actorName: row.actor_name
  }));
}
function listTenantMembersByTenantId(tenantId) {
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
  `).all(tenantId);
  return rows;
}
function listTenantMembers(actor) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }
  return listTenantMembersByTenantId(actor.tenantId);
}
function getTenantAppState(actor) {
  if (!actor.tenantId) {
    return createEmptyAppState();
  }
  const row = getDatabase().prepare(`
    select veiculos_json, leads_json, vendas_json, consultas_json, tarefas_json, custos_json, config_json, memoria_json
    from tenant_state
    where tenant_id = ?
  `).get(actor.tenantId);
  const vendedores = listTenantMembers(actor).map((member) => ({
    id: String(member.id),
    nome: member.nome,
    metaMensal: member.meta_mensal ?? void 0
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
    memoriaLoja: { ...APP_STATE_DEFAULTS.memoriaLoja, ...parseJson(row.memoria_json, {}) }
  });
}
function updateTenantAppState(actor, patch) {
  if (!actor.tenantId) {
    throw new Error("Usuario sem loja vinculada.");
  }
  if (actor.role === "seller" && (patch.configPrecos !== void 0 || patch.memoriaLoja !== void 0)) {
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
  const statements = Object.entries(patch).filter(([, value]) => value !== void 0).map(([key, value]) => ({
    column: resourceKey(key),
    value: JSON.stringify(value)
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
        actor.tenantId
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
      resources: Object.keys(patch).filter((key) => patch[key] !== void 0),
      role: actor.role
    }
  });
  return getTenantAppState(actor);
}
function sessionToResponse(session) {
  const daysRemaining = session.trialEndsAt ? Math.max(0, Math.ceil((new Date(session.trialEndsAt).getTime() - Date.now()) / 864e5)) : null;
  return {
    authenticated: true,
    user: {
      id: String(session.userId),
      membershipId: session.membershipId ? String(session.membershipId) : null,
      email: session.email,
      name: session.name,
      role: session.role,
      salesGoalMonthly: session.salesGoalMonthly
    },
    tenant: session.tenantId ? {
      id: String(session.tenantId),
      name: session.tenantName,
      slug: session.tenantSlug,
      status: session.tenantStatus,
      trialEndsAt: session.trialEndsAt,
      planCode: session.planCode,
      daysRemaining
    } : null,
    permissions: {
      canManagePlatform: session.role === "platform_admin",
      canManageTeam: session.role === "owner"
    },
    expiresAt: session.expiresAt
  };
}

// server/backend.ts
var __vite_injected_original_import_meta_url = "file:///C:/Users/PEDROSO/Downloads/autovenda-pro-b2b-main/autovenda-pro-b2b-main/server/backend.ts";
var require2 = createRequire(__vite_injected_original_import_meta_url);
var sinespApi = require2("sinesp-api");
var rateLimitBuckets = /* @__PURE__ */ new Map();
function normalizeHeaders(headers) {
  const normalized = {};
  if (!headers) return normalized;
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(", ");
      return;
    }
    if (typeof value === "string") {
      normalized[key.toLowerCase()] = value;
    }
  });
  return normalized;
}
function json(status, body, headers) {
  return {
    status,
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  };
}
function enforceRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1e3);
    return retryAfterSeconds;
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return null;
}
function requireSession(headers) {
  const session = getSessionFromCookie(headers.cookie);
  if (!session) {
    return { error: json(401, { error: "Sessao invalida ou expirada." }) };
  }
  if (session.role !== "platform_admin" && (session.tenantStatus === "blocked" || session.tenantStatus === "closed")) {
    return { error: json(403, { error: "A loja esta bloqueada ou encerrada." }) };
  }
  return { session };
}
function requirePlatformAdmin(headers) {
  const result = requireSession(headers);
  if ("error" in result) return result;
  if (result.session.role !== "platform_admin") {
    return { error: json(403, { error: "Acesso restrito ao admin da plataforma." }) };
  }
  return result;
}
async function handleLogin(request, headers) {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }
  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`login:${ip}`, 10, 6e4);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }
  const body = request.body ?? {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return json(400, { error: "Informe e-mail e senha." });
  }
  const auth = authenticateUser(email, password, {
    ip,
    userAgent: headers["user-agent"]
  });
  if (!auth) {
    return json(401, { error: "Credenciais invalidas." });
  }
  return json(200, sessionToResponse(auth.session), {
    "Set-Cookie": auth.cookieHeader
  });
}
async function handleSession(headers) {
  const result = requireSession(headers);
  if ("error" in result) return result.error;
  return json(200, sessionToResponse(result.session));
}
async function handleLogout(headers) {
  const result = requireSession(headers);
  if (!("error" in result)) {
    revokeSession(result.session.sessionId);
  }
  return json(200, { success: true }, {
    "Set-Cookie": clearSessionCookieHeader()
  });
}
async function handlePlatformStores(request, headers) {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;
  if (request.method === "GET") {
    return json(200, { stores: listStores() });
  }
  if (request.method === "POST") {
    const body = request.body ?? {};
    const storeName = String(body.storeName ?? "").trim();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const ownerName = String(body.ownerName ?? "").trim();
    const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();
    const ownerPassword = String(body.ownerPassword ?? "");
    const trialDays = Number(body.trialDays ?? process.env.DEFAULT_TRIAL_DAYS ?? 7);
    const maxUsers = Number(body.maxUsers ?? 5);
    if (!storeName || !slug || !ownerName || !ownerEmail || !ownerPassword) {
      return json(400, { error: "Informe loja, slug, owner, e-mail e senha." });
    }
    try {
      createTenantWithOwner({
        storeName,
        slug,
        ownerName,
        ownerEmail,
        ownerPassword,
        trialDays,
        maxUsers
      });
      return json(201, { success: true, stores: listStores() });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar a loja." });
    }
  }
  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}
async function handlePlatformStoreUpdate(request, headers) {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;
  if (request.method !== "PATCH") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PATCH" });
  }
  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }
  const body = request.body ?? {};
  const status = body.status ? String(body.status) : void 0;
  const extendTrialDays = body.extendTrialDays === void 0 ? void 0 : Number(body.extendTrialDays);
  const trialDays = body.trialDays === void 0 ? void 0 : Number(body.trialDays);
  const maxUsers = body.maxUsers === void 0 ? void 0 : Number(body.maxUsers);
  try {
    updateStoreStatus(storeId, {
      status,
      extendTrialDays,
      trialDays,
      maxUsers
    });
    return json(200, { success: true, stores: listStores() });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel atualizar a loja." });
  }
}
async function handleTenantTeam(request, headers) {
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  if (!sessionResult.session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }
  if (request.method === "GET") {
    if (sessionResult.session.role !== "owner" && sessionResult.session.role !== "platform_admin") {
      return json(403, { error: "Acesso restrito ao owner." });
    }
    return json(200, { members: listTenantMembers(sessionResult.session) });
  }
  if (request.method === "POST") {
    if (sessionResult.session.role !== "owner") {
      return json(403, { error: "Somente o owner pode criar vendedores." });
    }
    const body = request.body ?? {};
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "seller").trim().toLowerCase();
    const salesGoalMonthly = body.salesGoalMonthly === void 0 ? null : Number(body.salesGoalMonthly);
    if (!name || !email || !password) {
      return json(400, { error: "Informe nome, e-mail e senha do vendedor." });
    }
    if (!["owner", "seller"].includes(role)) {
      return json(400, { error: "Papel invalido para o usuario da loja." });
    }
    try {
      createSellerForTenant(sessionResult.session, {
        name,
        email,
        password,
        role,
        salesGoalMonthly
      });
      return json(201, { success: true, members: listTenantMembers(sessionResult.session) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o vendedor." });
    }
  }
  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}
async function handlePlatformStoreTeam(request, headers) {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;
  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)\/team$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }
  if (request.method === "GET") {
    return json(200, { members: listTenantMembersByTenantId(storeId) });
  }
  if (request.method === "POST") {
    const body = request.body ?? {};
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "seller").trim().toLowerCase();
    const salesGoalMonthly = body.salesGoalMonthly === void 0 ? null : Number(body.salesGoalMonthly);
    if (!name || !email || !password) {
      return json(400, { error: "Informe nome, e-mail e senha do usuario." });
    }
    if (!["owner", "seller"].includes(role)) {
      return json(400, { error: "Papel invalido para o usuario da loja." });
    }
    try {
      createTenantUserForPlatform(storeId, {
        name,
        email,
        password,
        role,
        salesGoalMonthly
      });
      return json(201, { success: true, members: listTenantMembersByTenantId(storeId) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o usuario." });
    }
  }
  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}
async function handlePlatformActivity(request, headers) {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  return json(200, { events: listPlatformAuditEvents(20) });
}
async function handleTenantActivity(request, headers) {
  const result = requireSession(headers);
  if ("error" in result) return result.error;
  if (!result.session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  return json(200, { events: listTenantAuditEvents(result.session, 20) });
}
async function handleAppStateGet(headers) {
  const result = requireSession(headers);
  if ("error" in result) return result.error;
  if (!result.session.tenantId) {
    return json(200, { state: getTenantAppState(result.session) });
  }
  return json(200, { state: getTenantAppState(result.session) });
}
async function handleAppStateUpdate(request, headers) {
  const result = requireSession(headers);
  if ("error" in result) return result.error;
  if (!result.session.tenantId) {
    return json(400, { error: "Somente usuarios de loja podem sincronizar dados." });
  }
  if (request.method !== "PUT") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PUT" });
  }
  const body = request.body ?? {};
  const patch = body;
  try {
    const state = updateTenantAppState(result.session, patch);
    return json(200, { state });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel sincronizar os dados." });
  }
}
async function handleGemini(request, headers) {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`gemini:${ip}`, 25, 6e4);
  if (retryAfter) {
    return json(429, { error: "Muitas requisicoes de IA. Aguarde alguns segundos." }, { "Retry-After": String(retryAfter) });
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return json(503, { error: "GOOGLE_API_KEY nao configurada." });
  }
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request.body ?? {})
  });
  const text = await upstream.text();
  let parsedBody = text;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = { error: text };
  }
  return json(upstream.status, parsedBody);
}
function normalizePlate(value) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7);
}
function isValidPlate(value) {
  return /^[A-Z]{3}[0-9]{4}$/.test(value) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(value);
}
function firstString(...values) {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim() : "";
}
function extractYear(data) {
  const year = firstString(data.ano, data.anoModelo);
  return year || "Nao informado";
}
async function lookupPlateWithSinesp(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await sinespApi.search(candidate);
      return {
        response,
        usedPlate: candidate
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha ao consultar placa.");
    }
  }
  throw lastError ?? new Error("Nao foi possivel consultar a placa.");
}
async function handlePlateLookup(request, headers) {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const url = new URL(`http://localhost${request.path}`);
  const plate = normalizePlate(url.searchParams.get("plate") ?? "");
  const candidates = (url.searchParams.get("candidates") ?? "").split(",").map(normalizePlate).filter(Boolean);
  if (!plate || !isValidPlate(plate)) {
    return json(400, { error: "Placa invalida. Use o formato antigo ou Mercosul." });
  }
  try {
    const { response, usedPlate } = await lookupPlateWithSinesp(
      Array.from(new Set([plate, ...candidates].filter(isValidPlate)))
    );
    return json(200, {
      placa: firstString(response.placa, usedPlate),
      placaConsultada: plate,
      marca: firstString(response.marca, response.modelo).split("/")[0] || "Nao informado",
      modelo: firstString(response.modelo, response.marca) || "Nao informado",
      ano: extractYear(response),
      cor: firstString(response.cor),
      situacao: firstString(response.situacao, response.mensagemRetorno) || "Consulta realizada",
      municipio: firstString(response.municipio),
      uf: firstString(response.uf),
      source: "sinesp-api",
      raw: response
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel consultar a placa.";
    if (/nao encontrado|placa nao encontrada/i.test(message)) {
      return json(404, { error: "Placa nao encontrada." });
    }
    return json(503, {
      error: "O provedor de consulta de placa esta indisponivel no momento. Tente novamente em instantes.",
      detail: message
    });
  }
}
async function handleFipeLookup(request, headers) {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const url = new URL(`http://localhost${request.path}`);
  const marca = String(url.searchParams.get("marca") ?? "").trim();
  const modelo = String(url.searchParams.get("modelo") ?? "").trim();
  const ano = String(url.searchParams.get("ano") ?? "").trim();
  const tipo = String(url.searchParams.get("tipo") ?? "carro").trim().toLowerCase();
  if (!modelo || !ano) {
    return json(400, { error: "Informe modelo e ano para consultar a FIPE." });
  }
  if (!["carro", "moto", "caminhao"].includes(tipo)) {
    return json(400, { error: "Tipo de veiculo invalido para FIPE." });
  }
  try {
    const result = await lookupFipeByText({
      marca,
      modelo,
      ano,
      tipo
    });
    if (!result) {
      return json(404, { error: "FIPE nao encontrada para os dados informados." });
    }
    return json(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar a FIPE.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message
    });
  }
}
async function handleFipeBrandSuggestions(request, headers) {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const url = new URL(`http://localhost${request.path}`);
  const query = String(url.searchParams.get("q") ?? "").trim();
  const tipo = String(url.searchParams.get("tipo") ?? "carro").trim().toLowerCase();
  if (!["carro", "moto", "caminhao"].includes(tipo)) {
    return json(400, { error: "Tipo de veiculo invalido para FIPE." });
  }
  try {
    const suggestions = await suggestFipeBrands({
      query,
      tipo
    });
    return json(200, suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar sugestoes de marca.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message
    });
  }
}
async function handleFipeModelSuggestions(request, headers) {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const url = new URL(`http://localhost${request.path}`);
  const marca = String(url.searchParams.get("marca") ?? "").trim();
  const query = String(url.searchParams.get("q") ?? "").trim();
  const tipo = String(url.searchParams.get("tipo") ?? "carro").trim().toLowerCase();
  if (!["carro", "moto", "caminhao"].includes(tipo)) {
    return json(400, { error: "Tipo de veiculo invalido para FIPE." });
  }
  try {
    const suggestions = await suggestFipeModels({
      marca,
      query,
      tipo
    });
    return json(200, suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar sugestoes de modelo.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message
    });
  }
}
async function handleBackendRequest(request) {
  const headers = normalizeHeaders(request.headers);
  try {
    if (request.path === "/api/auth/login") {
      return await handleLogin(request, headers);
    }
    if (request.path === "/api/auth/session") {
      return await handleSession(headers);
    }
    if (request.path === "/api/auth/logout") {
      return await handleLogout(headers);
    }
    if (request.path === "/api/platform/stores") {
      return await handlePlatformStores(request, headers);
    }
    if (request.path === "/api/platform/activity") {
      return await handlePlatformActivity(request, headers);
    }
    if (/^\/api\/platform\/stores\/\d+\/team$/.test(request.path)) {
      return await handlePlatformStoreTeam(request, headers);
    }
    if (/^\/api\/platform\/stores\/\d+$/.test(request.path)) {
      return await handlePlatformStoreUpdate(request, headers);
    }
    if (request.path === "/api/tenant/team") {
      return await handleTenantTeam(request, headers);
    }
    if (request.path === "/api/tenant/activity") {
      return await handleTenantActivity(request, headers);
    }
    if (request.path === "/api/app/state" && request.method === "GET") {
      return await handleAppStateGet(headers);
    }
    if (request.path === "/api/app/state" && request.method === "PUT") {
      return await handleAppStateUpdate(request, headers);
    }
    if (request.path === "/api/gemini/v1/generateContent") {
      return await handleGemini(request, headers);
    }
    if (request.path.startsWith("/api/consultas/placa")) {
      return await handlePlateLookup(request, headers);
    }
    if (request.path.startsWith("/api/fipe/lookup")) {
      return await handleFipeLookup(request, headers);
    }
    if (request.path.startsWith("/api/fipe/marcas")) {
      return await handleFipeBrandSuggestions(request, headers);
    }
    if (request.path.startsWith("/api/fipe/modelos")) {
      return await handleFipeModelSuggestions(request, headers);
    }
    return json(404, { error: "Rota nao encontrada." });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Falha interna do servidor."
    });
  }
}

// server/vite-security-plugin.ts
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (!chunks.length) {
        resolve(void 0);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}
function writeResponse(res, status, headers, body) {
  res.statusCode = status;
  Object.entries(headers ?? {}).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(JSON.stringify(body));
}
function securityApiPlugin() {
  return {
    name: "security-api-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        const url = new URL(req.url, "http://localhost");
        const body = await readBody(req);
        const response = await handleBackendRequest({
          method: req.method ?? "GET",
          path: `${url.pathname}${url.search}`,
          headers: req.headers,
          body,
          ip: req.socket.remoteAddress ?? "local"
        });
        writeResponse(res, response.status, response.headers, response.body);
      });
    }
  };
}

// vite.config.ts
var __vite_injected_original_dirname = "C:\\Users\\PEDROSO\\Downloads\\autovenda-pro-b2b-main\\autovenda-pro-b2b-main";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);
  return {
    server: {
      host: "::",
      port: 8080
    },
    plugins: [react(), securityApiPlugin(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("recharts")) {
              return "charts";
            }
            if (id.includes("react-router") || id.includes("@tanstack/react-query")) {
              return "router-query";
            }
            if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("sonner") || id.includes("embla-carousel-react") || id.includes("vaul")) {
              return "ui-vendor";
            }
            if (id.includes("react") || id.includes("scheduler")) {
              return "react-vendor";
            }
          }
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAic2VydmVyL2JhY2tlbmQudHMiLCAic3JjL2xpYi9maXBlLnRzIiwgInNlcnZlci9maXBlLnRzIiwgInNlcnZlci9kYXRhYmFzZS50cyIsICJzcmMvc3RvcmUvdHlwZXMudHMiLCAic3JjL2xpYi9hcHAtc3RhdGUudHMiLCAic2VydmVyL3ZpdGUtc2VjdXJpdHktcGx1Z2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxQRURST1NPXFxcXERvd25sb2Fkc1xcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL1BFRFJPU08vRG93bmxvYWRzL2F1dG92ZW5kYS1wcm8tYjJiLW1haW4vYXV0b3ZlbmRhLXByby1iMmItbWFpbi92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xuaW1wb3J0IHsgc2VjdXJpdHlBcGlQbHVnaW4gfSBmcm9tIFwiLi9zZXJ2ZXIvdml0ZS1zZWN1cml0eS1wbHVnaW5cIjtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xuICBPYmplY3QuYXNzaWduKHByb2Nlc3MuZW52LCBlbnYpO1xuXG4gIHJldHVybiB7XG4gICAgc2VydmVyOiB7XG4gICAgICBob3N0OiBcIjo6XCIsXG4gICAgICBwb3J0OiA4MDgwLFxuICAgIH0sXG4gICAgcGx1Z2luczogW3JlYWN0KCksIHNlY3VyaXR5QXBpUGx1Z2luKCksIG1vZGUgPT09IFwiZGV2ZWxvcG1lbnRcIiAmJiBjb21wb25lbnRUYWdnZXIoKV0uZmlsdGVyKEJvb2xlYW4pLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGJ1aWxkOiB7XG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIG91dHB1dDoge1xuICAgICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgICAgaWYgKCFpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlc1wiKSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJyZWNoYXJ0c1wiKSkge1xuICAgICAgICAgICAgICByZXR1cm4gXCJjaGFydHNcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwicmVhY3Qtcm91dGVyXCIpIHx8IGlkLmluY2x1ZGVzKFwiQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5XCIpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBcInJvdXRlci1xdWVyeVwiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGlkLmluY2x1ZGVzKFwiQHJhZGl4LXVpXCIpIHx8XG4gICAgICAgICAgICAgIGlkLmluY2x1ZGVzKFwibHVjaWRlLXJlYWN0XCIpIHx8XG4gICAgICAgICAgICAgIGlkLmluY2x1ZGVzKFwic29ubmVyXCIpIHx8XG4gICAgICAgICAgICAgIGlkLmluY2x1ZGVzKFwiZW1ibGEtY2Fyb3VzZWwtcmVhY3RcIikgfHxcbiAgICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJ2YXVsXCIpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFwidWktdmVuZG9yXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInJlYWN0XCIpIHx8IGlkLmluY2x1ZGVzKFwic2NoZWR1bGVyXCIpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBcInJlYWN0LXZlbmRvclwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH07XG59KTtcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNlcnZlclwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNlcnZlclxcXFxiYWNrZW5kLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9QRURST1NPL0Rvd25sb2Fkcy9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL2F1dG92ZW5kYS1wcm8tYjJiLW1haW4vc2VydmVyL2JhY2tlbmQudHNcIjtpbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSBcIm5vZGU6bW9kdWxlXCI7XG5pbXBvcnQgeyBsb29rdXBGaXBlQnlUZXh0LCBzdWdnZXN0RmlwZUJyYW5kcywgc3VnZ2VzdEZpcGVNb2RlbHMgfSBmcm9tIFwiLi9maXBlXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlUmVzb3VyY2VQYXRjaCB9IGZyb20gXCIuLi9zcmMvbGliL2FwcC1zdGF0ZVwiO1xuaW1wb3J0IHtcbiAgYXV0aGVudGljYXRlVXNlcixcbiAgY2xlYXJTZXNzaW9uQ29va2llSGVhZGVyLFxuICBjcmVhdGVUZW5hbnRVc2VyRm9yUGxhdGZvcm0sXG4gIGNyZWF0ZVNlbGxlckZvclRlbmFudCxcbiAgY3JlYXRlVGVuYW50V2l0aE93bmVyLFxuICBnZXRTZXNzaW9uRnJvbUNvb2tpZSxcbiAgZ2V0VGVuYW50QXBwU3RhdGUsXG4gIGxpc3RQbGF0Zm9ybUF1ZGl0RXZlbnRzLFxuICBsaXN0U3RvcmVzLFxuICBsaXN0VGVuYW50QXVkaXRFdmVudHMsXG4gIGxpc3RUZW5hbnRNZW1iZXJzQnlUZW5hbnRJZCxcbiAgbGlzdFRlbmFudE1lbWJlcnMsXG4gIHJldm9rZVNlc3Npb24sXG4gIHNlc3Npb25Ub1Jlc3BvbnNlLFxuICB1cGRhdGVTdG9yZVN0YXR1cyxcbiAgdXBkYXRlVGVuYW50QXBwU3RhdGUsXG4gIHR5cGUgQXV0aGVudGljYXRlZFNlc3Npb24sXG4gIHR5cGUgVGVuYW50U3RhdHVzLFxufSBmcm9tIFwiLi9kYXRhYmFzZVwiO1xuXG5jb25zdCByZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuY29uc3Qgc2luZXNwQXBpID0gcmVxdWlyZShcInNpbmVzcC1hcGlcIikgYXMge1xuICBzZWFyY2g6IChwbGF0ZTogc3RyaW5nKSA9PiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+Pjtcbn07XG5cbnR5cGUgUmVxdWVzdFNoYXBlID0ge1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQ+O1xuICBib2R5PzogdW5rbm93bjtcbiAgaXA/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlc3BvbnNlU2hhcGUgPSB7XG4gIHN0YXR1czogbnVtYmVyO1xuICBib2R5OiB1bmtub3duO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn07XG5cbnR5cGUgU2Vzc2lvblJlc3VsdCA9XG4gIHwgeyBzZXNzaW9uOiBBdXRoZW50aWNhdGVkU2Vzc2lvbiB9XG4gIHwgeyBlcnJvcjogUmVzcG9uc2VTaGFwZSB9O1xuXG5jb25zdCByYXRlTGltaXRCdWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXG5mdW5jdGlvbiBub3JtYWxpemVIZWFkZXJzKGhlYWRlcnM6IFJlcXVlc3RTaGFwZVtcImhlYWRlcnNcIl0pIHtcbiAgY29uc3Qgbm9ybWFsaXplZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBpZiAoIWhlYWRlcnMpIHJldHVybiBub3JtYWxpemVkO1xuXG4gIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgbm9ybWFsaXplZFtrZXkudG9Mb3dlckNhc2UoKV0gPSB2YWx1ZS5qb2luKFwiLCBcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgbm9ybWFsaXplZFtrZXkudG9Mb3dlckNhc2UoKV0gPSB2YWx1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBqc29uKHN0YXR1czogbnVtYmVyLCBib2R5OiB1bmtub3duLCBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFJlc3BvbnNlU2hhcGUge1xuICByZXR1cm4ge1xuICAgIHN0YXR1cyxcbiAgICBib2R5LFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvbjsgY2hhcnNldD11dGYtOFwiLFxuICAgICAgXCJDYWNoZS1Db250cm9sXCI6IFwibm8tc3RvcmVcIixcbiAgICAgIC4uLmhlYWRlcnMsXG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5mb3JjZVJhdGVMaW1pdChrZXk6IHN0cmluZywgbGltaXQ6IG51bWJlciwgd2luZG93TXM6IG51bWJlcikge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICBjb25zdCByZWNlbnQgPSAocmF0ZUxpbWl0QnVja2V0cy5nZXQoa2V5KSA/PyBbXSkuZmlsdGVyKCh0cykgPT4gbm93IC0gdHMgPCB3aW5kb3dNcyk7XG5cbiAgaWYgKHJlY2VudC5sZW5ndGggPj0gbGltaXQpIHtcbiAgICBjb25zdCByZXRyeUFmdGVyU2Vjb25kcyA9IE1hdGguY2VpbCgod2luZG93TXMgLSAobm93IC0gcmVjZW50WzBdKSkgLyAxMDAwKTtcbiAgICByZXR1cm4gcmV0cnlBZnRlclNlY29uZHM7XG4gIH1cblxuICByZWNlbnQucHVzaChub3cpO1xuICByYXRlTGltaXRCdWNrZXRzLnNldChrZXksIHJlY2VudCk7XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiByZXF1aXJlU2Vzc2lvbihoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogU2Vzc2lvblJlc3VsdCB7XG4gIGNvbnN0IHNlc3Npb24gPSBnZXRTZXNzaW9uRnJvbUNvb2tpZShoZWFkZXJzLmNvb2tpZSk7XG4gIGlmICghc2Vzc2lvbikge1xuICAgIHJldHVybiB7IGVycm9yOiBqc29uKDQwMSwgeyBlcnJvcjogXCJTZXNzYW8gaW52YWxpZGEgb3UgZXhwaXJhZGEuXCIgfSkgfTtcbiAgfVxuXG4gIGlmIChcbiAgICBzZXNzaW9uLnJvbGUgIT09IFwicGxhdGZvcm1fYWRtaW5cIiAmJlxuICAgIChzZXNzaW9uLnRlbmFudFN0YXR1cyA9PT0gXCJibG9ja2VkXCIgfHwgc2Vzc2lvbi50ZW5hbnRTdGF0dXMgPT09IFwiY2xvc2VkXCIpXG4gICkge1xuICAgIHJldHVybiB7IGVycm9yOiBqc29uKDQwMywgeyBlcnJvcjogXCJBIGxvamEgZXN0YSBibG9xdWVhZGEgb3UgZW5jZXJyYWRhLlwiIH0pIH07XG4gIH1cblxuICByZXR1cm4geyBzZXNzaW9uIH07XG59XG5cbmZ1bmN0aW9uIHJlcXVpcmVQbGF0Zm9ybUFkbWluKGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBTZXNzaW9uUmVzdWx0IHtcbiAgY29uc3QgcmVzdWx0ID0gcmVxdWlyZVNlc3Npb24oaGVhZGVycyk7XG4gIGlmIChcImVycm9yXCIgaW4gcmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICBpZiAocmVzdWx0LnNlc3Npb24ucm9sZSAhPT0gXCJwbGF0Zm9ybV9hZG1pblwiKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IGpzb24oNDAzLCB7IGVycm9yOiBcIkFjZXNzbyByZXN0cml0byBhbyBhZG1pbiBkYSBwbGF0YWZvcm1hLlwiIH0pIH07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcmVxdWlyZU93bmVyKGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBTZXNzaW9uUmVzdWx0IHtcbiAgY29uc3QgcmVzdWx0ID0gcmVxdWlyZVNlc3Npb24oaGVhZGVycyk7XG4gIGlmIChcImVycm9yXCIgaW4gcmVzdWx0KSByZXR1cm4gcmVzdWx0O1xuICBpZiAocmVzdWx0LnNlc3Npb24ucm9sZSAhPT0gXCJvd25lclwiKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IGpzb24oNDAzLCB7IGVycm9yOiBcIkFjZXNzbyByZXN0cml0byBhbyBvd25lciBkYSBsb2phLlwiIH0pIH07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlTG9naW4ocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gXCJQT1NUXCIpIHtcbiAgICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJQT1NUXCIgfSk7XG4gIH1cblxuICBjb25zdCBpcCA9IHJlcXVlc3QuaXAgPz8gXCJ1bmtub3duXCI7XG4gIGNvbnN0IHJldHJ5QWZ0ZXIgPSBlbmZvcmNlUmF0ZUxpbWl0KGBsb2dpbjoke2lwfWAsIDEwLCA2MF8wMDApO1xuICBpZiAocmV0cnlBZnRlcikge1xuICAgIHJldHVybiBqc29uKDQyOSwgeyBlcnJvcjogXCJNdWl0YXMgdGVudGF0aXZhcy4gVGVudGUgbm92YW1lbnRlIGVtIGluc3RhbnRlcy5cIiB9LCB7IFwiUmV0cnktQWZ0ZXJcIjogU3RyaW5nKHJldHJ5QWZ0ZXIpIH0pO1xuICB9XG5cbiAgY29uc3QgYm9keSA9IChyZXF1ZXN0LmJvZHkgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBlbWFpbCA9IFN0cmluZyhib2R5LmVtYWlsID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBwYXNzd29yZCA9IFN0cmluZyhib2R5LnBhc3N3b3JkID8/IFwiXCIpO1xuXG4gIGlmICghZW1haWwgfHwgIXBhc3N3b3JkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkluZm9ybWUgZS1tYWlsIGUgc2VuaGEuXCIgfSk7XG4gIH1cblxuICBjb25zdCBhdXRoID0gYXV0aGVudGljYXRlVXNlcihlbWFpbCwgcGFzc3dvcmQsIHtcbiAgICBpcCxcbiAgICB1c2VyQWdlbnQ6IGhlYWRlcnNbXCJ1c2VyLWFnZW50XCJdLFxuICB9KTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4ganNvbig0MDEsIHsgZXJyb3I6IFwiQ3JlZGVuY2lhaXMgaW52YWxpZGFzLlwiIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCBzZXNzaW9uVG9SZXNwb25zZShhdXRoLnNlc3Npb24pLCB7XG4gICAgXCJTZXQtQ29va2llXCI6IGF1dGguY29va2llSGVhZGVyLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2Vzc2lvbihoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHJlc3VsdCkgcmV0dXJuIHJlc3VsdC5lcnJvcjtcbiAgcmV0dXJuIGpzb24oMjAwLCBzZXNzaW9uVG9SZXNwb25zZShyZXN1bHQuc2Vzc2lvbikpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVMb2dvdXQoaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8UmVzcG9uc2VTaGFwZT4ge1xuICBjb25zdCByZXN1bHQgPSByZXF1aXJlU2Vzc2lvbihoZWFkZXJzKTtcbiAgaWYgKCEoXCJlcnJvclwiIGluIHJlc3VsdCkpIHtcbiAgICByZXZva2VTZXNzaW9uKHJlc3VsdC5zZXNzaW9uLnNlc3Npb25JZCk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHsgc3VjY2VzczogdHJ1ZSB9LCB7XG4gICAgXCJTZXQtQ29va2llXCI6IGNsZWFyU2Vzc2lvbkNvb2tpZUhlYWRlcigpLFxuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlUGxhdGZvcm1TdG9yZXMocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmVQbGF0Zm9ybUFkbWluKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHJlc3VsdCkgcmV0dXJuIHJlc3VsdC5lcnJvcjtcblxuICBpZiAocmVxdWVzdC5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4ganNvbigyMDAsIHsgc3RvcmVzOiBsaXN0U3RvcmVzKCkgfSk7XG4gIH1cblxuICBpZiAocmVxdWVzdC5tZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgY29uc3QgYm9keSA9IChyZXF1ZXN0LmJvZHkgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IHN0b3JlTmFtZSA9IFN0cmluZyhib2R5LnN0b3JlTmFtZSA/PyBcIlwiKS50cmltKCk7XG4gICAgY29uc3Qgc2x1ZyA9IFN0cmluZyhib2R5LnNsdWcgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3Qgb3duZXJOYW1lID0gU3RyaW5nKGJvZHkub3duZXJOYW1lID8/IFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCBvd25lckVtYWlsID0gU3RyaW5nKGJvZHkub3duZXJFbWFpbCA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBvd25lclBhc3N3b3JkID0gU3RyaW5nKGJvZHkub3duZXJQYXNzd29yZCA/PyBcIlwiKTtcbiAgICBjb25zdCB0cmlhbERheXMgPSBOdW1iZXIoYm9keS50cmlhbERheXMgPz8gcHJvY2Vzcy5lbnYuREVGQVVMVF9UUklBTF9EQVlTID8/IDcpO1xuICAgIGNvbnN0IG1heFVzZXJzID0gTnVtYmVyKGJvZHkubWF4VXNlcnMgPz8gNSk7XG5cbiAgICBpZiAoIXN0b3JlTmFtZSB8fCAhc2x1ZyB8fCAhb3duZXJOYW1lIHx8ICFvd25lckVtYWlsIHx8ICFvd25lclBhc3N3b3JkKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW5mb3JtZSBsb2phLCBzbHVnLCBvd25lciwgZS1tYWlsIGUgc2VuaGEuXCIgfSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNyZWF0ZVRlbmFudFdpdGhPd25lcih7XG4gICAgICAgIHN0b3JlTmFtZSxcbiAgICAgICAgc2x1ZyxcbiAgICAgICAgb3duZXJOYW1lLFxuICAgICAgICBvd25lckVtYWlsLFxuICAgICAgICBvd25lclBhc3N3b3JkLFxuICAgICAgICB0cmlhbERheXMsXG4gICAgICAgIG1heFVzZXJzLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4ganNvbigyMDEsIHsgc3VjY2VzczogdHJ1ZSwgc3RvcmVzOiBsaXN0U3RvcmVzKCkgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIk5hbyBmb2kgcG9zc2l2ZWwgY3JpYXIgYSBsb2phLlwiIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIkdFVCwgUE9TVFwiIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVQbGF0Zm9ybVN0b3JlVXBkYXRlKHJlcXVlc3Q6IFJlcXVlc3RTaGFwZSwgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8UmVzcG9uc2VTaGFwZT4ge1xuICBjb25zdCByZXN1bHQgPSByZXF1aXJlUGxhdGZvcm1BZG1pbihoZWFkZXJzKTtcbiAgaWYgKFwiZXJyb3JcIiBpbiByZXN1bHQpIHJldHVybiByZXN1bHQuZXJyb3I7XG5cbiAgaWYgKHJlcXVlc3QubWV0aG9kICE9PSBcIlBBVENIXCIpIHtcbiAgICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJQQVRDSFwiIH0pO1xuICB9XG5cbiAgY29uc3QgbWF0Y2ggPSByZXF1ZXN0LnBhdGgubWF0Y2goL15cXC9hcGlcXC9wbGF0Zm9ybVxcL3N0b3Jlc1xcLyhcXGQrKSQvKTtcbiAgY29uc3Qgc3RvcmVJZCA9IE51bWJlcihtYXRjaD8uWzFdID8/IDApO1xuICBpZiAoIXN0b3JlSWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTG9qYSBpbnZhbGlkYS5cIiB9KTtcbiAgfVxuXG4gIGNvbnN0IGJvZHkgPSAocmVxdWVzdC5ib2R5ID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3Qgc3RhdHVzID0gYm9keS5zdGF0dXMgPyBTdHJpbmcoYm9keS5zdGF0dXMpIGFzIFRlbmFudFN0YXR1cyA6IHVuZGVmaW5lZDtcbiAgY29uc3QgZXh0ZW5kVHJpYWxEYXlzID0gYm9keS5leHRlbmRUcmlhbERheXMgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlcihib2R5LmV4dGVuZFRyaWFsRGF5cyk7XG4gIGNvbnN0IHRyaWFsRGF5cyA9IGJvZHkudHJpYWxEYXlzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBOdW1iZXIoYm9keS50cmlhbERheXMpO1xuICBjb25zdCBtYXhVc2VycyA9IGJvZHkubWF4VXNlcnMgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IE51bWJlcihib2R5Lm1heFVzZXJzKTtcblxuICB0cnkge1xuICAgIHVwZGF0ZVN0b3JlU3RhdHVzKHN0b3JlSWQsIHtcbiAgICAgIHN0YXR1cyxcbiAgICAgIGV4dGVuZFRyaWFsRGF5cyxcbiAgICAgIHRyaWFsRGF5cyxcbiAgICAgIG1heFVzZXJzLFxuICAgIH0pO1xuICAgIHJldHVybiBqc29uKDIwMCwgeyBzdWNjZXNzOiB0cnVlLCBzdG9yZXM6IGxpc3RTdG9yZXMoKSB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJOYW8gZm9pIHBvc3NpdmVsIGF0dWFsaXphciBhIGxvamEuXCIgfSk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlVGVuYW50VGVhbShyZXF1ZXN0OiBSZXF1ZXN0U2hhcGUsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPFJlc3BvbnNlU2hhcGU+IHtcbiAgY29uc3Qgc2Vzc2lvblJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHNlc3Npb25SZXN1bHQpIHJldHVybiBzZXNzaW9uUmVzdWx0LmVycm9yO1xuXG4gIGlmICghc2Vzc2lvblJlc3VsdC5zZXNzaW9uLnRlbmFudElkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlVzdWFyaW8gc2VtIGxvamEgdmluY3VsYWRhLlwiIH0pO1xuICB9XG5cbiAgaWYgKHJlcXVlc3QubWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgaWYgKHNlc3Npb25SZXN1bHQuc2Vzc2lvbi5yb2xlICE9PSBcIm93bmVyXCIgJiYgc2Vzc2lvblJlc3VsdC5zZXNzaW9uLnJvbGUgIT09IFwicGxhdGZvcm1fYWRtaW5cIikge1xuICAgICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkFjZXNzbyByZXN0cml0byBhbyBvd25lci5cIiB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7IG1lbWJlcnM6IGxpc3RUZW5hbnRNZW1iZXJzKHNlc3Npb25SZXN1bHQuc2Vzc2lvbikgfSk7XG4gIH1cblxuICBpZiAocmVxdWVzdC5tZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgaWYgKHNlc3Npb25SZXN1bHQuc2Vzc2lvbi5yb2xlICE9PSBcIm93bmVyXCIpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJTb21lbnRlIG8gb3duZXIgcG9kZSBjcmlhciB2ZW5kZWRvcmVzLlwiIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGJvZHkgPSAocmVxdWVzdC5ib2R5ID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICBjb25zdCBuYW1lID0gU3RyaW5nKGJvZHkubmFtZSA/PyBcIlwiKS50cmltKCk7XG4gICAgY29uc3QgZW1haWwgPSBTdHJpbmcoYm9keS5lbWFpbCA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBwYXNzd29yZCA9IFN0cmluZyhib2R5LnBhc3N3b3JkID8/IFwiXCIpO1xuICAgIGNvbnN0IHJvbGUgPSBTdHJpbmcoYm9keS5yb2xlID8/IFwic2VsbGVyXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHNhbGVzR29hbE1vbnRobHkgPSBib2R5LnNhbGVzR29hbE1vbnRobHkgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBOdW1iZXIoYm9keS5zYWxlc0dvYWxNb250aGx5KTtcblxuICAgIGlmICghbmFtZSB8fCAhZW1haWwgfHwgIXBhc3N3b3JkKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW5mb3JtZSBub21lLCBlLW1haWwgZSBzZW5oYSBkbyB2ZW5kZWRvci5cIiB9KTtcbiAgICB9XG5cbiAgICBpZiAoIVtcIm93bmVyXCIsIFwic2VsbGVyXCJdLmluY2x1ZGVzKHJvbGUpKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiUGFwZWwgaW52YWxpZG8gcGFyYSBvIHVzdWFyaW8gZGEgbG9qYS5cIiB9KTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY3JlYXRlU2VsbGVyRm9yVGVuYW50KHNlc3Npb25SZXN1bHQuc2Vzc2lvbiwge1xuICAgICAgICBuYW1lLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgIHJvbGU6IHJvbGUgYXMgXCJvd25lclwiIHwgXCJzZWxsZXJcIixcbiAgICAgICAgc2FsZXNHb2FsTW9udGhseSxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGpzb24oMjAxLCB7IHN1Y2Nlc3M6IHRydWUsIG1lbWJlcnM6IGxpc3RUZW5hbnRNZW1iZXJzKHNlc3Npb25SZXN1bHQuc2Vzc2lvbikgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIk5hbyBmb2kgcG9zc2l2ZWwgY3JpYXIgbyB2ZW5kZWRvci5cIiB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJHRVQsIFBPU1RcIiB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlUGxhdGZvcm1TdG9yZVRlYW0ocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmVQbGF0Zm9ybUFkbWluKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHJlc3VsdCkgcmV0dXJuIHJlc3VsdC5lcnJvcjtcblxuICBjb25zdCBtYXRjaCA9IHJlcXVlc3QucGF0aC5tYXRjaCgvXlxcL2FwaVxcL3BsYXRmb3JtXFwvc3RvcmVzXFwvKFxcZCspXFwvdGVhbSQvKTtcbiAgY29uc3Qgc3RvcmVJZCA9IE51bWJlcihtYXRjaD8uWzFdID8/IDApO1xuICBpZiAoIXN0b3JlSWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTG9qYSBpbnZhbGlkYS5cIiB9KTtcbiAgfVxuXG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgIHJldHVybiBqc29uKDIwMCwgeyBtZW1iZXJzOiBsaXN0VGVuYW50TWVtYmVyc0J5VGVuYW50SWQoc3RvcmVJZCkgfSk7XG4gIH1cblxuICBpZiAocmVxdWVzdC5tZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgY29uc3QgYm9keSA9IChyZXF1ZXN0LmJvZHkgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGNvbnN0IG5hbWUgPSBTdHJpbmcoYm9keS5uYW1lID8/IFwiXCIpLnRyaW0oKTtcbiAgICBjb25zdCBlbWFpbCA9IFN0cmluZyhib2R5LmVtYWlsID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHBhc3N3b3JkID0gU3RyaW5nKGJvZHkucGFzc3dvcmQgPz8gXCJcIik7XG4gICAgY29uc3Qgcm9sZSA9IFN0cmluZyhib2R5LnJvbGUgPz8gXCJzZWxsZXJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3Qgc2FsZXNHb2FsTW9udGhseSA9IGJvZHkuc2FsZXNHb2FsTW9udGhseSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IE51bWJlcihib2R5LnNhbGVzR29hbE1vbnRobHkpO1xuXG4gICAgaWYgKCFuYW1lIHx8ICFlbWFpbCB8fCAhcGFzc3dvcmQpIHtcbiAgICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbmZvcm1lIG5vbWUsIGUtbWFpbCBlIHNlbmhhIGRvIHVzdWFyaW8uXCIgfSk7XG4gICAgfVxuXG4gICAgaWYgKCFbXCJvd25lclwiLCBcInNlbGxlclwiXS5pbmNsdWRlcyhyb2xlKSkge1xuICAgICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlBhcGVsIGludmFsaWRvIHBhcmEgbyB1c3VhcmlvIGRhIGxvamEuXCIgfSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNyZWF0ZVRlbmFudFVzZXJGb3JQbGF0Zm9ybShzdG9yZUlkLCB7XG4gICAgICAgIG5hbWUsXG4gICAgICAgIGVtYWlsLFxuICAgICAgICBwYXNzd29yZCxcbiAgICAgICAgcm9sZTogcm9sZSBhcyBcIm93bmVyXCIgfCBcInNlbGxlclwiLFxuICAgICAgICBzYWxlc0dvYWxNb250aGx5LFxuICAgICAgfSk7XG4gICAgICByZXR1cm4ganNvbigyMDEsIHsgc3VjY2VzczogdHJ1ZSwgbWVtYmVyczogbGlzdFRlbmFudE1lbWJlcnNCeVRlbmFudElkKHN0b3JlSWQpIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJOYW8gZm9pIHBvc3NpdmVsIGNyaWFyIG8gdXN1YXJpby5cIiB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJHRVQsIFBPU1RcIiB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlUGxhdGZvcm1BY3Rpdml0eShyZXF1ZXN0OiBSZXF1ZXN0U2hhcGUsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPFJlc3BvbnNlU2hhcGU+IHtcbiAgY29uc3QgcmVzdWx0ID0gcmVxdWlyZVBsYXRmb3JtQWRtaW4oaGVhZGVycyk7XG4gIGlmIChcImVycm9yXCIgaW4gcmVzdWx0KSByZXR1cm4gcmVzdWx0LmVycm9yO1xuXG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gXCJHRVRcIikge1xuICAgIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIkdFVFwiIH0pO1xuICB9XG5cbiAgcmV0dXJuIGpzb24oMjAwLCB7IGV2ZW50czogbGlzdFBsYXRmb3JtQXVkaXRFdmVudHMoMjApIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVUZW5hbnRBY3Rpdml0eShyZXF1ZXN0OiBSZXF1ZXN0U2hhcGUsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPFJlc3BvbnNlU2hhcGU+IHtcbiAgY29uc3QgcmVzdWx0ID0gcmVxdWlyZVNlc3Npb24oaGVhZGVycyk7XG4gIGlmIChcImVycm9yXCIgaW4gcmVzdWx0KSByZXR1cm4gcmVzdWx0LmVycm9yO1xuXG4gIGlmICghcmVzdWx0LnNlc3Npb24udGVuYW50SWQpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVXN1YXJpbyBzZW0gbG9qYSB2aW5jdWxhZGEuXCIgfSk7XG4gIH1cblxuICBpZiAocmVxdWVzdC5tZXRob2QgIT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJHRVRcIiB9KTtcbiAgfVxuXG4gIHJldHVybiBqc29uKDIwMCwgeyBldmVudHM6IGxpc3RUZW5hbnRBdWRpdEV2ZW50cyhyZXN1bHQuc2Vzc2lvbiwgMjApIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBTdGF0ZUdldChoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHJlc3VsdCkgcmV0dXJuIHJlc3VsdC5lcnJvcjtcblxuICBpZiAoIXJlc3VsdC5zZXNzaW9uLnRlbmFudElkKSB7XG4gICAgcmV0dXJuIGpzb24oMjAwLCB7IHN0YXRlOiBnZXRUZW5hbnRBcHBTdGF0ZShyZXN1bHQuc2Vzc2lvbikgfSk7XG4gIH1cblxuICByZXR1cm4ganNvbigyMDAsIHsgc3RhdGU6IGdldFRlbmFudEFwcFN0YXRlKHJlc3VsdC5zZXNzaW9uKSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwU3RhdGVVcGRhdGUocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGNvbnN0IHJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHJlc3VsdCkgcmV0dXJuIHJlc3VsdC5lcnJvcjtcblxuICBpZiAoIXJlc3VsdC5zZXNzaW9uLnRlbmFudElkKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlNvbWVudGUgdXN1YXJpb3MgZGUgbG9qYSBwb2RlbSBzaW5jcm9uaXphciBkYWRvcy5cIiB9KTtcbiAgfVxuXG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gXCJQVVRcIikge1xuICAgIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIlBVVFwiIH0pO1xuICB9XG5cbiAgY29uc3QgYm9keSA9IChyZXF1ZXN0LmJvZHkgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBwYXRjaCA9IGJvZHkgYXMgQXBwU3RhdGVSZXNvdXJjZVBhdGNoO1xuXG4gIHRyeSB7XG4gICAgY29uc3Qgc3RhdGUgPSB1cGRhdGVUZW5hbnRBcHBTdGF0ZShyZXN1bHQuc2Vzc2lvbiwgcGF0Y2gpO1xuICAgIHJldHVybiBqc29uKDIwMCwgeyBzdGF0ZSB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJOYW8gZm9pIHBvc3NpdmVsIHNpbmNyb25pemFyIG9zIGRhZG9zLlwiIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUdlbWluaShyZXF1ZXN0OiBSZXF1ZXN0U2hhcGUsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPFJlc3BvbnNlU2hhcGU+IHtcbiAgaWYgKHJlcXVlc3QubWV0aG9kICE9PSBcIlBPU1RcIikge1xuICAgIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIlBPU1RcIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHNlc3Npb25SZXN1bHQgPSByZXF1aXJlU2Vzc2lvbihoZWFkZXJzKTtcbiAgaWYgKFwiZXJyb3JcIiBpbiBzZXNzaW9uUmVzdWx0KSByZXR1cm4gc2Vzc2lvblJlc3VsdC5lcnJvcjtcblxuICBjb25zdCBpcCA9IHJlcXVlc3QuaXAgPz8gXCJ1bmtub3duXCI7XG4gIGNvbnN0IHJldHJ5QWZ0ZXIgPSBlbmZvcmNlUmF0ZUxpbWl0KGBnZW1pbmk6JHtpcH1gLCAyNSwgNjBfMDAwKTtcbiAgaWYgKHJldHJ5QWZ0ZXIpIHtcbiAgICByZXR1cm4ganNvbig0MjksIHsgZXJyb3I6IFwiTXVpdGFzIHJlcXVpc2ljb2VzIGRlIElBLiBBZ3VhcmRlIGFsZ3VucyBzZWd1bmRvcy5cIiB9LCB7IFwiUmV0cnktQWZ0ZXJcIjogU3RyaW5nKHJldHJ5QWZ0ZXIpIH0pO1xuICB9XG5cbiAgY29uc3QgYXBpS2V5ID0gcHJvY2Vzcy5lbnYuR09PR0xFX0FQSV9LRVk7XG4gIGlmICghYXBpS2V5KSB7XG4gICAgcmV0dXJuIGpzb24oNTAzLCB7IGVycm9yOiBcIkdPT0dMRV9BUElfS0VZIG5hbyBjb25maWd1cmFkYS5cIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHVwc3RyZWFtID0gYXdhaXQgZmV0Y2goYGh0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YS9tb2RlbHMvZ2VtaW5pLTIuMC1mbGFzaDpnZW5lcmF0ZUNvbnRlbnQ/a2V5PSR7YXBpS2V5fWAsIHtcbiAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdC5ib2R5ID8/IHt9KSxcbiAgfSk7XG5cbiAgY29uc3QgdGV4dCA9IGF3YWl0IHVwc3RyZWFtLnRleHQoKTtcbiAgbGV0IHBhcnNlZEJvZHk6IHVua25vd24gPSB0ZXh0O1xuXG4gIHRyeSB7XG4gICAgcGFyc2VkQm9keSA9IEpTT04ucGFyc2UodGV4dCk7XG4gIH0gY2F0Y2gge1xuICAgIHBhcnNlZEJvZHkgPSB7IGVycm9yOiB0ZXh0IH07XG4gIH1cblxuICByZXR1cm4ganNvbih1cHN0cmVhbS5zdGF0dXMsIHBhcnNlZEJvZHkpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQbGF0ZSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXmEtekEtWjAtOV0vZywgXCJcIikudG9VcHBlckNhc2UoKS5zbGljZSgwLCA3KTtcbn1cblxuZnVuY3Rpb24gaXNWYWxpZFBsYXRlKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIC9eW0EtWl17M31bMC05XXs0fSQvLnRlc3QodmFsdWUpIHx8IC9eW0EtWl17M31bMC05XVtBLVpdWzAtOV17Mn0kLy50ZXN0KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZmlyc3RTdHJpbmcoLi4udmFsdWVzOiB1bmtub3duW10pIHtcbiAgY29uc3QgZm91bmQgPSB2YWx1ZXMuZmluZCgodmFsdWUpID0+IHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiAmJiB2YWx1ZS50cmltKCkpO1xuICByZXR1cm4gdHlwZW9mIGZvdW5kID09PSBcInN0cmluZ1wiID8gZm91bmQudHJpbSgpIDogXCJcIjtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFllYXIoZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pIHtcbiAgY29uc3QgeWVhciA9IGZpcnN0U3RyaW5nKGRhdGEuYW5vLCBkYXRhLmFub01vZGVsbyk7XG4gIHJldHVybiB5ZWFyIHx8IFwiTmFvIGluZm9ybWFkb1wiO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb29rdXBQbGF0ZVdpdGhTaW5lc3AoY2FuZGlkYXRlczogc3RyaW5nW10pIHtcbiAgbGV0IGxhc3RFcnJvcjogRXJyb3IgfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2luZXNwQXBpLnNlYXJjaChjYW5kaWRhdGUpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgIHVzZWRQbGF0ZTogY2FuZGlkYXRlLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbGFzdEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFwiRmFsaGEgYW8gY29uc3VsdGFyIHBsYWNhLlwiKTtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBsYXN0RXJyb3IgPz8gbmV3IEVycm9yKFwiTmFvIGZvaSBwb3NzaXZlbCBjb25zdWx0YXIgYSBwbGFjYS5cIik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVBsYXRlTG9va3VwKHJlcXVlc3Q6IFJlcXVlc3RTaGFwZSwgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8UmVzcG9uc2VTaGFwZT4ge1xuICBpZiAocmVxdWVzdC5tZXRob2QgIT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJHRVRcIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHNlc3Npb25SZXN1bHQgPSByZXF1aXJlU2Vzc2lvbihoZWFkZXJzKTtcbiAgaWYgKFwiZXJyb3JcIiBpbiBzZXNzaW9uUmVzdWx0KSByZXR1cm4gc2Vzc2lvblJlc3VsdC5lcnJvcjtcblxuICBjb25zdCB1cmwgPSBuZXcgVVJMKGBodHRwOi8vbG9jYWxob3N0JHtyZXF1ZXN0LnBhdGh9YCk7XG4gIGNvbnN0IHBsYXRlID0gbm9ybWFsaXplUGxhdGUodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJwbGF0ZVwiKSA/PyBcIlwiKTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9ICh1cmwuc2VhcmNoUGFyYW1zLmdldChcImNhbmRpZGF0ZXNcIikgPz8gXCJcIilcbiAgICAuc3BsaXQoXCIsXCIpXG4gICAgLm1hcChub3JtYWxpemVQbGF0ZSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuXG4gIGlmICghcGxhdGUgfHwgIWlzVmFsaWRQbGF0ZShwbGF0ZSkpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiUGxhY2EgaW52YWxpZGEuIFVzZSBvIGZvcm1hdG8gYW50aWdvIG91IE1lcmNvc3VsLlwiIH0pO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zdCB7IHJlc3BvbnNlLCB1c2VkUGxhdGUgfSA9IGF3YWl0IGxvb2t1cFBsYXRlV2l0aFNpbmVzcChcbiAgICAgIEFycmF5LmZyb20obmV3IFNldChbcGxhdGUsIC4uLmNhbmRpZGF0ZXNdLmZpbHRlcihpc1ZhbGlkUGxhdGUpKSksXG4gICAgKTtcblxuICAgIHJldHVybiBqc29uKDIwMCwge1xuICAgICAgcGxhY2E6IGZpcnN0U3RyaW5nKHJlc3BvbnNlLnBsYWNhLCB1c2VkUGxhdGUpLFxuICAgICAgcGxhY2FDb25zdWx0YWRhOiBwbGF0ZSxcbiAgICAgIG1hcmNhOiBmaXJzdFN0cmluZyhyZXNwb25zZS5tYXJjYSwgcmVzcG9uc2UubW9kZWxvKS5zcGxpdChcIi9cIilbMF0gfHwgXCJOYW8gaW5mb3JtYWRvXCIsXG4gICAgICBtb2RlbG86IGZpcnN0U3RyaW5nKHJlc3BvbnNlLm1vZGVsbywgcmVzcG9uc2UubWFyY2EpIHx8IFwiTmFvIGluZm9ybWFkb1wiLFxuICAgICAgYW5vOiBleHRyYWN0WWVhcihyZXNwb25zZSksXG4gICAgICBjb3I6IGZpcnN0U3RyaW5nKHJlc3BvbnNlLmNvciksXG4gICAgICBzaXR1YWNhbzogZmlyc3RTdHJpbmcocmVzcG9uc2Uuc2l0dWFjYW8sIHJlc3BvbnNlLm1lbnNhZ2VtUmV0b3JubykgfHwgXCJDb25zdWx0YSByZWFsaXphZGFcIixcbiAgICAgIG11bmljaXBpbzogZmlyc3RTdHJpbmcocmVzcG9uc2UubXVuaWNpcGlvKSxcbiAgICAgIHVmOiBmaXJzdFN0cmluZyhyZXNwb25zZS51ZiksXG4gICAgICBzb3VyY2U6IFwic2luZXNwLWFwaVwiLFxuICAgICAgcmF3OiByZXNwb25zZSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIk5hbyBmb2kgcG9zc2l2ZWwgY29uc3VsdGFyIGEgcGxhY2EuXCI7XG5cbiAgICBpZiAoL25hbyBlbmNvbnRyYWRvfHBsYWNhIG5hbyBlbmNvbnRyYWRhL2kudGVzdChtZXNzYWdlKSkge1xuICAgICAgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIlBsYWNhIG5hbyBlbmNvbnRyYWRhLlwiIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBqc29uKDUwMywge1xuICAgICAgZXJyb3I6IFwiTyBwcm92ZWRvciBkZSBjb25zdWx0YSBkZSBwbGFjYSBlc3RhIGluZGlzcG9uaXZlbCBubyBtb21lbnRvLiBUZW50ZSBub3ZhbWVudGUgZW0gaW5zdGFudGVzLlwiLFxuICAgICAgZGV0YWlsOiBtZXNzYWdlLFxuICAgIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpcGVMb29rdXAocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gXCJHRVRcIikge1xuICAgIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIkdFVFwiIH0pO1xuICB9XG5cbiAgY29uc3Qgc2Vzc2lvblJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHNlc3Npb25SZXN1bHQpIHJldHVybiBzZXNzaW9uUmVzdWx0LmVycm9yO1xuXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoYGh0dHA6Ly9sb2NhbGhvc3Qke3JlcXVlc3QucGF0aH1gKTtcbiAgY29uc3QgbWFyY2EgPSBTdHJpbmcodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJtYXJjYVwiKSA/PyBcIlwiKS50cmltKCk7XG4gIGNvbnN0IG1vZGVsbyA9IFN0cmluZyh1cmwuc2VhcmNoUGFyYW1zLmdldChcIm1vZGVsb1wiKSA/PyBcIlwiKS50cmltKCk7XG4gIGNvbnN0IGFubyA9IFN0cmluZyh1cmwuc2VhcmNoUGFyYW1zLmdldChcImFub1wiKSA/PyBcIlwiKS50cmltKCk7XG4gIGNvbnN0IHRpcG8gPSBTdHJpbmcodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJ0aXBvXCIpID8/IFwiY2Fycm9cIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKCFtb2RlbG8gfHwgIWFubykge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbmZvcm1lIG1vZGVsbyBlIGFubyBwYXJhIGNvbnN1bHRhciBhIEZJUEUuXCIgfSk7XG4gIH1cblxuICBpZiAoIVtcImNhcnJvXCIsIFwibW90b1wiLCBcImNhbWluaGFvXCJdLmluY2x1ZGVzKHRpcG8pKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlRpcG8gZGUgdmVpY3VsbyBpbnZhbGlkbyBwYXJhIEZJUEUuXCIgfSk7XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvb2t1cEZpcGVCeVRleHQoe1xuICAgICAgbWFyY2EsXG4gICAgICBtb2RlbG8sXG4gICAgICBhbm8sXG4gICAgICB0aXBvOiB0aXBvIGFzIFwiY2Fycm9cIiB8IFwibW90b1wiIHwgXCJjYW1pbmhhb1wiLFxuICAgIH0pO1xuXG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJGSVBFIG5hbyBlbmNvbnRyYWRhIHBhcmEgb3MgZGFkb3MgaW5mb3JtYWRvcy5cIiB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4ganNvbigyMDAsIHJlc3VsdCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJGYWxoYSBhbyBjb25zdWx0YXIgYSBGSVBFLlwiO1xuICAgIHJldHVybiBqc29uKDUwMywge1xuICAgICAgZXJyb3I6IFwiTyBwcm92ZWRvciBkZSBGSVBFIGVzdGEgaW5kaXNwb25pdmVsIG5vIG1vbWVudG8uIFRlbnRlIG5vdmFtZW50ZSBlbSBpbnN0YW50ZXMuXCIsXG4gICAgICBkZXRhaWw6IG1lc3NhZ2UsXG4gICAgfSk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlRmlwZUJyYW5kU3VnZ2VzdGlvbnMocmVxdWVzdDogUmVxdWVzdFNoYXBlLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxSZXNwb25zZVNoYXBlPiB7XG4gIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gXCJHRVRcIikge1xuICAgIHJldHVybiBqc29uKDQwNSwgeyBlcnJvcjogXCJNZXRvZG8gbmFvIHBlcm1pdGlkby5cIiB9LCB7IEFsbG93OiBcIkdFVFwiIH0pO1xuICB9XG5cbiAgY29uc3Qgc2Vzc2lvblJlc3VsdCA9IHJlcXVpcmVTZXNzaW9uKGhlYWRlcnMpO1xuICBpZiAoXCJlcnJvclwiIGluIHNlc3Npb25SZXN1bHQpIHJldHVybiBzZXNzaW9uUmVzdWx0LmVycm9yO1xuXG4gIGNvbnN0IHVybCA9IG5ldyBVUkwoYGh0dHA6Ly9sb2NhbGhvc3Qke3JlcXVlc3QucGF0aH1gKTtcbiAgY29uc3QgcXVlcnkgPSBTdHJpbmcodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJxXCIpID8/IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgdGlwbyA9IFN0cmluZyh1cmwuc2VhcmNoUGFyYW1zLmdldChcInRpcG9cIikgPz8gXCJjYXJyb1wiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuICBpZiAoIVtcImNhcnJvXCIsIFwibW90b1wiLCBcImNhbWluaGFvXCJdLmluY2x1ZGVzKHRpcG8pKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIlRpcG8gZGUgdmVpY3VsbyBpbnZhbGlkbyBwYXJhIEZJUEUuXCIgfSk7XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gYXdhaXQgc3VnZ2VzdEZpcGVCcmFuZHMoe1xuICAgICAgcXVlcnksXG4gICAgICB0aXBvOiB0aXBvIGFzIFwiY2Fycm9cIiB8IFwibW90b1wiIHwgXCJjYW1pbmhhb1wiLFxuICAgIH0pO1xuICAgIHJldHVybiBqc29uKDIwMCwgc3VnZ2VzdGlvbnMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiRmFsaGEgYW8gY29uc3VsdGFyIHN1Z2VzdG9lcyBkZSBtYXJjYS5cIjtcbiAgICByZXR1cm4ganNvbig1MDMsIHtcbiAgICAgIGVycm9yOiBcIk8gcHJvdmVkb3IgZGUgRklQRSBlc3RhIGluZGlzcG9uaXZlbCBubyBtb21lbnRvLiBUZW50ZSBub3ZhbWVudGUgZW0gaW5zdGFudGVzLlwiLFxuICAgICAgZGV0YWlsOiBtZXNzYWdlLFxuICAgIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpcGVNb2RlbFN1Z2dlc3Rpb25zKHJlcXVlc3Q6IFJlcXVlc3RTaGFwZSwgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8UmVzcG9uc2VTaGFwZT4ge1xuICBpZiAocmVxdWVzdC5tZXRob2QgIT09IFwiR0VUXCIpIHtcbiAgICByZXR1cm4ganNvbig0MDUsIHsgZXJyb3I6IFwiTWV0b2RvIG5hbyBwZXJtaXRpZG8uXCIgfSwgeyBBbGxvdzogXCJHRVRcIiB9KTtcbiAgfVxuXG4gIGNvbnN0IHNlc3Npb25SZXN1bHQgPSByZXF1aXJlU2Vzc2lvbihoZWFkZXJzKTtcbiAgaWYgKFwiZXJyb3JcIiBpbiBzZXNzaW9uUmVzdWx0KSByZXR1cm4gc2Vzc2lvblJlc3VsdC5lcnJvcjtcblxuICBjb25zdCB1cmwgPSBuZXcgVVJMKGBodHRwOi8vbG9jYWxob3N0JHtyZXF1ZXN0LnBhdGh9YCk7XG4gIGNvbnN0IG1hcmNhID0gU3RyaW5nKHVybC5zZWFyY2hQYXJhbXMuZ2V0KFwibWFyY2FcIikgPz8gXCJcIikudHJpbSgpO1xuICBjb25zdCBxdWVyeSA9IFN0cmluZyh1cmwuc2VhcmNoUGFyYW1zLmdldChcInFcIikgPz8gXCJcIikudHJpbSgpO1xuICBjb25zdCB0aXBvID0gU3RyaW5nKHVybC5zZWFyY2hQYXJhbXMuZ2V0KFwidGlwb1wiKSA/PyBcImNhcnJvXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG4gIGlmICghW1wiY2Fycm9cIiwgXCJtb3RvXCIsIFwiY2FtaW5oYW9cIl0uaW5jbHVkZXModGlwbykpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiVGlwbyBkZSB2ZWljdWxvIGludmFsaWRvIHBhcmEgRklQRS5cIiB9KTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBhd2FpdCBzdWdnZXN0RmlwZU1vZGVscyh7XG4gICAgICBtYXJjYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgdGlwbzogdGlwbyBhcyBcImNhcnJvXCIgfCBcIm1vdG9cIiB8IFwiY2FtaW5oYW9cIixcbiAgICB9KTtcbiAgICByZXR1cm4ganNvbigyMDAsIHN1Z2dlc3Rpb25zKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkZhbGhhIGFvIGNvbnN1bHRhciBzdWdlc3RvZXMgZGUgbW9kZWxvLlwiO1xuICAgIHJldHVybiBqc29uKDUwMywge1xuICAgICAgZXJyb3I6IFwiTyBwcm92ZWRvciBkZSBGSVBFIGVzdGEgaW5kaXNwb25pdmVsIG5vIG1vbWVudG8uIFRlbnRlIG5vdmFtZW50ZSBlbSBpbnN0YW50ZXMuXCIsXG4gICAgICBkZXRhaWw6IG1lc3NhZ2UsXG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUJhY2tlbmRSZXF1ZXN0KHJlcXVlc3Q6IFJlcXVlc3RTaGFwZSk6IFByb21pc2U8UmVzcG9uc2VTaGFwZT4ge1xuICBjb25zdCBoZWFkZXJzID0gbm9ybWFsaXplSGVhZGVycyhyZXF1ZXN0LmhlYWRlcnMpO1xuXG4gIHRyeSB7XG4gICAgaWYgKHJlcXVlc3QucGF0aCA9PT0gXCIvYXBpL2F1dGgvbG9naW5cIikge1xuICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZUxvZ2luKHJlcXVlc3QsIGhlYWRlcnMpO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBhdGggPT09IFwiL2FwaS9hdXRoL3Nlc3Npb25cIikge1xuICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZVNlc3Npb24oaGVhZGVycyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF0aCA9PT0gXCIvYXBpL2F1dGgvbG9nb3V0XCIpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVMb2dvdXQoaGVhZGVycyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF0aCA9PT0gXCIvYXBpL3BsYXRmb3JtL3N0b3Jlc1wiKSB7XG4gICAgICByZXR1cm4gYXdhaXQgaGFuZGxlUGxhdGZvcm1TdG9yZXMocmVxdWVzdCwgaGVhZGVycyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF0aCA9PT0gXCIvYXBpL3BsYXRmb3JtL2FjdGl2aXR5XCIpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVQbGF0Zm9ybUFjdGl2aXR5KHJlcXVlc3QsIGhlYWRlcnMpO1xuICAgIH1cblxuICAgIGlmICgvXlxcL2FwaVxcL3BsYXRmb3JtXFwvc3RvcmVzXFwvXFxkK1xcL3RlYW0kLy50ZXN0KHJlcXVlc3QucGF0aCkpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVQbGF0Zm9ybVN0b3JlVGVhbShyZXF1ZXN0LCBoZWFkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAoL15cXC9hcGlcXC9wbGF0Zm9ybVxcL3N0b3Jlc1xcL1xcZCskLy50ZXN0KHJlcXVlc3QucGF0aCkpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVQbGF0Zm9ybVN0b3JlVXBkYXRlKHJlcXVlc3QsIGhlYWRlcnMpO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBhdGggPT09IFwiL2FwaS90ZW5hbnQvdGVhbVwiKSB7XG4gICAgICByZXR1cm4gYXdhaXQgaGFuZGxlVGVuYW50VGVhbShyZXF1ZXN0LCBoZWFkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXRoID09PSBcIi9hcGkvdGVuYW50L2FjdGl2aXR5XCIpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVUZW5hbnRBY3Rpdml0eShyZXF1ZXN0LCBoZWFkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXRoID09PSBcIi9hcGkvYXBwL3N0YXRlXCIgJiYgcmVxdWVzdC5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVBcHBTdGF0ZUdldChoZWFkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXRoID09PSBcIi9hcGkvYXBwL3N0YXRlXCIgJiYgcmVxdWVzdC5tZXRob2QgPT09IFwiUFVUXCIpIHtcbiAgICAgIHJldHVybiBhd2FpdCBoYW5kbGVBcHBTdGF0ZVVwZGF0ZShyZXF1ZXN0LCBoZWFkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAocmVxdWVzdC5wYXRoID09PSBcIi9hcGkvZ2VtaW5pL3YxL2dlbmVyYXRlQ29udGVudFwiKSB7XG4gICAgICByZXR1cm4gYXdhaXQgaGFuZGxlR2VtaW5pKHJlcXVlc3QsIGhlYWRlcnMpO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBhdGguc3RhcnRzV2l0aChcIi9hcGkvY29uc3VsdGFzL3BsYWNhXCIpKSB7XG4gICAgICByZXR1cm4gYXdhaXQgaGFuZGxlUGxhdGVMb29rdXAocmVxdWVzdCwgaGVhZGVycyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF0aC5zdGFydHNXaXRoKFwiL2FwaS9maXBlL2xvb2t1cFwiKSkge1xuICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZUZpcGVMb29rdXAocmVxdWVzdCwgaGVhZGVycyk7XG4gICAgfVxuXG4gICAgaWYgKHJlcXVlc3QucGF0aC5zdGFydHNXaXRoKFwiL2FwaS9maXBlL21hcmNhc1wiKSkge1xuICAgICAgcmV0dXJuIGF3YWl0IGhhbmRsZUZpcGVCcmFuZFN1Z2dlc3Rpb25zKHJlcXVlc3QsIGhlYWRlcnMpO1xuICAgIH1cblxuICAgIGlmIChyZXF1ZXN0LnBhdGguc3RhcnRzV2l0aChcIi9hcGkvZmlwZS9tb2RlbG9zXCIpKSB7XG4gICAgICByZXR1cm4gYXdhaXQgaGFuZGxlRmlwZU1vZGVsU3VnZ2VzdGlvbnMocmVxdWVzdCwgaGVhZGVycyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIlJvdGEgbmFvIGVuY29udHJhZGEuXCIgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIGpzb24oNTAwLCB7XG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIkZhbGhhIGludGVybmEgZG8gc2Vydmlkb3IuXCIsXG4gICAgfSk7XG4gIH1cbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNyY1xcXFxsaWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFBFRFJPU09cXFxcRG93bmxvYWRzXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxzcmNcXFxcbGliXFxcXGZpcGUudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL1BFRFJPU08vRG93bmxvYWRzL2F1dG92ZW5kYS1wcm8tYjJiLW1haW4vYXV0b3ZlbmRhLXByby1iMmItbWFpbi9zcmMvbGliL2ZpcGUudHNcIjt0eXBlIEZpcGVPcHRpb24gPSB7XG4gIGxhYmVsOiBzdHJpbmc7XG4gIHZhbHVlOiBzdHJpbmcgfCBudW1iZXI7XG59O1xuXG5jb25zdCBTVE9QV09SRFMgPSBuZXcgU2V0KFtcbiAgXCJkZVwiLFxuICBcImRvXCIsXG4gIFwiZGFcIixcbiAgXCJkYXNcIixcbiAgXCJkb3NcIixcbiAgXCJlXCIsXG4gIFwiYVwiLFxuICBcIm9cIixcbiAgXCJtaVwiLFxuXSk7XG5cbmNvbnN0IEJSQU5EX0FMSUFTRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgdm9sa3N3YWdlbjogW1xuICAgIFwidndcIixcbiAgICBcInZvbGtzd2FnZW5cIixcbiAgICBcInZvbGtzXCIsXG4gICAgXCJ2b2xrc3ZhZ2VuXCIsXG4gICAgXCJ2b2xrc3ZhZ2VtXCIsXG4gICAgXCJ2b2xrdmFnZW1cIixcbiAgICBcInZvbGt3YWdlblwiLFxuICAgIFwid29sa3N3YWdlblwiLFxuICBdLFxuICBjaGV2cm9sZXQ6IFtcImdtXCIsIFwiY2hldnJvbGV0XCJdLFxuICBjaXRyb2VuOiBbXCJjaXRyb2VuXCJdLFxufTtcblxuZnVuY3Rpb24gc3RyaXBEaWFjcml0aWNzKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHZhbHVlLm5vcm1hbGl6ZShcIk5GRFwiKS5yZXBsYWNlKC9bXFx1MDMwMC1cXHUwMzZmXS9nLCBcIlwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUZpcGVUZXh0KHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHN0cmlwRGlhY3JpdGljcyh2YWx1ZSlcbiAgICAudG9Mb3dlckNhc2UoKVxuICAgIC8vIFNwbGl0IGNvbXBhY3QgaW5wdXRzIGxpa2UgXCJ2b3lhZ2UxLjZcIiBpbnRvIHNlYXJjaGFibGUgdG9rZW5zLlxuICAgIC5yZXBsYWNlKC8oW2Etel0pKFswLTldKS9nLCBcIiQxICQyXCIpXG4gICAgLnJlcGxhY2UoLyhbMC05XSkoW2Etel0pL2csIFwiJDEgJDJcIilcbiAgICAucmVwbGFjZSgvW15hLXowLTldKy9nLCBcIiBcIilcbiAgICAucmVwbGFjZSgvXFxzKy9nLCBcIiBcIilcbiAgICAudHJpbSgpO1xufVxuXG5mdW5jdGlvbiB0b2tlbml6ZSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiBub3JtYWxpemVGaXBlVGV4dCh2YWx1ZSlcbiAgICAuc3BsaXQoXCIgXCIpXG4gICAgLmZpbHRlcigodG9rZW4pID0+IHRva2VuICYmICFTVE9QV09SRFMuaGFzKHRva2VuKSk7XG59XG5cbmZ1bmN0aW9uIHRva2VuT3ZlcmxhcFNjb3JlKHF1ZXJ5VG9rZW5zOiBzdHJpbmdbXSwgY2FuZGlkYXRlVG9rZW5zOiBzdHJpbmdbXSkge1xuICBsZXQgc2NvcmUgPSAwO1xuXG4gIGZvciAoY29uc3QgdG9rZW4gb2YgcXVlcnlUb2tlbnMpIHtcbiAgICBpZiAoY2FuZGlkYXRlVG9rZW5zLmluY2x1ZGVzKHRva2VuKSkge1xuICAgICAgc2NvcmUgKz0gdG9rZW4ubGVuZ3RoID49IDQgPyA3IDogMztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjYW5kaWRhdGVUb2tlbnMuc29tZSgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuaW5jbHVkZXModG9rZW4pIHx8IHRva2VuLmluY2x1ZGVzKGNhbmRpZGF0ZSkpKSB7XG4gICAgICBzY29yZSArPSB0b2tlbi5sZW5ndGggPj0gNCA/IDQgOiAyO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzY29yZTtcbn1cblxuZnVuY3Rpb24gc2NvcmVPcHRpb24ocXVlcnk6IHN0cmluZywgY2FuZGlkYXRlOiBzdHJpbmcpIHtcbiAgY29uc3Qgbm9ybWFsaXplZFF1ZXJ5ID0gbm9ybWFsaXplRmlwZVRleHQocXVlcnkpO1xuICBjb25zdCBub3JtYWxpemVkQ2FuZGlkYXRlID0gbm9ybWFsaXplRmlwZVRleHQoY2FuZGlkYXRlKTtcblxuICBpZiAoIW5vcm1hbGl6ZWRRdWVyeSB8fCAhbm9ybWFsaXplZENhbmRpZGF0ZSkge1xuICAgIHJldHVybiAwO1xuICB9XG5cbiAgbGV0IHNjb3JlID0gMDtcblxuICBpZiAobm9ybWFsaXplZFF1ZXJ5ID09PSBub3JtYWxpemVkQ2FuZGlkYXRlKSB7XG4gICAgc2NvcmUgKz0gMTAwO1xuICB9IGVsc2UgaWYgKG5vcm1hbGl6ZWRDYW5kaWRhdGUuaW5jbHVkZXMobm9ybWFsaXplZFF1ZXJ5KSB8fCBub3JtYWxpemVkUXVlcnkuaW5jbHVkZXMobm9ybWFsaXplZENhbmRpZGF0ZSkpIHtcbiAgICBzY29yZSArPSA0NTtcbiAgfVxuXG4gIHNjb3JlICs9IHRva2VuT3ZlcmxhcFNjb3JlKHRva2VuaXplKHF1ZXJ5KSwgdG9rZW5pemUoY2FuZGlkYXRlKSk7XG5cbiAgY29uc3QgcXVlcnlIZWFkID0gdG9rZW5pemUocXVlcnkpWzBdO1xuICBjb25zdCBjYW5kaWRhdGVIZWFkID0gdG9rZW5pemUoY2FuZGlkYXRlKVswXTtcbiAgaWYgKHF1ZXJ5SGVhZCAmJiBjYW5kaWRhdGVIZWFkICYmIHF1ZXJ5SGVhZCA9PT0gY2FuZGlkYXRlSGVhZCkge1xuICAgIHNjb3JlICs9IDEwO1xuICB9XG5cbiAgcmV0dXJuIHNjb3JlO1xufVxuXG5mdW5jdGlvbiBleHBhbmRCcmFuZFF1ZXJ5KG1hcmNhOiBzdHJpbmcsIG1vZGVsbzogc3RyaW5nKSB7XG4gIGNvbnN0IGJhc2UgPSBub3JtYWxpemVGaXBlVGV4dChgJHttYXJjYX0gJHttb2RlbG99YCk7XG4gIGNvbnN0IHF1ZXJpZXMgPSBuZXcgU2V0PHN0cmluZz4oW2Jhc2UsIG5vcm1hbGl6ZUZpcGVUZXh0KG1hcmNhKV0pO1xuXG4gIE9iamVjdC5lbnRyaWVzKEJSQU5EX0FMSUFTRVMpLmZvckVhY2goKFtjYW5vbmljYWwsIGFsaWFzZXNdKSA9PiB7XG4gICAgaWYgKGFsaWFzZXMuc29tZSgoYWxpYXMpID0+IGJhc2UuaW5jbHVkZXMoYWxpYXMpKSkge1xuICAgICAgcXVlcmllcy5hZGQoY2Fub25pY2FsKTtcbiAgICAgIGFsaWFzZXMuZm9yRWFjaCgoYWxpYXMpID0+IHF1ZXJpZXMuYWRkKGFsaWFzKSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gQXJyYXkuZnJvbShxdWVyaWVzKS5maWx0ZXIoQm9vbGVhbik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwaWNrQmVzdEZpcGVCcmFuZDxUIGV4dGVuZHMgRmlwZU9wdGlvbj4oYnJhbmRzOiBUW10sIG1hcmNhOiBzdHJpbmcsIG1vZGVsbzogc3RyaW5nKSB7XG4gIGNvbnN0IHF1ZXJpZXMgPSBleHBhbmRCcmFuZFF1ZXJ5KG1hcmNhLCBtb2RlbG8pO1xuICBsZXQgYmVzdDogeyBpdGVtOiBUOyBzY29yZTogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IGl0ZW0gb2YgYnJhbmRzKSB7XG4gICAgY29uc3QgY2FuZGlkYXRlTGFiZWwgPSBTdHJpbmcoaXRlbS5sYWJlbCk7XG4gICAgY29uc3Qgc2NvcmUgPSBNYXRoLm1heCguLi5xdWVyaWVzLm1hcCgocXVlcnkpID0+IHNjb3JlT3B0aW9uKHF1ZXJ5LCBjYW5kaWRhdGVMYWJlbCkpKTtcbiAgICBpZiAoIWJlc3QgfHwgc2NvcmUgPiBiZXN0LnNjb3JlKSB7XG4gICAgICBiZXN0ID0geyBpdGVtLCBzY29yZSB9O1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBiZXN0ICYmIGJlc3Quc2NvcmUgPiAwID8gYmVzdC5pdGVtIDogbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBpY2tCZXN0RmlwZU1vZGVsPFQgZXh0ZW5kcyBGaXBlT3B0aW9uPihtb2RlbHM6IFRbXSwgbW9kZWxvOiBzdHJpbmcpIHtcbiAgbGV0IGJlc3Q6IHsgaXRlbTogVDsgc2NvcmU6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cbiAgZm9yIChjb25zdCBpdGVtIG9mIG1vZGVscykge1xuICAgIGNvbnN0IHNjb3JlID0gc2NvcmVPcHRpb24obW9kZWxvLCBTdHJpbmcoaXRlbS5sYWJlbCkpO1xuICAgIGlmICghYmVzdCB8fCBzY29yZSA+IGJlc3Quc2NvcmUpIHtcbiAgICAgIGJlc3QgPSB7IGl0ZW0sIHNjb3JlIH07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJlc3QgJiYgYmVzdC5zY29yZSA+PSAxMCA/IGJlc3QuaXRlbSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGluZmVyRnVlbFByZWZlcmVuY2UobW9kZWxvOiBzdHJpbmcpIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZpcGVUZXh0KG1vZGVsbyk7XG5cbiAgaWYgKC8oZGllc2VsfHRkaXxoZGl8ZGNpfGNkaSlcXGIvLnRlc3Qobm9ybWFsaXplZCkpIHJldHVybiBcImRpZXNlbFwiO1xuICBpZiAoLyhoaWJyaWRvfGhpYnJpZGF8aHlicmlkfGhldnxwaGV2KVxcYi8udGVzdChub3JtYWxpemVkKSkgcmV0dXJuIFwiaGlicmlkb1wiO1xuICBpZiAoLyhhbGNvb2x8ZXRhbm9sKVxcYi8udGVzdChub3JtYWxpemVkKSkgcmV0dXJuIFwiYWxjb29sXCI7XG4gIGlmICgvKGZsZXh8dG90YWwgZmxleHx0IGZsZXh8ZSBmbGV4KVxcYi8udGVzdChub3JtYWxpemVkKSkgcmV0dXJuIFwiZmxleFwiO1xuICByZXR1cm4gXCJmbGV4XCI7XG59XG5cbmNvbnN0IEZVRUxfU0NPUkU6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgZGllc2VsOiBbXCJkaWVzZWxcIl0sXG4gIGhpYnJpZG86IFtcImhpYnJpZG9cIl0sXG4gIGFsY29vbDogW1wiYWxjb29sXCJdLFxuICBmbGV4OiBbXCJmbGV4XCIsIFwiZ2Fzb2xpbmFcIl0sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcGlja0Jlc3RGaXBlWWVhcjxUIGV4dGVuZHMgRmlwZU9wdGlvbj4oeWVhcnM6IFRbXSwgYW5vOiBzdHJpbmcsIG1vZGVsbzogc3RyaW5nKSB7XG4gIGNvbnN0IHRhcmdldFllYXIgPSAoYW5vLm1hdGNoKC9cXGR7NH0vKT8uWzBdID8/IFwiXCIpLnRyaW0oKTtcbiAgY29uc3QgZnVlbFByZWZlcmVuY2UgPSBpbmZlckZ1ZWxQcmVmZXJlbmNlKG1vZGVsbyk7XG5cbiAgY29uc3QgY2FuZGlkYXRlcyA9IHllYXJzLmZpbHRlcigoaXRlbSkgPT4ge1xuICAgIGlmICghdGFyZ2V0WWVhcikgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZUZpcGVUZXh0KFN0cmluZyhpdGVtLmxhYmVsKSkuc3RhcnRzV2l0aCh0YXJnZXRZZWFyKTtcbiAgfSk7XG5cbiAgaWYgKCFjYW5kaWRhdGVzLmxlbmd0aCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgcHJlZmVycmVkRnVlbE9yZGVyID0gRlVFTF9TQ09SRVtmdWVsUHJlZmVyZW5jZV0gPz8gW1wiZmxleFwiLCBcImdhc29saW5hXCIsIFwiZGllc2VsXCIsIFwiYWxjb29sXCIsIFwiaGlicmlkb1wiXTtcblxuICBmb3IgKGNvbnN0IGZ1ZWwgb2YgcHJlZmVycmVkRnVlbE9yZGVyKSB7XG4gICAgY29uc3QgbWF0Y2ggPSBjYW5kaWRhdGVzLmZpbmQoKGl0ZW0pID0+IG5vcm1hbGl6ZUZpcGVUZXh0KFN0cmluZyhpdGVtLmxhYmVsKSkuaW5jbHVkZXMoZnVlbCkpO1xuICAgIGlmIChtYXRjaCkgcmV0dXJuIG1hdGNoO1xuICB9XG5cbiAgcmV0dXJuIGNhbmRpZGF0ZXNbMF07XG59XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFBFRFJPU09cXFxcRG93bmxvYWRzXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxzZXJ2ZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFBFRFJPU09cXFxcRG93bmxvYWRzXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxzZXJ2ZXJcXFxcZmlwZS50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvUEVEUk9TTy9Eb3dubG9hZHMvYXV0b3ZlbmRhLXByby1iMmItbWFpbi9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL3NlcnZlci9maXBlLnRzXCI7aW1wb3J0IHtcbiAgbm9ybWFsaXplRmlwZVRleHQsXG4gIHBpY2tCZXN0RmlwZUJyYW5kLFxuICBwaWNrQmVzdEZpcGVNb2RlbCxcbiAgcGlja0Jlc3RGaXBlWWVhcixcbn0gZnJvbSBcIi4uL3NyYy9saWIvZmlwZVwiO1xuXG50eXBlIE9mZmljaWFsRmlwZU9wdGlvbiA9IHtcbiAgTGFiZWw6IHN0cmluZztcbiAgVmFsdWU6IHN0cmluZyB8IG51bWJlcjtcbn07XG5cbnR5cGUgT2ZmaWNpYWxGaXBlTW9kZWxSZXNwb25zZSA9IHtcbiAgTW9kZWxvcz86IE9mZmljaWFsRmlwZU9wdGlvbltdO1xuICBBbm9zPzogT2ZmaWNpYWxGaXBlT3B0aW9uW107XG4gIGVycm8/OiBzdHJpbmc7XG59O1xuXG50eXBlIE9mZmljaWFsRmlwZVZhbHVlUmVzcG9uc2UgPSB7XG4gIFZhbG9yPzogc3RyaW5nO1xuICBNYXJjYT86IHN0cmluZztcbiAgTW9kZWxvPzogc3RyaW5nO1xuICBBbm9Nb2RlbG8/OiBudW1iZXI7XG4gIENvbWJ1c3RpdmVsPzogc3RyaW5nO1xuICBDb2RpZ29GaXBlPzogc3RyaW5nO1xuICBNZXNSZWZlcmVuY2lhPzogc3RyaW5nO1xuICBBdXRlbnRpY2FjYW8/OiBzdHJpbmc7XG4gIFRpcG9WZWljdWxvPzogbnVtYmVyO1xuICBTaWdsYUNvbWJ1c3RpdmVsPzogc3RyaW5nO1xuICBEYXRhQ29uc3VsdGE/OiBzdHJpbmc7XG4gIGVycm8/OiBzdHJpbmc7XG4gIGNvZGlnbz86IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIEZpcGVWZWhpY2xlVHlwZSA9IFwiY2Fycm9cIiB8IFwibW90b1wiIHwgXCJjYW1pbmhhb1wiO1xuXG5leHBvcnQgdHlwZSBGaXBlU3VnZ2VzdGlvbiA9IHtcbiAgbGFiZWw6IHN0cmluZztcbiAgdmFsdWU6IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIEZpcGVMb29rdXBSZXN1bHQgPSB7XG4gIHZhbG9yOiBzdHJpbmc7XG4gIG1hcmNhOiBzdHJpbmc7XG4gIG1vZGVsbzogc3RyaW5nO1xuICBhbm9Nb2RlbG86IG51bWJlcjtcbiAgY29tYnVzdGl2ZWw6IHN0cmluZztcbiAgY29kaWdvRmlwZTogc3RyaW5nO1xuICBtZXNSZWZlcmVuY2lhOiBzdHJpbmc7XG4gIGF1dGVudGljYWNhbz86IHN0cmluZztcbiAgdGlwb1ZlaWN1bG86IG51bWJlcjtcbiAgc2lnbGFDb21idXN0aXZlbDogc3RyaW5nO1xuICBkYXRhQ29uc3VsdGE6IHN0cmluZztcbiAgc291cmNlOiBcImZpcGUtb2ZpY2lhbFwiO1xufTtcblxuY29uc3QgT0ZGSUNJQUxfRklQRV9CQVNFID0gXCJodHRwczovL3ZlaWN1bG9zLmZpcGUub3JnLmJyL2FwaS92ZWljdWxvc1wiO1xuY29uc3QgVkVISUNMRV9UWVBFX0NPREU6IFJlY29yZDxGaXBlVmVoaWNsZVR5cGUsIHN0cmluZz4gPSB7XG4gIGNhcnJvOiBcIjFcIixcbiAgbW90bzogXCIyXCIsXG4gIGNhbWluaGFvOiBcIjNcIixcbn07XG5jb25zdCBDQUNIRV9UVExfTVMgPSAxMDAwICogNjAgKiA2MCAqIDY7XG5jb25zdCByZXF1ZXN0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgeyBleHBpcmVzQXQ6IG51bWJlcjsgdmFsdWU6IHVua25vd24gfT4oKTtcblxuZnVuY3Rpb24gYXNGb3JtRGF0YShkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KSB7XG4gIGNvbnN0IGZvcm0gPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG4gIE9iamVjdC5lbnRyaWVzKGRhdGEpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIGZvcm0uc2V0KGtleSwgdmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIGZvcm07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RPZmZpY2lhbEZpcGU8VD4ocGF0aDogc3RyaW5nLCBkYXRhPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke09GRklDSUFMX0ZJUEVfQkFTRX0vJHtwYXRofWAsIHtcbiAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04XCIsXG4gICAgICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgIH0sXG4gICAgYm9keTogZGF0YSA/IGFzRm9ybURhdGEoZGF0YSkgOiB1bmRlZmluZWQsXG4gIH0pO1xuXG4gIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEZhbGhhIGFvIGNvbnN1bHRhciBGSVBFIG9maWNpYWwgKCR7cmVzcG9uc2Uuc3RhdHVzfSkuYCk7XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2UuanNvbigpIGFzIFByb21pc2U8VD47XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldENhY2hlZDxUPihrZXk6IHN0cmluZywgbG9hZGVyOiAoKSA9PiBQcm9taXNlPFQ+KSB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGNhY2hlZCA9IHJlcXVlc3RDYWNoZS5nZXQoa2V5KTtcbiAgaWYgKGNhY2hlZCAmJiBjYWNoZWQuZXhwaXJlc0F0ID4gbm93KSB7XG4gICAgcmV0dXJuIGNhY2hlZC52YWx1ZSBhcyBUO1xuICB9XG5cbiAgY29uc3QgdmFsdWUgPSBhd2FpdCBsb2FkZXIoKTtcbiAgcmVxdWVzdENhY2hlLnNldChrZXksIHtcbiAgICBleHBpcmVzQXQ6IG5vdyArIENBQ0hFX1RUTF9NUyxcbiAgICB2YWx1ZSxcbiAgfSk7XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hSZWZlcmVuY2VDb2RlKCkge1xuICByZXR1cm4gZ2V0Q2FjaGVkKFwiZmlwZTpyZWZlcmVuY2VcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IHJlZmVyZW5jZXMgPSBhd2FpdCBwb3N0T2ZmaWNpYWxGaXBlPHsgQ29kaWdvOiBudW1iZXI7IE1lczogc3RyaW5nIH1bXT4oXG4gICAgICBcIkNvbnN1bHRhclRhYmVsYURlUmVmZXJlbmNpYVwiLFxuICAgICk7XG4gICAgcmV0dXJuIFN0cmluZyhyZWZlcmVuY2VzWzBdPy5Db2RpZ28gPz8gXCJcIik7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiB0b09wdGlvbnMoaXRlbXM6IE9mZmljaWFsRmlwZU9wdGlvbltdIHwgdW5kZWZpbmVkKSB7XG4gIHJldHVybiAoaXRlbXMgPz8gW10pLm1hcCgoaXRlbSkgPT4gKHtcbiAgICBsYWJlbDogU3RyaW5nKGl0ZW0uTGFiZWwgPz8gXCJcIiksXG4gICAgdmFsdWU6IFN0cmluZyhpdGVtLlZhbHVlID8/IFwiXCIpLFxuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoQnJhbmRzKHJlZmVyZW5jZUNvZGU6IHN0cmluZywgdmVoaWNsZVR5cGVDb2RlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIGdldENhY2hlZChgZmlwZTpicmFuZHM6JHtyZWZlcmVuY2VDb2RlfToke3ZlaGljbGVUeXBlQ29kZX1gLCBhc3luYyAoKSA9PlxuICAgIHRvT3B0aW9ucyhcbiAgICAgIGF3YWl0IHBvc3RPZmZpY2lhbEZpcGU8T2ZmaWNpYWxGaXBlT3B0aW9uW10+KFwiQ29uc3VsdGFyTWFyY2FzXCIsIHtcbiAgICAgICAgY29kaWdvVGFiZWxhUmVmZXJlbmNpYTogcmVmZXJlbmNlQ29kZSxcbiAgICAgICAgY29kaWdvVGlwb1ZlaWN1bG86IHZlaGljbGVUeXBlQ29kZSxcbiAgICAgIH0pLFxuICAgICksXG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoTW9kZWxzKHJlZmVyZW5jZUNvZGU6IHN0cmluZywgdmVoaWNsZVR5cGVDb2RlOiBzdHJpbmcsIGJyYW5kQ29kZTogc3RyaW5nKSB7XG4gIHJldHVybiBnZXRDYWNoZWQoYGZpcGU6bW9kZWxzOiR7cmVmZXJlbmNlQ29kZX06JHt2ZWhpY2xlVHlwZUNvZGV9OiR7YnJhbmRDb2RlfWAsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHBvc3RPZmZpY2lhbEZpcGU8T2ZmaWNpYWxGaXBlTW9kZWxSZXNwb25zZT4oXCJDb25zdWx0YXJNb2RlbG9zXCIsIHtcbiAgICAgIGNvZGlnb1RhYmVsYVJlZmVyZW5jaWE6IHJlZmVyZW5jZUNvZGUsXG4gICAgICBjb2RpZ29UaXBvVmVpY3VsbzogdmVoaWNsZVR5cGVDb2RlLFxuICAgICAgY29kaWdvTWFyY2E6IGJyYW5kQ29kZSxcbiAgICB9KTtcbiAgICByZXR1cm4gdG9PcHRpb25zKHJlc3BvbnNlLk1vZGVsb3MpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcmFua1N1Z2dlc3Rpb25zKG9wdGlvbnM6IEZpcGVTdWdnZXN0aW9uW10sIHF1ZXJ5OiBzdHJpbmcsIGxpbWl0ID0gOCkge1xuICBjb25zdCBub3JtYWxpemVkUXVlcnkgPSBub3JtYWxpemVGaXBlVGV4dChxdWVyeSk7XG4gIGNvbnN0IHF1ZXJ5VG9rZW5zID0gbm9ybWFsaXplZFF1ZXJ5LnNwbGl0KFwiIFwiKS5maWx0ZXIoQm9vbGVhbik7XG5cbiAgaWYgKCFub3JtYWxpemVkUXVlcnkpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICByZXR1cm4gb3B0aW9uc1xuICAgIC5tYXAoKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRMYWJlbCA9IG5vcm1hbGl6ZUZpcGVUZXh0KGl0ZW0ubGFiZWwpO1xuICAgICAgbGV0IHNjb3JlID0gMDtcblxuICAgICAgaWYgKG5vcm1hbGl6ZWRMYWJlbC5zdGFydHNXaXRoKG5vcm1hbGl6ZWRRdWVyeSkpIHtcbiAgICAgICAgc2NvcmUgKz0gMTAwO1xuICAgICAgfSBlbHNlIGlmIChub3JtYWxpemVkTGFiZWwuaW5jbHVkZXMobm9ybWFsaXplZFF1ZXJ5KSkge1xuICAgICAgICBzY29yZSArPSA3MDtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCB0b2tlbiBvZiBxdWVyeVRva2Vucykge1xuICAgICAgICBpZiAobm9ybWFsaXplZExhYmVsLnN0YXJ0c1dpdGgodG9rZW4pKSB7XG4gICAgICAgICAgc2NvcmUgKz0gdG9rZW4ubGVuZ3RoID49IDQgPyAxOCA6IDY7XG4gICAgICAgIH0gZWxzZSBpZiAobm9ybWFsaXplZExhYmVsLmluY2x1ZGVzKHRva2VuKSkge1xuICAgICAgICAgIHNjb3JlICs9IHRva2VuLmxlbmd0aCA+PSA0ID8gMTAgOiA0O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGl0ZW0sIHNjb3JlIH07XG4gICAgfSlcbiAgICAuZmlsdGVyKChlbnRyeSkgPT4gZW50cnkuc2NvcmUgPiAwKVxuICAgIC5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSB8fCBhLml0ZW0ubGFiZWwubG9jYWxlQ29tcGFyZShiLml0ZW0ubGFiZWwpKVxuICAgIC5zbGljZSgwLCBsaW1pdClcbiAgICAubWFwKChlbnRyeSkgPT4gZW50cnkuaXRlbSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdWdnZXN0RmlwZUJyYW5kcyhwYXJhbXM6IHtcbiAgcXVlcnk6IHN0cmluZztcbiAgdGlwbz86IEZpcGVWZWhpY2xlVHlwZTtcbiAgbGltaXQ/OiBudW1iZXI7XG59KSB7XG4gIGNvbnN0IHF1ZXJ5ID0gcGFyYW1zLnF1ZXJ5LnRyaW0oKTtcbiAgaWYgKHF1ZXJ5Lmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCB0aXBvID0gcGFyYW1zLnRpcG8gPz8gXCJjYXJyb1wiO1xuICBjb25zdCB2ZWhpY2xlVHlwZUNvZGUgPSBWRUhJQ0xFX1RZUEVfQ09ERVt0aXBvXTtcbiAgY29uc3QgcmVmZXJlbmNlQ29kZSA9IGF3YWl0IGZldGNoUmVmZXJlbmNlQ29kZSgpO1xuXG4gIGlmICghcmVmZXJlbmNlQ29kZSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGNvbnN0IGJyYW5kcyA9IGF3YWl0IGZldGNoQnJhbmRzKHJlZmVyZW5jZUNvZGUsIHZlaGljbGVUeXBlQ29kZSk7XG4gIHJldHVybiByYW5rU3VnZ2VzdGlvbnMoYnJhbmRzLCBxdWVyeSwgcGFyYW1zLmxpbWl0ID8/IDgpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3VnZ2VzdEZpcGVNb2RlbHMocGFyYW1zOiB7XG4gIG1hcmNhOiBzdHJpbmc7XG4gIHF1ZXJ5OiBzdHJpbmc7XG4gIHRpcG8/OiBGaXBlVmVoaWNsZVR5cGU7XG4gIGxpbWl0PzogbnVtYmVyO1xufSkge1xuICBjb25zdCBtYXJjYSA9IHBhcmFtcy5tYXJjYS50cmltKCk7XG4gIGNvbnN0IHF1ZXJ5ID0gcGFyYW1zLnF1ZXJ5LnRyaW0oKTtcbiAgaWYgKG1hcmNhLmxlbmd0aCA8IDIgfHwgcXVlcnkubGVuZ3RoIDwgMikge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIGNvbnN0IHRpcG8gPSBwYXJhbXMudGlwbyA/PyBcImNhcnJvXCI7XG4gIGNvbnN0IHZlaGljbGVUeXBlQ29kZSA9IFZFSElDTEVfVFlQRV9DT0RFW3RpcG9dO1xuICBjb25zdCByZWZlcmVuY2VDb2RlID0gYXdhaXQgZmV0Y2hSZWZlcmVuY2VDb2RlKCk7XG5cbiAgaWYgKCFyZWZlcmVuY2VDb2RlKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgYnJhbmRzID0gYXdhaXQgZmV0Y2hCcmFuZHMocmVmZXJlbmNlQ29kZSwgdmVoaWNsZVR5cGVDb2RlKTtcbiAgY29uc3QgYnJhbmQgPSBwaWNrQmVzdEZpcGVCcmFuZChicmFuZHMsIG1hcmNhLCBxdWVyeSk7XG4gIGlmICghYnJhbmQpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBtb2RlbHMgPSBhd2FpdCBmZXRjaE1vZGVscyhyZWZlcmVuY2VDb2RlLCB2ZWhpY2xlVHlwZUNvZGUsIFN0cmluZyhicmFuZC52YWx1ZSkpO1xuICByZXR1cm4gcmFua1N1Z2dlc3Rpb25zKG1vZGVscywgcXVlcnksIHBhcmFtcy5saW1pdCA/PyA4KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvb2t1cEZpcGVCeVRleHQocGFyYW1zOiB7XG4gIG1hcmNhOiBzdHJpbmc7XG4gIG1vZGVsbzogc3RyaW5nO1xuICBhbm86IHN0cmluZztcbiAgdGlwbz86IEZpcGVWZWhpY2xlVHlwZTtcbn0pIHtcbiAgY29uc3QgdGlwbyA9IHBhcmFtcy50aXBvID8/IFwiY2Fycm9cIjtcbiAgY29uc3QgdmVoaWNsZVR5cGVDb2RlID0gVkVISUNMRV9UWVBFX0NPREVbdGlwb107XG4gIGNvbnN0IHJlZmVyZW5jZUNvZGUgPSBhd2FpdCBmZXRjaFJlZmVyZW5jZUNvZGUoKTtcblxuICBpZiAoIXJlZmVyZW5jZUNvZGUpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGJyYW5kcyA9IGF3YWl0IGZldGNoQnJhbmRzKHJlZmVyZW5jZUNvZGUsIHZlaGljbGVUeXBlQ29kZSk7XG4gIGNvbnN0IGJyYW5kID0gcGlja0Jlc3RGaXBlQnJhbmQoXG4gICAgYnJhbmRzLFxuICAgIHBhcmFtcy5tYXJjYSxcbiAgICBwYXJhbXMubW9kZWxvLFxuICApO1xuXG4gIGlmICghYnJhbmQpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IG1vZGVscyA9IGF3YWl0IGZldGNoTW9kZWxzKHJlZmVyZW5jZUNvZGUsIHZlaGljbGVUeXBlQ29kZSwgU3RyaW5nKGJyYW5kLnZhbHVlKSk7XG4gIGNvbnN0IG1vZGVsID0gcGlja0Jlc3RGaXBlTW9kZWwoXG4gICAgbW9kZWxzLFxuICAgIHBhcmFtcy5tb2RlbG8sXG4gICk7XG5cbiAgaWYgKCFtb2RlbCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgeWVhcnMgPSBhd2FpdCBwb3N0T2ZmaWNpYWxGaXBlPE9mZmljaWFsRmlwZU9wdGlvbltdPihcIkNvbnN1bHRhckFub01vZGVsb1wiLCB7XG4gICAgY29kaWdvVGFiZWxhUmVmZXJlbmNpYTogcmVmZXJlbmNlQ29kZSxcbiAgICBjb2RpZ29UaXBvVmVpY3VsbzogdmVoaWNsZVR5cGVDb2RlLFxuICAgIGNvZGlnb01hcmNhOiBTdHJpbmcoYnJhbmQudmFsdWUpLFxuICAgIGNvZGlnb01vZGVsbzogU3RyaW5nKG1vZGVsLnZhbHVlKSxcbiAgfSk7XG4gIGNvbnN0IHllYXIgPSBwaWNrQmVzdEZpcGVZZWFyKHRvT3B0aW9ucyh5ZWFycyksIHBhcmFtcy5hbm8sIHBhcmFtcy5tb2RlbG8pO1xuXG4gIGlmICgheWVhcikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgW2Fub01vZGVsbywgY29kaWdvVGlwb0NvbWJ1c3RpdmVsXSA9IFN0cmluZyh5ZWFyLnZhbHVlKS5zcGxpdChcIi1cIik7XG4gIGNvbnN0IHZhbHVlID0gYXdhaXQgcG9zdE9mZmljaWFsRmlwZTxPZmZpY2lhbEZpcGVWYWx1ZVJlc3BvbnNlPihcIkNvbnN1bHRhclZhbG9yQ29tVG9kb3NQYXJhbWV0cm9zXCIsIHtcbiAgICBjb2RpZ29UYWJlbGFSZWZlcmVuY2lhOiByZWZlcmVuY2VDb2RlLFxuICAgIGNvZGlnb01hcmNhOiBTdHJpbmcoYnJhbmQudmFsdWUpLFxuICAgIGNvZGlnb01vZGVsbzogU3RyaW5nKG1vZGVsLnZhbHVlKSxcbiAgICBjb2RpZ29UaXBvVmVpY3VsbzogdmVoaWNsZVR5cGVDb2RlLFxuICAgIGFub01vZGVsbyxcbiAgICBjb2RpZ29UaXBvQ29tYnVzdGl2ZWwsXG4gICAgdGlwb1ZlaWN1bG86IHRpcG8sXG4gICAgbW9kZWxvQ29kaWdvRXh0ZXJubzogXCJcIixcbiAgICB0aXBvQ29uc3VsdGE6IFwidHJhZGljaW9uYWxcIixcbiAgfSk7XG5cbiAgaWYgKHZhbHVlLmVycm8gfHwgIXZhbHVlLlZhbG9yIHx8ICF2YWx1ZS5Db2RpZ29GaXBlKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHZhbG9yOiB2YWx1ZS5WYWxvcixcbiAgICBtYXJjYTogdmFsdWUuTWFyY2EgPz8gYnJhbmQubGFiZWwsXG4gICAgbW9kZWxvOiB2YWx1ZS5Nb2RlbG8gPz8gbW9kZWwubGFiZWwsXG4gICAgYW5vTW9kZWxvOiB2YWx1ZS5Bbm9Nb2RlbG8gPz8gTnVtYmVyKGFub01vZGVsbyksXG4gICAgY29tYnVzdGl2ZWw6IHZhbHVlLkNvbWJ1c3RpdmVsID8/IHllYXIubGFiZWwucmVwbGFjZSgvXlxcZHs0fVxccyovLCBcIlwiKSxcbiAgICBjb2RpZ29GaXBlOiB2YWx1ZS5Db2RpZ29GaXBlLFxuICAgIG1lc1JlZmVyZW5jaWE6IHZhbHVlLk1lc1JlZmVyZW5jaWEgPz8gXCJcIixcbiAgICBhdXRlbnRpY2FjYW86IHZhbHVlLkF1dGVudGljYWNhbyxcbiAgICB0aXBvVmVpY3VsbzogdmFsdWUuVGlwb1ZlaWN1bG8gPz8gTnVtYmVyKHZlaGljbGVUeXBlQ29kZSksXG4gICAgc2lnbGFDb21idXN0aXZlbDogdmFsdWUuU2lnbGFDb21idXN0aXZlbCA/PyBcIlwiLFxuICAgIGRhdGFDb25zdWx0YTogdmFsdWUuRGF0YUNvbnN1bHRhID8/IFwiXCIsXG4gICAgc291cmNlOiBcImZpcGUtb2ZpY2lhbFwiIGFzIGNvbnN0LFxuICB9IHNhdGlzZmllcyBGaXBlTG9va3VwUmVzdWx0O1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxQRURST1NPXFxcXERvd25sb2Fkc1xcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcc2VydmVyXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxQRURST1NPXFxcXERvd25sb2Fkc1xcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcc2VydmVyXFxcXGRhdGFiYXNlLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9QRURST1NPL0Rvd25sb2Fkcy9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL2F1dG92ZW5kYS1wcm8tYjJiLW1haW4vc2VydmVyL2RhdGFiYXNlLnRzXCI7aW1wb3J0IHsgcmFuZG9tQnl0ZXMsIHBia2RmMlN5bmMsIHRpbWluZ1NhZmVFcXVhbCwgY3JlYXRlSGFzaCB9IGZyb20gXCJub2RlOmNyeXB0b1wiO1xuaW1wb3J0IHsgbWtkaXJTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgeyBEYXRhYmFzZVN5bmMgfSBmcm9tIFwibm9kZTpzcWxpdGVcIjtcbmltcG9ydCB7IGNyZWF0ZUVtcHR5QXBwU3RhdGUsIHR5cGUgQXBwU3RhdGVSZXNvdXJjZVBhdGNoLCB0eXBlIEFwcFN0YXRlU25hcHNob3QgfSBmcm9tIFwiLi4vc3JjL2xpYi9hcHAtc3RhdGVcIjtcblxuY29uc3QgU0VTU0lPTl9DT09LSUVfTkFNRSA9IFwiYXV0b2NybV9zZXNzaW9uXCI7XG5jb25zdCBTRVNTSU9OX1RUTF9NUyA9IDEwMDAgKiA2MCAqIDYwICogMjQgKiA3O1xuY29uc3QgUEJLREYyX0lURVJBVElPTlMgPSAxMjBfMDAwO1xuY29uc3QgQVBQX1NUQVRFX0RFRkFVTFRTID0gY3JlYXRlRW1wdHlBcHBTdGF0ZSgpO1xuXG5leHBvcnQgdHlwZSBQbGF0Zm9ybVJvbGUgPSBcInBsYXRmb3JtX2FkbWluXCIgfCBcIm93bmVyXCIgfCBcInNlbGxlclwiO1xuZXhwb3J0IHR5cGUgVGVuYW50U3RhdHVzID0gXCJ0cmlhbFwiIHwgXCJhY3RpdmVcIiB8IFwicGFzdF9kdWVcIiB8IFwiYmxvY2tlZFwiIHwgXCJjbG9zZWRcIjtcblxuZXhwb3J0IGludGVyZmFjZSBBdXRoZW50aWNhdGVkU2Vzc2lvbiB7XG4gIHNlc3Npb25JZDogbnVtYmVyO1xuICB1c2VySWQ6IG51bWJlcjtcbiAgbWVtYmVyc2hpcElkOiBudW1iZXIgfCBudWxsO1xuICBlbWFpbDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHJvbGU6IFBsYXRmb3JtUm9sZTtcbiAgdGVuYW50SWQ6IG51bWJlciB8IG51bGw7XG4gIHRlbmFudE5hbWU6IHN0cmluZyB8IG51bGw7XG4gIHRlbmFudFNsdWc6IHN0cmluZyB8IG51bGw7XG4gIHRlbmFudFN0YXR1czogVGVuYW50U3RhdHVzIHwgbnVsbDtcbiAgdHJpYWxFbmRzQXQ6IHN0cmluZyB8IG51bGw7XG4gIHBsYW5Db2RlOiBzdHJpbmcgfCBudWxsO1xuICBzYWxlc0dvYWxNb250aGx5OiBudW1iZXIgfCBudWxsO1xuICBleHBpcmVzQXQ6IHN0cmluZztcbn1cblxudHlwZSBNZW1iZXJSb3cgPSB7XG4gIGlkOiBudW1iZXI7XG4gIG5vbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgcGFwZWw6IFwib3duZXJcIiB8IFwic2VsbGVyXCI7XG4gIGF0aXZvOiBudW1iZXI7XG4gIG1ldGFfbWVuc2FsOiBudW1iZXIgfCBudWxsO1xuICBjcmlhZG9fZW06IHN0cmluZztcbn07XG5cbmxldCBkYkluc3RhbmNlOiBEYXRhYmFzZVN5bmMgfCBudWxsID0gbnVsbDtcbmxldCBpbml0aWFsaXplZFBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBnZXREYXRhYmFzZVBhdGgoKSB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5EQVRBQkFTRV9QQVRIID8/IGpvaW4ocHJvY2Vzcy5jd2QoKSwgXCJkYXRhXCIsIFwiYXV0b2NybS5zcWxpdGVcIik7XG59XG5cbmZ1bmN0aW9uIGdldEVudihuYW1lOiBzdHJpbmcpIHtcbiAgY29uc3QgdmFsdWUgPSBwcm9jZXNzLmVudltuYW1lXTtcbiAgaWYgKCF2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgVmFyaWF2ZWwgJHtuYW1lfSBuYW8gY29uZmlndXJhZGEuYCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiBub3dJc28oKSB7XG4gIHJldHVybiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG59XG5cbmZ1bmN0aW9uIHdyaXRlQXVkaXRMb2coZGI6IERhdGFiYXNlU3luYywgaW5wdXQ6IHtcbiAgdGVuYW50SWQ/OiBudW1iZXIgfCBudWxsO1xuICBhY3RvclVzZXJJZD86IG51bWJlciB8IG51bGw7XG4gIGFjdGlvbjogc3RyaW5nO1xuICBwYXlsb2FkPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG59KSB7XG4gIGRiLnByZXBhcmUoYFxuICAgIGluc2VydCBpbnRvIGF1ZGl0X2xvZyAodGVuYW50X2lkLCBhY3Rvcl91c2VyX2lkLCBhY3Rpb24sIHBheWxvYWRfanNvbiwgY3JlYXRlZF9hdClcbiAgICB2YWx1ZXMgKD8sID8sID8sID8sID8pXG4gIGApLnJ1bihcbiAgICBpbnB1dC50ZW5hbnRJZCA/PyBudWxsLFxuICAgIGlucHV0LmFjdG9yVXNlcklkID8/IG51bGwsXG4gICAgaW5wdXQuYWN0aW9uLFxuICAgIEpTT04uc3RyaW5naWZ5KGlucHV0LnBheWxvYWQgPz8ge30pLFxuICAgIG5vd0lzbygpLFxuICApO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVFbWFpbChlbWFpbDogc3RyaW5nKSB7XG4gIHJldHVybiBlbWFpbC50cmltKCkudG9Mb3dlckNhc2UoKTtcbn1cblxuZnVuY3Rpb24gaXNMZWdhY3lTaGEyNTZIYXNoKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIC9eW2EtZjAtOV17NjR9JC9pLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBoYXNoUGFzc3dvcmQocGFzc3dvcmQ6IHN0cmluZykge1xuICBjb25zdCBzYWx0ID0gcmFuZG9tQnl0ZXMoMTYpLnRvU3RyaW5nKFwiaGV4XCIpO1xuICBjb25zdCBkZXJpdmVkID0gcGJrZGYyU3luYyhwYXNzd29yZCwgc2FsdCwgUEJLREYyX0lURVJBVElPTlMsIDMyLCBcInNoYTI1NlwiKS50b1N0cmluZyhcImhleFwiKTtcbiAgcmV0dXJuIGBwYmtkZjIkJHtQQktERjJfSVRFUkFUSU9OU30kJHtzYWx0fSQke2Rlcml2ZWR9YDtcbn1cblxuZnVuY3Rpb24gdmVyaWZ5UGFzc3dvcmQocGFzc3dvcmQ6IHN0cmluZywgc3RvcmVkSGFzaDogc3RyaW5nKSB7XG4gIGlmIChzdG9yZWRIYXNoLnN0YXJ0c1dpdGgoXCJwYmtkZjIkXCIpKSB7XG4gICAgY29uc3QgWywgaXRlcmF0aW9uVGV4dCwgc2FsdCwgZXhwZWN0ZWRIYXNoXSA9IHN0b3JlZEhhc2guc3BsaXQoXCIkXCIpO1xuICAgIGNvbnN0IGl0ZXJhdGlvbnMgPSBOdW1iZXIoaXRlcmF0aW9uVGV4dCk7XG4gICAgY29uc3QgZGVyaXZlZCA9IHBia2RmMlN5bmMocGFzc3dvcmQsIHNhbHQsIGl0ZXJhdGlvbnMsIDMyLCBcInNoYTI1NlwiKTtcbiAgICBjb25zdCBleHBlY3RlZCA9IEJ1ZmZlci5mcm9tKGV4cGVjdGVkSGFzaCwgXCJoZXhcIik7XG4gICAgaWYgKGRlcml2ZWQubGVuZ3RoICE9PSBleHBlY3RlZC5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdGltaW5nU2FmZUVxdWFsKGRlcml2ZWQsIGV4cGVjdGVkKTtcbiAgfVxuXG4gIGlmIChpc0xlZ2FjeVNoYTI1Nkhhc2goc3RvcmVkSGFzaCkpIHtcbiAgICBjb25zdCBpbnB1dEhhc2ggPSBjcmVhdGVIYXNoKFwic2hhMjU2XCIpLnVwZGF0ZShwYXNzd29yZCkuZGlnZXN0KFwiaGV4XCIpO1xuICAgIHJldHVybiB0aW1pbmdTYWZlRXF1YWwoQnVmZmVyLmZyb20oaW5wdXRIYXNoKSwgQnVmZmVyLmZyb20oc3RvcmVkSGFzaCkpO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoYXNoVG9rZW4odG9rZW46IHN0cmluZykge1xuICByZXR1cm4gY3JlYXRlSGFzaChcInNoYTI1NlwiKS51cGRhdGUodG9rZW4pLmRpZ2VzdChcImhleFwiKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VKc29uPFQ+KHZhbHVlOiB1bmtub3duLCBmYWxsYmFjazogVCk6IFQge1xuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiIHx8ICF2YWx1ZSkgcmV0dXJuIGZhbGxiYWNrO1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKHZhbHVlKSBhcyBUO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsbGJhY2s7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzb3VyY2VLZXkoY29sdW1uOiBrZXlvZiBPbWl0PEFwcFN0YXRlU25hcHNob3QsIFwidmVuZGVkb3Jlc1wiPikge1xuICByZXR1cm4ge1xuICAgIHZlaWN1bG9zOiBcInZlaWN1bG9zX2pzb25cIixcbiAgICBsZWFkczogXCJsZWFkc19qc29uXCIsXG4gICAgdmVuZGFzOiBcInZlbmRhc19qc29uXCIsXG4gICAgY29uc3VsdGFzOiBcImNvbnN1bHRhc19qc29uXCIsXG4gICAgdGFyZWZhc1Bvc1ZlbmRhOiBcInRhcmVmYXNfanNvblwiLFxuICAgIGN1c3RvczogXCJjdXN0b3NfanNvblwiLFxuICAgIGNvbmZpZ1ByZWNvczogXCJjb25maWdfanNvblwiLFxuICAgIG1lbW9yaWFMb2phOiBcIm1lbW9yaWFfanNvblwiLFxuICB9W2NvbHVtbl07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNjaGVtYShkYjogRGF0YWJhc2VTeW5jKSB7XG4gIGRiLmV4ZWMoYFxuICAgIHByYWdtYSBmb3JlaWduX2tleXMgPSBvbjtcbiAgICBwcmFnbWEgam91cm5hbF9tb2RlID0gd2FsO1xuXG4gICAgY3JlYXRlIHRhYmxlIGlmIG5vdCBleGlzdHMgdXNlcnMgKFxuICAgICAgaWQgaW50ZWdlciBwcmltYXJ5IGtleSBhdXRvaW5jcmVtZW50LFxuICAgICAgZW1haWwgdGV4dCBub3QgbnVsbCB1bmlxdWUsXG4gICAgICBwYXNzd29yZF9oYXNoIHRleHQgbm90IG51bGwsXG4gICAgICBuYW1lIHRleHQgbm90IG51bGwsXG4gICAgICBwbGF0Zm9ybV9yb2xlIHRleHQgbm90IG51bGwgZGVmYXVsdCAndGVuYW50X3VzZXInIGNoZWNrIChwbGF0Zm9ybV9yb2xlIGluICgncGxhdGZvcm1fYWRtaW4nLCAndGVuYW50X3VzZXInKSksXG4gICAgICBhY3RpdmUgaW50ZWdlciBub3QgbnVsbCBkZWZhdWx0IDEsXG4gICAgICBjcmVhdGVkX2F0IHRleHQgbm90IG51bGwgZGVmYXVsdCBjdXJyZW50X3RpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRfYXQgdGV4dCBub3QgbnVsbCBkZWZhdWx0IGN1cnJlbnRfdGltZXN0YW1wXG4gICAgKTtcblxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIHRlbmFudHMgKFxuICAgICAgaWQgaW50ZWdlciBwcmltYXJ5IGtleSBhdXRvaW5jcmVtZW50LFxuICAgICAgbmFtZSB0ZXh0IG5vdCBudWxsLFxuICAgICAgc2x1ZyB0ZXh0IG5vdCBudWxsIHVuaXF1ZSxcbiAgICAgIHN0YXR1cyB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ3RyaWFsJyBjaGVjayAoc3RhdHVzIGluICgndHJpYWwnLCAnYWN0aXZlJywgJ3Bhc3RfZHVlJywgJ2Jsb2NrZWQnLCAnY2xvc2VkJykpLFxuICAgICAgcGxhbl9jb2RlIHRleHQgbm90IG51bGwgZGVmYXVsdCAnc3RhcnRlcicsXG4gICAgICBtYXhfdXNlcnMgaW50ZWdlciBub3QgbnVsbCBkZWZhdWx0IDEwLFxuICAgICAgdHJpYWxfZW5kc19hdCB0ZXh0IG5vdCBudWxsLFxuICAgICAgY3JlYXRlZF9hdCB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgY3VycmVudF90aW1lc3RhbXAsXG4gICAgICB1cGRhdGVkX2F0IHRleHQgbm90IG51bGwgZGVmYXVsdCBjdXJyZW50X3RpbWVzdGFtcFxuICAgICk7XG5cbiAgICBjcmVhdGUgdGFibGUgaWYgbm90IGV4aXN0cyBtZW1iZXJzaGlwcyAoXG4gICAgICBpZCBpbnRlZ2VyIHByaW1hcnkga2V5IGF1dG9pbmNyZW1lbnQsXG4gICAgICB0ZW5hbnRfaWQgaW50ZWdlciBub3QgbnVsbCByZWZlcmVuY2VzIHRlbmFudHMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgdXNlcl9pZCBpbnRlZ2VyIG5vdCBudWxsIHJlZmVyZW5jZXMgdXNlcnMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgcm9sZSB0ZXh0IG5vdCBudWxsIGNoZWNrIChyb2xlIGluICgnb3duZXInLCAnc2VsbGVyJykpLFxuICAgICAgYWN0aXZlIGludGVnZXIgbm90IG51bGwgZGVmYXVsdCAxLFxuICAgICAgc2FsZXNfZ29hbF9tb250aGx5IGludGVnZXIsXG4gICAgICBjcmVhdGVkX2F0IHRleHQgbm90IG51bGwgZGVmYXVsdCBjdXJyZW50X3RpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRfYXQgdGV4dCBub3QgbnVsbCBkZWZhdWx0IGN1cnJlbnRfdGltZXN0YW1wLFxuICAgICAgdW5pcXVlICh0ZW5hbnRfaWQsIHVzZXJfaWQpXG4gICAgKTtcblxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIHNlc3Npb25zIChcbiAgICAgIGlkIGludGVnZXIgcHJpbWFyeSBrZXkgYXV0b2luY3JlbWVudCxcbiAgICAgIHVzZXJfaWQgaW50ZWdlciBub3QgbnVsbCByZWZlcmVuY2VzIHVzZXJzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIG1lbWJlcnNoaXBfaWQgaW50ZWdlciByZWZlcmVuY2VzIG1lbWJlcnNoaXBzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIHRva2VuX2hhc2ggdGV4dCBub3QgbnVsbCB1bmlxdWUsXG4gICAgICBleHBpcmVzX2F0IHRleHQgbm90IG51bGwsXG4gICAgICByZXZva2VkX2F0IHRleHQsXG4gICAgICBpcF9hZGRyZXNzIHRleHQsXG4gICAgICB1c2VyX2FnZW50IHRleHQsXG4gICAgICBjcmVhdGVkX2F0IHRleHQgbm90IG51bGwgZGVmYXVsdCBjdXJyZW50X3RpbWVzdGFtcFxuICAgICk7XG5cbiAgICBjcmVhdGUgdGFibGUgaWYgbm90IGV4aXN0cyB0ZW5hbnRfc3RhdGUgKFxuICAgICAgdGVuYW50X2lkIGludGVnZXIgcHJpbWFyeSBrZXkgcmVmZXJlbmNlcyB0ZW5hbnRzKGlkKSBvbiBkZWxldGUgY2FzY2FkZSxcbiAgICAgIHZlaWN1bG9zX2pzb24gdGV4dCBub3QgbnVsbCBkZWZhdWx0ICdbXScsXG4gICAgICBsZWFkc19qc29uIHRleHQgbm90IG51bGwgZGVmYXVsdCAnW10nLFxuICAgICAgdmVuZGFzX2pzb24gdGV4dCBub3QgbnVsbCBkZWZhdWx0ICdbXScsXG4gICAgICBjb25zdWx0YXNfanNvbiB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ1tdJyxcbiAgICAgIHRhcmVmYXNfanNvbiB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgJ1tdJyxcbiAgICAgIGN1c3Rvc19qc29uIHRleHQgbm90IG51bGwgZGVmYXVsdCAnW10nLFxuICAgICAgY29uZmlnX2pzb24gdGV4dCBub3QgbnVsbCBkZWZhdWx0ICd7fScsXG4gICAgICBtZW1vcmlhX2pzb24gdGV4dCBub3QgbnVsbCBkZWZhdWx0ICd7fScsXG4gICAgICBjcmVhdGVkX2F0IHRleHQgbm90IG51bGwgZGVmYXVsdCBjdXJyZW50X3RpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRfYXQgdGV4dCBub3QgbnVsbCBkZWZhdWx0IGN1cnJlbnRfdGltZXN0YW1wXG4gICAgKTtcblxuICAgIGNyZWF0ZSB0YWJsZSBpZiBub3QgZXhpc3RzIGF1ZGl0X2xvZyAoXG4gICAgICBpZCBpbnRlZ2VyIHByaW1hcnkga2V5IGF1dG9pbmNyZW1lbnQsXG4gICAgICB0ZW5hbnRfaWQgaW50ZWdlciByZWZlcmVuY2VzIHRlbmFudHMoaWQpIG9uIGRlbGV0ZSBjYXNjYWRlLFxuICAgICAgYWN0b3JfdXNlcl9pZCBpbnRlZ2VyIHJlZmVyZW5jZXMgdXNlcnMoaWQpIG9uIGRlbGV0ZSBzZXQgbnVsbCxcbiAgICAgIGFjdGlvbiB0ZXh0IG5vdCBudWxsLFxuICAgICAgcGF5bG9hZF9qc29uIHRleHQgbm90IG51bGwgZGVmYXVsdCAne30nLFxuICAgICAgY3JlYXRlZF9hdCB0ZXh0IG5vdCBudWxsIGRlZmF1bHQgY3VycmVudF90aW1lc3RhbXBcbiAgICApO1xuXG4gICAgY3JlYXRlIGluZGV4IGlmIG5vdCBleGlzdHMgaWR4X21lbWJlcnNoaXBzX3RlbmFudCBvbiBtZW1iZXJzaGlwcyAodGVuYW50X2lkKTtcbiAgICBjcmVhdGUgaW5kZXggaWYgbm90IGV4aXN0cyBpZHhfbWVtYmVyc2hpcHNfdXNlciBvbiBtZW1iZXJzaGlwcyAodXNlcl9pZCk7XG4gICAgY3JlYXRlIGluZGV4IGlmIG5vdCBleGlzdHMgaWR4X3Nlc3Npb25zX3VzZXIgb24gc2Vzc2lvbnMgKHVzZXJfaWQpO1xuICAgIGNyZWF0ZSBpbmRleCBpZiBub3QgZXhpc3RzIGlkeF9zZXNzaW9uc19tZW1iZXJzaGlwIG9uIHNlc3Npb25zIChtZW1iZXJzaGlwX2lkKTtcbiAgICBjcmVhdGUgaW5kZXggaWYgbm90IGV4aXN0cyBpZHhfdGVuYW50c19zdGF0dXMgb24gdGVuYW50cyAoc3RhdHVzKTtcbiAgYCk7XG59XG5cbmZ1bmN0aW9uIGhhc0NvbHVtbihkYjogRGF0YWJhc2VTeW5jLCB0YWJsZTogc3RyaW5nLCBjb2x1bW46IHN0cmluZykge1xuICBjb25zdCBjb2x1bW5zID0gZGIucHJlcGFyZShgcHJhZ21hIHRhYmxlX2luZm8oJHt0YWJsZX0pYCkuYWxsKCkgYXMgQXJyYXk8eyBuYW1lOiBzdHJpbmcgfT47XG4gIHJldHVybiBjb2x1bW5zLnNvbWUoKGl0ZW0pID0+IGl0ZW0ubmFtZSA9PT0gY29sdW1uKTtcbn1cblxuZnVuY3Rpb24gcnVuTWlncmF0aW9ucyhkYjogRGF0YWJhc2VTeW5jKSB7XG4gIGlmICghaGFzQ29sdW1uKGRiLCBcInRlbmFudHNcIiwgXCJtYXhfdXNlcnNcIikpIHtcbiAgICBkYi5leGVjKFwiYWx0ZXIgdGFibGUgdGVuYW50cyBhZGQgY29sdW1uIG1heF91c2VycyBpbnRlZ2VyIG5vdCBudWxsIGRlZmF1bHQgMTA7XCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVBsYXRmb3JtQWRtaW4oZGI6IERhdGFiYXNlU3luYykge1xuICBjb25zdCBlbWFpbCA9IG5vcm1hbGl6ZUVtYWlsKGdldEVudihcIlBMQVRGT1JNX0FETUlOX0VNQUlMXCIpKTtcbiAgY29uc3QgZXhpc3RpbmcgPSBkYlxuICAgIC5wcmVwYXJlKFwic2VsZWN0IGlkLCBwYXNzd29yZF9oYXNoIGZyb20gdXNlcnMgd2hlcmUgZW1haWwgPSA/XCIpXG4gICAgLmdldChlbWFpbCkgYXMgeyBpZDogbnVtYmVyOyBwYXNzd29yZF9oYXNoOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblxuICBjb25zdCByYXdQYXNzd29yZCA9IHByb2Nlc3MuZW52LlBMQVRGT1JNX0FETUlOX1BBU1NXT1JEPy50cmltKCk7XG4gIGNvbnN0IGhhc2hGcm9tRW52ID0gcHJvY2Vzcy5lbnYuUExBVEZPUk1fQURNSU5fUEFTU1dPUkRfSEFTSD8udHJpbSgpO1xuICBjb25zdCBwYXNzd29yZEhhc2ggPSByYXdQYXNzd29yZFxuICAgID8gaGFzaFBhc3N3b3JkKHJhd1Bhc3N3b3JkKVxuICAgIDogaGFzaEZyb21FbnZcbiAgICAgID8gaGFzaEZyb21FbnZcbiAgICAgIDogbnVsbDtcblxuICBpZiAoIXBhc3N3b3JkSGFzaCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNvbmZpZ3VyZSBQTEFURk9STV9BRE1JTl9QQVNTV09SRCBvdSBQTEFURk9STV9BRE1JTl9QQVNTV09SRF9IQVNILlwiKTtcbiAgfVxuXG4gIGlmICghZXhpc3RpbmcpIHtcbiAgICBkYi5wcmVwYXJlKGBcbiAgICAgIGluc2VydCBpbnRvIHVzZXJzIChlbWFpbCwgcGFzc3dvcmRfaGFzaCwgbmFtZSwgcGxhdGZvcm1fcm9sZSwgYWN0aXZlLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KVxuICAgICAgdmFsdWVzICg/LCA/LCA/LCAncGxhdGZvcm1fYWRtaW4nLCAxLCA/LCA/KVxuICAgIGApLnJ1bihlbWFpbCwgcGFzc3dvcmRIYXNoLCBcIlBsYXRmb3JtIEFkbWluXCIsIG5vd0lzbygpLCBub3dJc28oKSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgZGIucHJlcGFyZShgXG4gICAgdXBkYXRlIHVzZXJzXG4gICAgc2V0IHBhc3N3b3JkX2hhc2ggPSA/LCBuYW1lID0gJ1BsYXRmb3JtIEFkbWluJywgcGxhdGZvcm1fcm9sZSA9ICdwbGF0Zm9ybV9hZG1pbicsIGFjdGl2ZSA9IDEsIHVwZGF0ZWRfYXQgPSA/XG4gICAgd2hlcmUgaWQgPSA/XG4gIGApLnJ1bihwYXNzd29yZEhhc2gsIG5vd0lzbygpLCBleGlzdGluZy5pZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNldERhdGFiYXNlQ29ubmVjdGlvbkZvclRlc3RzKCkge1xuICBpZiAoZGJJbnN0YW5jZSkge1xuICAgIGRiSW5zdGFuY2UuY2xvc2UoKTtcbiAgfVxuICBkYkluc3RhbmNlID0gbnVsbDtcbiAgaW5pdGlhbGl6ZWRQYXRoID0gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERhdGFiYXNlKCkge1xuICBjb25zdCBwYXRoID0gZ2V0RGF0YWJhc2VQYXRoKCk7XG4gIGlmIChkYkluc3RhbmNlICYmIGluaXRpYWxpemVkUGF0aCA9PT0gcGF0aCkge1xuICAgIHJldHVybiBkYkluc3RhbmNlO1xuICB9XG5cbiAgaWYgKGRiSW5zdGFuY2UpIHtcbiAgICBkYkluc3RhbmNlLmNsb3NlKCk7XG4gICAgZGJJbnN0YW5jZSA9IG51bGw7XG4gIH1cblxuICBta2RpclN5bmMoZGlybmFtZShwYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gIGNvbnN0IGRiID0gbmV3IERhdGFiYXNlU3luYyhwYXRoKTtcbiAgY3JlYXRlU2NoZW1hKGRiKTtcbiAgcnVuTWlncmF0aW9ucyhkYik7XG4gIGVuc3VyZVBsYXRmb3JtQWRtaW4oZGIpO1xuXG4gIGRiSW5zdGFuY2UgPSBkYjtcbiAgaW5pdGlhbGl6ZWRQYXRoID0gcGF0aDtcbiAgcmV0dXJuIGRiO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVDb29raWUobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBtYXhBZ2VTZWNvbmRzOiBudW1iZXIpIHtcbiAgY29uc3QgaXNQcm9kID0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09IFwicHJvZHVjdGlvblwiO1xuICByZXR1cm4gYCR7bmFtZX09JHt2YWx1ZX07IFBhdGg9LzsgSHR0cE9ubHk7IFNhbWVTaXRlPUxheDsgTWF4LUFnZT0ke21heEFnZVNlY29uZHN9OyAke2lzUHJvZCA/IFwiU2VjdXJlOyBcIiA6IFwiXCJ9YC50cmltKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclNlc3Npb25Db29raWVIZWFkZXIoKSB7XG4gIHJldHVybiBgJHtTRVNTSU9OX0NPT0tJRV9OQU1FfT07IFBhdGg9LzsgSHR0cE9ubHk7IFNhbWVTaXRlPUxheDsgTWF4LUFnZT0wYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRlbmFudFdpdGhPd25lcihpbnB1dDoge1xuICBzdG9yZU5hbWU6IHN0cmluZztcbiAgc2x1Zzogc3RyaW5nO1xuICBvd25lck5hbWU6IHN0cmluZztcbiAgb3duZXJFbWFpbDogc3RyaW5nO1xuICBvd25lclBhc3N3b3JkOiBzdHJpbmc7XG4gIHRyaWFsRGF5czogbnVtYmVyO1xuICBtYXhVc2VyczogbnVtYmVyO1xufSkge1xuICBjb25zdCBkYiA9IGdldERhdGFiYXNlKCk7XG4gIGNvbnN0IGV4aXN0aW5nVXNlciA9IGRiLnByZXBhcmUoXCJzZWxlY3QgaWQgZnJvbSB1c2VycyB3aGVyZSBlbWFpbCA9ID9cIikuZ2V0KG5vcm1hbGl6ZUVtYWlsKGlucHV0Lm93bmVyRW1haWwpKSBhcyB7IGlkOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcbiAgaWYgKGV4aXN0aW5nVXNlcikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkphIGV4aXN0ZSB1bSB1c3VhcmlvIGNvbSBlc3NlIGUtbWFpbC5cIik7XG4gIH1cblxuICBjb25zdCBleGlzdGluZ1N0b3JlID0gZGIucHJlcGFyZShcInNlbGVjdCBpZCBmcm9tIHRlbmFudHMgd2hlcmUgc2x1ZyA9ID9cIikuZ2V0KGlucHV0LnNsdWcudHJpbSgpLnRvTG93ZXJDYXNlKCkpIGFzIHsgaWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuICBpZiAoZXhpc3RpbmdTdG9yZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkphIGV4aXN0ZSB1bWEgbG9qYSBjb20gZXNzZSBpZGVudGlmaWNhZG9yLlwiKTtcbiAgfVxuXG4gIGNvbnN0IHRyaWFsRW5kc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIE1hdGgubWF4KDEsIGlucHV0LnRyaWFsRGF5cykgKiA4Nl80MDBfMDAwKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBjcmVhdGVkQXQgPSBub3dJc28oKTtcblxuICBkYi5leGVjKFwiYmVnaW5cIik7XG4gIHRyeSB7XG4gICAgY29uc3QgdGVuYW50UmVzdWx0ID0gZGIucHJlcGFyZShgXG4gICAgICBpbnNlcnQgaW50byB0ZW5hbnRzIChuYW1lLCBzbHVnLCBzdGF0dXMsIHBsYW5fY29kZSwgbWF4X3VzZXJzLCB0cmlhbF9lbmRzX2F0LCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KVxuICAgICAgdmFsdWVzICg/LCA/LCAndHJpYWwnLCAnc3RhcnRlcicsID8sID8sID8sID8pXG4gICAgICByZXR1cm5pbmcgaWRcbiAgICBgKS5nZXQoXG4gICAgICBpbnB1dC5zdG9yZU5hbWUudHJpbSgpLFxuICAgICAgaW5wdXQuc2x1Zy50cmltKCkudG9Mb3dlckNhc2UoKSxcbiAgICAgIE1hdGgubWF4KDEsIGlucHV0Lm1heFVzZXJzKSxcbiAgICAgIHRyaWFsRW5kc0F0LFxuICAgICAgY3JlYXRlZEF0LFxuICAgICAgY3JlYXRlZEF0LFxuICAgICkgYXMgeyBpZDogbnVtYmVyIH07XG5cbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gZGIucHJlcGFyZShgXG4gICAgICBpbnNlcnQgaW50byB1c2VycyAoZW1haWwsIHBhc3N3b3JkX2hhc2gsIG5hbWUsIHBsYXRmb3JtX3JvbGUsIGFjdGl2ZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdClcbiAgICAgIHZhbHVlcyAoPywgPywgPywgJ3RlbmFudF91c2VyJywgMSwgPywgPylcbiAgICAgIHJldHVybmluZyBpZFxuICAgIGApLmdldChcbiAgICAgIG5vcm1hbGl6ZUVtYWlsKGlucHV0Lm93bmVyRW1haWwpLFxuICAgICAgaGFzaFBhc3N3b3JkKGlucHV0Lm93bmVyUGFzc3dvcmQpLFxuICAgICAgaW5wdXQub3duZXJOYW1lLnRyaW0oKSxcbiAgICAgIGNyZWF0ZWRBdCxcbiAgICAgIGNyZWF0ZWRBdCxcbiAgICApIGFzIHsgaWQ6IG51bWJlciB9O1xuXG4gICAgZGIucHJlcGFyZShgXG4gICAgICBpbnNlcnQgaW50byBtZW1iZXJzaGlwcyAodGVuYW50X2lkLCB1c2VyX2lkLCByb2xlLCBhY3RpdmUsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpXG4gICAgICB2YWx1ZXMgKD8sID8sICdvd25lcicsIDEsID8sID8pXG4gICAgYCkucnVuKHRlbmFudFJlc3VsdC5pZCwgdXNlclJlc3VsdC5pZCwgY3JlYXRlZEF0LCBjcmVhdGVkQXQpO1xuXG4gICAgICBkYi5wcmVwYXJlKGBcbiAgICAgICAgaW5zZXJ0IGludG8gdGVuYW50X3N0YXRlIChcbiAgICAgICAgICB0ZW5hbnRfaWQsIHZlaWN1bG9zX2pzb24sIGxlYWRzX2pzb24sIHZlbmRhc19qc29uLCBjb25zdWx0YXNfanNvbiwgdGFyZWZhc19qc29uLCBjdXN0b3NfanNvbiwgY29uZmlnX2pzb24sIG1lbW9yaWFfanNvbiwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdFxuICAgICAgICApIHZhbHVlcyAoPywgJ1tdJywgJ1tdJywgJ1tdJywgJ1tdJywgJ1tdJywgJ1tdJywgJ3t9JywgJ3t9JywgPywgPylcbiAgICAgIGApLnJ1bih0ZW5hbnRSZXN1bHQuaWQsIGNyZWF0ZWRBdCwgY3JlYXRlZEF0KTtcblxuICAgICAgd3JpdGVBdWRpdExvZyhkYiwge1xuICAgICAgICB0ZW5hbnRJZDogdGVuYW50UmVzdWx0LmlkLFxuICAgICAgICBhY3RvclVzZXJJZDogdXNlclJlc3VsdC5pZCxcbiAgICAgICAgYWN0aW9uOiBcInRlbmFudC5jcmVhdGVkXCIsXG4gICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICBzdG9yZU5hbWU6IGlucHV0LnN0b3JlTmFtZS50cmltKCksXG4gICAgICAgICAgc2x1ZzogaW5wdXQuc2x1Zy50cmltKCkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICB0cmlhbERheXM6IE1hdGgubWF4KDEsIGlucHV0LnRyaWFsRGF5cyksXG4gICAgICAgICAgbWF4VXNlcnM6IE1hdGgubWF4KDEsIGlucHV0Lm1heFVzZXJzKSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkYi5leGVjKFwiY29tbWl0XCIpO1xuICAgICAgcmV0dXJuIHsgdGVuYW50SWQ6IHRlbmFudFJlc3VsdC5pZCB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGRiLmV4ZWMoXCJyb2xsYmFja1wiKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb3VudEFjdGl2ZU1lbWJlcnNoaXBzKGRiOiBEYXRhYmFzZVN5bmMsIHRlbmFudElkOiBudW1iZXIpIHtcbiAgY29uc3Qgcm93ID0gZGIucHJlcGFyZShgXG4gICAgc2VsZWN0IGNvdW50KCopIGFzIHRvdGFsXG4gICAgZnJvbSBtZW1iZXJzaGlwc1xuICAgIHdoZXJlIHRlbmFudF9pZCA9ID8gYW5kIGFjdGl2ZSA9IDFcbiAgYCkuZ2V0KHRlbmFudElkKSBhcyB7IHRvdGFsOiBudW1iZXIgfTtcbiAgcmV0dXJuIHJvdy50b3RhbDtcbn1cblxuZnVuY3Rpb24gZ2V0VGVuYW50TGltaXQoZGI6IERhdGFiYXNlU3luYywgdGVuYW50SWQ6IG51bWJlcikge1xuICBjb25zdCByb3cgPSBkYi5wcmVwYXJlKFwic2VsZWN0IG1heF91c2VycyBmcm9tIHRlbmFudHMgd2hlcmUgaWQgPSA/XCIpLmdldCh0ZW5hbnRJZCkgYXMgeyBtYXhfdXNlcnM6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuICBpZiAoIXJvdykge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkxvamEgbmFvIGVuY29udHJhZGEuXCIpO1xuICB9XG4gIHJldHVybiByb3cubWF4X3VzZXJzO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUZW5hbnRNZW1iZXJzaGlwKGRiOiBEYXRhYmFzZVN5bmMsIGlucHV0OiB7XG4gIHRlbmFudElkOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgcGFzc3dvcmQ6IHN0cmluZztcbiAgcm9sZTogXCJvd25lclwiIHwgXCJzZWxsZXJcIjtcbiAgc2FsZXNHb2FsTW9udGhseT86IG51bWJlciB8IG51bGw7XG59KSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWRFbWFpbCA9IG5vcm1hbGl6ZUVtYWlsKGlucHV0LmVtYWlsKTtcbiAgY29uc3QgZXhpc3RpbmdVc2VyID0gZGIucHJlcGFyZShcInNlbGVjdCBpZCBmcm9tIHVzZXJzIHdoZXJlIGVtYWlsID0gP1wiKS5nZXQobm9ybWFsaXplZEVtYWlsKSBhcyB7IGlkOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcbiAgaWYgKGV4aXN0aW5nVXNlcikge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkphIGV4aXN0ZSB1bSB1c3VhcmlvIGNvbSBlc3NlIGUtbWFpbC5cIik7XG4gIH1cblxuICBjb25zdCBhY3RpdmVVc2VycyA9IGNvdW50QWN0aXZlTWVtYmVyc2hpcHMoZGIsIGlucHV0LnRlbmFudElkKTtcbiAgY29uc3QgbWF4VXNlcnMgPSBnZXRUZW5hbnRMaW1pdChkYiwgaW5wdXQudGVuYW50SWQpO1xuICBpZiAoYWN0aXZlVXNlcnMgPj0gbWF4VXNlcnMpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEEgbG9qYSBhdGluZ2l1IG8gbGltaXRlIGRlICR7bWF4VXNlcnN9IHVzdWFyaW9zLmApO1xuICB9XG5cbiAgY29uc3QgY3JlYXRlZEF0ID0gbm93SXNvKCk7XG4gIGRiLmV4ZWMoXCJiZWdpblwiKTtcbiAgdHJ5IHtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gZGIucHJlcGFyZShgXG4gICAgICBpbnNlcnQgaW50byB1c2VycyAoZW1haWwsIHBhc3N3b3JkX2hhc2gsIG5hbWUsIHBsYXRmb3JtX3JvbGUsIGFjdGl2ZSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdClcbiAgICAgIHZhbHVlcyAoPywgPywgPywgJ3RlbmFudF91c2VyJywgMSwgPywgPylcbiAgICAgIHJldHVybmluZyBpZFxuICAgIGApLmdldChub3JtYWxpemVkRW1haWwsIGhhc2hQYXNzd29yZChpbnB1dC5wYXNzd29yZCksIGlucHV0Lm5hbWUudHJpbSgpLCBjcmVhdGVkQXQsIGNyZWF0ZWRBdCkgYXMgeyBpZDogbnVtYmVyIH07XG5cbiAgICAgIGRiLnByZXBhcmUoYFxuICAgICAgICBpbnNlcnQgaW50byBtZW1iZXJzaGlwcyAodGVuYW50X2lkLCB1c2VyX2lkLCByb2xlLCBhY3RpdmUsIHNhbGVzX2dvYWxfbW9udGhseSwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdClcbiAgICAgICAgdmFsdWVzICg/LCA/LCA/LCAxLCA/LCA/LCA/KVxuICAgICAgYCkucnVuKGlucHV0LnRlbmFudElkLCB1c2VyUmVzdWx0LmlkLCBpbnB1dC5yb2xlLCBpbnB1dC5zYWxlc0dvYWxNb250aGx5ID8/IG51bGwsIGNyZWF0ZWRBdCwgY3JlYXRlZEF0KTtcblxuICAgICAgd3JpdGVBdWRpdExvZyhkYiwge1xuICAgICAgICB0ZW5hbnRJZDogaW5wdXQudGVuYW50SWQsXG4gICAgICAgIGFjdG9yVXNlcklkOiB1c2VyUmVzdWx0LmlkLFxuICAgICAgICBhY3Rpb246IFwidGVuYW50LnVzZXIuY3JlYXRlZFwiLFxuICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgZW1haWw6IG5vcm1hbGl6ZWRFbWFpbCxcbiAgICAgICAgICByb2xlOiBpbnB1dC5yb2xlLFxuICAgICAgICAgIHNhbGVzR29hbE1vbnRobHk6IGlucHV0LnNhbGVzR29hbE1vbnRobHkgPz8gbnVsbCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBkYi5leGVjKFwiY29tbWl0XCIpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGRiLmV4ZWMoXCJyb2xsYmFja1wiKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2VsbGVyRm9yVGVuYW50KGFjdG9yOiBBdXRoZW50aWNhdGVkU2Vzc2lvbiwgaW5wdXQ6IHtcbiAgbmFtZTogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICBwYXNzd29yZDogc3RyaW5nO1xuICByb2xlPzogXCJvd25lclwiIHwgXCJzZWxsZXJcIjtcbiAgc2FsZXNHb2FsTW9udGhseT86IG51bWJlciB8IG51bGw7XG59KSB7XG4gIGlmICghYWN0b3IudGVuYW50SWQgfHwgYWN0b3Iucm9sZSAhPT0gXCJvd25lclwiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiU29tZW50ZSBvIG93bmVyIHBvZGUgY3JpYXIgdXN1YXJpb3MgZGEgbG9qYS5cIik7XG4gIH1cblxuICBjb25zdCBkYiA9IGdldERhdGFiYXNlKCk7XG4gIGNyZWF0ZVRlbmFudE1lbWJlcnNoaXAoZGIsIHtcbiAgICB0ZW5hbnRJZDogYWN0b3IudGVuYW50SWQsXG4gICAgbmFtZTogaW5wdXQubmFtZSxcbiAgICBlbWFpbDogaW5wdXQuZW1haWwsXG4gICAgcGFzc3dvcmQ6IGlucHV0LnBhc3N3b3JkLFxuICAgIHJvbGU6IGlucHV0LnJvbGUgPz8gXCJzZWxsZXJcIixcbiAgICBzYWxlc0dvYWxNb250aGx5OiBpbnB1dC5zYWxlc0dvYWxNb250aGx5LFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRlbmFudFVzZXJGb3JQbGF0Zm9ybShzdG9yZUlkOiBudW1iZXIsIGlucHV0OiB7XG4gIG5hbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgcGFzc3dvcmQ6IHN0cmluZztcbiAgcm9sZTogXCJvd25lclwiIHwgXCJzZWxsZXJcIjtcbiAgc2FsZXNHb2FsTW9udGhseT86IG51bWJlciB8IG51bGw7XG59KSB7XG4gIGNvbnN0IGRiID0gZ2V0RGF0YWJhc2UoKTtcbiAgY3JlYXRlVGVuYW50TWVtYmVyc2hpcChkYiwge1xuICAgIHRlbmFudElkOiBzdG9yZUlkLFxuICAgIG5hbWU6IGlucHV0Lm5hbWUsXG4gICAgZW1haWw6IGlucHV0LmVtYWlsLFxuICAgIHBhc3N3b3JkOiBpbnB1dC5wYXNzd29yZCxcbiAgICByb2xlOiBpbnB1dC5yb2xlLFxuICAgIHNhbGVzR29hbE1vbnRobHk6IGlucHV0LnNhbGVzR29hbE1vbnRobHksXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlU3RvcmVTdGF0dXMoc3RvcmVJZDogbnVtYmVyLCBwYXRjaDoge1xuICBzdGF0dXM/OiBUZW5hbnRTdGF0dXM7XG4gIGV4dGVuZFRyaWFsRGF5cz86IG51bWJlcjtcbiAgdHJpYWxEYXlzPzogbnVtYmVyO1xuICBtYXhVc2Vycz86IG51bWJlcjtcbn0pIHtcbiAgY29uc3QgZGIgPSBnZXREYXRhYmFzZSgpO1xuICBjb25zdCBjdXJyZW50ID0gZGIucHJlcGFyZShcInNlbGVjdCB0cmlhbF9lbmRzX2F0LCBtYXhfdXNlcnMgZnJvbSB0ZW5hbnRzIHdoZXJlIGlkID0gP1wiKS5nZXQoc3RvcmVJZCkgYXMge1xuICAgIHRyaWFsX2VuZHNfYXQ6IHN0cmluZztcbiAgICBtYXhfdXNlcnM6IG51bWJlcjtcbiAgfSB8IHVuZGVmaW5lZDtcbiAgaWYgKCFjdXJyZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiTG9qYSBuYW8gZW5jb250cmFkYS5cIik7XG4gIH1cblxuICBjb25zdCBuZXh0VHJpYWxFbmRzQXQgPSBwYXRjaC50cmlhbERheXMgIT09IHVuZGVmaW5lZFxuICAgID8gbmV3IERhdGUoRGF0ZS5ub3coKSArIE1hdGgubWF4KDEsIHBhdGNoLnRyaWFsRGF5cykgKiA4Nl80MDBfMDAwKS50b0lTT1N0cmluZygpXG4gICAgOiBwYXRjaC5leHRlbmRUcmlhbERheXNcbiAgICAgID8gbmV3IERhdGUobmV3IERhdGUoY3VycmVudC50cmlhbF9lbmRzX2F0KS5nZXRUaW1lKCkgKyBwYXRjaC5leHRlbmRUcmlhbERheXMgKiA4Nl80MDBfMDAwKS50b0lTT1N0cmluZygpXG4gICAgICA6IGN1cnJlbnQudHJpYWxfZW5kc19hdDtcblxuICBjb25zdCBuZXh0TWF4VXNlcnMgPSBwYXRjaC5tYXhVc2VycyA9PT0gdW5kZWZpbmVkID8gY3VycmVudC5tYXhfdXNlcnMgOiBNYXRoLm1heCgxLCBwYXRjaC5tYXhVc2Vycyk7XG4gIGNvbnN0IGFjdGl2ZVVzZXJzID0gY291bnRBY3RpdmVNZW1iZXJzaGlwcyhkYiwgc3RvcmVJZCk7XG4gIGlmIChuZXh0TWF4VXNlcnMgPCBhY3RpdmVVc2Vycykge1xuICAgIHRocm93IG5ldyBFcnJvcihgQSBsb2phIGphIHBvc3N1aSAke2FjdGl2ZVVzZXJzfSB1c3VhcmlvcyBhdGl2b3MuYCk7XG4gIH1cblxuICAgIGRiLnByZXBhcmUoYFxuICAgICAgdXBkYXRlIHRlbmFudHNcbiAgICAgIHNldCBzdGF0dXMgPSBjb2FsZXNjZSg/LCBzdGF0dXMpLFxuICAgICAgICAgIG1heF91c2VycyA9ID8sXG4gICAgICAgICAgdHJpYWxfZW5kc19hdCA9ID8sXG4gICAgICAgICAgdXBkYXRlZF9hdCA9ID9cbiAgICAgIHdoZXJlIGlkID0gP1xuICAgIGApLnJ1bihwYXRjaC5zdGF0dXMgPz8gbnVsbCwgbmV4dE1heFVzZXJzLCBuZXh0VHJpYWxFbmRzQXQsIG5vd0lzbygpLCBzdG9yZUlkKTtcblxuICAgIHdyaXRlQXVkaXRMb2coZGIsIHtcbiAgICAgIHRlbmFudElkOiBzdG9yZUlkLFxuICAgICAgYWN0aW9uOiBcInRlbmFudC51cGRhdGVkXCIsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIHN0YXR1czogcGF0Y2guc3RhdHVzID8/IG51bGwsXG4gICAgICAgIGV4dGVuZFRyaWFsRGF5czogcGF0Y2guZXh0ZW5kVHJpYWxEYXlzID8/IG51bGwsXG4gICAgICAgIHRyaWFsRGF5czogcGF0Y2gudHJpYWxEYXlzID8/IG51bGwsXG4gICAgICAgIG1heFVzZXJzOiBuZXh0TWF4VXNlcnMsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbmZ1bmN0aW9uIGdldE1lbWJlcnNoaXBGb3JVc2VyKGRiOiBEYXRhYmFzZVN5bmMsIHVzZXJJZDogbnVtYmVyKSB7XG4gIHJldHVybiBkYi5wcmVwYXJlKGBcbiAgICBzZWxlY3RcbiAgICAgIG0uaWQgYXMgbWVtYmVyc2hpcF9pZCxcbiAgICAgIG0udGVuYW50X2lkLFxuICAgICAgbS5yb2xlLFxuICAgICAgbS5zYWxlc19nb2FsX21vbnRobHksXG4gICAgICB0Lm5hbWUgYXMgdGVuYW50X25hbWUsXG4gICAgICB0LnNsdWcgYXMgdGVuYW50X3NsdWcsXG4gICAgICB0LnN0YXR1cyBhcyB0ZW5hbnRfc3RhdHVzLFxuICAgICAgdC50cmlhbF9lbmRzX2F0LFxuICAgICAgdC5wbGFuX2NvZGVcbiAgICBmcm9tIG1lbWJlcnNoaXBzIG1cbiAgICBqb2luIHRlbmFudHMgdCBvbiB0LmlkID0gbS50ZW5hbnRfaWRcbiAgICB3aGVyZSBtLnVzZXJfaWQgPSA/IGFuZCBtLmFjdGl2ZSA9IDFcbiAgICBvcmRlciBieSBjYXNlIHdoZW4gbS5yb2xlID0gJ293bmVyJyB0aGVuIDAgZWxzZSAxIGVuZCwgbS5pZCBhc2NcbiAgICBsaW1pdCAxXG4gIGApLmdldCh1c2VySWQpIGFzIHtcbiAgICBtZW1iZXJzaGlwX2lkOiBudW1iZXI7XG4gICAgdGVuYW50X2lkOiBudW1iZXI7XG4gICAgcm9sZTogXCJvd25lclwiIHwgXCJzZWxsZXJcIjtcbiAgICBzYWxlc19nb2FsX21vbnRobHk6IG51bWJlciB8IG51bGw7XG4gICAgdGVuYW50X25hbWU6IHN0cmluZztcbiAgICB0ZW5hbnRfc2x1Zzogc3RyaW5nO1xuICAgIHRlbmFudF9zdGF0dXM6IFRlbmFudFN0YXR1cztcbiAgICB0cmlhbF9lbmRzX2F0OiBzdHJpbmc7XG4gICAgcGxhbl9jb2RlOiBzdHJpbmc7XG4gIH0gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhdXRoZW50aWNhdGVVc2VyKGVtYWlsOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIG1ldGFkYXRhPzogeyBpcD86IHN0cmluZzsgdXNlckFnZW50Pzogc3RyaW5nIH0pIHtcbiAgY29uc3QgZGIgPSBnZXREYXRhYmFzZSgpO1xuICBjb25zdCB1c2VyID0gZGIucHJlcGFyZShgXG4gICAgc2VsZWN0IGlkLCBlbWFpbCwgcGFzc3dvcmRfaGFzaCwgbmFtZSwgcGxhdGZvcm1fcm9sZSwgYWN0aXZlXG4gICAgZnJvbSB1c2Vyc1xuICAgIHdoZXJlIGVtYWlsID0gP1xuICBgKS5nZXQobm9ybWFsaXplRW1haWwoZW1haWwpKSBhcyB7XG4gICAgaWQ6IG51bWJlcjtcbiAgICBlbWFpbDogc3RyaW5nO1xuICAgIHBhc3N3b3JkX2hhc2g6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGxhdGZvcm1fcm9sZTogXCJwbGF0Zm9ybV9hZG1pblwiIHwgXCJ0ZW5hbnRfdXNlclwiO1xuICAgIGFjdGl2ZTogbnVtYmVyO1xuICB9IHwgdW5kZWZpbmVkO1xuXG4gIGlmICghdXNlcj8uYWN0aXZlIHx8ICF2ZXJpZnlQYXNzd29yZChwYXNzd29yZCwgdXNlci5wYXNzd29yZF9oYXNoKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IG1lbWJlcnNoaXAgPSB1bmRlZmluZWQ7XG4gIGxldCByb2xlOiBQbGF0Zm9ybVJvbGUgPSBcInBsYXRmb3JtX2FkbWluXCI7XG5cbiAgaWYgKHVzZXIucGxhdGZvcm1fcm9sZSAhPT0gXCJwbGF0Zm9ybV9hZG1pblwiKSB7XG4gICAgbWVtYmVyc2hpcCA9IGdldE1lbWJlcnNoaXBGb3JVc2VyKGRiLCB1c2VyLmlkKTtcbiAgICBpZiAoIW1lbWJlcnNoaXApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByb2xlID0gbWVtYmVyc2hpcC5yb2xlO1xuICB9XG5cbiAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmFuZG9tQnl0ZXMoMzIpLnRvU3RyaW5nKFwiYmFzZTY0dXJsXCIpO1xuICBjb25zdCB0b2tlbkhhc2ggPSBoYXNoVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIFNFU1NJT05fVFRMX01TKS50b0lTT1N0cmluZygpO1xuXG4gIGNvbnN0IHNlc3Npb25Sb3cgPSBkYi5wcmVwYXJlKGBcbiAgICBpbnNlcnQgaW50byBzZXNzaW9ucyAodXNlcl9pZCwgbWVtYmVyc2hpcF9pZCwgdG9rZW5faGFzaCwgZXhwaXJlc19hdCwgaXBfYWRkcmVzcywgdXNlcl9hZ2VudCwgY3JlYXRlZF9hdClcbiAgICB2YWx1ZXMgKD8sID8sID8sID8sID8sID8sID8pXG4gICAgcmV0dXJuaW5nIGlkXG4gIGApLmdldChcbiAgICB1c2VyLmlkLFxuICAgIG1lbWJlcnNoaXA/Lm1lbWJlcnNoaXBfaWQgPz8gbnVsbCxcbiAgICB0b2tlbkhhc2gsXG4gICAgZXhwaXJlc0F0LFxuICAgIG1ldGFkYXRhPy5pcCA/PyBudWxsLFxuICAgIG1ldGFkYXRhPy51c2VyQWdlbnQgPz8gbnVsbCxcbiAgICBub3dJc28oKSxcbiAgKSBhcyB7IGlkOiBudW1iZXIgfTtcblxuICB3cml0ZUF1ZGl0TG9nKGRiLCB7XG4gICAgdGVuYW50SWQ6IG1lbWJlcnNoaXA/LnRlbmFudF9pZCA/PyBudWxsLFxuICAgIGFjdG9yVXNlcklkOiB1c2VyLmlkLFxuICAgIGFjdGlvbjogXCJhdXRoLmxvZ2luXCIsXG4gICAgcGF5bG9hZDoge1xuICAgICAgcm9sZSxcbiAgICAgIHNlc3Npb25JZDogc2Vzc2lvblJvdy5pZCxcbiAgICAgIGlwOiBtZXRhZGF0YT8uaXAgPz8gbnVsbCxcbiAgICB9LFxuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb246IGJ1aWxkU2Vzc2lvblBheWxvYWQoe1xuICAgICAgc2Vzc2lvbklkOiBzZXNzaW9uUm93LmlkLFxuICAgICAgdXNlcixcbiAgICAgIG1lbWJlcnNoaXAsXG4gICAgICBleHBpcmVzQXQsXG4gICAgfSksXG4gICAgY29va2llSGVhZGVyOiBzZXJpYWxpemVDb29raWUoU0VTU0lPTl9DT09LSUVfTkFNRSwgc2Vzc2lvblRva2VuLCBNYXRoLmZsb29yKFNFU1NJT05fVFRMX01TIC8gMTAwMCkpLFxuICB9O1xufVxuXG5mdW5jdGlvbiBidWlsZFNlc3Npb25QYXlsb2FkKGlucHV0OiB7XG4gIHNlc3Npb25JZDogbnVtYmVyO1xuICB1c2VyOiB7XG4gICAgaWQ6IG51bWJlcjtcbiAgICBlbWFpbDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBwbGF0Zm9ybV9yb2xlOiBcInBsYXRmb3JtX2FkbWluXCIgfCBcInRlbmFudF91c2VyXCI7XG4gIH07XG4gIG1lbWJlcnNoaXA6XG4gICAgfCB7XG4gICAgICAgIG1lbWJlcnNoaXBfaWQ6IG51bWJlcjtcbiAgICAgICAgdGVuYW50X2lkOiBudW1iZXI7XG4gICAgICAgIHJvbGU6IFwib3duZXJcIiB8IFwic2VsbGVyXCI7XG4gICAgICAgIHNhbGVzX2dvYWxfbW9udGhseTogbnVtYmVyIHwgbnVsbDtcbiAgICAgICAgdGVuYW50X25hbWU6IHN0cmluZztcbiAgICAgICAgdGVuYW50X3NsdWc6IHN0cmluZztcbiAgICAgICAgdGVuYW50X3N0YXR1czogVGVuYW50U3RhdHVzO1xuICAgICAgICB0cmlhbF9lbmRzX2F0OiBzdHJpbmc7XG4gICAgICAgIHBsYW5fY29kZTogc3RyaW5nO1xuICAgICAgfVxuICAgIHwgdW5kZWZpbmVkO1xuICBleHBpcmVzQXQ6IHN0cmluZztcbn0pOiBBdXRoZW50aWNhdGVkU2Vzc2lvbiB7XG4gIHJldHVybiB7XG4gICAgc2Vzc2lvbklkOiBpbnB1dC5zZXNzaW9uSWQsXG4gICAgdXNlcklkOiBpbnB1dC51c2VyLmlkLFxuICAgIG1lbWJlcnNoaXBJZDogaW5wdXQubWVtYmVyc2hpcD8ubWVtYmVyc2hpcF9pZCA/PyBudWxsLFxuICAgIGVtYWlsOiBpbnB1dC51c2VyLmVtYWlsLFxuICAgIG5hbWU6IGlucHV0LnVzZXIubmFtZSxcbiAgICByb2xlOiBpbnB1dC51c2VyLnBsYXRmb3JtX3JvbGUgPT09IFwicGxhdGZvcm1fYWRtaW5cIiA/IFwicGxhdGZvcm1fYWRtaW5cIiA6IChpbnB1dC5tZW1iZXJzaGlwPy5yb2xlID8/IFwic2VsbGVyXCIpLFxuICAgIHRlbmFudElkOiBpbnB1dC5tZW1iZXJzaGlwPy50ZW5hbnRfaWQgPz8gbnVsbCxcbiAgICB0ZW5hbnROYW1lOiBpbnB1dC5tZW1iZXJzaGlwPy50ZW5hbnRfbmFtZSA/PyBudWxsLFxuICAgIHRlbmFudFNsdWc6IGlucHV0Lm1lbWJlcnNoaXA/LnRlbmFudF9zbHVnID8/IG51bGwsXG4gICAgdGVuYW50U3RhdHVzOiBpbnB1dC5tZW1iZXJzaGlwPy50ZW5hbnRfc3RhdHVzID8/IG51bGwsXG4gICAgdHJpYWxFbmRzQXQ6IGlucHV0Lm1lbWJlcnNoaXA/LnRyaWFsX2VuZHNfYXQgPz8gbnVsbCxcbiAgICBwbGFuQ29kZTogaW5wdXQubWVtYmVyc2hpcD8ucGxhbl9jb2RlID8/IG51bGwsXG4gICAgc2FsZXNHb2FsTW9udGhseTogaW5wdXQubWVtYmVyc2hpcD8uc2FsZXNfZ29hbF9tb250aGx5ID8/IG51bGwsXG4gICAgZXhwaXJlc0F0OiBpbnB1dC5leHBpcmVzQXQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXNzaW9uRnJvbUNvb2tpZShjb29raWVIZWFkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuICBjb25zdCByYXcgPSBjb29raWVIZWFkZXJcbiAgICA/LnNwbGl0KFwiO1wiKVxuICAgIC5tYXAoKHBhcnQpID0+IHBhcnQudHJpbSgpKVxuICAgIC5maW5kKChwYXJ0KSA9PiBwYXJ0LnN0YXJ0c1dpdGgoYCR7U0VTU0lPTl9DT09LSUVfTkFNRX09YCkpO1xuXG4gIGNvbnN0IHRva2VuID0gcmF3Py5zbGljZShgJHtTRVNTSU9OX0NPT0tJRV9OQU1FfT1gLmxlbmd0aCk7XG4gIGlmICghdG9rZW4pIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IGRiID0gZ2V0RGF0YWJhc2UoKTtcbiAgY29uc3Qgcm93ID0gZGIucHJlcGFyZShgXG4gICAgc2VsZWN0XG4gICAgICBzLmlkIGFzIHNlc3Npb25faWQsXG4gICAgICBzLmV4cGlyZXNfYXQsXG4gICAgICBzLnJldm9rZWRfYXQsXG4gICAgICB1LmlkIGFzIHVzZXJfaWQsXG4gICAgICB1LmVtYWlsLFxuICAgICAgdS5uYW1lLFxuICAgICAgdS5wbGF0Zm9ybV9yb2xlLFxuICAgICAgbS5pZCBhcyBtZW1iZXJzaGlwX2lkLFxuICAgICAgbS5yb2xlIGFzIG1lbWJlcnNoaXBfcm9sZSxcbiAgICAgIG0uc2FsZXNfZ29hbF9tb250aGx5LFxuICAgICAgdC5pZCBhcyB0ZW5hbnRfaWQsXG4gICAgICB0Lm5hbWUgYXMgdGVuYW50X25hbWUsXG4gICAgICB0LnNsdWcgYXMgdGVuYW50X3NsdWcsXG4gICAgICB0LnN0YXR1cyBhcyB0ZW5hbnRfc3RhdHVzLFxuICAgICAgdC50cmlhbF9lbmRzX2F0LFxuICAgICAgdC5wbGFuX2NvZGVcbiAgICBmcm9tIHNlc3Npb25zIHNcbiAgICBqb2luIHVzZXJzIHUgb24gdS5pZCA9IHMudXNlcl9pZFxuICAgIGxlZnQgam9pbiBtZW1iZXJzaGlwcyBtIG9uIG0uaWQgPSBzLm1lbWJlcnNoaXBfaWRcbiAgICBsZWZ0IGpvaW4gdGVuYW50cyB0IG9uIHQuaWQgPSBtLnRlbmFudF9pZFxuICAgIHdoZXJlIHMudG9rZW5faGFzaCA9ID9cbiAgYCkuZ2V0KGhhc2hUb2tlbih0b2tlbikpIGFzIHtcbiAgICBzZXNzaW9uX2lkOiBudW1iZXI7XG4gICAgZXhwaXJlc19hdDogc3RyaW5nO1xuICAgIHJldm9rZWRfYXQ6IHN0cmluZyB8IG51bGw7XG4gICAgdXNlcl9pZDogbnVtYmVyO1xuICAgIGVtYWlsOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHBsYXRmb3JtX3JvbGU6IFwicGxhdGZvcm1fYWRtaW5cIiB8IFwidGVuYW50X3VzZXJcIjtcbiAgICBtZW1iZXJzaGlwX2lkOiBudW1iZXIgfCBudWxsO1xuICAgIG1lbWJlcnNoaXBfcm9sZTogXCJvd25lclwiIHwgXCJzZWxsZXJcIiB8IG51bGw7XG4gICAgc2FsZXNfZ29hbF9tb250aGx5OiBudW1iZXIgfCBudWxsO1xuICAgIHRlbmFudF9pZDogbnVtYmVyIHwgbnVsbDtcbiAgICB0ZW5hbnRfbmFtZTogc3RyaW5nIHwgbnVsbDtcbiAgICB0ZW5hbnRfc2x1Zzogc3RyaW5nIHwgbnVsbDtcbiAgICB0ZW5hbnRfc3RhdHVzOiBUZW5hbnRTdGF0dXMgfCBudWxsO1xuICAgIHRyaWFsX2VuZHNfYXQ6IHN0cmluZyB8IG51bGw7XG4gICAgcGxhbl9jb2RlOiBzdHJpbmcgfCBudWxsO1xuICB9IHwgdW5kZWZpbmVkO1xuXG4gIGlmICghcm93IHx8IHJvdy5yZXZva2VkX2F0IHx8IG5ldyBEYXRlKHJvdy5leHBpcmVzX2F0KS5nZXRUaW1lKCkgPD0gRGF0ZS5ub3coKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKHJvdy50ZW5hbnRfc3RhdHVzID09PSBcInRyaWFsXCIgJiYgcm93LnRyaWFsX2VuZHNfYXQgJiYgbmV3IERhdGUocm93LnRyaWFsX2VuZHNfYXQpLmdldFRpbWUoKSA8PSBEYXRlLm5vdygpKSB7XG4gICAgZGIucHJlcGFyZShcInVwZGF0ZSB0ZW5hbnRzIHNldCBzdGF0dXMgPSAncGFzdF9kdWUnLCB1cGRhdGVkX2F0ID0gPyB3aGVyZSBpZCA9ID9cIikucnVuKG5vd0lzbygpLCByb3cudGVuYW50X2lkKTtcbiAgICByb3cudGVuYW50X3N0YXR1cyA9IFwicGFzdF9kdWVcIjtcbiAgfVxuXG4gIGlmIChyb3cudGVuYW50X3N0YXR1cyA9PT0gXCJibG9ja2VkXCIgfHwgcm93LnRlbmFudF9zdGF0dXMgPT09IFwiY2xvc2VkXCIpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc2Vzc2lvbklkOiByb3cuc2Vzc2lvbl9pZCxcbiAgICAgIHVzZXJJZDogcm93LnVzZXJfaWQsXG4gICAgICBtZW1iZXJzaGlwSWQ6IHJvdy5tZW1iZXJzaGlwX2lkLFxuICAgICAgZW1haWw6IHJvdy5lbWFpbCxcbiAgICAgIG5hbWU6IHJvdy5uYW1lLFxuICAgICAgcm9sZTogcm93LnBsYXRmb3JtX3JvbGUgPT09IFwicGxhdGZvcm1fYWRtaW5cIiA/IFwicGxhdGZvcm1fYWRtaW5cIiA6ICgocm93Lm1lbWJlcnNoaXBfcm9sZSA/PyBcInNlbGxlclwiKSBhcyBQbGF0Zm9ybVJvbGUpLFxuICAgICAgdGVuYW50SWQ6IHJvdy50ZW5hbnRfaWQsXG4gICAgICB0ZW5hbnROYW1lOiByb3cudGVuYW50X25hbWUsXG4gICAgICB0ZW5hbnRTbHVnOiByb3cudGVuYW50X3NsdWcsXG4gICAgICB0ZW5hbnRTdGF0dXM6IHJvdy50ZW5hbnRfc3RhdHVzLFxuICAgICAgdHJpYWxFbmRzQXQ6IHJvdy50cmlhbF9lbmRzX2F0LFxuICAgICAgcGxhbkNvZGU6IHJvdy5wbGFuX2NvZGUsXG4gICAgICBzYWxlc0dvYWxNb250aGx5OiByb3cuc2FsZXNfZ29hbF9tb250aGx5LFxuICAgICAgZXhwaXJlc0F0OiByb3cuZXhwaXJlc19hdCxcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uSWQ6IHJvdy5zZXNzaW9uX2lkLFxuICAgIHVzZXJJZDogcm93LnVzZXJfaWQsXG4gICAgbWVtYmVyc2hpcElkOiByb3cubWVtYmVyc2hpcF9pZCxcbiAgICBlbWFpbDogcm93LmVtYWlsLFxuICAgIG5hbWU6IHJvdy5uYW1lLFxuICAgIHJvbGU6IHJvdy5wbGF0Zm9ybV9yb2xlID09PSBcInBsYXRmb3JtX2FkbWluXCIgPyBcInBsYXRmb3JtX2FkbWluXCIgOiAoKHJvdy5tZW1iZXJzaGlwX3JvbGUgPz8gXCJzZWxsZXJcIikgYXMgUGxhdGZvcm1Sb2xlKSxcbiAgICB0ZW5hbnRJZDogcm93LnRlbmFudF9pZCxcbiAgICB0ZW5hbnROYW1lOiByb3cudGVuYW50X25hbWUsXG4gICAgdGVuYW50U2x1Zzogcm93LnRlbmFudF9zbHVnLFxuICAgIHRlbmFudFN0YXR1czogcm93LnRlbmFudF9zdGF0dXMsXG4gICAgdHJpYWxFbmRzQXQ6IHJvdy50cmlhbF9lbmRzX2F0LFxuICAgIHBsYW5Db2RlOiByb3cucGxhbl9jb2RlLFxuICAgIHNhbGVzR29hbE1vbnRobHk6IHJvdy5zYWxlc19nb2FsX21vbnRobHksXG4gICAgZXhwaXJlc0F0OiByb3cuZXhwaXJlc19hdCxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldm9rZVNlc3Npb24oc2Vzc2lvbklkOiBudW1iZXIpIHtcbiAgZ2V0RGF0YWJhc2UoKS5wcmVwYXJlKFwidXBkYXRlIHNlc3Npb25zIHNldCByZXZva2VkX2F0ID0gPyB3aGVyZSBpZCA9ID9cIikucnVuKG5vd0lzbygpLCBzZXNzaW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdFN0b3JlcygpIHtcbiAgY29uc3Qgcm93cyA9IGdldERhdGFiYXNlKCkucHJlcGFyZShgXG4gICAgc2VsZWN0XG4gICAgICB0LmlkLFxuICAgICAgdC5uYW1lLFxuICAgICAgdC5zbHVnLFxuICAgICAgdC5zdGF0dXMsXG4gICAgICB0LnBsYW5fY29kZSxcbiAgICAgIHQubWF4X3VzZXJzLFxuICAgICAgdC50cmlhbF9lbmRzX2F0LFxuICAgICAgKFxuICAgICAgICBzZWxlY3QgY291bnQoKilcbiAgICAgICAgZnJvbSBtZW1iZXJzaGlwcyBtXG4gICAgICAgIHdoZXJlIG0udGVuYW50X2lkID0gdC5pZCBhbmQgbS5hY3RpdmUgPSAxXG4gICAgICApIGFzIHVzZXJzX2NvdW50LFxuICAgICAgKFxuICAgICAgICBzZWxlY3QgdS5uYW1lXG4gICAgICAgIGZyb20gbWVtYmVyc2hpcHMgbVxuICAgICAgICBqb2luIHVzZXJzIHUgb24gdS5pZCA9IG0udXNlcl9pZFxuICAgICAgICB3aGVyZSBtLnRlbmFudF9pZCA9IHQuaWQgYW5kIG0ucm9sZSA9ICdvd25lcidcbiAgICAgICAgb3JkZXIgYnkgbS5pZCBhc2NcbiAgICAgICAgbGltaXQgMVxuICAgICAgKSBhcyBvd25lcl9uYW1lLFxuICAgICAgKFxuICAgICAgICBzZWxlY3QgdS5lbWFpbFxuICAgICAgICBmcm9tIG1lbWJlcnNoaXBzIG1cbiAgICAgICAgam9pbiB1c2VycyB1IG9uIHUuaWQgPSBtLnVzZXJfaWRcbiAgICAgICAgd2hlcmUgbS50ZW5hbnRfaWQgPSB0LmlkIGFuZCBtLnJvbGUgPSAnb3duZXInXG4gICAgICAgIG9yZGVyIGJ5IG0uaWQgYXNjXG4gICAgICAgIGxpbWl0IDFcbiAgICAgICkgYXMgb3duZXJfZW1haWxcbiAgICBmcm9tIHRlbmFudHMgdFxuICAgIG9yZGVyIGJ5IHQuY3JlYXRlZF9hdCBkZXNjXG4gIGApLmFsbCgpIGFzIEFycmF5PFJlY29yZDxzdHJpbmcsIHVua25vd24+PjtcblxuICByZXR1cm4gcm93cztcbn1cblxudHlwZSBBdWRpdFJvdyA9IHtcbiAgaWQ6IG51bWJlcjtcbiAgYWN0aW9uOiBzdHJpbmc7XG4gIHBheWxvYWRfanNvbjogc3RyaW5nO1xuICBjcmVhdGVkX2F0OiBzdHJpbmc7XG4gIHRlbmFudF9pZDogbnVtYmVyIHwgbnVsbDtcbiAgdGVuYW50X25hbWU6IHN0cmluZyB8IG51bGw7XG4gIGFjdG9yX25hbWU6IHN0cmluZyB8IG51bGw7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbGlzdFBsYXRmb3JtQXVkaXRFdmVudHMobGltaXQgPSAyMCkge1xuICBjb25zdCByb3dzID0gZ2V0RGF0YWJhc2UoKS5wcmVwYXJlKGBcbiAgICBzZWxlY3RcbiAgICAgIGEuaWQsXG4gICAgICBhLmFjdGlvbixcbiAgICAgIGEucGF5bG9hZF9qc29uLFxuICAgICAgYS5jcmVhdGVkX2F0LFxuICAgICAgYS50ZW5hbnRfaWQsXG4gICAgICB0Lm5hbWUgYXMgdGVuYW50X25hbWUsXG4gICAgICB1Lm5hbWUgYXMgYWN0b3JfbmFtZVxuICAgIGZyb20gYXVkaXRfbG9nIGFcbiAgICBsZWZ0IGpvaW4gdGVuYW50cyB0IG9uIHQuaWQgPSBhLnRlbmFudF9pZFxuICAgIGxlZnQgam9pbiB1c2VycyB1IG9uIHUuaWQgPSBhLmFjdG9yX3VzZXJfaWRcbiAgICBvcmRlciBieSBhLmNyZWF0ZWRfYXQgZGVzYywgYS5pZCBkZXNjXG4gICAgbGltaXQgP1xuICBgKS5hbGwobGltaXQpIGFzIEF1ZGl0Um93W107XG5cbiAgcmV0dXJuIHJvd3MubWFwKChyb3cpID0+ICh7XG4gICAgaWQ6IHJvdy5pZCxcbiAgICBhY3Rpb246IHJvdy5hY3Rpb24sXG4gICAgcGF5bG9hZDogcGFyc2VKc29uKHJvdy5wYXlsb2FkX2pzb24sIHt9KSxcbiAgICBjcmVhdGVkQXQ6IHJvdy5jcmVhdGVkX2F0LFxuICAgIHRlbmFudElkOiByb3cudGVuYW50X2lkLFxuICAgIHRlbmFudE5hbWU6IHJvdy50ZW5hbnRfbmFtZSxcbiAgICBhY3Rvck5hbWU6IHJvdy5hY3Rvcl9uYW1lLFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaXN0VGVuYW50QXVkaXRFdmVudHMoYWN0b3I6IEF1dGhlbnRpY2F0ZWRTZXNzaW9uLCBsaW1pdCA9IDIwKSB7XG4gIGlmICghYWN0b3IudGVuYW50SWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJVc3VhcmlvIHNlbSBsb2phIHZpbmN1bGFkYS5cIik7XG4gIH1cblxuICBjb25zdCByb3dzID0gZ2V0RGF0YWJhc2UoKS5wcmVwYXJlKGBcbiAgICBzZWxlY3RcbiAgICAgIGEuaWQsXG4gICAgICBhLmFjdGlvbixcbiAgICAgIGEucGF5bG9hZF9qc29uLFxuICAgICAgYS5jcmVhdGVkX2F0LFxuICAgICAgYS50ZW5hbnRfaWQsXG4gICAgICB0Lm5hbWUgYXMgdGVuYW50X25hbWUsXG4gICAgICB1Lm5hbWUgYXMgYWN0b3JfbmFtZVxuICAgIGZyb20gYXVkaXRfbG9nIGFcbiAgICBsZWZ0IGpvaW4gdGVuYW50cyB0IG9uIHQuaWQgPSBhLnRlbmFudF9pZFxuICAgIGxlZnQgam9pbiB1c2VycyB1IG9uIHUuaWQgPSBhLmFjdG9yX3VzZXJfaWRcbiAgICB3aGVyZSBhLnRlbmFudF9pZCA9ID9cbiAgICBvcmRlciBieSBhLmNyZWF0ZWRfYXQgZGVzYywgYS5pZCBkZXNjXG4gICAgbGltaXQgP1xuICBgKS5hbGwoYWN0b3IudGVuYW50SWQsIGxpbWl0KSBhcyBBdWRpdFJvd1tdO1xuXG4gIHJldHVybiByb3dzLm1hcCgocm93KSA9PiAoe1xuICAgIGlkOiByb3cuaWQsXG4gICAgYWN0aW9uOiByb3cuYWN0aW9uLFxuICAgIHBheWxvYWQ6IHBhcnNlSnNvbihyb3cucGF5bG9hZF9qc29uLCB7fSksXG4gICAgY3JlYXRlZEF0OiByb3cuY3JlYXRlZF9hdCxcbiAgICB0ZW5hbnRJZDogcm93LnRlbmFudF9pZCxcbiAgICB0ZW5hbnROYW1lOiByb3cudGVuYW50X25hbWUsXG4gICAgYWN0b3JOYW1lOiByb3cuYWN0b3JfbmFtZSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlzdFRlbmFudE1lbWJlcnNCeVRlbmFudElkKHRlbmFudElkOiBudW1iZXIpIHtcbiAgY29uc3Qgcm93cyA9IGdldERhdGFiYXNlKCkucHJlcGFyZShgXG4gICAgc2VsZWN0XG4gICAgICBtLmlkLFxuICAgICAgdS5uYW1lIGFzIG5vbWUsXG4gICAgICB1LmVtYWlsLFxuICAgICAgbS5yb2xlIGFzIHBhcGVsLFxuICAgICAgbS5hY3RpdmUgYXMgYXRpdm8sXG4gICAgICBtLnNhbGVzX2dvYWxfbW9udGhseSBhcyBtZXRhX21lbnNhbCxcbiAgICAgIG0uY3JlYXRlZF9hdCBhcyBjcmlhZG9fZW1cbiAgICBmcm9tIG1lbWJlcnNoaXBzIG1cbiAgICBqb2luIHVzZXJzIHUgb24gdS5pZCA9IG0udXNlcl9pZFxuICAgIHdoZXJlIG0udGVuYW50X2lkID0gP1xuICAgIG9yZGVyIGJ5IGNhc2Ugd2hlbiBtLnJvbGUgPSAnb3duZXInIHRoZW4gMCBlbHNlIDEgZW5kLCB1Lm5hbWUgYXNjXG4gIGApLmFsbCh0ZW5hbnRJZCkgYXMgTWVtYmVyUm93W107XG5cbiAgcmV0dXJuIHJvd3M7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaXN0VGVuYW50TWVtYmVycyhhY3RvcjogQXV0aGVudGljYXRlZFNlc3Npb24pIHtcbiAgaWYgKCFhY3Rvci50ZW5hbnRJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlVzdWFyaW8gc2VtIGxvamEgdmluY3VsYWRhLlwiKTtcbiAgfVxuXG4gIHJldHVybiBsaXN0VGVuYW50TWVtYmVyc0J5VGVuYW50SWQoYWN0b3IudGVuYW50SWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGVuYW50QXBwU3RhdGUoYWN0b3I6IEF1dGhlbnRpY2F0ZWRTZXNzaW9uKSB7XG4gIGlmICghYWN0b3IudGVuYW50SWQpIHtcbiAgICByZXR1cm4gY3JlYXRlRW1wdHlBcHBTdGF0ZSgpO1xuICB9XG5cbiAgY29uc3Qgcm93ID0gZ2V0RGF0YWJhc2UoKS5wcmVwYXJlKGBcbiAgICBzZWxlY3QgdmVpY3Vsb3NfanNvbiwgbGVhZHNfanNvbiwgdmVuZGFzX2pzb24sIGNvbnN1bHRhc19qc29uLCB0YXJlZmFzX2pzb24sIGN1c3Rvc19qc29uLCBjb25maWdfanNvbiwgbWVtb3JpYV9qc29uXG4gICAgZnJvbSB0ZW5hbnRfc3RhdGVcbiAgICB3aGVyZSB0ZW5hbnRfaWQgPSA/XG4gIGApLmdldChhY3Rvci50ZW5hbnRJZCkgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblxuICBjb25zdCB2ZW5kZWRvcmVzID0gbGlzdFRlbmFudE1lbWJlcnMoYWN0b3IpLm1hcCgobWVtYmVyKSA9PiAoe1xuICAgIGlkOiBTdHJpbmcobWVtYmVyLmlkKSxcbiAgICBub21lOiBtZW1iZXIubm9tZSxcbiAgICBtZXRhTWVuc2FsOiBtZW1iZXIubWV0YV9tZW5zYWwgPz8gdW5kZWZpbmVkLFxuICB9KSk7XG5cbiAgaWYgKCFyb3cpIHtcbiAgICByZXR1cm4gY3JlYXRlRW1wdHlBcHBTdGF0ZSh7IHZlbmRlZG9yZXMgfSk7XG4gIH1cblxuICByZXR1cm4gY3JlYXRlRW1wdHlBcHBTdGF0ZSh7XG4gICAgdmVuZGVkb3JlcyxcbiAgICB2ZWljdWxvczogcGFyc2VKc29uKHJvdy52ZWljdWxvc19qc29uLCBBUFBfU1RBVEVfREVGQVVMVFMudmVpY3Vsb3MpLFxuICAgIGxlYWRzOiBwYXJzZUpzb24ocm93LmxlYWRzX2pzb24sIEFQUF9TVEFURV9ERUZBVUxUUy5sZWFkcyksXG4gICAgdmVuZGFzOiBwYXJzZUpzb24ocm93LnZlbmRhc19qc29uLCBBUFBfU1RBVEVfREVGQVVMVFMudmVuZGFzKSxcbiAgICBjb25zdWx0YXM6IHBhcnNlSnNvbihyb3cuY29uc3VsdGFzX2pzb24sIEFQUF9TVEFURV9ERUZBVUxUUy5jb25zdWx0YXMpLFxuICAgIHRhcmVmYXNQb3NWZW5kYTogcGFyc2VKc29uKHJvdy50YXJlZmFzX2pzb24sIEFQUF9TVEFURV9ERUZBVUxUUy50YXJlZmFzUG9zVmVuZGEpLFxuICAgIGN1c3RvczogcGFyc2VKc29uKHJvdy5jdXN0b3NfanNvbiwgQVBQX1NUQVRFX0RFRkFVTFRTLmN1c3RvcyksXG4gICAgY29uZmlnUHJlY29zOiB7IC4uLkFQUF9TVEFURV9ERUZBVUxUUy5jb25maWdQcmVjb3MsIC4uLnBhcnNlSnNvbihyb3cuY29uZmlnX2pzb24sIHt9KSB9LFxuICAgIG1lbW9yaWFMb2phOiB7IC4uLkFQUF9TVEFURV9ERUZBVUxUUy5tZW1vcmlhTG9qYSwgLi4ucGFyc2VKc29uKHJvdy5tZW1vcmlhX2pzb24sIHt9KSB9LFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVRlbmFudEFwcFN0YXRlKGFjdG9yOiBBdXRoZW50aWNhdGVkU2Vzc2lvbiwgcGF0Y2g6IEFwcFN0YXRlUmVzb3VyY2VQYXRjaCkge1xuICBpZiAoIWFjdG9yLnRlbmFudElkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVXN1YXJpbyBzZW0gbG9qYSB2aW5jdWxhZGEuXCIpO1xuICB9XG5cbiAgaWYgKGFjdG9yLnJvbGUgPT09IFwic2VsbGVyXCIgJiYgKHBhdGNoLmNvbmZpZ1ByZWNvcyAhPT0gdW5kZWZpbmVkIHx8IHBhdGNoLm1lbW9yaWFMb2phICE9PSB1bmRlZmluZWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiU2VsbGVyIG5hbyBwb2RlIGFsdGVyYXIgY29uZmlndXJhY29lcyBhZG1pbmlzdHJhdGl2YXMgZGEgbG9qYS5cIik7XG4gIH1cblxuICBjb25zdCBkYiA9IGdldERhdGFiYXNlKCk7XG4gIGRiLnByZXBhcmUoYFxuICAgIGluc2VydCBpbnRvIHRlbmFudF9zdGF0ZSAoXG4gICAgICB0ZW5hbnRfaWQsIHZlaWN1bG9zX2pzb24sIGxlYWRzX2pzb24sIHZlbmRhc19qc29uLCBjb25zdWx0YXNfanNvbiwgdGFyZWZhc19qc29uLCBjdXN0b3NfanNvbiwgY29uZmlnX2pzb24sIG1lbW9yaWFfanNvbiwgY3JlYXRlZF9hdCwgdXBkYXRlZF9hdFxuICAgIClcbiAgICB2YWx1ZXMgKD8sICdbXScsICdbXScsICdbXScsICdbXScsICdbXScsICdbXScsICd7fScsICd7fScsID8sID8pXG4gICAgb24gY29uZmxpY3QodGVuYW50X2lkKSBkbyBub3RoaW5nXG4gIGApLnJ1bihhY3Rvci50ZW5hbnRJZCwgbm93SXNvKCksIG5vd0lzbygpKTtcblxuICBjb25zdCBzdGF0ZW1lbnRzID0gT2JqZWN0LmVudHJpZXMocGF0Y2gpXG4gICAgLmZpbHRlcigoWywgdmFsdWVdKSA9PiB2YWx1ZSAhPT0gdW5kZWZpbmVkKVxuICAgIC5tYXAoKFtrZXksIHZhbHVlXSkgPT4gKHtcbiAgICAgIGNvbHVtbjogcmVzb3VyY2VLZXkoa2V5IGFzIGtleW9mIE9taXQ8QXBwU3RhdGVTbmFwc2hvdCwgXCJ2ZW5kZWRvcmVzXCI+KSxcbiAgICAgIHZhbHVlOiBKU09OLnN0cmluZ2lmeSh2YWx1ZSksXG4gICAgfSkpO1xuXG4gIGlmICghc3RhdGVtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZ2V0VGVuYW50QXBwU3RhdGUoYWN0b3IpO1xuICB9XG5cbiAgZGIuZXhlYyhcImJlZ2luXCIpO1xuICB0cnkge1xuICAgIGZvciAoY29uc3Qgc3RhdGVtZW50IG9mIHN0YXRlbWVudHMpIHtcbiAgICAgIGRiLnByZXBhcmUoYHVwZGF0ZSB0ZW5hbnRfc3RhdGUgc2V0ICR7c3RhdGVtZW50LmNvbHVtbn0gPSA/LCB1cGRhdGVkX2F0ID0gPyB3aGVyZSB0ZW5hbnRfaWQgPSA/YCkucnVuKFxuICAgICAgICBzdGF0ZW1lbnQudmFsdWUsXG4gICAgICAgIG5vd0lzbygpLFxuICAgICAgICBhY3Rvci50ZW5hbnRJZCxcbiAgICAgICk7XG4gICAgfVxuICAgIGRiLmV4ZWMoXCJjb21taXRcIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgZGIuZXhlYyhcInJvbGxiYWNrXCIpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgd3JpdGVBdWRpdExvZyhkYiwge1xuICAgIHRlbmFudElkOiBhY3Rvci50ZW5hbnRJZCxcbiAgICBhY3RvclVzZXJJZDogYWN0b3IudXNlcklkLFxuICAgIGFjdGlvbjogXCJ0ZW5hbnQuc3RhdGUudXBkYXRlZFwiLFxuICAgIHBheWxvYWQ6IHtcbiAgICAgIHJlc291cmNlczogT2JqZWN0LmtleXMocGF0Y2gpLmZpbHRlcigoa2V5KSA9PiBwYXRjaFtrZXkgYXMga2V5b2YgdHlwZW9mIHBhdGNoXSAhPT0gdW5kZWZpbmVkKSxcbiAgICAgIHJvbGU6IGFjdG9yLnJvbGUsXG4gICAgfSxcbiAgfSk7XG5cbiAgcmV0dXJuIGdldFRlbmFudEFwcFN0YXRlKGFjdG9yKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlc3Npb25Ub1Jlc3BvbnNlKHNlc3Npb246IEF1dGhlbnRpY2F0ZWRTZXNzaW9uKSB7XG4gIGNvbnN0IGRheXNSZW1haW5pbmcgPSBzZXNzaW9uLnRyaWFsRW5kc0F0XG4gICAgPyBNYXRoLm1heCgwLCBNYXRoLmNlaWwoKG5ldyBEYXRlKHNlc3Npb24udHJpYWxFbmRzQXQpLmdldFRpbWUoKSAtIERhdGUubm93KCkpIC8gODZfNDAwXzAwMCkpXG4gICAgOiBudWxsO1xuXG4gIHJldHVybiB7XG4gICAgYXV0aGVudGljYXRlZDogdHJ1ZSxcbiAgICB1c2VyOiB7XG4gICAgICBpZDogU3RyaW5nKHNlc3Npb24udXNlcklkKSxcbiAgICAgIG1lbWJlcnNoaXBJZDogc2Vzc2lvbi5tZW1iZXJzaGlwSWQgPyBTdHJpbmcoc2Vzc2lvbi5tZW1iZXJzaGlwSWQpIDogbnVsbCxcbiAgICAgIGVtYWlsOiBzZXNzaW9uLmVtYWlsLFxuICAgICAgbmFtZTogc2Vzc2lvbi5uYW1lLFxuICAgICAgcm9sZTogc2Vzc2lvbi5yb2xlLFxuICAgICAgc2FsZXNHb2FsTW9udGhseTogc2Vzc2lvbi5zYWxlc0dvYWxNb250aGx5LFxuICAgIH0sXG4gICAgdGVuYW50OiBzZXNzaW9uLnRlbmFudElkXG4gICAgICA/IHtcbiAgICAgICAgICBpZDogU3RyaW5nKHNlc3Npb24udGVuYW50SWQpLFxuICAgICAgICAgIG5hbWU6IHNlc3Npb24udGVuYW50TmFtZSxcbiAgICAgICAgICBzbHVnOiBzZXNzaW9uLnRlbmFudFNsdWcsXG4gICAgICAgICAgc3RhdHVzOiBzZXNzaW9uLnRlbmFudFN0YXR1cyxcbiAgICAgICAgICB0cmlhbEVuZHNBdDogc2Vzc2lvbi50cmlhbEVuZHNBdCxcbiAgICAgICAgICBwbGFuQ29kZTogc2Vzc2lvbi5wbGFuQ29kZSxcbiAgICAgICAgICBkYXlzUmVtYWluaW5nLFxuICAgICAgICB9XG4gICAgICA6IG51bGwsXG4gICAgcGVybWlzc2lvbnM6IHtcbiAgICAgIGNhbk1hbmFnZVBsYXRmb3JtOiBzZXNzaW9uLnJvbGUgPT09IFwicGxhdGZvcm1fYWRtaW5cIixcbiAgICAgIGNhbk1hbmFnZVRlYW06IHNlc3Npb24ucm9sZSA9PT0gXCJvd25lclwiLFxuICAgIH0sXG4gICAgZXhwaXJlc0F0OiBzZXNzaW9uLmV4cGlyZXNBdCxcbiAgfTtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNyY1xcXFxzdG9yZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNyY1xcXFxzdG9yZVxcXFx0eXBlcy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvUEVEUk9TTy9Eb3dubG9hZHMvYXV0b3ZlbmRhLXByby1iMmItbWFpbi9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL3NyYy9zdG9yZS90eXBlcy50c1wiO2V4cG9ydCB0eXBlIFZlaWN1bG9TdGF0dXMgPSBcImRpc3Bvbml2ZWxcIiB8IFwicmVzZXJ2YWRvXCIgfCBcInZlbmRpZG9cIjtcblxuZXhwb3J0IGludGVyZmFjZSBBanVzdGVzRm90byB7XG4gIGJyaWxobzogbnVtYmVyO1xuICBjb250cmFzdGU6IG51bWJlcjtcbiAgc2F0dXJhY2FvOiBudW1iZXI7XG4gIGNhbG9yOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmVpY3VsbyB7XG4gIGlkOiBzdHJpbmc7XG4gIGZvdG9zOiBzdHJpbmdbXTtcbiAgZm90b3NEZXN0YXF1ZTogbnVtYmVyW107XG4gIG9yaWdlbT86IFwiZXN0b3F1ZVwiIHwgXCJzaW11bGFjYW9fY3VzdG9zXCI7XG4gIG1vZGVsbzogc3RyaW5nO1xuICBtYXJjYT86IHN0cmluZztcbiAgYW5vOiBzdHJpbmc7XG4gIGttPzogc3RyaW5nO1xuICBjb3I/OiBzdHJpbmc7XG4gIGNhbWJpbz86IHN0cmluZztcbiAgbXVsdGltaWRpYT86IFwic2ltXCIgfCBcIm5hb1wiO1xuICBvcGNpb25haXM/OiBzdHJpbmc7XG4gIGN1c3RvOiBzdHJpbmc7XG4gIHZhbG9yVmVuZGE6IHN0cmluZztcbiAgdmFsb3JGaXBlPzogc3RyaW5nO1xuICBsZWlsYW8/OiBib29sZWFuO1xuICBzaW5pc3Rybz86IGJvb2xlYW47XG4gIHN0YXR1czogVmVpY3Vsb1N0YXR1cztcbiAgZGVzY3JpY2FvT2x4Pzogc3RyaW5nO1xuICBkZXNjcmljYW9XaGF0c2FwcD86IHN0cmluZztcbiAgZGVzY3JpY2FvTWFya2V0cGxhY2U/OiBzdHJpbmc7XG4gIGhhc2h0YWdzPzogc3RyaW5nW107XG4gIHRpdHVsb0FudW5jaW8/OiBzdHJpbmc7XG4gIGZvdG9DYXBhSW5kZXg/OiBudW1iZXI7XG4gIGFqdXN0ZXNGb3RvPzogQWp1c3Rlc0ZvdG87XG4gIHBsYWNhPzogc3RyaW5nOyAvLyBwcmVlbmNoaWRvIG5hIGNvbnN1bHRhIHBlbGEgcGxhY2FcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XG4gIHZlbmRpZG9FbT86IHN0cmluZztcbiAgdmVuZGVkb3JJZD86IHN0cmluZztcbiAgYXJjaGl2ZWRBdD86IHN0cmluZztcbiAgZGVsZXRlZEF0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBMZWFkU3RhdHVzID1cbiAgfCBcIm5vdm9cIlxuICB8IFwiZW1fY29udGF0b1wiXG4gIHwgXCJwcm9wb3N0YVwiXG4gIHwgXCJhcHJvdmFjYW9cIlxuICB8IFwidGVzdF9kcml2ZVwiXG4gIHwgXCJyZXNlcnZhZG9cIlxuICB8IFwiZmVjaGFkb1wiXG4gIHwgXCJwZXJkaWRvXCI7XG5leHBvcnQgdHlwZSBMZWFkU291cmNlID0gXCJtYW51YWxcIiB8IFwibWFya2V0cGxhY2VcIiB8IFwid2hhdHNhcHBcIiB8IFwibWV0YV9hZHNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBMZWFkIHtcbiAgaWQ6IHN0cmluZztcbiAgbm9tZTogc3RyaW5nO1xuICB0ZWxlZm9uZTogc3RyaW5nO1xuICBpbnRlcmVzc2U6IHN0cmluZztcbiAgb3JpZ2VtOiBMZWFkU291cmNlO1xuICB2ZWljdWxvSWQ/OiBzdHJpbmc7XG4gIHZlaWN1bG9UZXh0bz86IHN0cmluZztcbiAgZGF0YTogc3RyaW5nO1xuICB2ZW5kZWRvcklkOiBzdHJpbmc7XG4gIHN0YXR1czogTGVhZFN0YXR1cztcbiAgaGlzdG9yaWNvOiBzdHJpbmdbXTtcbiAgYW5vdGFjb2VzOiBzdHJpbmc7XG4gIHByb3hpbWFBY2FvPzogc3RyaW5nO1xuICBwcm94aW1hQWNhb0VtPzogc3RyaW5nO1xuICB2YWxvclByb3Bvc3RhPzogbnVtYmVyIHwgbnVsbDtcbiAgdGVzdERyaXZlQXQ/OiBzdHJpbmc7XG4gIHJlc2VydmFkb0F0ZT86IHN0cmluZztcbiAgbW90aXZvUGVyZGE/OiBzdHJpbmc7XG4gIGFyY2hpdmVkQXQ/OiBzdHJpbmc7XG4gIGRlbGV0ZWRBdD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZW5kZWRvciB7XG4gIGlkOiBzdHJpbmc7XG4gIG5vbWU6IHN0cmluZztcbiAgYXZhdGFyPzogc3RyaW5nO1xuICBtZXRhTWVuc2FsPzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBNZW1vcmlhTG9qYVRvbSA9IFwiY29uc3VsdGl2b1wiIHwgXCJkaXJldG9cIiB8IFwicHJlbWl1bVwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV4ZW1wbG9NZW1vcmlhTG9qYSB7XG4gIG1vZGVsbzogc3RyaW5nO1xuICB0aXR1bG86IHN0cmluZztcbiAgZGVzY3JpY2FvOiBzdHJpbmc7XG4gIGNhdGVnb3JpYTogc3RyaW5nO1xuICBjcmlhZG9FbTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1lbW9yaWFMb2phIHtcbiAgdG9tRGVWb3o6IE1lbW9yaWFMb2phVG9tO1xuICBmb2Nvc0NvbWVyY2lhaXM6IHN0cmluZ1tdO1xuICBnYXRpbGhvc0ZpeG9zOiBzdHJpbmdbXTtcbiAgZnJhc2VzUmVjb3JyZW50ZXM6IHN0cmluZ1tdO1xuICBjYXRlZ29yaWFzTWFpc1VzYWRhczogc3RyaW5nW107XG4gIGV4ZW1wbG9zUmVjZW50ZXM6IEV4ZW1wbG9NZW1vcmlhTG9qYVtdO1xuICBhdHVhbGl6YWRvRW06IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRNZW1vcmlhTG9qYTogTWVtb3JpYUxvamEgPSB7XG4gIHRvbURlVm96OiBcImNvbnN1bHRpdm9cIixcbiAgZm9jb3NDb21lcmNpYWlzOiBbXCJmaW5hbmNpYW1lbnRvXCIsIFwidHJvY2FcIiwgXCJhZ2lsaWRhZGVcIiwgXCJjb25maWFuY2FcIl0sXG4gIGdhdGlsaG9zRml4b3M6IFtcbiAgICBcIkFjZWl0YW1vcyBmaW5hbmNpYW1lbnRvXCIsXG4gICAgXCJBdmFsaWFtb3Mgc2V1IHVzYWRvIG5hIHRyb2NhXCIsXG4gICAgXCJGYWxlIGNvbm9zY28gcGFyYSBtYWlzIGluZm9ybWFjb2VzXCIsXG4gIF0sXG4gIGZyYXNlc1JlY29ycmVudGVzOiBbXSxcbiAgY2F0ZWdvcmlhc01haXNVc2FkYXM6IFtdLFxuICBleGVtcGxvc1JlY2VudGVzOiBbXSxcbiAgYXR1YWxpemFkb0VtOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIFZlbmRhIHtcbiAgaWQ6IHN0cmluZztcbiAgdmVpY3Vsb0lkOiBzdHJpbmc7XG4gIHZlbmRlZG9ySWQ6IHN0cmluZztcbiAgdmFsb3I6IG51bWJlcjtcbiAgZGF0YTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnN1bHRhVmVpY3VsYXIge1xuICBpZDogc3RyaW5nO1xuICBwbGFjYTogc3RyaW5nO1xuICB2ZWljdWxvSWQ/OiBzdHJpbmc7XG4gIGRhdGE6IHN0cmluZztcbiAgcmVzdWx0YWRvOiB7XG4gICAgbWFyY2E6IHN0cmluZztcbiAgICBtb2RlbG86IHN0cmluZztcbiAgICBhbm86IHN0cmluZztcbiAgICBjb3I6IHN0cmluZztcbiAgICBzaXR1YWNhbzogc3RyaW5nO1xuICAgIG11bHRhczogbnVtYmVyIHwgbnVsbDtcbiAgICBkZWJpdG9zOiBzdHJpbmcgfCBudWxsO1xuICAgIGxlaWxhbzogYm9vbGVhbiB8IG51bGw7XG4gICAgcm91Ym86IGJvb2xlYW4gfCBudWxsO1xuICAgIHJlY2FsbD86IGJvb2xlYW4gfCBudWxsO1xuICAgIHZhbG9yRmlwZT86IHN0cmluZyB8IG51bGw7XG4gICAgY29kaWdvRmlwZT86IHN0cmluZyB8IG51bGw7XG4gICAgbWVzUmVmZXJlbmNpYUZpcGU/OiBzdHJpbmcgfCBudWxsO1xuICAgIGNvbWJ1c3RpdmVsRmlwZT86IHN0cmluZyB8IG51bGw7XG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29uZmlndXJhY2FvUHJlY29zIHtcbiAgcGludHVyYVBvclBlY2E6IG51bWJlcjtcbiAgcG5ldVBlcXVlbm86IG51bWJlcjtcbiAgcG5ldUdyYW5kZTogbnVtYmVyO1xuICBoaWdpZW5pemFjYW9QZXF1ZW5vOiBudW1iZXI7XG4gIGhpZ2llbml6YWNhb0dyYW5kZTogbnVtYmVyO1xuICBwb2xpbWVudG9QZXF1ZW5vOiBudW1iZXI7XG4gIHBvbGltZW50b0dyYW5kZTogbnVtYmVyO1xuICBtYXJnZW1MdWNyb1BlcmNlbnQ6IG51bWJlcjtcbiAgdGVsZWZvbmVMb2phPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdENvbmZpZ1ByZWNvczogQ29uZmlndXJhY2FvUHJlY29zID0ge1xuICBwaW50dXJhUG9yUGVjYTogMzAwLFxuICBwbmV1UGVxdWVubzogMjAwLFxuICBwbmV1R3JhbmRlOiAzMDAsXG4gIGhpZ2llbml6YWNhb1BlcXVlbm86IDUwMCxcbiAgaGlnaWVuaXphY2FvR3JhbmRlOiA3MDAsXG4gIHBvbGltZW50b1BlcXVlbm86IDI1MCxcbiAgcG9saW1lbnRvR3JhbmRlOiAzNTAsXG4gIG1hcmdlbUx1Y3JvUGVyY2VudDogMTUsXG4gIHRlbGVmb25lTG9qYTogXCJcIixcbn07XG5cbmV4cG9ydCB0eXBlIEN1c3RvUmVwYXJvQ2F0ZWdvcmlhID1cbiAgfCBcInBpbnR1cmFcIlxuICB8IFwicG5ldXNcIlxuICB8IFwicmV0cm92aXNvclwiXG4gIHwgXCJoaWdpZW5pemFjYW9cIlxuICB8IFwicG9saW1lbnRvXCJcbiAgfCBcIm1lY2FuaWNhXCJcbiAgfCBcIm91dHJvXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3VzdG9SZXBhcm8ge1xuICBpZDogc3RyaW5nO1xuICB2ZWljdWxvSWQ6IHN0cmluZztcbiAgY2F0ZWdvcmlhOiBDdXN0b1JlcGFyb0NhdGVnb3JpYTtcbiAgZGVzY3JpY2FvOiBzdHJpbmc7XG4gIHZhbG9yOiBudW1iZXI7XG4gIGRhdGE6IHN0cmluZztcbiAgY3JpYWRvRW06IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgVGFyZWZhUG9zVmVuZGFTdGF0dXMgPSBcInBlbmRlbnRlXCIgfCBcImVtX2FuZGFtZW50b1wiIHwgXCJjb25jbHVpZGFcIjtcblxuZXhwb3J0IHR5cGUgVGFyZWZhUG9zVmVuZGFDYXRlZ29yaWEgPVxuICB8IFwiZG9jdW1lbnRvXCJcbiAgfCBcInJlcGFyb1wiXG4gIHwgXCJsaW1wZXphXCJcbiAgfCBcIm11bHRhXCJcbiAgfCBcImVudHJlZ2FcIlxuICB8IFwib3V0cm9cIjtcblxuZXhwb3J0IGludGVyZmFjZSBUYXJlZmFQb3NWZW5kYSB7XG4gIGlkOiBzdHJpbmc7XG4gIHZlbmRhSWQ6IHN0cmluZztcbiAgdmVpY3Vsb0lkOiBzdHJpbmc7XG4gIHRpdHVsbzogc3RyaW5nO1xuICBkZXNjcmljYW8/OiBzdHJpbmc7XG4gIGNhdGVnb3JpYTogVGFyZWZhUG9zVmVuZGFDYXRlZ29yaWE7XG4gIHN0YXR1czogVGFyZWZhUG9zVmVuZGFTdGF0dXM7XG4gIHJlc3BvbnNhdmVsPzogc3RyaW5nO1xuICBjcmlhZG9FbTogc3RyaW5nO1xuICBjb25jbHVpZG9FbT86IHN0cmluZztcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcUEVEUk9TT1xcXFxEb3dubG9hZHNcXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXHNyY1xcXFxsaWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXFBFRFJPU09cXFxcRG93bmxvYWRzXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcYXV0b3ZlbmRhLXByby1iMmItbWFpblxcXFxzcmNcXFxcbGliXFxcXGFwcC1zdGF0ZS50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvUEVEUk9TTy9Eb3dubG9hZHMvYXV0b3ZlbmRhLXByby1iMmItbWFpbi9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL3NyYy9saWIvYXBwLXN0YXRlLnRzXCI7aW1wb3J0IHR5cGUge1xuICBDb25maWd1cmFjYW9QcmVjb3MsXG4gIENvbnN1bHRhVmVpY3VsYXIsXG4gIEN1c3RvUmVwYXJvLFxuICBMZWFkLFxuICBNZW1vcmlhTG9qYSxcbiAgVGFyZWZhUG9zVmVuZGEsXG4gIFZlaWN1bG8sXG4gIFZlbmRhLFxuICBWZW5kZWRvcixcbn0gZnJvbSBcIi4uL3N0b3JlL3R5cGVzXCI7XG5pbXBvcnQgeyBkZWZhdWx0Q29uZmlnUHJlY29zLCBkZWZhdWx0TWVtb3JpYUxvamEgfSBmcm9tIFwiLi4vc3RvcmUvdHlwZXNcIjtcblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZVNuYXBzaG90IHtcbiAgdmVpY3Vsb3M6IFZlaWN1bG9bXTtcbiAgbGVhZHM6IExlYWRbXTtcbiAgdmVuZGVkb3JlczogVmVuZGVkb3JbXTtcbiAgdmVuZGFzOiBWZW5kYVtdO1xuICBjb25zdWx0YXM6IENvbnN1bHRhVmVpY3VsYXJbXTtcbiAgdGFyZWZhc1Bvc1ZlbmRhOiBUYXJlZmFQb3NWZW5kYVtdO1xuICBjdXN0b3M6IEN1c3RvUmVwYXJvW107XG4gIGNvbmZpZ1ByZWNvczogQ29uZmlndXJhY2FvUHJlY29zO1xuICBtZW1vcmlhTG9qYTogTWVtb3JpYUxvamE7XG59XG5cbmV4cG9ydCB0eXBlIEFwcFN0YXRlUmVzb3VyY2VQYXRjaCA9IFBhcnRpYWw8XG4gIE9taXQ8QXBwU3RhdGVTbmFwc2hvdCwgXCJ2ZW5kZWRvcmVzXCI+XG4+O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRW1wdHlBcHBTdGF0ZShvdmVycmlkZXM/OiBQYXJ0aWFsPEFwcFN0YXRlU25hcHNob3Q+KTogQXBwU3RhdGVTbmFwc2hvdCB7XG4gIHJldHVybiB7XG4gICAgdmVpY3Vsb3M6IFtdLFxuICAgIGxlYWRzOiBbXSxcbiAgICB2ZW5kZWRvcmVzOiBbXSxcbiAgICB2ZW5kYXM6IFtdLFxuICAgIGNvbnN1bHRhczogW10sXG4gICAgdGFyZWZhc1Bvc1ZlbmRhOiBbXSxcbiAgICBjdXN0b3M6IFtdLFxuICAgIGNvbmZpZ1ByZWNvczogeyAuLi5kZWZhdWx0Q29uZmlnUHJlY29zIH0sXG4gICAgbWVtb3JpYUxvamE6IHsgLi4uZGVmYXVsdE1lbW9yaWFMb2phIH0sXG4gICAgLi4ub3ZlcnJpZGVzLFxuICB9O1xufVxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxQRURST1NPXFxcXERvd25sb2Fkc1xcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcc2VydmVyXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxQRURST1NPXFxcXERvd25sb2Fkc1xcXFxhdXRvdmVuZGEtcHJvLWIyYi1tYWluXFxcXGF1dG92ZW5kYS1wcm8tYjJiLW1haW5cXFxcc2VydmVyXFxcXHZpdGUtc2VjdXJpdHktcGx1Z2luLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9QRURST1NPL0Rvd25sb2Fkcy9hdXRvdmVuZGEtcHJvLWIyYi1tYWluL2F1dG92ZW5kYS1wcm8tYjJiLW1haW4vc2VydmVyL3ZpdGUtc2VjdXJpdHktcGx1Z2luLnRzXCI7aW1wb3J0IHR5cGUgeyBJbmNvbWluZ01lc3NhZ2UsIFNlcnZlclJlc3BvbnNlIH0gZnJvbSBcIm5vZGU6aHR0cFwiO1xuaW1wb3J0IHR5cGUgeyBQbHVnaW4gfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHsgaGFuZGxlQmFja2VuZFJlcXVlc3QgfSBmcm9tIFwiLi9iYWNrZW5kXCI7XG5cbmZ1bmN0aW9uIHJlYWRCb2R5KHJlcTogSW5jb21pbmdNZXNzYWdlKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx1bmtub3duPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuICAgIHJlcS5vbihcImRhdGFcIiwgKGNodW5rKSA9PiBjaHVua3MucHVzaChCdWZmZXIuZnJvbShjaHVuaykpKTtcbiAgICByZXEub24oXCJlbmRcIiwgKCkgPT4ge1xuICAgICAgaWYgKCFjaHVua3MubGVuZ3RoKSB7XG4gICAgICAgIHJlc29sdmUodW5kZWZpbmVkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCByYXcgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoXCJ1dGYtOFwiKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmUoSlNPTi5wYXJzZShyYXcpKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXNvbHZlKHJhdyk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmVxLm9uKFwiZXJyb3JcIiwgcmVqZWN0KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHdyaXRlUmVzcG9uc2UocmVzOiBTZXJ2ZXJSZXNwb25zZSwgc3RhdHVzOiBudW1iZXIsIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQsIGJvZHk6IHVua25vd24pIHtcbiAgcmVzLnN0YXR1c0NvZGUgPSBzdGF0dXM7XG4gIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMgPz8ge30pLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgIHJlcy5zZXRIZWFkZXIoa2V5LCB2YWx1ZSk7XG4gIH0pO1xuICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KGJvZHkpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlY3VyaXR5QXBpUGx1Z2luKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogXCJzZWN1cml0eS1hcGktcGx1Z2luXCIsXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZShhc3luYyAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAgICAgaWYgKCFyZXEudXJsPy5zdGFydHNXaXRoKFwiL2FwaS9cIikpIHtcbiAgICAgICAgICBuZXh0KCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsLCBcImh0dHA6Ly9sb2NhbGhvc3RcIik7XG4gICAgICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm9keShyZXEpO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZUJhY2tlbmRSZXF1ZXN0KHtcbiAgICAgICAgICBtZXRob2Q6IHJlcS5tZXRob2QgPz8gXCJHRVRcIixcbiAgICAgICAgICBwYXRoOiBgJHt1cmwucGF0aG5hbWV9JHt1cmwuc2VhcmNofWAsXG4gICAgICAgICAgaGVhZGVyczogcmVxLmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQ+LFxuICAgICAgICAgIGJvZHksXG4gICAgICAgICAgaXA6IHJlcS5zb2NrZXQucmVtb3RlQWRkcmVzcyA/PyBcImxvY2FsXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdyaXRlUmVzcG9uc2UocmVzLCByZXNwb25zZS5zdGF0dXMsIHJlc3BvbnNlLmhlYWRlcnMsIHJlc3BvbnNlLmJvZHkpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBc1osU0FBUyxjQUFjLGVBQWU7QUFDNWIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1Qjs7O0FDSHFZLFNBQVMscUJBQXFCOzs7QUNLbmMsSUFBTSxZQUFZLG9CQUFJLElBQUk7QUFBQSxFQUN4QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0YsQ0FBQztBQUVELElBQU0sZ0JBQTBDO0FBQUEsRUFDOUMsWUFBWTtBQUFBLElBQ1Y7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsV0FBVyxDQUFDLE1BQU0sV0FBVztBQUFBLEVBQzdCLFNBQVMsQ0FBQyxTQUFTO0FBQ3JCO0FBRUEsU0FBUyxnQkFBZ0IsT0FBZTtBQUN0QyxTQUFPLE1BQU0sVUFBVSxLQUFLLEVBQUUsUUFBUSxvQkFBb0IsRUFBRTtBQUM5RDtBQUVPLFNBQVMsa0JBQWtCLE9BQWU7QUFDL0MsU0FBTyxnQkFBZ0IsS0FBSyxFQUN6QixZQUFZ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U0FBUztBQUMvQyxZQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsT0FBTyxHQUFHO0FBQ2pDLGVBQUs7QUFDTDtBQUFBLFFBQ0Y7QUFFQSxjQUFNLE1BQU0sSUFBSSxJQUFJLElBQUksS0FBSyxrQkFBa0I7QUFDL0MsY0FBTSxPQUFPLE1BQU0sU0FBUyxHQUFHO0FBQy9CLGNBQU0sV0FBVyxNQUFNLHFCQUFxQjtBQUFBLFVBQzFDLFFBQVEsSUFBSSxVQUFVO0FBQUEsVUFDdEIsTUFBTSxHQUFHLElBQUksUUFBUSxHQUFHLElBQUksTUFBTTtBQUFBLFVBQ2xDLFNBQVMsSUFBSTtBQUFBLFVBQ2I7QUFBQSxVQUNBLElBQUksSUFBSSxPQUFPLGlCQUFpQjtBQUFBLFFBQ2xDLENBQUM7QUFFRCxzQkFBYyxLQUFLLFNBQVMsUUFBUSxTQUFTLFNBQVMsU0FBUyxJQUFJO0FBQUEsTUFDckUsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNGO0FBQ0Y7OztBUHpEQSxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsU0FBTyxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBRTlCLFNBQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxJQUNSO0FBQUEsSUFDQSxTQUFTLENBQUMsTUFBTSxHQUFHLGtCQUFrQixHQUFHLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsSUFDbkcsU0FBUztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLE1BQ3RDO0FBQUEsSUFDRjtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFVBQ04sYUFBYSxJQUFJO0FBQ2YsZ0JBQUksQ0FBQyxHQUFHLFNBQVMsY0FBYyxFQUFHO0FBRWxDLGdCQUFJLEdBQUcsU0FBUyxVQUFVLEdBQUc7QUFDM0IscUJBQU87QUFBQSxZQUNUO0FBRUEsZ0JBQUksR0FBRyxTQUFTLGNBQWMsS0FBSyxHQUFHLFNBQVMsdUJBQXVCLEdBQUc7QUFDdkUscUJBQU87QUFBQSxZQUNUO0FBRUEsZ0JBQ0UsR0FBRyxTQUFTLFdBQVcsS0FDdkIsR0FBRyxTQUFTLGNBQWMsS0FDMUIsR0FBRyxTQUFTLFFBQVEsS0FDcEIsR0FBRyxTQUFTLHNCQUFzQixLQUNsQyxHQUFHLFNBQVMsTUFBTSxHQUNsQjtBQUNBLHFCQUFPO0FBQUEsWUFDVDtBQUVBLGdCQUFJLEdBQUcsU0FBUyxPQUFPLEtBQUssR0FBRyxTQUFTLFdBQVcsR0FBRztBQUNwRCxxQkFBTztBQUFBLFlBQ1Q7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInBhdGgiLCAicGF0aCIsICJyZXF1aXJlIl0KfQo=
