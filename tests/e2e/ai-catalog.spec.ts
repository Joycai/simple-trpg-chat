import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { hash } from 'bcryptjs';

test('Admin Vendor/model editor persists protocol settings without native controls', async ({ page }) => {
  const name = `catalog-e2e-${Date.now()}`;
  await page.goto('/admin/ai');
  await page.getByRole('button', { name: '添加 Vendor', exact: true }).click();
  await page.getByRole('textbox', { name: 'Vendor 名称', exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'API 密钥', exact: true }).fill('test-unused-key');
  await page.getByRole('textbox', { name: '端点地址', exact: true }).fill('https://api.openai.com/v1');
  await page.getByRole('switch', { name: 'Responses', exact: true }).click();
  await page.getByRole('textbox', { name: '端点地址', exact: true }).nth(1).fill('https://api.openai.com/v1');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const vendor = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(vendor).toBeVisible();
  try {
    await vendor.getByRole('button', { name: '添加模型', exact: true }).click();
    await page.getByRole('textbox', { name: '模型显示名称', exact: true }).fill('Test model');
    await page.getByRole('textbox', { name: '模型 ID', exact: true }).fill('test-model');
    await page.getByRole('textbox', { name: '最大输出（tokens）', exact: true }).fill('8192');
    await page.getByRole('button', { name: '推理强度（effort）', exact: true }).click();
    await page.getByRole('option', { name: 'high', exact: true }).click();
    await page.getByRole('textbox', { name: '服务商强度值', exact: true }).fill('max');
    await page.getByRole('button', { name: '推理强度（effort）', exact: true }).click();
    await page.getByRole('option', { name: 'low', exact: true }).click();
    await page.getByRole('button', { name: '推理强度（effort）', exact: true }).click();
    await page.getByRole('option', { name: 'high', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '服务商强度值', exact: true })).toHaveValue('max');
    await page.getByRole('button', { name: '使用协议', exact: true }).click();
    await page.getByRole('option', { name: /Responses/ }).click();
    await expect(page.getByRole('textbox', { name: '最大输出（tokens）', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: '使用协议', exact: true }).click();
    await page.getByRole('option', { name: /Chat Completions/ }).click();
    await expect(page.getByRole('textbox', { name: '最大输出（tokens）', exact: true })).toHaveValue('8192');
    await expect(page.getByRole('textbox', { name: '服务商强度值', exact: true })).toHaveValue('max');
    await expect(page.getByRole('switch', { name: '共享此模型给其他用户' })).toBeVisible();
    await expect(page.locator('select')).toHaveCount(0);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(vendor.getByText('test-model', { exact: true })).toBeVisible();
    await page.reload();
    await vendor.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '最大输出（tokens）', exact: true })).toHaveValue('8192');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['default', 'parchment', 'cthulhu', 'shrine', 'rainglass', 'aether']) {
      for (const mode of ['light', 'dark']) {
        await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; }, { theme, mode });
        const field = page.getByRole('textbox', { name: '模型显示名称', exact: true });
        await expect(field).toBeVisible();
        const bounds = await field.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click();
  } finally {
    // Delete only fixtures created by this test; no provider API requests are made.
    await page.reload();
    await expect(vendor).toBeVisible();
    if (await vendor.getByText('test-model', { exact: true }).count()) {
      await vendor.getByRole('button', { name: '删除', exact: true }).last().click();
      await page.getByRole('button', { name: '删除', exact: true }).last().click();
      await expect(vendor.getByText('test-model', { exact: true })).toHaveCount(0);
    }
    await vendor.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '删除', exact: true }).last().click();
    await expect(vendor).toHaveCount(0);
  }
});

test('Vendor presets expose the nine requested services and isolated Plan endpoints', async ({ page }) => {
  await page.goto('/admin/ai');
  await page.getByRole('button', { name: '添加 Vendor', exact: true }).click();
  await page.getByRole('button', { name: '服务商预设', exact: true }).click();
  await expect(page.getByRole('option')).toHaveText([
    'OpOpenAI', 'GeGemini', 'ClClaude', '阿里阿里千问', '阿里阿里千问（Plan）',
    '字节字节火山', '字节字节火山（Agent Plan）', 'DeDeepSeek', '自定自定义',
  ]);
  await page.getByRole('option', { name: '阿里千问（Plan）', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '端点地址', exact: true }).first()).toHaveValue('https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  await expect(page.getByText(/Token Plan 个人版（北京）/)).toBeVisible();
  await page.getByRole('button', { name: '服务商预设', exact: true }).click();
  await page.getByRole('option', { name: '字节火山（Agent Plan）', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '端点地址', exact: true }).first()).toHaveValue('https://ark.cn-beijing.volces.com/api/plan/v3');
  await page.getByRole('button', { name: '服务商预设', exact: true }).click();
  await page.getByRole('option', { name: '字节火山', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '端点地址', exact: true }).first()).toHaveValue('https://ark.cn-beijing.volces.com/api/v3');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
});

// A dedicated host fixture avoids depending on a developer's existing account.
const hostName = `key-eye-host-${Date.now()}`;
const hostPassword = 'test-key-eye-host-password';
let hostDb: ReturnType<typeof postgres> | undefined;
test.beforeAll(async () => {
  const url = process.env.DATABASE_URL || JSON.parse(readFileSync('db.config.json', 'utf8')).url;
  hostDb = postgres(url, { max: 1 });
  const passwordHash = await hash(hostPassword, 10);
  await hostDb`INSERT INTO users (username, password_hash, display_name, role) VALUES (${hostName}, ${passwordHash}, ${hostName}, 'host')`;
});
test.afterAll(async () => {
  if (hostDb) {
    try { await hostDb`DELETE FROM users WHERE username = ${hostName}`; }
    finally { await hostDb.end(); }
  }
});

for (const entry of ['admin', 'personal'] as const) {
  test(`${entry} key field toggles inline without losing input across themes`, async ({ page }) => {
    if (entry === 'personal') {
      await page.context().clearCookies();
      await page.goto('/login');
      await page.locator('#username').fill(hostName);
      await page.locator('#password').fill(hostPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(url => !url.pathname.startsWith('/login'));
      await page.getByTitle(hostName, { exact: true }).click();
      await page.getByRole('button', { name: '个人设置', exact: true }).click();
      await page.getByRole('button', { name: 'AI 服务', exact: true }).click();
    } else {
      await page.goto('/admin/ai');
    }
    await page.getByRole('button', { name: '添加 Vendor', exact: true }).click();
    const key = page.getByLabel('API 密钥', { exact: true });
    await expect(key).toHaveAttribute('type', 'password');
    await key.fill('test-visibility-only');
    await key.press('Tab');
    await expect(page.getByRole('button', { name: '显示密钥', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('type', 'text');
    await expect(key).toHaveValue('test-visibility-only');
    await page.getByRole('button', { name: '隐藏密钥', exact: true }).click();
    await expect(key).toHaveAttribute('type', 'password');
    await expect(key).toHaveValue('test-visibility-only');
    await expect(page.getByRole('switch', { name: '显示密钥', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['default', 'parchment', 'cthulhu', 'shrine', 'rainglass', 'aether']) {
      for (const mode of ['light', 'dark']) {
        await page.evaluate(({ theme, mode }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.mode = mode;
        }, { theme, mode });
        const input = (await key.boundingBox())!;
        const toggle = (await page.getByRole('button', { name: '显示密钥', exact: true }).boundingBox())!;
        expect(toggle.x).toBeGreaterThan(input.x + input.width / 2);
        expect(toggle.x + toggle.width).toBeLessThanOrEqual(input.x + input.width);
        expect(Math.abs(toggle.y + toggle.height / 2 - input.y - input.height / 2)).toBeLessThan(2);
        expect(input.x + input.width).toBeLessThanOrEqual(390);
      }
    }
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '添加 Vendor', exact: true }).click();
    await expect(key).toHaveValue('');
    await expect(key).toHaveAttribute('type', 'password');
  });
}
