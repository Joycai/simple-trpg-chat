import { test, expect } from "@playwright/test";

// Runs in the chromium-unauth project (no storageState) — see playwright.config.ts.

test("login page renders form fields", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("wrong credentials show error", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#username", "notauser");
  await page.fill("#password", "wrongpass");
  await page.click('button[type="submit"]');
  await expect(page.locator("text=⚠️")).toBeVisible({ timeout: 8_000 });
});

test("valid credentials redirect to the lobby", async ({ page }) => {
  // Uses testuser (not admin) to avoid single-session token conflict with auth.setup.ts
  await page.goto("/login");
  await page.fill("#username", "testuser");
  await page.fill("#password", "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 15_000 });
  await expect(page).toHaveURL("/");
});

test("protected route redirects unauthenticated user to login", async ({ page }) => {
  await page.goto("/admin/config");
  await expect(page).toHaveURL(/\/login/);
});
