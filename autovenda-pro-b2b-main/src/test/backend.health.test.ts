// @vitest-environment jsdom

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBackendRequest } from "../../server/backend";
import { resetDatabaseConnectionForTests } from "../../server/database";
import { resetRateLimitStore } from "../../server/rate-limit";

describe("backend health endpoint", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "autovenda-health-"));
    process.env.DATABASE_PATH = join(tempDir, "rozzcar.sqlite");
    process.env.APP_BASE_URL = "http://localhost:8082";
    process.env.PLATFORM_ADMIN_EMAIL = "admin@plataforma.local";
    process.env.PLATFORM_ADMIN_PASSWORD = "123456";
    resetDatabaseConnectionForTests();
    resetRateLimitStore();
  });

  afterEach(() => {
    resetDatabaseConnectionForTests();
    resetRateLimitStore();
    delete process.env.DATABASE_PATH;
    delete process.env.PLATFORM_ADMIN_EMAIL;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns database and rate limit diagnostics", async () => {
    const response = await handleBackendRequest({
      method: "GET",
      path: "/api/health",
      headers: {
        origin: "http://localhost:8082",
      },
      ip: "127.0.0.1",
      requestId: "health-test",
    });

    expect(response.status).toBe(200);
    expect(response.headers?.["X-Request-Id"]).toBe("health-test");
    expect(response.body).toMatchObject({
      status: "ok",
      database: {
        status: "ok",
        mode: "sqlite",
      },
      rateLimit: {
        strategy: "sqlite-local",
      },
    });
  });
});
