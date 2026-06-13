import { test as setup } from "@playwright/test";
import path from "path";
import fs from "fs";

const authFile = path.join(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/login");
  await page.fill("#username", "admin");
  await page.fill("#password", "admin123");
  await page.click('button[type="submit"]');
  // Admin users land on /admin; non-admin users land on /
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
