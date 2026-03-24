import { createRequire } from "node:module";
import { lookupFipeByText, suggestFipeBrands, suggestFipeModels } from "./fipe";
import type { AppStateResourcePatch } from "../src/lib/app-state";
import {
  authenticateUser,
  clearSessionCookieHeader,
  createTenantUserForPlatform,
  createSellerForTenant,
  createTenantWithOwner,
  getSessionFromCookie,
  getTenantAppState,
  listPlatformAuditEvents,
  listStores,
  listTenantAuditEvents,
  listTenantMembersByTenantId,
  listTenantMembers,
  revokeSession,
  sessionToResponse,
  updateStoreStatus,
  updateTenantAppState,
  type AuthenticatedSession,
  type TenantStatus,
} from "./database";

const require = createRequire(import.meta.url);
const sinespApi = require("sinesp-api") as {
  search: (plate: string) => Promise<Record<string, unknown>>;
};

type RequestShape = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
};

type ResponseShape = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

type SessionResult =
  | { session: AuthenticatedSession }
  | { error: ResponseShape };

const rateLimitBuckets = new Map<string, number[]>();

function normalizeHeaders(headers: RequestShape["headers"]) {
  const normalized: Record<string, string> = {};
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

function json(status: number, body: unknown, headers?: Record<string, string>): ResponseShape {
  return {
    status,
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  };
}

function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(key) ?? []).filter((ts) => now - ts < windowMs);

  if (recent.length >= limit) {
    const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return retryAfterSeconds;
  }

  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return null;
}

function requireSession(headers: Record<string, string>): SessionResult {
  const session = getSessionFromCookie(headers.cookie);
  if (!session) {
    return { error: json(401, { error: "Sessao invalida ou expirada." }) };
  }

  if (
    session.role !== "platform_admin" &&
    (session.tenantStatus === "blocked" || session.tenantStatus === "closed")
  ) {
    return { error: json(403, { error: "A loja esta bloqueada ou encerrada." }) };
  }

  return { session };
}

function requirePlatformAdmin(headers: Record<string, string>): SessionResult {
  const result = requireSession(headers);
  if ("error" in result) return result;
  if (result.session.role !== "platform_admin") {
    return { error: json(403, { error: "Acesso restrito ao admin da plataforma." }) };
  }
  return result;
}

function requireOwner(headers: Record<string, string>): SessionResult {
  const result = requireSession(headers);
  if ("error" in result) return result;
  if (result.session.role !== "owner") {
    return { error: json(403, { error: "Acesso restrito ao owner da loja." }) };
  }
  return result;
}

async function handleLogin(request: RequestShape, headers: Record<string, string>) {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`login:${ip}`, 10, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return json(400, { error: "Informe e-mail e senha." });
  }

  const auth = authenticateUser(email, password, {
    ip,
    userAgent: headers["user-agent"],
  });

  if (!auth) {
    return json(401, { error: "Credenciais invalidas." });
  }

  return json(200, sessionToResponse(auth.session), {
    "Set-Cookie": auth.cookieHeader,
  });
}

async function handleSession(headers: Record<string, string>): Promise<ResponseShape> {
  const result = requireSession(headers);
  if ("error" in result) return result.error;
  return json(200, sessionToResponse(result.session));
}

async function handleLogout(headers: Record<string, string>): Promise<ResponseShape> {
  const result = requireSession(headers);
  if (!("error" in result)) {
    revokeSession(result.session.sessionId);
  }

  return json(200, { success: true }, {
    "Set-Cookie": clearSessionCookieHeader(),
  });
}

async function handlePlatformStores(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  if (request.method === "GET") {
    return json(200, { stores: listStores() });
  }

  if (request.method === "POST") {
    const body = (request.body ?? {}) as Record<string, unknown>;
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
        maxUsers,
      });
      return json(201, { success: true, stores: listStores() });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar a loja." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handlePlatformStoreUpdate(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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

  const body = (request.body ?? {}) as Record<string, unknown>;
  const status = body.status ? String(body.status) as TenantStatus : undefined;
  const extendTrialDays = body.extendTrialDays === undefined ? undefined : Number(body.extendTrialDays);
  const trialDays = body.trialDays === undefined ? undefined : Number(body.trialDays);
  const maxUsers = body.maxUsers === undefined ? undefined : Number(body.maxUsers);

  try {
    updateStoreStatus(storeId, {
      status,
      extendTrialDays,
      trialDays,
      maxUsers,
    });
    return json(200, { success: true, stores: listStores() });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel atualizar a loja." });
  }
}

async function handleTenantTeam(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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

    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "seller").trim().toLowerCase();
    const salesGoalMonthly = body.salesGoalMonthly === undefined ? null : Number(body.salesGoalMonthly);

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
        role: role as "owner" | "seller",
        salesGoalMonthly,
      });
      return json(201, { success: true, members: listTenantMembers(sessionResult.session) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o vendedor." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handlePlatformStoreTeam(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "seller").trim().toLowerCase();
    const salesGoalMonthly = body.salesGoalMonthly === undefined ? null : Number(body.salesGoalMonthly);

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
        role: role as "owner" | "seller",
        salesGoalMonthly,
      });
      return json(201, { success: true, members: listTenantMembersByTenantId(storeId) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o usuario." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handlePlatformActivity(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  return json(200, { events: listPlatformAuditEvents(20) });
}

async function handleTenantActivity(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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

async function handleAppStateGet(headers: Record<string, string>): Promise<ResponseShape> {
  const result = requireSession(headers);
  if ("error" in result) return result.error;

  if (!result.session.tenantId) {
    return json(200, { state: getTenantAppState(result.session) });
  }

  return json(200, { state: getTenantAppState(result.session) });
}

async function handleAppStateUpdate(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = requireSession(headers);
  if ("error" in result) return result.error;

  if (!result.session.tenantId) {
    return json(400, { error: "Somente usuarios de loja podem sincronizar dados." });
  }

  if (request.method !== "PUT") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PUT" });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const patch = body as AppStateResourcePatch;

  try {
    const state = updateTenantAppState(result.session, patch);
    return json(200, { state });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel sincronizar os dados." });
  }
}

async function handleGemini(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;

  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`gemini:${ip}`, 25, 60_000);
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
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body ?? {}),
  });

  const text = await upstream.text();
  let parsedBody: unknown = text;

  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = { error: text };
  }

  return json(upstream.status, parsedBody);
}

function normalizePlate(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7);
}

function isValidPlate(value: string) {
  return /^[A-Z]{3}[0-9]{4}$/.test(value) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(value);
}

function firstString(...values: unknown[]) {
  const found = values.find((value) => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim() : "";
}

function extractYear(data: Record<string, unknown>) {
  const year = firstString(data.ano, data.anoModelo);
  return year || "Nao informado";
}

async function lookupPlateWithSinesp(candidates: string[]) {
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const response = await sinespApi.search(candidate);
      return {
        response,
        usedPlate: candidate,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha ao consultar placa.");
    }
  }

  throw lastError ?? new Error("Nao foi possivel consultar a placa.");
}

async function handlePlateLookup(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;

  const url = new URL(`http://localhost${request.path}`);
  const plate = normalizePlate(url.searchParams.get("plate") ?? "");
  const candidates = (url.searchParams.get("candidates") ?? "")
    .split(",")
    .map(normalizePlate)
    .filter(Boolean);

  if (!plate || !isValidPlate(plate)) {
    return json(400, { error: "Placa invalida. Use o formato antigo ou Mercosul." });
  }

  try {
    const { response, usedPlate } = await lookupPlateWithSinesp(
      Array.from(new Set([plate, ...candidates].filter(isValidPlate))),
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
      raw: response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel consultar a placa.";

    if (/nao encontrado|placa nao encontrada/i.test(message)) {
      return json(404, { error: "Placa nao encontrada." });
    }

    return json(503, {
      error: "O provedor de consulta de placa esta indisponivel no momento. Tente novamente em instantes.",
      detail: message,
    });
  }
}

async function handleFipeLookup(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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
      tipo: tipo as "carro" | "moto" | "caminhao",
    });

    if (!result) {
      return json(404, { error: "FIPE nao encontrada para os dados informados." });
    }

    return json(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar a FIPE.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message,
    });
  }
}

async function handleFipeBrandSuggestions(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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
      tipo: tipo as "carro" | "moto" | "caminhao",
    });
    return json(200, suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar sugestoes de marca.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message,
    });
  }
}

async function handleFipeModelSuggestions(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
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
      tipo: tipo as "carro" | "moto" | "caminhao",
    });
    return json(200, suggestions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar sugestoes de modelo.";
    return json(503, {
      error: "O provedor de FIPE esta indisponivel no momento. Tente novamente em instantes.",
      detail: message,
    });
  }
}

export async function handleBackendRequest(request: RequestShape): Promise<ResponseShape> {
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
      error: error instanceof Error ? error.message : "Falha interna do servidor.",
    });
  }
}
