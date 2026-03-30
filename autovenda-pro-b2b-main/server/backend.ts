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
  createPasswordResetToken,
  resetPasswordWithToken,
  updateStoreStatus,
  updateTenantAppState,
  updateMemberPermissions,
  getNfeConfig,
  getStoreNfeSettings,
  toggleNfeEnabled,
  updateStoreNfeConfig,
  updateVendaNfe,
  type AuthenticatedSession,
  type TenantStatus,
  type SellerPermissions,
  type NfeConfigData,
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

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'",
};

function json(status: number, body: unknown, headers?: Record<string, string>): ResponseShape {
  return {
    status,
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "E-mail invalido." });
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

async function sendResetEmail(email: string, name: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY nao configurada. Email de reset nao enviado para:", email);
    return true; // retorna true para o fluxo continuar em dev
  }

  const fromEmail = process.env.EMAIL_FROM ?? "noreply@rozzcar.com";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Rozzcar <${fromEmail}>`,
        to: [email],
        subject: "Recuperacao de senha - Rozzcar",
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f1117; color: #e5e7eb; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                <span style="font-size: 24px; color: white;">R</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; color: white;">Rozzcar</h1>
            </div>
            <p style="color: #d1d5db;">Ola, <strong>${name}</strong>.</p>
            <p style="color: #9ca3af;">Recebemos uma solicitacao para redefinir sua senha. Clique no botao abaixo para criar uma nova senha:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 14px;">Redefinir minha senha</a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">Este link expira em 30 minutos. Se voce nao solicitou a troca, ignore este email.</p>
            <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />
            <p style="color: #4b5563; font-size: 11px; text-align: center;">Rozzcar - Gestao automotiva inteligente</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[Email] Falha ao enviar:", res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Erro ao enviar:", err);
    return false;
  }
}

async function handleForgotPassword(request: RequestShape): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`forgot:${ip}`, 5, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email) {
    return json(400, { error: "Informe o e-mail." });
  }

  // Sempre retorna sucesso para nao revelar se o email existe
  const result = createPasswordResetToken(email);

  if (result) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8080";
    const resetUrl = `${baseUrl}/?reset=${result.token}`;
    await sendResetEmail(email, result.userName, resetUrl);
  }

  return json(200, { message: "Se o e-mail estiver cadastrado, voce recebera um link de recuperacao." });
}

async function handleResetPassword(request: RequestShape): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = enforceRateLimit(`reset:${ip}`, 5, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const token = String(body.token ?? "");
  const newPassword = String(body.password ?? "");

  if (!token || !newPassword) {
    return json(400, { error: "Token e nova senha sao obrigatorios." });
  }

  if (newPassword.length < 6) {
    return json(400, { error: "A senha deve ter no minimo 6 caracteres." });
  }

  const success = resetPasswordWithToken(token, newPassword);
  if (!success) {
    return json(400, { error: "Link expirado ou invalido. Solicite um novo." });
  }

  return json(200, { message: "Senha redefinida com sucesso. Faca login com a nova senha." });
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
  const nfeEnabled = body.nfeEnabled === undefined ? undefined : Boolean(body.nfeEnabled);

  try {
    updateStoreStatus(storeId, { status, extendTrialDays, trialDays, maxUsers });
    if (nfeEnabled !== undefined) {
      toggleNfeEnabled(storeId, nfeEnabled);
    }
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

async function handleMemberPermissions(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;

  if (request.method !== "PATCH") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PATCH" });
  }

  const match = request.path.match(/^\/api\/tenant\/members\/(\d+)\/permissions$/);
  const memberId = Number(match?.[1] ?? 0);
  if (!memberId) {
    return json(400, { error: "Membro invalido." });
  }

  const body = (request.body ?? {}) as Partial<SellerPermissions>;

  try {
    updateMemberPermissions(sessionResult.session, memberId, body);
    return json(200, { success: true });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel atualizar permissoes." });
  }
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

  const apiKeys = [process.env.GOOGLE_API_KEY, process.env.GOOGLE_API_KEY_2].filter(Boolean) as string[];
  if (apiKeys.length === 0) {
    return json(503, { error: "GOOGLE_API_KEY nao configurada." });
  }

  const GEMINI_MODEL = "gemini-2.5-flash";
  const bodyStr = JSON.stringify(request.body ?? {});

  const tryKey = async (key: string) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyStr }
  );

  let upstream = await tryKey(apiKeys[0]);

  // Se der 429 tenta a segunda chave (se existir), senao aguarda e tenta de novo
  if (upstream.status === 429) {
    if (apiKeys[1]) {
      upstream = await tryKey(apiKeys[1]);
    } else {
      await new Promise((r) => setTimeout(r, 5000));
      upstream = await tryKey(apiKeys[0]);
    }
  }

  const text = await upstream.text();
  console.log(`[Gemini] status=${upstream.status} body=${text.slice(0, 300)}`);
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

// ─── NF-e helpers ────────────────────────────────────────────────────────────

function focusNfeBaseUrl(ambiente: "homologacao" | "producao") {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br/v2"
    : "https://homologacao.focusnfe.com.br/v2";
}

function focusNfeAuth(apiKey: string) {
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
}

function cleanCnpjCpf(value: string) {
  return value.replace(/[^\d]/g, "");
}

function cleanCep(value: string) {
  return value.replace(/[^\d]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function maskFocusApiKey(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 5)}${"*".repeat(Math.max(4, value.length - 9))}${value.slice(-4)}`;
}

function extractFocusError(body: Record<string, unknown>) {
  const erros = body.erros;
  if (Array.isArray(erros) && erros.length > 0) {
    const first = asRecord(erros[0]);
    if (first?.mensagem) return String(first.mensagem);
  }
  return String(body.mensagem_sefaz ?? body.mensagem ?? body.error ?? "Erro ao processar NF-e.");
}

function mapFocusNfeStatus(focusStatus: string, httpStatus: number) {
  if (focusStatus === "autorizado") return "autorizada";
  if (focusStatus === "cancelado" || focusStatus === "nfe_cancelada") return "cancelada";
  if (focusStatus === "processando_autorizacao") return "pendente";
  if (focusStatus === "erro_autorizacao" || focusStatus === "erro_cancelamento") return "erro";
  return httpStatus >= 400 ? "erro" : "pendente";
}

function resolveFocusAssetUrl(baseUrl: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value, `${baseUrl}/`).toString();
  } catch {
    return value;
  }
}

async function handlePlatformStoreNfeConfig(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)\/nfe-config$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }

  if (request.method === "GET") {
    try {
      const settings = getStoreNfeSettings(storeId);
      return json(200, {
        enabled: settings.enabled,
        configured: settings.configured,
        config: buildPublicNfeConfig(settings.config),
      });
    } catch (error) {
      return json(404, { error: error instanceof Error ? error.message : "Loja nao encontrada." });
    }
  }

  if (request.method === "PUT") {
    try {
      const currentSettings = getStoreNfeSettings(storeId);
      const body = (request.body ?? {}) as Partial<NfeConfigData>;
      const nextConfig = normalizeNfeConfigInput(body, currentSettings.config);
      const validationError = validateNfeConfig(nextConfig);
      if (validationError) {
        return json(400, { error: validationError });
      }

      updateStoreNfeConfig(storeId, nextConfig, result.session.userId);
      const nextSettings = getStoreNfeSettings(storeId);
      return json(200, {
        success: true,
        enabled: nextSettings.enabled,
        configured: nextSettings.configured,
        config: buildPublicNfeConfig(nextSettings.config),
      });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel salvar a configuracao NF-e." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, PUT" });
}

function buildNfeDescription(veiculo: Record<string, unknown>) {
  const descricao = [
    String(veiculo.modelo ?? "").trim(),
    String(veiculo.ano ?? "").trim(),
    String(veiculo.cor ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" - ")
    .trim();
  return (descricao || "VEICULO USADO").slice(0, 120);
}

function getVendaContext(session: AuthenticatedSession, vendaId: string) {
  const state = getTenantAppState(session);
  const venda = state.vendas.find((item) => item.id === vendaId);
  if (!venda) {
    return { error: json(404, { error: "Venda nao encontrada." }) };
  }

  const veiculo = state.veiculos.find((item) => item.id === venda.veiculoId);
  if (!veiculo) {
    return { error: json(404, { error: "Veiculo da venda nao encontrado." }) };
  }

  return { venda, veiculo };
}

function getVendaContextByNfeRef(session: AuthenticatedSession, ref: string) {
  const state = getTenantAppState(session);
  const venda = state.vendas.find((item) => String(asRecord(item.nfe)?.ref ?? "") === ref);
  if (!venda) {
    return { error: json(404, { error: "NF-e nao encontrada para esta loja." }) };
  }

  const veiculo = state.veiculos.find((item) => item.id === venda.veiculoId) ?? null;
  return { venda, veiculo };
}

function buildPublicNfeConfig(config: NfeConfigData | null) {
  if (!config) return null;
  const { focusApiKey, ...rest } = config;
  return {
    ...rest,
    focusApiKey: "",
    hasSavedApiKey: !!focusApiKey,
    focusApiKeyMasked: focusApiKey ? maskFocusApiKey(focusApiKey) : "",
  };
}

function normalizeNfeConfigInput(body: Partial<NfeConfigData>, currentConfig: NfeConfigData | null): NfeConfigData {
  const focusApiKey = String(body.focusApiKey ?? "").trim() || (currentConfig?.focusApiKey ?? "");

  return {
    focusApiKey,
    ambiente: body.ambiente === "producao" ? "producao" : "homologacao",
    cnpj: String(body.cnpj ?? "").trim(),
    razaoSocial: String(body.razaoSocial ?? "").trim(),
    nomeFantasia: String(body.nomeFantasia ?? "").trim() || undefined,
    inscricaoEstadual: String(body.inscricaoEstadual ?? "").trim(),
    regimeTributario: body.regimeTributario === "2" || body.regimeTributario === "3" ? body.regimeTributario : "1",
    logradouro: String(body.logradouro ?? "").trim(),
    numero: String(body.numero ?? "").trim(),
    complemento: String(body.complemento ?? "").trim() || undefined,
    bairro: String(body.bairro ?? "").trim(),
    municipio: String(body.municipio ?? "").trim(),
    codigoMunicipio: String(body.codigoMunicipio ?? "").replace(/[^\d]/g, "").slice(0, 7),
    uf: String(body.uf ?? "").trim().toUpperCase().slice(0, 2),
    cep: cleanCep(String(body.cep ?? "")).slice(0, 8),
    telefone: cleanCnpjCpf(String(body.telefone ?? "")).slice(0, 14) || undefined,
    email: String(body.email ?? "").trim() || undefined,
  };
}

function validateNfeConfig(config: NfeConfigData) {
  const required: (keyof NfeConfigData)[] = [
    "focusApiKey", "ambiente", "cnpj", "razaoSocial",
    "inscricaoEstadual", "regimeTributario",
    "logradouro", "numero", "bairro", "municipio", "codigoMunicipio", "uf", "cep",
  ];

  for (const field of required) {
    if (!config[field]) {
      return `Campo obrigatorio: ${field}`;
    }
  }

  const cnpjClean = cleanCnpjCpf(config.cnpj ?? "");
  if (cnpjClean.length !== 14) {
    return "CNPJ invalido. Informe 14 digitos.";
  }
  if (config.codigoMunicipio.length !== 7) {
    return "Codigo do municipio invalido. Informe os 7 digitos do IBGE.";
  }
  if (config.cep.length !== 8) {
    return "CEP invalido. Informe 8 digitos.";
  }

  return null;
}

function buildNfeInfoFromFocus(input: {
  config: NfeConfigData;
  ref: string;
  focusBody: Record<string, unknown>;
  httpStatus: number;
  valorTotal: number;
  descricaoProduto: string;
  formaPagamento: string;
  destinatario: Record<string, unknown>;
  existingNfe?: Record<string, unknown> | null;
  cancelledNow?: boolean;
  justificativa?: string;
}) {
  const focusStatus = String(input.focusBody.status ?? input.focusBody.codigo ?? "processando_autorizacao");
  const status = mapFocusNfeStatus(focusStatus, input.httpStatus);
  const erro = status === "erro" ? extractFocusError(input.focusBody) : null;
  const existing = input.existingNfe ?? {};
  const nowIso = new Date().toISOString();
  const dataEmissao = typeof input.focusBody.data_emissao === "string" ? input.focusBody.data_emissao : null;

  return {
    ref: input.ref,
    status,
    focusStatus,
    numero: input.focusBody.numero ?? existing.numero ?? null,
    serie: input.focusBody.serie ?? existing.serie ?? null,
    chave: input.focusBody.chave_nfe ?? existing.chave ?? null,
    danfeUrl: resolveFocusAssetUrl(focusNfeBaseUrl(input.config.ambiente), input.focusBody.caminho_danfe) ?? existing.danfeUrl ?? null,
    xmlUrl:
      resolveFocusAssetUrl(focusNfeBaseUrl(input.config.ambiente), input.focusBody.caminho_xml_nota_fiscal)
      ?? existing.xmlUrl
      ?? null,
    emitidaEm:
      status === "autorizada"
        ? (existing.emitidaEm ?? dataEmissao ?? nowIso)
        : (existing.emitidaEm ?? null),
    canceladaEm:
      status === "cancelada"
        ? (existing.canceladaEm ?? (input.cancelledNow ? nowIso : null))
        : (existing.canceladaEm ?? null),
    justificativa: input.justificativa ?? existing.justificativa ?? null,
    erro,
    mensagemSefaz: input.focusBody.mensagem_sefaz ?? existing.mensagemSefaz ?? null,
    valorTotal: input.valorTotal,
    descricaoProduto: input.descricaoProduto,
    formaPagamento: input.formaPagamento,
    ambiente: input.config.ambiente,
    ultimaAtualizacaoEm: nowIso,
    destinatario: input.destinatario,
  };
}

type TenantNfeContext = {
  venda: Record<string, unknown>;
  veiculo: Record<string, unknown> | null;
  vendaId: string;
  ref: string;
  nfe: Record<string, unknown>;
};

function getTenantNfeContext(session: AuthenticatedSession, searchParams: URLSearchParams) {
  const vendaId = (searchParams.get("vendaId") ?? "").trim();
  const requestedRef = (searchParams.get("ref") ?? "").trim();

  const contextResult = vendaId
    ? getVendaContext(session, vendaId)
    : requestedRef
      ? getVendaContextByNfeRef(session, requestedRef)
      : { error: json(400, { error: "Informe o vendaId ou ref da NF-e." }) };

  if ("error" in contextResult) {
    return contextResult;
  }

  const nfe = asRecord(contextResult.venda.nfe);
  const ref = requestedRef || String(nfe?.ref ?? "");

  if (!nfe || !ref) {
    return { error: json(404, { error: "NF-e nao encontrada para esta venda." }) };
  }

  return {
    venda: contextResult.venda as Record<string, unknown>,
    veiculo: contextResult.veiculo as Record<string, unknown> | null,
    vendaId: String(contextResult.venda.id ?? vendaId),
    ref,
    nfe,
  } satisfies TenantNfeContext;
}

function buildNfeAssetFileName(ref: string, extension: "pdf" | "xml") {
  const safeRef = ref.replace(/[^a-z0-9_-]+/gi, "-");
  return `NF-e-${safeRef}.${extension}`;
}

async function fetchNfeStatusFromProvider(config: NfeConfigData, ref: string) {
  const focusRes = await fetch(
    `${focusNfeBaseUrl(config.ambiente)}/nfe/${encodeURIComponent(ref)}?completa=1`,
    { headers: { Authorization: focusNfeAuth(config.focusApiKey) } },
  );
  const focusBody = await focusRes.json().catch(() => ({})) as Record<string, unknown>;

  if (!focusRes.ok && focusRes.status !== 404) {
    return { error: json(focusRes.status, { error: extractFocusError(focusBody) }) };
  }
  if (focusRes.status === 404) {
    return { error: json(404, { error: "NF-e nao encontrada na Focus." }) };
  }

  return { focusBody, httpStatus: focusRes.status };
}

async function ensureNfeAssetUrl(
  session: AuthenticatedSession,
  config: NfeConfigData,
  tenantNfe: TenantNfeContext,
  assetType: "danfe" | "xml",
) {
  const existingUrl = String(
    assetType === "danfe" ? tenantNfe.nfe.danfeUrl ?? "" : tenantNfe.nfe.xmlUrl ?? "",
  ).trim();
  if (existingUrl) {
    return { assetUrl: existingUrl, nfe: tenantNfe.nfe };
  }

  const statusResult = await fetchNfeStatusFromProvider(config, tenantNfe.ref);
  if ("error" in statusResult) {
    return statusResult;
  }

  const syncedNfe = buildNfeInfoFromFocus({
    config,
    ref: tenantNfe.ref,
    focusBody: statusResult.focusBody,
    httpStatus: statusResult.httpStatus,
    valorTotal: Number(tenantNfe.nfe.valorTotal ?? tenantNfe.venda.valor ?? 0),
    descricaoProduto: String(
      tenantNfe.nfe.descricaoProduto
      ?? (tenantNfe.veiculo ? buildNfeDescription(tenantNfe.veiculo) : "VEICULO USADO"),
    ),
    formaPagamento: String(tenantNfe.nfe.formaPagamento ?? "01"),
    destinatario: asRecord(tenantNfe.nfe.destinatario) ?? {},
    existingNfe: tenantNfe.nfe,
  });
  updateVendaNfe(session.tenantId!, tenantNfe.vendaId, syncedNfe);

  const assetUrl = String(assetType === "danfe" ? syncedNfe.danfeUrl ?? "" : syncedNfe.xmlUrl ?? "").trim();
  if (!assetUrl) {
    return {
      error: json(404, {
        error: assetType === "danfe" ? "DANFE indisponivel para esta NF-e." : "XML indisponivel para esta NF-e.",
      }),
    };
  }

  return { assetUrl, nfe: syncedNfe };
}

async function handleNfeAsset(
  request: RequestShape,
  headers: Record<string, string>,
  assetType: "danfe" | "xml",
): Promise<ResponseShape> {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || !session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "NF-e nao configurado." });
  }

  const url = new URL(`http://localhost${request.path}`);
  const tenantNfe = getTenantNfeContext(session, url.searchParams);
  if ("error" in tenantNfe) {
    return tenantNfe.error;
  }

  const assetResult = await ensureNfeAssetUrl(session, config, tenantNfe, assetType);
  if ("error" in assetResult) {
    return assetResult.error;
  }

  const upstream = await fetch(assetResult.assetUrl, {
    headers: {
      Authorization: focusNfeAuth(config.focusApiKey),
    },
  });

  if (!upstream.ok) {
    if (upstream.status === 404) {
      return json(404, {
        error: assetType === "danfe" ? "DANFE nao encontrado." : "XML nao encontrado.",
      });
    }

    return json(upstream.status, {
      error: assetType === "danfe" ? "Nao foi possivel carregar o DANFE." : "Nao foi possivel carregar o XML.",
    });
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const isDanfe = assetType === "danfe";
  const defaultContentType = isDanfe ? "application/pdf" : "application/xml";
  const requestedDownload = (url.searchParams.get("download") ?? "").trim() === "1";

  return json(200, {
    success: true,
    ref: tenantNfe.ref,
    vendaId: tenantNfe.vendaId,
    fileName: buildNfeAssetFileName(tenantNfe.ref, isDanfe ? "pdf" : "xml"),
    contentType: upstream.headers.get("content-type") ?? defaultContentType,
    contentBase64: buffer.toString("base64"),
    inline: isDanfe && !requestedDownload,
  });
}

async function handleNfeConfig(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }

  if (request.method === "GET") {
    return json(200, {
      config: null,
      enabled: session.nfeEnabled,
      configured: session.nfeConfigured,
    });
  }

  if (request.method === "PUT") {
    return json(403, { error: "A configuracao NF-e e gerenciada apenas pela plataforma." });
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, PUT" });
}

async function handleNfeEmitir(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }
  if (!session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "Configure os dados da empresa antes de emitir NF-e." });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const vendaId = String(body.vendaId ?? "").trim();
  const compradorNome = String(body.compradorNome ?? "").trim();
  const compradorCpfCnpj = cleanCnpjCpf(String(body.compradorCpfCnpj ?? ""));
  const compradorEmail = String(body.compradorEmail ?? "").trim();
  const compradorLogradouro = String(body.compradorLogradouro ?? "").trim();
  const compradorNumero = String(body.compradorNumero ?? "").trim();
  const compradorComplemento = String(body.compradorComplemento ?? "").trim();
  const compradorBairro = String(body.compradorBairro ?? "").trim();
  const compradorMunicipio = String(body.compradorMunicipio ?? "").trim();
  const compradorCodigoMunicipio = cleanCnpjCpf(String(body.compradorCodigoMunicipio ?? "")).slice(0, 7);
  const compradorUf = String(body.compradorUf ?? "").trim().toUpperCase().slice(0, 2);
  const compradorCep = cleanCep(String(body.compradorCep ?? "")).slice(0, 8);
  const indicadorInscricaoEstadualDestinatario = String(body.indicadorInscricaoEstadualDestinatario ?? "9").trim();
  const inscricaoEstadualDestinatario = String(body.inscricaoEstadualDestinatario ?? "").trim();
  const formaPagamento = String(body.formaPagamento ?? "01").trim();

  const vendaResult = getVendaContext(session, vendaId);
  if ("error" in vendaResult) return vendaResult.error;
  const { venda, veiculo } = vendaResult;

  const existingNfe = asRecord(venda.nfe) ?? null;
  if (existingNfe?.ref && existingNfe.status !== "erro") {
    return json(200, { success: true, alreadyExists: true, nfe: existingNfe, venda });
  }

  if (!vendaId || !compradorNome || !compradorCpfCnpj) {
    return json(400, { error: "Informe ID da venda, nome e CPF/CNPJ do comprador." });
  }
  if (compradorCpfCnpj.length !== 11 && compradorCpfCnpj.length !== 14) {
    return json(400, { error: "CPF deve ter 11 digitos ou CNPJ 14 digitos." });
  }
  if (!compradorLogradouro || !compradorNumero || !compradorBairro || !compradorMunicipio || !compradorUf) {
    return json(400, { error: "Preencha o endereco do comprador para emitir a NF-e." });
  }
  if (compradorCep.length !== 8) {
    return json(400, { error: "CEP do comprador invalido. Informe 8 digitos." });
  }
  if (!["1", "2", "9"].includes(indicadorInscricaoEstadualDestinatario)) {
    return json(400, { error: "Indicador de inscricao estadual do destinatario invalido." });
  }
  if (indicadorInscricaoEstadualDestinatario === "1" && !inscricaoEstadualDestinatario) {
    return json(400, { error: "Informe a inscricao estadual do comprador contribuinte." });
  }

  const valorTotal = Number(venda.valor ?? 0);
  if (valorTotal <= 0) {
    return json(400, { error: "Valor da venda invalido." });
  }

  const descricaoProduto = buildNfeDescription(veiculo as Record<string, unknown>);

  const ref = typeof existingNfe?.ref === "string" && existingNfe.ref
    ? existingNfe.ref
    : `nfe_${session.tenantId}_${vendaId.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  const baseUrl = focusNfeBaseUrl(config.ambiente);
  const authHeader = focusNfeAuth(config.focusApiKey);

  const destinatario = {
    nome: compradorNome,
    documento: compradorCpfCnpj,
    email: compradorEmail || null,
    logradouro: compradorLogradouro,
    numero: compradorNumero,
    complemento: compradorComplemento || null,
    bairro: compradorBairro,
    municipio: compradorMunicipio,
    codigoMunicipio: compradorCodigoMunicipio || null,
    uf: compradorUf,
    cep: compradorCep,
    indicadorInscricaoEstadual: indicadorInscricaoEstadualDestinatario,
    inscricaoEstadual: inscricaoEstadualDestinatario || null,
  };

  const nfePayload = {
    natureza_operacao: "VENDA DE VEICULO USADO",
    finalidade_emissao: "1",
    consumidor_final: "1",
    presenca_comprador: "1",
    modalidade_frete: "9",
    cnpj_emitente: cleanCnpjCpf(config.cnpj),
    nome_emitente: config.razaoSocial,
    ...(config.nomeFantasia ? { nome_fantasia_emitente: config.nomeFantasia } : {}),
    logradouro_emitente: config.logradouro,
    numero_emitente: config.numero,
    ...(config.complemento ? { complemento_emitente: config.complemento } : {}),
    bairro_emitente: config.bairro,
    municipio_emitente: config.municipio,
    codigo_municipio_emitente: config.codigoMunicipio,
    uf_emitente: config.uf,
    cep_emitente: cleanCep(config.cep),
    inscricao_estadual_emitente: config.inscricaoEstadual,
    regime_tributario_emitente: config.regimeTributario,
    ...(config.telefone ? { telefone_emitente: cleanCnpjCpf(config.telefone) } : {}),
    ...(compradorCpfCnpj.length === 11 ? { cpf_destinatario: compradorCpfCnpj } : { cnpj_destinatario: compradorCpfCnpj }),
    nome_destinatario: compradorNome,
    logradouro_destinatario: compradorLogradouro,
    numero_destinatario: compradorNumero,
    ...(compradorComplemento ? { complemento_destinatario: compradorComplemento } : {}),
    bairro_destinatario: compradorBairro,
    municipio_destinatario: compradorMunicipio,
    ...(compradorCodigoMunicipio ? { codigo_municipio_destinatario: compradorCodigoMunicipio } : {}),
    uf_destinatario: compradorUf,
    cep_destinatario: compradorCep,
    indicador_inscricao_estadual_destinatario: indicadorInscricaoEstadualDestinatario,
    ...(inscricaoEstadualDestinatario ? { inscricao_estadual_destinatario: inscricaoEstadualDestinatario } : {}),
    ...(compradorEmail ? { email_destinatario: compradorEmail } : {}),
    valor_produtos: valorTotal.toFixed(2),
    valor_total: valorTotal.toFixed(2),
    items: [
      {
        numero_item: "1",
        codigo_produto: String(veiculo.id ?? vendaId).slice(0, 60),
        descricao: descricaoProduto.slice(0, 120),
        codigo_ncm: "87032190",
        cfop: "5102",
        unidade_comercial: "UN",
        quantidade_comercial: "1.00",
        valor_unitario_comercial: valorTotal.toFixed(2),
        valor_bruto: valorTotal.toFixed(2),
        icms_origem: "0",
        icms_situacao_tributaria: "400",
        pis_situacao_tributaria: "07",
        cofins_situacao_tributaria: "07",
      },
    ],
    formas_pagamento: [
      {
        forma_pagamento: formaPagamento,
        valor_pagamento: valorTotal.toFixed(2),
      },
    ],
  };

  try {
    const focusRes = await fetch(`${baseUrl}/nfe?ref=${encodeURIComponent(ref)}`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nfePayload),
    });

    const focusBody = await focusRes.json().catch(() => ({})) as Record<string, unknown>;

    if (focusRes.status >= 500) {
      return json(502, { error: "Servico de NF-e indisponivel. Tente novamente." });
    }

    const nfeInfo = buildNfeInfoFromFocus({
      config,
      ref,
      focusBody,
      httpStatus: focusRes.status,
      valorTotal,
      descricaoProduto,
      formaPagamento,
      destinatario,
      existingNfe,
    });

    const vendaAtualizada = updateVendaNfe(session.tenantId, vendaId, nfeInfo);
    return json(nfeInfo.status === "pendente" ? 202 : 200, {
      success: true,
      alreadyExists: false,
      nfe: nfeInfo,
      venda: vendaAtualizada,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao emitir NF-e.";
    return json(500, { error: msg });
  }
}

async function handleNfeStatus(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || !session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "NF-e nao configurado." });
  }

  const url = new URL(`http://localhost${request.path}`);
  const vendaId = (url.searchParams.get("vendaId") ?? "").trim();
  const queryRef = (url.searchParams.get("ref") ?? "").trim();

  let ref = queryRef;
  let vendaNfe: Record<string, unknown> | null = null;

  if (vendaId) {
    const vendaResult = getVendaContext(session, vendaId);
    if ("error" in vendaResult) return vendaResult.error;
    vendaNfe = asRecord(vendaResult.venda.nfe);
    ref = ref || String(vendaNfe?.ref ?? "");
  }

  if (!ref) return json(400, { error: "Informe o ref da NF-e." });

  try {
    const focusRes = await fetch(
      `${focusNfeBaseUrl(config.ambiente)}/nfe/${encodeURIComponent(ref)}?completa=1`,
      { headers: { Authorization: focusNfeAuth(config.focusApiKey) } },
    );
    const focusBody = await focusRes.json().catch(() => ({})) as Record<string, unknown>;

    if (!focusRes.ok && focusRes.status !== 404) {
      return json(focusRes.status, { error: extractFocusError(focusBody) });
    }
    if (focusRes.status === 404) {
      return json(404, { error: "NF-e nao encontrada na Focus." });
    }

    if (session.tenantId && vendaId) {
      const existingDestinatario = asRecord(vendaNfe?.destinatario) ?? {};
      const nfeInfo = buildNfeInfoFromFocus({
        config,
        ref,
        focusBody,
        httpStatus: focusRes.status,
        valorTotal: Number(vendaNfe?.valorTotal ?? 0),
        descricaoProduto: String(vendaNfe?.descricaoProduto ?? ""),
        formaPagamento: String(vendaNfe?.formaPagamento ?? "01"),
        destinatario: existingDestinatario,
        existingNfe: vendaNfe,
      });
      const vendaAtualizada = updateVendaNfe(session.tenantId, vendaId, nfeInfo);
      return json(200, { success: true, nfe: nfeInfo, venda: vendaAtualizada });
    }

    return json(200, { success: true, ref, focus: focusBody });
  } catch (error) {
    return json(502, { error: "Servico de NF-e indisponivel." });
  }
}

async function handleNfeCancelar(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const sessionResult = requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || session.role !== "owner") {
    return json(403, { error: "Somente o owner pode cancelar NF-e." });
  }
  if (!session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = getNfeConfig(session.tenantId);
  if (!config) return json(400, { error: "NF-e nao configurado." });

  const body = (request.body ?? {}) as Record<string, unknown>;
  const vendaId = String(body.vendaId ?? "").trim();
  const informedRef = String(body.ref ?? "").trim();
  const justificativa = String(body.justificativa ?? "").trim();

  if (!vendaId) return json(400, { error: "Informe o ID da venda." });
  if (justificativa.length < 15) {
    return json(400, { error: "A justificativa deve ter pelo menos 15 caracteres." });
  }
  if (justificativa.length > 255) {
    return json(400, { error: "A justificativa deve ter no maximo 255 caracteres." });
  }

  const vendaResult = getVendaContext(session, vendaId);
  if ("error" in vendaResult) return vendaResult.error;
  const existingNfe = asRecord(vendaResult.venda.nfe);
  const ref = String(existingNfe?.ref ?? "");

  if (!ref) {
    return json(400, { error: "Esta venda nao possui NF-e emitida." });
  }
  if (informedRef && informedRef !== ref) {
    return json(400, { error: "A referencia informada nao corresponde a NF-e da venda." });
  }

  try {
    const focusRes = await fetch(
      `${focusNfeBaseUrl(config.ambiente)}/nfe/${encodeURIComponent(ref)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: focusNfeAuth(config.focusApiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ justificativa }),
      },
    );
    const focusBody = await focusRes.json().catch(() => ({})) as Record<string, unknown>;

    if (focusRes.ok || String(focusBody.codigo ?? "") === "nfe_cancelada") {
      const nfeInfo = buildNfeInfoFromFocus({
        config,
        ref,
        focusBody: { ...focusBody, status: "cancelado" },
        httpStatus: focusRes.status,
        valorTotal: Number(existingNfe?.valorTotal ?? vendaResult.venda.valor ?? 0),
        descricaoProduto: String(existingNfe?.descricaoProduto ?? buildNfeDescription(vendaResult.veiculo as Record<string, unknown>)),
        formaPagamento: String(existingNfe?.formaPagamento ?? "01"),
        destinatario: asRecord(existingNfe?.destinatario) ?? {},
        existingNfe,
        cancelledNow: true,
        justificativa,
      });
      const vendaAtualizada = updateVendaNfe(session.tenantId, vendaId, nfeInfo);
      return json(200, { success: true, nfe: nfeInfo });
    }

    return json(focusRes.status, {
      error: extractFocusError(focusBody),
    });
  } catch (error) {
    return json(500, { error: "Erro ao cancelar NF-e." });
  }
}

function checkCsrf(method: string, headers: Record<string, string>): ResponseShape | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const origin = headers["origin"];
  const referer = headers["referer"];
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8080";
  const allowedHost = new URL(baseUrl).host;
  const isDev = process.env.NODE_ENV !== "production";

  function isAllowed(url: string): boolean {
    try {
      const { hostname, host } = new URL(url);
      // Em desenvolvimento, aceita qualquer porta do localhost
      if (isDev && (hostname === "localhost" || hostname === "127.0.0.1")) return true;
      return host === allowedHost;
    } catch {
      return false;
    }
  }

  if (origin) {
    if (!isAllowed(origin)) return json(403, { error: "Requisicao de origem nao permitida." });
    return null;
  }

  if (referer) {
    if (!isAllowed(referer)) return json(403, { error: "Requisicao de origem nao permitida." });
    return null;
  }

  return null;
}

export async function handleBackendRequest(request: RequestShape): Promise<ResponseShape> {
  const headers = normalizeHeaders(request.headers);

  const csrfBlock = checkCsrf(request.method, headers);
  if (csrfBlock) return csrfBlock;

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

    if (request.path === "/api/auth/forgot-password") {
      return await handleForgotPassword(request);
    }

    if (request.path === "/api/auth/reset-password") {
      return await handleResetPassword(request);
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

    if (/^\/api\/platform\/stores\/\d+\/nfe-config$/.test(request.path)) {
      return await handlePlatformStoreNfeConfig(request, headers);
    }

    if (/^\/api\/platform\/stores\/\d+$/.test(request.path)) {
      return await handlePlatformStoreUpdate(request, headers);
    }

    if (request.path === "/api/tenant/team") {
      return await handleTenantTeam(request, headers);
    }

    if (/^\/api\/tenant\/members\/\d+\/permissions$/.test(request.path)) {
      return await handleMemberPermissions(request, headers);
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

    if (request.path === "/api/nfe/config") {
      return await handleNfeConfig(request, headers);
    }

    if (request.path === "/api/nfe/emitir") {
      return await handleNfeEmitir(request, headers);
    }

    if (request.path.startsWith("/api/nfe/danfe")) {
      return await handleNfeAsset(request, headers, "danfe");
    }

    if (request.path.startsWith("/api/nfe/xml")) {
      return await handleNfeAsset(request, headers, "xml");
    }

    if (request.path.startsWith("/api/nfe/status")) {
      return await handleNfeStatus(request, headers);
    }

    if (request.path === "/api/nfe/cancelar") {
      return await handleNfeCancelar(request, headers);
    }

    // ── Health check (Railway / monitoring) ─────────────────────────────
    if (request.path === "/api/health") {
      return json(200, {
        status: "ok",
        version: process.env.npm_package_version ?? "1.0.0",
        timestamp: new Date().toISOString(),
      });
    }

    // ── API v1 — rotas reservadas para integracoes externas futuras ──────
    // Autenticacao via Bearer token sera adicionada aqui
    // Exemplo de uso: integrar com site, app mobile, ou ERPs de clientes
    //
    // GET  /api/v1/stores              → listar lojas (platform_admin)
    // GET  /api/v1/stores/:id/veiculos → estoque publico de uma loja
    // POST /api/v1/stores/:id/leads    → receber lead externo (site/landing page)
    // GET  /api/v1/stores/:id/stats    → KPIs publicos (para dashboard externo)
    //
    if (request.path.startsWith("/api/v1/")) {
      return json(501, {
        error: "API v1 em desenvolvimento. Disponivel em breve.",
        docs: "https://docs.autovenda.pro/api",
      });
    }

    return json(404, { error: "Rota nao encontrada." });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Falha interna do servidor.",
    });
  }
}
