// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBackendRequest } from "../../server/backend";
import {
  authenticateUser,
  createTenantWithOwner,
  resetDatabaseConnectionForTests,
} from "../../server/database";

async function apiRequest(input: {
  cookie?: string;
  method: string;
  path: string;
  body?: unknown;
}) {
  return handleBackendRequest({
    method: input.method,
    path: input.path,
    headers: {
      cookie: input.cookie ?? "",
      origin: "http://localhost:8082",
    },
    body: input.body,
  });
}

describe("Convites da equipe", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-invite-"));
    process.env.DATABASE_PATH = join(tempDir, "rozzcar.sqlite");
    process.env.APP_BASE_URL = "http://localhost:8082";
    process.env.PLATFORM_ADMIN_EMAIL = "admin@plataforma.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "123456";
    process.env.PLATFORM_ADMIN_NAME = "Admin Plataforma";
    resetDatabaseConnectionForTests();
  });

  afterEach(() => {
    resetDatabaseConnectionForTests();
    delete process.env.DATABASE_PATH;
    delete process.env.APP_BASE_URL;
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    delete process.env.PLATFORM_ADMIN_NAME;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("permite convidar um vendedor e aceitar o convite com sessao ativa", async () => {
    createTenantWithOwner({
      storeName: "Auto Prime",
      slug: "auto-prime",
      ownerName: "Julia",
      ownerEmail: "julia@autoprime.com",
      ownerPassword: "123456",
      trialDays: 7,
      maxUsers: 5,
    });

    const ownerAuth = authenticateUser("julia@autoprime.com", "123456");
    if (!ownerAuth) throw new Error("Falha ao autenticar owner.");

    const inviteResponse = await apiRequest({
      cookie: ownerAuth.cookieHeader,
      method: "POST",
      path: "/api/tenant/invites",
      body: {
        name: "Mario",
        email: "mario@autoprime.com",
        role: "seller",
        salesGoalMonthly: 4,
      },
    });

    expect(inviteResponse.status).toBe(201);
    const inviteBody = inviteResponse.body as {
      inviteUrl: string;
      invites: Array<{ email: string; status: string }>;
    };
    expect(inviteBody.invites[0]?.email).toBe("mario@autoprime.com");
    expect(inviteBody.invites[0]?.status).toBe("pending");

    const inviteUrl = new URL(inviteBody.inviteUrl);
    const token = inviteUrl.searchParams.get("invite");
    expect(token).toBeTruthy();

    const acceptResponse = await apiRequest({
      method: "POST",
      path: "/api/auth/accept-invite",
      body: {
        token,
        password: "654321",
      },
    });

    expect(acceptResponse.status).toBe(200);
    const acceptBody = acceptResponse.body as {
      authenticated: boolean;
      user: { email: string; role: string };
      tenant: { slug: string } | null;
    };
    expect(acceptBody.authenticated).toBe(true);
    expect(acceptBody.user.email).toBe("mario@autoprime.com");
    expect(acceptBody.user.role).toBe("seller");
    expect(acceptBody.tenant?.slug).toBe("auto-prime");
    expect(acceptResponse.headers?.["Set-Cookie"]).toContain("rozzcar_session=");
  });
});
