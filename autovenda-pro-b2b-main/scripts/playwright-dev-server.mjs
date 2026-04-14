import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = String(process.argv[2] ?? process.env.PLAYWRIGHT_PORT ?? "8082");
const tmpDir = join(process.cwd(), ".tmp");
const dbPath = process.env.PLAYWRIGHT_DATABASE_PATH ?? join(tmpDir, "playwright.sqlite");

mkdirSync(tmpDir, { recursive: true });
rmSync(dbPath, { force: true });

const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: "",
  DIRECT_URL: "",
  DATABASE_PATH: dbPath,
  APP_BASE_URL: `http://127.0.0.1:${port}`,
  SESSION_SECRET: process.env.SESSION_SECRET || "playwright-session-secret",
  PLATFORM_ADMIN_EMAIL: process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@rozzcar.local",
  PLATFORM_ADMIN_PASSWORD: process.env.PLAYWRIGHT_ADMIN_PASSWORD || "Playwright123",
  PLATFORM_ADMIN_NAME: process.env.PLAYWRIGHT_ADMIN_NAME || "Playwright Admin",
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", port],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
