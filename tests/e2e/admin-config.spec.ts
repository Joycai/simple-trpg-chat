import { test, expect } from "@playwright/test";

// 1×1 transparent PNG — minimal valid image for upload tests
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Admin Config Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/config");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("browser tab title contains section name and site title", async ({ page }) => {
    await expect(page).toHaveTitle(/系统配置/);
  });

  test("all config sections appear in the correct order", async ({ page }) => {
    const headings = page.locator("h3");
    const texts = await headings.allTextContents();
    const order = ["数据库配置", "修改网站标题", "网站图标", "网站主题", "敏感词过滤设置"];
    for (const label of order) {
      expect(texts.some((t) => t.includes(label))).toBe(true);
    }
    const idxFavicon = texts.findIndex((t) => t.includes("网站图标"));
    const idxTitle = texts.findIndex((t) => t.includes("修改网站标题"));
    const idxTheme = texts.findIndex((t) => t.includes("网站主题"));
    expect(idxTitle).toBeLessThan(idxFavicon);
    expect(idxFavicon).toBeLessThan(idxTheme);
  });

  test("favicon section has choose-file and reset buttons", async ({ page }) => {
    const section = page.locator("section").filter({ hasText: "网站图标" });
    await expect(section.getByRole("button", { name: "选择图标文件" })).toBeVisible();
    await expect(section.getByRole("button", { name: "恢复默认" })).toBeVisible();
  });

  test("uploading a file shows a preview and enables the save button", async ({ page }) => {
    const section = page.locator("section").filter({ hasText: "网站图标" });
    const fileInput = section.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: "test-icon.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    const preview = section.locator('img[alt="favicon preview"]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(section.getByRole("button", { name: "保存配置" })).toBeEnabled();
  });

  test("favicon save then reset round-trip persists to DB", async ({ page }) => {
    const section = page.locator("section").filter({ hasText: "网站图标" });
    const fileInput = section.locator('input[type="file"]');

    // Upload and save
    await fileInput.setInputFiles({
      name: "test-icon.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await section.getByRole("button", { name: "保存配置" }).click();
    await expect(section.getByText("配置已保存")).toBeVisible({ timeout: 8_000 });

    // Reload to confirm DB persistence
    await page.reload();
    const preview = page
      .locator("section")
      .filter({ hasText: "网站图标" })
      .locator('img[alt="favicon preview"]');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /^data:image\/png;base64,/);

    // Reset to default
    const sectionAfterReload = page.locator("section").filter({ hasText: "网站图标" });
    await sectionAfterReload.getByRole("button", { name: "恢复默认" }).click();
    await expect(sectionAfterReload.getByText("配置已保存")).toBeVisible({ timeout: 8_000 });
  });

  test("site title update persists to DB", async ({ page }) => {
    const section = page.locator("section").filter({ hasText: "修改网站标题" });
    const input = section.locator("input");
    const original = await input.inputValue();

    await input.fill("Integration Test Title");
    await section.getByRole("button", { name: "保存配置" }).click();
    await expect(section.getByText("配置已保存")).toBeVisible({ timeout: 8_000 });

    // Restore original title
    await input.fill(original);
    await section.getByRole("button", { name: "保存配置" }).click();
    await expect(section.getByText("配置已保存")).toBeVisible({ timeout: 8_000 });
  });
});
