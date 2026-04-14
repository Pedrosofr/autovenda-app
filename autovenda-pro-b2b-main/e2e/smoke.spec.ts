import { expect, test } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
const platformEmail = env.PLATFORM_ADMIN_EMAIL;
const platformPassword = env.PLATFORM_ADMIN_PASSWORD;

test("health endpoint responds with database status", async ({ page }) => {
  await page.goto("/");

  const body = await page.evaluate(async () => {
    const response = await fetch("/api/health");
    return response.json();
  });

  expect(body.status).toBe("ok");
  expect(body.database?.status).toBe("ok");
  expect(body.database?.mode).toMatch(/postgres|sqlite/);
});

test("login page loads with branded shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ROZZ CAR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Acesso seguro")).toBeVisible();
});

test("platform admin can authenticate and access the platform console", async ({ page }) => {
  test.skip(!platformEmail || !platformPassword, "PLATFORM_ADMIN credentials not configured for smoke login.");

  await page.goto("/");
  await page.getByLabel("E-mail").fill(platformEmail ?? "");
  await page.getByLabel("Senha").fill(platformPassword ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("heading", { name: /Lojas, owners e trial em um painel unico/i })).toBeVisible();
});
