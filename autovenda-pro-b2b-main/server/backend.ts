import { createRequire } from "node:module";
import { lookupFipeByText, suggestFipeBrands, suggestFipeModels } from "./fipe";
import type { AppStateResourcePatch } from "../src/lib/app-state";
import {
  CONSULTATION_MODULE_IDS,
  CONSULTATION_MODULE_MAP,
  expandConsultationModules,
  type ConsultationExecutionQuery,
  type ConsultationExecutionResponse,
  type ConsultationModuleId,
  type ConsultationModuleResult,
  type ConsultationVehicleSummary,
} from "../src/lib/consulta-modules";
import type { Veiculo, Venda } from "../src/store/types";
import { z } from "zod";
import { createRequestId, logEvent, toErrorDetails } from "./observability";
import { getRateLimitStoreMetrics } from "./rate-limit";
import {
  authenticateUser,
  checkDatabaseHealth,
  clearSessionCookieHeader,
  createInviteForTenant,
  createTenantUserForPlatform,
  createSellerForTenant,
  deleteAccount,
  createTenantWithOwner,
  enforceDistributedRateLimit,
  getDatabaseMode,
  getSessionFromCookie,
  getTenantAppState,
  listPlatformAuditEvents,
  listStores,
  listTenantAuditEvents,
  listTenantInvites,
  listTenantMembersByTenantId,
  listTenantMembers,
  revokeInviteForTenant,
  revokeSession,
  revokeAllSessionsForUser,
  sessionToResponse,
  acceptInviteWithToken,
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
const APP_BRAND_NAME = "ROZZ CAR";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const signupBodySchema = z.object({
  storeName: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email(),
  ownerPassword: z.string().min(6),
});

const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email(),
});

const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const acceptInviteBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const geminiBodySchema = z.object({
  contents: z.array(z.object({
    role: z.string().min(1),
    parts: z.array(z.union([
      z.object({ text: z.string() }),
      z.object({
        inlineData: z.object({
          mimeType: z.string().min(1),
          data: z.string().min(1),
        }),
      }),
    ])).min(1),
  })).min(1),
  generationConfig: z.object({
    responseMimeType: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  }).optional(),
});

const tenantStatusSchema = z.enum(["trial", "active", "past_due", "blocked", "closed"]);
const tenantUserRoleSchema = z.enum(["owner", "seller"]);

const platformStoreCreateSchema = z.object({
  storeName: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().email(),
  ownerPassword: z.string().min(6),
  trialDays: z.coerce.number().int().min(1).max(365).default(7),
  maxUsers: z.coerce.number().int().min(1).max(500).default(5),
  maxVehicles: z.coerce.number().int().min(1).max(5000).default(30),
});

const platformStoreUpdateSchema = z.object({
  status: tenantStatusSchema.optional(),
  extendTrialDays: z.coerce.number().int().min(1).max(365).optional(),
  trialDays: z.coerce.number().int().min(1).max(365).optional(),
  maxUsers: z.coerce.number().int().min(1).max(500).optional(),
  maxVehicles: z.coerce.number().int().min(1).max(5000).optional(),
  nfeEnabled: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Informe ao menos um campo para atualizar a loja.",
});

const tenantUserCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(6),
  role: tenantUserRoleSchema.default("seller"),
  salesGoalMonthly: z.coerce.number().int().min(0).nullable().optional(),
});

const tenantInviteCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  role: tenantUserRoleSchema.default("seller"),
  salesGoalMonthly: z.coerce.number().int().min(0).nullable().optional(),
});

const sellerPermissionsSchema = z.object({
  verCRM: z.boolean().optional(),
  verEstoque: z.boolean().optional(),
  adicionarVeiculo: z.boolean().optional(),
  editarVeiculo: z.boolean().optional(),
  excluirVeiculo: z.boolean().optional(),
  verConsulta: z.boolean().optional(),
  verPosVenda: z.boolean().optional(),
  verCustos: z.boolean().optional(),
  verCreditos: z.boolean().optional(),
}).strict();

const appStateResourceItemSchema = z.object({
  id: z.string().trim().min(1),
}).passthrough();

const configPrecosSchema = z.object({
  pinturaPorPeca: z.coerce.number().finite().min(0).max(1_000_000),
  pneuPequeno: z.coerce.number().finite().min(0).max(1_000_000),
  pneuGrande: z.coerce.number().finite().min(0).max(1_000_000),
  higienizacaoPequeno: z.coerce.number().finite().min(0).max(1_000_000),
  higienizacaoGrande: z.coerce.number().finite().min(0).max(1_000_000),
  polimentoPequeno: z.coerce.number().finite().min(0).max(1_000_000),
  polimentoGrande: z.coerce.number().finite().min(0).max(1_000_000),
  margemLucroPercent: z.coerce.number().finite().min(0).max(1000),
  telefoneLoja: z.string().trim().max(40).optional(),
}).strict();

const memoriaLojaExampleSchema = z.object({
  modelo: z.string().trim().min(1).max(160),
  titulo: z.string().trim().min(1).max(220),
  descricao: z.string().trim().min(1).max(4000),
  categoria: z.string().trim().min(1).max(80),
  criadoEm: z.string().trim().min(1).max(80),
}).strict();

const memoriaLojaSchema = z.object({
  tomDeVoz: z.enum(["consultivo", "direto", "premium"]),
  focosComerciais: z.array(z.string().trim().min(1).max(120)).max(30),
  gatilhosFixos: z.array(z.string().trim().min(1).max(240)).max(40),
  frasesRecorrentes: z.array(z.string().trim().min(1).max(240)).max(50),
  categoriasMaisUsadas: z.array(z.string().trim().min(1).max(120)).max(30),
  exemplosRecentes: z.array(memoriaLojaExampleSchema).max(40),
  atualizadoEm: z.string().trim().min(1).max(80),
}).strict();

const appStatePatchSchema = z.object({
  veiculos: z.array(appStateResourceItemSchema).optional(),
  leads: z.array(appStateResourceItemSchema).optional(),
  vendas: z.array(appStateResourceItemSchema).optional(),
  consultas: z.array(appStateResourceItemSchema).optional(),
  tarefasPosVenda: z.array(appStateResourceItemSchema).optional(),
  custos: z.array(appStateResourceItemSchema).optional(),
  configPrecos: configPrecosSchema.optional(),
  memoriaLoja: memoriaLojaSchema.optional(),
}).strict();

const consultationExecutionSchema = z.object({
  plate: z.string().trim().optional(),
  marca: z.string().trim().optional(),
  modelo: z.string().trim().optional(),
  ano: z.string().trim().optional(),
  moduleIds: z.array(z.enum(CONSULTATION_MODULE_IDS)).min(1),
}).strict();

const nfeConfigBodySchema = z.object({
  focusApiKey: z.string().trim().optional(),
  ambiente: z.enum(["homologacao", "producao"]).optional(),
  cnpj: z.string().trim().optional(),
  razaoSocial: z.string().trim().optional(),
  nomeFantasia: z.string().trim().optional(),
  inscricaoEstadual: z.string().trim().optional(),
  regimeTributario: z.enum(["1", "2", "3"]).optional(),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  municipio: z.string().trim().optional(),
  codigoMunicipio: z.string().trim().optional(),
  uf: z.string().trim().optional(),
  cep: z.string().trim().optional(),
  telefone: z.string().trim().optional(),
  email: z.string().trim().optional(),
}).strict();

const emitirNfeBodySchema = z.object({
  vendaId: z.string().trim().min(1),
  compradorNome: z.string().trim().min(1),
  compradorCpfCnpj: z.string().trim().min(1),
  compradorEmail: z.string().trim().email().optional().or(z.literal("")),
  compradorLogradouro: z.string().trim().min(1),
  compradorNumero: z.string().trim().min(1),
  compradorComplemento: z.string().trim().optional(),
  compradorBairro: z.string().trim().min(1),
  compradorMunicipio: z.string().trim().min(1),
  compradorCodigoMunicipio: z.string().trim().optional(),
  compradorUf: z.string().trim().length(2),
  compradorCep: z.string().trim().min(8),
  indicadorInscricaoEstadualDestinatario: z.enum(["1", "2", "9"]).optional().default("9"),
  inscricaoEstadualDestinatario: z.string().trim().optional(),
  formaPagamento: z.string().trim().min(2).max(2).optional().default("01"),
}).passthrough();

const cancelarNfeBodySchema = z.object({
  vendaId: z.string().trim().min(1),
  ref: z.string().trim().optional(),
  justificativa: z.string().trim().min(15).max(255),
}).strict();

type RequestShape = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  requestId?: string;
};

type ResponseShape = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

type SessionResult =
  | { session: AuthenticatedSession }
  | { error: ResponseShape };

type ErrorResult = { error: ResponseShape };
type VendaContextResult = { venda: Venda; veiculo: Veiculo };
type VendaContextByRefResult = { venda: Venda; veiculo: Veiculo | null };
type NfeProviderStatusResult =
  | { focusBody: Record<string, unknown>; httpStatus: number }
  | ErrorResult;
type NfeAssetResult =
  | { assetUrl: string; nfe: Record<string, unknown> }
  | ErrorResult;

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

function publicErrorMessage(error: unknown, fallback: string) {
  if (!IS_PRODUCTION && error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function logServerError(context: string, error: unknown) {
  logEvent("error", "backend.error", {
    context,
    error: toErrorDetails(error),
  });
}

async function requireSession(
  headers: Record<string, string>,
  options?: { allowRestrictedTenant?: boolean },
): Promise<SessionResult> {
  const session = await getSessionFromCookie(headers.cookie);
  if (!session) {
    return { error: json(401, { error: "Sessao invalida ou expirada." }) };
  }

  if (
    !options?.allowRestrictedTenant &&
    session.role !== "platform_admin" &&
    (session.tenantStatus === "past_due" || session.tenantStatus === "blocked" || session.tenantStatus === "closed")
  ) {
    return {
      error: json(403, {
        error:
          session.tenantStatus === "past_due"
            ? "O trial da loja expirou. Regularize o plano para continuar usando o sistema."
            : "A loja esta bloqueada ou encerrada.",
      }),
    };
  }

  return { session };
}

async function requirePlatformAdmin(headers: Record<string, string>): Promise<SessionResult> {
  const result = await requireSession(headers);
  if ("error" in result) return result;
  if (result.session.role !== "platform_admin") {
    return { error: json(403, { error: "Acesso restrito ao admin da plataforma." }) };
  }
  return result;
}

async function requireOwner(headers: Record<string, string>): Promise<SessionResult> {
  const result = await requireSession(headers);
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
  const retryAfter = await enforceDistributedRateLimit(`login:${ip}`, 10, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const parsedBody = loginBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe um e-mail valido e a senha." });
  }

  const email = parsedBody.data.email.trim().toLowerCase();
  const password = parsedBody.data.password;

  const auth = await authenticateUser(email, password, {
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

async function handleSignup(request: RequestShape, headers: Record<string, string>) {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = await enforceDistributedRateLimit(`signup:${ip}`, 5, 10 * 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas de cadastro. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const parsedBody = signupBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, {
      error: "Informe nome da loja, slug valido, seu nome, e-mail valido e senha com ao menos 6 caracteres.",
    });
  }

  try {
    await createTenantWithOwner({
      storeName: parsedBody.data.storeName,
      slug: parsedBody.data.slug,
      ownerName: parsedBody.data.ownerName,
      ownerEmail: parsedBody.data.ownerEmail,
      ownerPassword: parsedBody.data.ownerPassword,
      trialDays: Number(process.env.DEFAULT_TRIAL_DAYS ?? 7),
      maxUsers: Number(process.env.DEFAULT_MAX_USERS ?? 5),
      maxVehicles: Number(process.env.DEFAULT_MAX_VEHICLES ?? 30),
    });

    const auth = await authenticateUser(parsedBody.data.ownerEmail, parsedBody.data.ownerPassword, {
      ip,
      userAgent: headers["user-agent"],
    });

    if (!auth) {
      return json(500, { error: "Cadastro concluido, mas nao foi possivel iniciar a sessao automaticamente." });
    }

    return json(201, sessionToResponse(auth.session), {
      "Set-Cookie": auth.cookieHeader,
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel concluir o cadastro." });
  }
}

async function handleSession(headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers, { allowRestrictedTenant: true });
  if ("error" in result) return result.error;
  return json(200, sessionToResponse(result.session));
}

async function handleLogout(headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers, { allowRestrictedTenant: true });
  if (!("error" in result)) {
    await revokeSession(result.session.sessionId);
  }

  return json(200, { success: true }, {
    "Set-Cookie": clearSessionCookieHeader(),
  });
}

async function handleLogoutAll(headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers, { allowRestrictedTenant: true });
  if (!("error" in result)) {
    await revokeAllSessionsForUser(result.session.userId);
  }

  return json(200, { success: true }, {
    "Set-Cookie": clearSessionCookieHeader(),
  });
}

async function handleDeleteAccount(headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers, { allowRestrictedTenant: true });
  if ("error" in result) return result.error;
  await deleteAccount(result.session);
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
        from: `${APP_BRAND_NAME} <${fromEmail}>`,
        to: [email],
        subject: `Recuperacao de senha - ${APP_BRAND_NAME}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f1117; color: #e5e7eb; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                <span style="font-size: 24px; color: white;">R</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; color: white;">${APP_BRAND_NAME}</h1>
            </div>
            <p style="color: #d1d5db;">Ola, <strong>${name}</strong>.</p>
            <p style="color: #9ca3af;">Recebemos uma solicitacao para redefinir sua senha. Clique no botao abaixo para criar uma nova senha:</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 14px;">Redefinir minha senha</a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">Este link expira em 30 minutos. Se voce nao solicitou a troca, ignore este email.</p>
            <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />
            <p style="color: #4b5563; font-size: 11px; text-align: center;">${APP_BRAND_NAME} - Gestao automotiva inteligente</p>
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

async function sendInviteEmail(
  email: string,
  name: string,
  inviteUrl: string,
  tenantName: string,
  role: "owner" | "seller",
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY nao configurada. Email de convite nao enviado para:", email);
    return true;
  }

  const fromEmail = process.env.EMAIL_FROM ?? "noreply@rozzcar.com";
  const roleLabel = role === "owner" ? "acesso total" : "vendedor";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${APP_BRAND_NAME} <${fromEmail}>`,
        to: [email],
        subject: `Convite para acessar ${tenantName} - ${APP_BRAND_NAME}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f1117; color: #e5e7eb; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                <span style="font-size: 24px; color: white;">R</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; color: white;">${APP_BRAND_NAME}</h1>
            </div>
            <p style="color: #d1d5db;">Ola, <strong>${name}</strong>.</p>
            <p style="color: #9ca3af;">Voce recebeu um convite para acessar a loja <strong>${tenantName}</strong> com perfil de <strong>${roleLabel}</strong>.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: bold; font-size: 14px;">Criar senha e entrar</a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">Esse convite expira em 7 dias. Se voce nao esperava esse acesso, ignore este email.</p>
            <hr style="border: none; border-top: 1px solid #1f2937; margin: 24px 0;" />
            <p style="color: #4b5563; font-size: 11px; text-align: center;">${APP_BRAND_NAME} - Gestao automotiva inteligente</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[Email] Falha ao enviar convite:", res.status, err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Email] Erro ao enviar convite:", err);
    return false;
  }
}

async function handleForgotPassword(request: RequestShape): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = await enforceDistributedRateLimit(`forgot:${ip}`, 5, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const parsedBody = forgotPasswordBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe um e-mail valido." });
  }

  const email = parsedBody.data.email.trim().toLowerCase();

  // Sempre retorna sucesso para nao revelar se o email existe
  const result = await createPasswordResetToken(email);

  if (result) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8082";
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
  const retryAfter = await enforceDistributedRateLimit(`reset:${ip}`, 5, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const parsedBody = resetPasswordBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe um token valido e uma senha com ao menos 6 caracteres." });
  }

  const token = parsedBody.data.token;
  const newPassword = parsedBody.data.password;

  const success = await resetPasswordWithToken(token, newPassword);
  if (!success) {
    return json(400, { error: "Link expirado ou invalido. Solicite um novo." });
  }

  return json(200, { message: "Senha redefinida com sucesso. Faca login com a nova senha." });
}

async function handleAcceptInvite(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const ip = request.ip ?? "unknown";
  const retryAfter = await enforceDistributedRateLimit(`accept-invite:${ip}`, 5, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas tentativas. Tente novamente em instantes." }, { "Retry-After": String(retryAfter) });
  }

  const parsedBody = acceptInviteBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe um convite valido e uma senha com ao menos 6 caracteres." });
  }

  try {
    const auth = await acceptInviteWithToken(parsedBody.data.token, {
      password: parsedBody.data.password,
      metadata: {
        ip,
        userAgent: headers["user-agent"],
      },
    });

    if (!auth) {
      return json(400, { error: "Esse convite expirou, foi cancelado ou ja foi usado." });
    }

    return json(200, sessionToResponse(auth.session), {
      "Set-Cookie": auth.cookieHeader,
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel aceitar o convite." });
  }
}

async function handlePlatformStores(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  if (request.method === "GET") {
    return json(200, { stores: await listStores() });
  }

  if (request.method === "POST") {
    const rawBody = (request.body ?? {}) as Record<string, unknown>;
    const parsedBody = platformStoreCreateSchema.safeParse({
      ...rawBody,
      trialDays: rawBody.trialDays ?? process.env.DEFAULT_TRIAL_DAYS ?? 7,
    });
    if (!parsedBody.success) {
      return json(400, { error: "Informe loja, slug valido, owner, e-mail valido e senha com ao menos 6 caracteres." });
    }

    try {
      await createTenantWithOwner({
        storeName: parsedBody.data.storeName,
        slug: parsedBody.data.slug,
        ownerName: parsedBody.data.ownerName,
        ownerEmail: parsedBody.data.ownerEmail,
        ownerPassword: parsedBody.data.ownerPassword,
        trialDays: parsedBody.data.trialDays,
        maxUsers: parsedBody.data.maxUsers,
        maxVehicles: parsedBody.data.maxVehicles,
      });
      return json(201, { success: true, stores: await listStores() });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar a loja." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handlePlatformStoreUpdate(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  if (request.method !== "PATCH") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PATCH" });
  }

  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }

  const parsedBody = platformStoreUpdateSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Payload invalido para atualizacao da loja." });
  }

  try {
    await updateStoreStatus(storeId, {
      status: parsedBody.data.status as TenantStatus | undefined,
      extendTrialDays: parsedBody.data.extendTrialDays,
      trialDays: parsedBody.data.trialDays,
      maxUsers: parsedBody.data.maxUsers,
      maxVehicles: parsedBody.data.maxVehicles,
    });
    if (parsedBody.data.nfeEnabled !== undefined) {
      await toggleNfeEnabled(storeId, parsedBody.data.nfeEnabled);
    }
    return json(200, { success: true, stores: await listStores() });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel atualizar a loja." });
  }
}

async function handleTenantTeam(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = await requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;

  if (!sessionResult.session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }

  if (request.method === "GET") {
    if (sessionResult.session.role !== "owner" && sessionResult.session.role !== "platform_admin") {
      return json(403, { error: "Acesso restrito ao owner." });
    }
    return json(200, {
      members: await listTenantMembers(sessionResult.session),
      invites: await listTenantInvites(sessionResult.session),
    });
  }

  if (request.method === "POST") {
    if (sessionResult.session.role !== "owner") {
      return json(403, { error: "Somente o owner pode criar vendedores." });
    }

    const parsedBody = tenantUserCreateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return json(400, { error: "Informe nome, e-mail valido e senha com ao menos 6 caracteres." });
    }

    try {
      await createSellerForTenant(sessionResult.session, {
        name: parsedBody.data.name,
        email: parsedBody.data.email,
        password: parsedBody.data.password,
        role: parsedBody.data.role,
        salesGoalMonthly: parsedBody.data.salesGoalMonthly ?? null,
      });
      return json(201, { success: true, members: await listTenantMembers(sessionResult.session) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o vendedor." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handleTenantInvites(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;

  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const parsedBody = tenantInviteCreateSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe nome, e-mail valido e os dados basicos do convite." });
  }

  try {
    const invite = await createInviteForTenant(sessionResult.session, {
      name: parsedBody.data.name,
      email: parsedBody.data.email,
      role: parsedBody.data.role,
      salesGoalMonthly: parsedBody.data.salesGoalMonthly ?? null,
    });

    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8082";
    const inviteUrl = `${baseUrl}/?invite=${invite.token}&email=${encodeURIComponent(invite.email)}&name=${encodeURIComponent(invite.name)}&store=${encodeURIComponent(invite.tenantName)}&role=${invite.role}`;
    await sendInviteEmail(invite.email, invite.name, inviteUrl, invite.tenantName, invite.role);

    return json(201, {
      success: true,
      inviteUrl,
      members: await listTenantMembers(sessionResult.session),
      invites: await listTenantInvites(sessionResult.session),
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel enviar o convite." });
  }
}

async function handleTenantInviteRevoke(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;

  if (request.method !== "DELETE") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "DELETE" });
  }

  const match = request.path.match(/^\/api\/tenant\/invites\/(\d+)$/);
  const inviteId = Number(match?.[1] ?? 0);
  if (!inviteId) {
    return json(400, { error: "Convite invalido." });
  }

  try {
    await revokeInviteForTenant(sessionResult.session, inviteId);
    return json(200, {
      success: true,
      members: await listTenantMembers(sessionResult.session),
      invites: await listTenantInvites(sessionResult.session),
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel cancelar o convite." });
  }
}

async function handlePlatformStoreTeam(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)\/team$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }

  if (request.method === "GET") {
    return json(200, { members: await listTenantMembersByTenantId(storeId) });
  }

  if (request.method === "POST") {
    const parsedBody = tenantUserCreateSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return json(400, { error: "Informe nome, e-mail valido e senha com ao menos 6 caracteres." });
    }

    try {
      await createTenantUserForPlatform(storeId, {
        name: parsedBody.data.name,
        email: parsedBody.data.email,
        password: parsedBody.data.password,
        role: parsedBody.data.role,
        salesGoalMonthly: parsedBody.data.salesGoalMonthly ?? null,
      });
      return json(201, { success: true, members: await listTenantMembersByTenantId(storeId) });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel criar o usuario." });
    }
  }

  return json(405, { error: "Metodo nao permitido." }, { Allow: "GET, POST" });
}

async function handlePlatformActivity(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  return json(200, { events: await listPlatformAuditEvents(20) });
}

async function handleMemberPermissions(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;

  if (request.method !== "PATCH") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PATCH" });
  }

  const match = request.path.match(/^\/api\/tenant\/members\/(\d+)\/permissions$/);
  const memberId = Number(match?.[1] ?? 0);
  if (!memberId) {
    return json(400, { error: "Membro invalido." });
  }

  const parsedBody = sellerPermissionsSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Payload invalido para permissoes do vendedor." });
  }

  try {
    await updateMemberPermissions(sessionResult.session, memberId, parsedBody.data);
    return json(200, { success: true });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel atualizar permissoes." });
  }
}

async function handleTenantActivity(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers);
  if ("error" in result) return result.error;

  if (!result.session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }

  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  return json(200, { events: await listTenantAuditEvents(result.session, 20) });
}

async function handleAppStateGet(headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers);
  if ("error" in result) return result.error;

  if (!result.session.tenantId) {
    return json(200, { state: await getTenantAppState(result.session) });
  }

  return json(200, { state: await getTenantAppState(result.session) });
}

async function handleAppStateUpdate(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  const result = await requireSession(headers);
  if ("error" in result) return result.error;

  if (!result.session.tenantId) {
    return json(400, { error: "Somente usuarios de loja podem sincronizar dados." });
  }

  if (request.method !== "PUT") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "PUT" });
  }

  const parsedBody = appStatePatchSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Payload invalido para sincronizacao do estado da loja." });
  }

  try {
    const state = await updateTenantAppState(result.session, parsedBody.data as AppStateResourcePatch);
    return json(200, { state });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Nao foi possivel sincronizar os dados." });
  }
}

async function handleGemini(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const sessionResult = await requireSession(headers);
  if ("error" in sessionResult) return sessionResult.error;

  const ip = request.ip ?? "unknown";
  const retryAfter = await enforceDistributedRateLimit(`gemini:${ip}`, 25, 60_000);
  if (retryAfter) {
    return json(429, { error: "Muitas requisicoes de IA. Aguarde alguns segundos." }, { "Retry-After": String(retryAfter) });
  }

  const validatedBody = geminiBodySchema.safeParse(request.body ?? {});
  if (!validatedBody.success) {
    return json(400, { error: "Payload invalido para requisicao Gemini." });
  }

  const apiKeys = [process.env.GOOGLE_API_KEY, process.env.GOOGLE_API_KEY_2].filter(Boolean) as string[];
  if (apiKeys.length === 0) {
    return json(503, { error: "GOOGLE_API_KEY nao configurada." });
  }

  const GEMINI_MODEL = "gemini-2.5-flash";
  const bodyStr = JSON.stringify(validatedBody.data);
  const retryableStatuses = new Set([429, 500, 503, 529]);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const tryKey = async (key: string) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyStr }
  );

  let upstream: Response | null = null;
  let usedKeyIndex = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const keyIndex = attempt < apiKeys.length ? attempt : usedKeyIndex;
    usedKeyIndex = keyIndex;
    upstream = await tryKey(apiKeys[keyIndex]);

    if (!retryableStatuses.has(upstream.status)) {
      break;
    }

    if (attempt < 2) {
      await sleep(1500 * (attempt + 1));
    }
  }

  if (!upstream) {
    return json(503, { error: "Servico de IA indisponivel no momento." });
  }

  const text = await upstream.text();
  console.log(`[Gemini] status=${upstream.status} bytes=${text.length}`);
  let upstreamBody: unknown = text;

  try {
    upstreamBody = JSON.parse(text);
  } catch {
    upstreamBody = { error: text };
  }

  if (!upstream.ok) {
    const upstreamError = upstreamBody as { error?: { message?: string } | string };
    const nestedMessage =
      typeof upstreamError.error === "string"
        ? upstreamError.error
        : upstreamError.error?.message;

    if (upstream.status === 503) {
      return json(503, {
        error: "Gemini indisponivel no momento por alta demanda. Tente novamente em alguns segundos.",
        detail: nestedMessage ?? null,
      });
    }

    if (upstream.status === 429) {
      return json(429, {
        error: "Gemini atingiu limite temporario de uso. Aguarde alguns segundos e tente novamente.",
        detail: nestedMessage ?? null,
      });
    }
  }

  return json(upstream.status, upstreamBody);
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

  const sessionResult = await requireOwner(headers);
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

  const sessionResult = await requireOwner(headers);
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

  const sessionResult = await requireOwner(headers);
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

  const sessionResult = await requireOwner(headers);
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

function buildPendingModuleResult(moduleId: ConsultationModuleId): ConsultationModuleResult {
  const definition = CONSULTATION_MODULE_MAP[moduleId];
  return {
    moduleId,
    title: definition.title,
    priceCents: definition.priceCents,
    providerKey: definition.providerKey,
    status: "pending_integration",
    message: "Modulo preparado para integrar API externa sem retrabalhar a tela.",
    executedAt: new Date().toISOString(),
  };
}

async function executeConsultationModules(query: ConsultationExecutionQuery, moduleIds: ConsultationModuleId[]) {
  const expandedModuleIds = expandConsultationModules(moduleIds);
  const results: ConsultationModuleResult[] = [];
  let vehicle: ConsultationVehicleSummary | null = null;
  const plate = normalizePlate(query.plate ?? "");

  const ensurePlateLookup = async () => {
    if (vehicle) return vehicle;
    if (!plate || !isValidPlate(plate)) return null;

    try {
      const { response, usedPlate } = await lookupPlateWithSinesp([plate]);
      vehicle = {
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
      };
      return vehicle;
    } catch (error) {
      const definition = CONSULTATION_MODULE_MAP.placa;
      const message = error instanceof Error ? error.message : "Nao foi possivel consultar a placa.";
      const status = /nao encontrado|placa nao encontrada/i.test(message) ? "not_found" : "provider_unavailable";

      if (!results.some((item) => item.moduleId === "placa")) {
        results.push({
          moduleId: "placa",
          title: definition.title,
          priceCents: definition.priceCents,
          providerKey: definition.providerKey,
          status,
          message:
            status === "not_found"
              ? "Placa nao encontrada."
              : "Provedor de placa indisponivel no momento.",
          executedAt: new Date().toISOString(),
        });
      }
      return null;
    }
  };

  for (const moduleId of expandedModuleIds) {
    if (results.some((item) => item.moduleId === moduleId)) continue;

    const definition = CONSULTATION_MODULE_MAP[moduleId];
    if (definition.availability !== "live") {
      results.push(buildPendingModuleResult(moduleId));
      continue;
    }

    if (moduleId === "placa") {
      const plateVehicle = await ensurePlateLookup();
      if (plateVehicle) {
        results.push({
          moduleId,
          title: definition.title,
          priceCents: definition.priceCents,
          providerKey: definition.providerKey,
          status: "completed",
          data: plateVehicle as unknown as Record<string, unknown>,
          executedAt: new Date().toISOString(),
        });
      }
      continue;
    }

    if (moduleId === "fipe") {
      const plateVehicle = await ensurePlateLookup();
      const marca = query.marca?.trim() || plateVehicle?.marca || "";
      const modelo = query.modelo?.trim() || plateVehicle?.modelo || "";
      const ano = query.ano?.trim() || plateVehicle?.ano || "";

      if (!modelo || !ano) {
        results.push({
          moduleId,
          title: definition.title,
          priceCents: definition.priceCents,
          providerKey: definition.providerKey,
          status: "failed",
          message: "Informe marca/modelo/ano ou use uma placa valida para consultar a FIPE.",
          executedAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        const fipe = await lookupFipeByText({ marca, modelo, ano, tipo: "carro" });
        if (!fipe) {
          results.push({
            moduleId,
            title: definition.title,
            priceCents: definition.priceCents,
            providerKey: definition.providerKey,
            status: "not_found",
            message: "FIPE nao localizada para os dados informados.",
            executedAt: new Date().toISOString(),
          });
          continue;
        }

        if (!vehicle) {
          vehicle = {
            placa: plateVehicle?.placa,
            placaConsultada: plateVehicle?.placaConsultada,
            marca: fipe.marca,
            modelo: fipe.modelo,
            ano: String(fipe.anoModelo),
            cor: plateVehicle?.cor,
            situacao: plateVehicle?.situacao,
            municipio: plateVehicle?.municipio,
            uf: plateVehicle?.uf,
            source: plateVehicle?.source ?? fipe.source,
          };
        }

        results.push({
          moduleId,
          title: definition.title,
          priceCents: definition.priceCents,
          providerKey: definition.providerKey,
          status: "completed",
          data: {
            valor: fipe.valor,
            marca: fipe.marca,
            modelo: fipe.modelo,
            anoModelo: fipe.anoModelo,
            combustivel: fipe.combustivel,
            codigoFipe: fipe.codigoFipe,
            mesReferencia: fipe.mesReferencia,
            autenticacao: fipe.autenticacao ?? null,
            source: fipe.source,
          },
          executedAt: new Date().toISOString(),
        });
      } catch (error) {
        results.push({
          moduleId,
          title: definition.title,
          priceCents: definition.priceCents,
          providerKey: definition.providerKey,
          status: "provider_unavailable",
          message: error instanceof Error ? error.message : "Falha ao consultar a FIPE.",
          executedAt: new Date().toISOString(),
        });
      }
    }
  }

  const totalPriceCents = moduleIds.reduce((sum, moduleId) => sum + CONSULTATION_MODULE_MAP[moduleId].priceCents, 0);
  const response: ConsultationExecutionResponse = {
    query: {
      plate: plate || undefined,
      marca: query.marca?.trim() || undefined,
      modelo: query.modelo?.trim() || undefined,
      ano: query.ano?.trim() || undefined,
    },
    requestedModuleIds: moduleIds,
    expandedModuleIds,
    totalPriceCents,
    vehicle,
    results,
  };

  return response;
}

async function handleConsultationCatalog(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "GET") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "GET" });
  }

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;

  return json(200, { modules: Object.values(CONSULTATION_MODULE_MAP) });
}

async function handleConsultationExecution(request: RequestShape, headers: Record<string, string>): Promise<ResponseShape> {
  if (request.method !== "POST") {
    return json(405, { error: "Metodo nao permitido." }, { Allow: "POST" });
  }

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;

  const parsedBody = consultationExecutionSchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Informe os modulos e os dados minimos da consulta." });
  }

  const response = await executeConsultationModules(
    {
      plate: parsedBody.data.plate,
      marca: parsedBody.data.marca,
      modelo: parsedBody.data.modelo,
      ano: parsedBody.data.ano,
    },
    parsedBody.data.moduleIds,
  );

  return json(200, response);
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

function isValidCnpj(value: string) {
  const cnpj = cleanCnpjCpf(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const digits = cnpj.split("").map(Number);
  const calcDigit = (sliceEnd: number) => {
    const weights = sliceEnd === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits.slice(0, sliceEnd).reduce((acc, digit, index) => acc + (digit * weights[index]), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calcDigit(12) === digits[12] && calcDigit(13) === digits[13];
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
  const result = await requirePlatformAdmin(headers);
  if ("error" in result) return result.error;

  const match = request.path.match(/^\/api\/platform\/stores\/(\d+)\/nfe-config$/);
  const storeId = Number(match?.[1] ?? 0);
  if (!storeId) {
    return json(400, { error: "Loja invalida." });
  }

  if (request.method === "GET") {
    try {
      const settings = await getStoreNfeSettings(storeId);
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
      const currentSettings = await getStoreNfeSettings(storeId);
      const parsedBody = nfeConfigBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return json(400, { error: "Payload invalido para configuracao de NF-e." });
      }
      const nextConfig = normalizeNfeConfigInput(parsedBody.data as Partial<NfeConfigData>, currentSettings.config);
      const validationError = validateNfeConfig(nextConfig);
      if (validationError) {
        return json(400, { error: validationError });
      }

      await updateStoreNfeConfig(storeId, nextConfig, result.session.userId);
      const nextSettings = await getStoreNfeSettings(storeId);
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

async function getVendaContext(
  session: AuthenticatedSession,
  vendaId: string,
): Promise<VendaContextResult | ErrorResult> {
  const state = await getTenantAppState(session);
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

async function getVendaContextByNfeRef(
  session: AuthenticatedSession,
  ref: string,
): Promise<VendaContextByRefResult | ErrorResult> {
  const state = await getTenantAppState(session);
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
  if (!isValidCnpj(cnpjClean)) {
    return "CNPJ invalido. Informe um CNPJ valido com digitos verificadores.";
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

async function getTenantNfeContext(
  session: AuthenticatedSession,
  searchParams: URLSearchParams,
): Promise<TenantNfeContext | ErrorResult> {
  const vendaId = (searchParams.get("vendaId") ?? "").trim();
  const requestedRef = (searchParams.get("ref") ?? "").trim();

  const contextResult = vendaId
    ? await getVendaContext(session, vendaId)
    : requestedRef
      ? await getVendaContextByNfeRef(session, requestedRef)
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
    venda: contextResult.venda as unknown as Record<string, unknown>,
    veiculo: contextResult.veiculo as unknown as Record<string, unknown> | null,
    vendaId: String(contextResult.venda.id ?? vendaId),
    ref,
    nfe,
  } satisfies TenantNfeContext;
}

function buildNfeAssetFileName(ref: string, extension: "pdf" | "xml") {
  const safeRef = ref.replace(/[^a-z0-9_-]+/gi, "-");
  return `NF-e-${safeRef}.${extension}`;
}

async function fetchNfeStatusFromProvider(
  config: NfeConfigData,
  ref: string,
): Promise<NfeProviderStatusResult> {
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
): Promise<NfeAssetResult> {
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
  await updateVendaNfe(session.tenantId!, tenantNfe.vendaId, syncedNfe);

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

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || !session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = await getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "NF-e nao configurado." });
  }

  const url = new URL(`http://localhost${request.path}`);
  const tenantNfe = await getTenantNfeContext(session, url.searchParams);
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
  const sessionResult = await requireOwner(headers);
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

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId) {
    return json(400, { error: "Usuario sem loja vinculada." });
  }
  if (!session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = await getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "Configure os dados da empresa antes de emitir NF-e." });
  }

  const parsedBody = emitirNfeBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Payload invalido para emissao da NF-e." });
  }
  const vendaId = parsedBody.data.vendaId;
  const compradorNome = parsedBody.data.compradorNome;
  const compradorCpfCnpj = cleanCnpjCpf(parsedBody.data.compradorCpfCnpj);
  const compradorEmail = (parsedBody.data.compradorEmail ?? "").trim();
  const compradorLogradouro = parsedBody.data.compradorLogradouro;
  const compradorNumero = parsedBody.data.compradorNumero;
  const compradorComplemento = (parsedBody.data.compradorComplemento ?? "").trim();
  const compradorBairro = parsedBody.data.compradorBairro;
  const compradorMunicipio = parsedBody.data.compradorMunicipio;
  const compradorCodigoMunicipio = cleanCnpjCpf(String(parsedBody.data.compradorCodigoMunicipio ?? "")).slice(0, 7);
  const compradorUf = parsedBody.data.compradorUf.trim().toUpperCase().slice(0, 2);
  const compradorCep = cleanCep(parsedBody.data.compradorCep).slice(0, 8);
  const indicadorInscricaoEstadualDestinatario = parsedBody.data.indicadorInscricaoEstadualDestinatario;
  const inscricaoEstadualDestinatario = (parsedBody.data.inscricaoEstadualDestinatario ?? "").trim();
  const formaPagamento = parsedBody.data.formaPagamento.trim();

  const vendaResult = await getVendaContext(session, vendaId);
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

  const descricaoProduto = buildNfeDescription(veiculo as unknown as Record<string, unknown>);

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

    const vendaAtualizada = await updateVendaNfe(session.tenantId, vendaId, nfeInfo);
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

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || !session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = await getNfeConfig(session.tenantId);
  if (!config) {
    return json(400, { error: "NF-e nao configurado." });
  }

  const url = new URL(`http://localhost${request.path}`);
  const vendaId = (url.searchParams.get("vendaId") ?? "").trim();
  const queryRef = (url.searchParams.get("ref") ?? "").trim();

  let ref = queryRef;
  let vendaNfe: Record<string, unknown> | null = null;

  if (vendaId) {
    const vendaResult = await getVendaContext(session, vendaId);
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
      const vendaAtualizada = await updateVendaNfe(session.tenantId, vendaId, nfeInfo);
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

  const sessionResult = await requireOwner(headers);
  if ("error" in sessionResult) return sessionResult.error;
  const { session } = sessionResult;

  if (!session.tenantId || session.role !== "owner") {
    return json(403, { error: "Somente o owner pode cancelar NF-e." });
  }
  if (!session.nfeEnabled) {
    return json(403, { error: "NF-e nao habilitado para esta loja." });
  }

  const config = await getNfeConfig(session.tenantId);
  if (!config) return json(400, { error: "NF-e nao configurado." });

  const parsedBody = cancelarNfeBodySchema.safeParse(request.body ?? {});
  if (!parsedBody.success) {
    return json(400, { error: "Payload invalido para cancelamento da NF-e." });
  }
  const vendaId = parsedBody.data.vendaId;
  const informedRef = parsedBody.data.ref ?? "";
  const justificativa = parsedBody.data.justificativa;

  const vendaResult = await getVendaContext(session, vendaId);
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
        descricaoProduto: String(
          existingNfe?.descricaoProduto
          ?? buildNfeDescription(vendaResult.veiculo as unknown as Record<string, unknown>),
        ),
        formaPagamento: String(existingNfe?.formaPagamento ?? "01"),
        destinatario: asRecord(existingNfe?.destinatario) ?? {},
        existingNfe,
        cancelledNow: true,
        justificativa,
      });
      const vendaAtualizada = await updateVendaNfe(session.tenantId, vendaId, nfeInfo);
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
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:8082";
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
  const requestId = request.requestId ?? createRequestId();
  const startedAt = Date.now();
  const headers = normalizeHeaders(request.headers);
  const withRequestId = (response: ResponseShape): ResponseShape => ({
    ...response,
    headers: {
      ...(response.headers ?? {}),
      "X-Request-Id": requestId,
    },
  });

  const csrfBlock = checkCsrf(request.method, headers);
  if (csrfBlock) return withRequestId(csrfBlock);

  try {
    logEvent("info", "backend.request.received", {
      requestId,
      method: request.method,
      path: request.path,
      ip: request.ip ?? "unknown",
    });

    if (request.path === "/api/auth/login") {
      return withRequestId(await handleLogin(request, headers));
    }

    if (request.path === "/api/auth/signup") {
      return withRequestId(await handleSignup(request, headers));
    }

    if (request.path === "/api/auth/session") {
      return withRequestId(await handleSession(headers));
    }

    if (request.path === "/api/auth/logout") {
      return withRequestId(await handleLogout(headers));
    }

    if (request.path === "/api/auth/logout-all") {
      if (request.method !== "POST") {
        return withRequestId(json(405, { error: "Metodo nao permitido." }, { Allow: "POST" }));
      }
      return withRequestId(await handleLogoutAll(headers));
    }

    if (request.path === "/api/account") {
      if (request.method !== "DELETE") {
        return withRequestId(json(405, { error: "Metodo nao permitido." }, { Allow: "DELETE" }));
      }
      return withRequestId(await handleDeleteAccount(headers));
    }

    if (request.path === "/api/auth/forgot-password") {
      return withRequestId(await handleForgotPassword(request));
    }

    if (request.path === "/api/auth/reset-password") {
      return withRequestId(await handleResetPassword(request));
    }

    if (request.path === "/api/auth/accept-invite") {
      return withRequestId(await handleAcceptInvite(request, headers));
    }

    if (request.path === "/api/platform/stores") {
      return withRequestId(await handlePlatformStores(request, headers));
    }

    if (request.path === "/api/platform/activity") {
      return withRequestId(await handlePlatformActivity(request, headers));
    }

    if (/^\/api\/platform\/stores\/\d+\/team$/.test(request.path)) {
      return withRequestId(await handlePlatformStoreTeam(request, headers));
    }

    if (/^\/api\/platform\/stores\/\d+\/nfe-config$/.test(request.path)) {
      return withRequestId(await handlePlatformStoreNfeConfig(request, headers));
    }

    if (/^\/api\/platform\/stores\/\d+$/.test(request.path)) {
      return withRequestId(await handlePlatformStoreUpdate(request, headers));
    }

    if (request.path === "/api/tenant/team") {
      return withRequestId(await handleTenantTeam(request, headers));
    }

    if (request.path === "/api/tenant/invites") {
      return withRequestId(await handleTenantInvites(request, headers));
    }

    if (/^\/api\/tenant\/invites\/\d+$/.test(request.path)) {
      return withRequestId(await handleTenantInviteRevoke(request, headers));
    }

    if (/^\/api\/tenant\/members\/\d+\/permissions$/.test(request.path)) {
      return withRequestId(await handleMemberPermissions(request, headers));
    }

    if (request.path === "/api/tenant/activity") {
      return withRequestId(await handleTenantActivity(request, headers));
    }

    if (request.path === "/api/app/state" && request.method === "GET") {
      return withRequestId(await handleAppStateGet(headers));
    }

    if (request.path === "/api/app/state" && request.method === "PUT") {
      return withRequestId(await handleAppStateUpdate(request, headers));
    }

    if (request.path === "/api/gemini/v1/generateContent") {
      return withRequestId(await handleGemini(request, headers));
    }

    if (request.path.startsWith("/api/consultas/placa")) {
      return withRequestId(await handlePlateLookup(request, headers));
    }

    if (request.path === "/api/consultas/catalogo") {
      return withRequestId(await handleConsultationCatalog(request, headers));
    }

    if (request.path === "/api/consultas/executar") {
      return withRequestId(await handleConsultationExecution(request, headers));
    }

    if (request.path.startsWith("/api/fipe/lookup")) {
      return withRequestId(await handleFipeLookup(request, headers));
    }

    if (request.path.startsWith("/api/fipe/marcas")) {
      return withRequestId(await handleFipeBrandSuggestions(request, headers));
    }

    if (request.path.startsWith("/api/fipe/modelos")) {
      return withRequestId(await handleFipeModelSuggestions(request, headers));
    }

    if (request.path === "/api/nfe/config") {
      return withRequestId(await handleNfeConfig(request, headers));
    }

    if (request.path === "/api/nfe/emitir") {
      return withRequestId(await handleNfeEmitir(request, headers));
    }

    if (request.path.startsWith("/api/nfe/danfe")) {
      return withRequestId(await handleNfeAsset(request, headers, "danfe"));
    }

    if (request.path.startsWith("/api/nfe/xml")) {
      return withRequestId(await handleNfeAsset(request, headers, "xml"));
    }

    if (request.path.startsWith("/api/nfe/status")) {
      return withRequestId(await handleNfeStatus(request, headers));
    }

    if (request.path === "/api/nfe/cancelar") {
      return withRequestId(await handleNfeCancelar(request, headers));
    }

    // ── Health check (Railway / monitoring) ─────────────────────────────
    if (request.path === "/api/health") {
      return withRequestId(json(200, {
        status: "ok",
        version: process.env.npm_package_version ?? "1.0.0",
        timestamp: new Date().toISOString(),
        database: await checkDatabaseHealth(),
        rateLimit: getRateLimitStoreMetrics(),
      }));
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
      return withRequestId(json(501, {
        error: "API v1 em desenvolvimento. Disponivel em breve.",
        docs: "https://docs.autovenda.pro/api",
      }));
    }

    return withRequestId(json(404, { error: "Rota nao encontrada." }));
  } catch (error) {
    logServerError("request", error);
    return withRequestId(json(500, {
      error: publicErrorMessage(error, "Falha interna do servidor."),
    }));
  } finally {
    logEvent("info", "backend.request.completed", {
      requestId,
      method: request.method,
      path: request.path,
      durationMs: Date.now() - startedAt,
      databaseMode: getDatabaseMode(),
    });
  }
}
