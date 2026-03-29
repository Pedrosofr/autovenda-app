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
  type AuthenticatedSession,
  type TenantStatus,
  type SellerPermissions,
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

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return json(503, { error: "GOOGLE_API_KEY nao configurada." });
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const bodyStr = JSON.stringify(request.body ?? {});

  let upstream = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });

  // Retry uma vez apos 5s se der rate limit (429)
  if (upstream.status === 429) {
    await new Promise((r) => setTimeout(r, 5000));
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyStr,
    });
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
