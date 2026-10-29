import { test, expect } from '@playwright/test';

test('image service type, native parameters, key retention and deletion', async ({ page }) => {
  const name = `image-e2e-${Date.now()}`;
  await page.goto('/admin/ai');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '图片生成服务', exact: true }) });
  await section.getByRole('button', { name: '添加图片服务', exact: true }).click();
  await section.getByLabel('服务名称', { exact: true }).fill(name);
  await section.getByLabel('模型类型', { exact: true }).selectOption('wan2.7-image-pro');
  await expect(section.getByLabel('协议', { exact: true })).toHaveValue('dashscope');
  await expect(section.getByLabel('生成尺寸', { exact: true })).toHaveValue('1024x1024');
  await section.getByLabel('模型类型', { exact: true }).selectOption('nano-banana-2.1');
  await expect(section.getByLabel('协议', { exact: true })).toHaveValue('gemini');
  await expect(section.getByLabel('生成尺寸', { exact: true })).toHaveValue('1K');
  await expect(section.getByLabel('宽高比', { exact: true })).toBeVisible();
  await section.getByLabel('API Key', { exact: true }).fill('unused-e2e-key');
  await section.getByLabel('每张图片费率（AI 点数）', { exact: true }).fill('2');
  await section.getByRole('button', { name: '保存', exact: true }).click();
  const row = section.locator('div.border-b').filter({ hasText: name });
  await expect(row).toBeVisible();
  try {
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(section.getByLabel('API Key（留空保持不变）', { exact: true })).toHaveValue('');
    await section.getByLabel('每张图片费率（AI 点数）', { exact: true }).fill('3');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.getByRole('button', { name: '保存', exact: true }).click();
    await expect(row).toContainText('3 点 / 张');
    await page.reload();
    await expect(row).toContainText('3 点 / 张');
  } finally {
    await page.reload();
    await row.getByRole('button', { name: '删除图片服务', exact: true }).click();
    await page.getByRole('button', { name: '删除图片服务', exact: true }).last().click();
    await expect(row).toHaveCount(0);
  }
});

test('image editor follows all theme palettes and fits narrow screens', async ({ page }) => {
  await page.goto('/admin/ai');
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: '图片生成服务', exact: true }) });
  await section.getByRole('button', { name: '添加图片服务', exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['default', 'parchment', 'cthulhu', 'shrine', 'rainglass', 'aether']) {
      for (const mode of ['light', 'dark']) {
        await page.evaluate(({ theme, mode }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.mode = mode;
        }, { theme, mode });
        await expect(section.getByLabel('模型类型', { exact: true })).toBeVisible();
        const result = await section.evaluate(element => {
          const controls = [...element.querySelectorAll('input:not([type=checkbox]), select, button')];
          const overflow = controls.some(control => {
            const rect = control.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1;
          });
          const input = element.querySelector('input')!;
          const probe = document.createElement('span');
          probe.style.color = 'rgb(var(--theme-text))';
          element.appendChild(probe);
          const themed = getComputedStyle(input).color === getComputedStyle(probe).color;
          probe.remove();
          return { overflow, themed };
        });
        expect(result, `${width}/${theme}/${mode}`).toEqual({ overflow: false, themed: true });
      }
    }
  }
});
