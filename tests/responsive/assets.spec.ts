import { test, expect } from '@playwright/test';
test('asset studio preserves candidates, uses themed menus and keeps controls inside viewport', async ({ page }) => {
  await page.goto('./?scenario=asset');
  const studio = page.getByTestId('asset-studio');
  await expect(studio).toBeVisible();
  const small = page.viewportSize()!.width < 768;
  const firstPrompt = page.getByLabel('生成描述', { exact: true });
  await expect(firstPrompt).toHaveValue('一枚刻有古老文字的铜币');
  await page.getByRole('button', { name: '生成一张', exact: true }).click();
  await expect(page.getByRole('button', { name: '再生成一张', exact: true })).toBeEnabled();
  await firstPrompt.fill('一枚银币');
  await page.getByRole('button', { name: '再生成一张', exact: true }).click();
  if (small) await page.getByRole('button', { name: '候选图片 (2)', exact: true }).click();
  await expect(page.getByRole('button', { name: '候选图片 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '候选图片 2', exact: true })).toBeVisible();
  if (small) await page.getByRole('button', { name: '描述', exact: true }).click();
  for (const theme of ['default', 'parchment', 'cthulhu', 'shrine', 'rainglass', 'aether']) {
    for (const mode of ['light', 'dark']) {
      await page.evaluate(({ theme, mode }) => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.mode = mode; }, { theme, mode });
      await page.getByLabel('图片服务', { exact: true }).click();
      const menu = page.getByRole('listbox');
      await expect(menu).toBeVisible();
      expect(await menu.evaluate(el => {
        const probe = document.createElement('span'); probe.style.backgroundColor = 'rgb(var(--theme-surface))'; el.append(probe);
        const same = getComputedStyle(el).backgroundColor === getComputedStyle(probe).backgroundColor; probe.remove();
        const r = el.getBoundingClientRect(); return same && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
      }), `${theme}/${mode}`).toBe(true);
      await page.keyboard.press('Escape');
      await expect(studio).toBeVisible();
      expect(await studio.locator('select').count()).toBe(0);
      expect(await studio.evaluate(el => {
        const header = el.querySelector('header')!.getBoundingClientRect(); const footer = el.querySelector('footer')!.getBoundingClientRect();
        return header.top >= 0 && footer.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1;
      })).toBe(true);
    }
  }
  await page.getByLabel('风格', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(page.getByLabel('风格', { exact: true })).toContainText('像素');
  if (small) await page.getByRole('button', { name: '候选图片 (2)', exact: true }).click();
  await page.getByRole('button', { name: '使用此图', exact: true }).click();
  await expect(page.getByTestId('closed')).toBeVisible();
  await expect(page.getByTestId('sent')).toContainText('data:image');
});
