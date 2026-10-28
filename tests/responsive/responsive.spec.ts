import { test, expect, type Locator, type Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page), "uncaught browser errors").toEqual([]);
});

async function insideViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize()!;
    return !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }).toBe(true);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const dm of [false, true]) {
  test(`chat remains writable and sendable (${dm ? "DM" : "public"})`, async ({ page }) => {
    await page.goto(`?scenario=chat&dm=${dm ? 1 : 0}`);
    const input = page.getByRole("textbox");
    await insideViewport(page, input);
    const box = (await input.boundingBox())!;
    expect(box.width).toBeGreaterThan(150);
    await input.fill("移动端测试消息");
    const send = page.getByRole("button", { name: "发送", exact: true });
    await insideViewport(page, send);
    await send.tap();
    await expect(page.getByTestId("sent")).toHaveText("移动端测试消息");
    await page.getByRole("button", { name: "发送表情", exact: true }).tap();
    await insideViewport(page, page.getByRole("dialog"));
    await noHorizontalOverflow(page);
  });
}

test("host menus stay visible through rotation and their actions work", async ({ page }) => {
  await page.goto("?scenario=toolbar");
  await page.getByTitle(/^发起检定/).tap();
  const menu = page.locator("[data-viewport-popover]");
  await insideViewport(page, menu);
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.height, height: original.width });
  await insideViewport(page, menu);
  await page.getByRole("button", { name: /普通检定/ }).tap();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("selection")).toHaveText("check");
  await page.getByTitle("道具/事件", { exact: true }).tap();
  await insideViewport(page, menu);
  await page.getByRole("button", { name: /道具管理/ }).tap();
  await expect(page.getByTestId("selection")).toHaveText("checkitemManager");
  await noHorizontalOverflow(page);
});

test("portaled menus support outside taps, Escape and English labels", async ({ page }) => {
  await page.goto("?scenario=toolbar&locale=en&theme=rainglass");
  // The gear menu includes the background slider, making it tall on landscape phones.
  await page.getByTitle("System Menu", { exact: true }).tap();
  const menu = page.locator("[data-viewport-popover]");
  await insideViewport(page, menu);
  const lastAction = menu.getByRole("button").last();
  await lastAction.scrollIntoViewIfNeeded();
  await insideViewport(page, lastAction);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.getByTitle("System Menu", { exact: true }).tap();
  await page.touchscreen.tap(page.viewportSize()!.width - 2, page.viewportSize()!.height - 2);
  await expect(menu).toHaveCount(0);
});

test("expanded inventory editor keeps content and footer usable across rotation", async ({ page }) => {
  await page.goto("?scenario=editor");
  const expand = page.getByTitle("展开为全窗口编辑", { exact: true });
  await expand.scrollIntoViewIfNeeded();
  await expand.tap();
  const modal = page.locator(".overlay-modal");
  await insideViewport(page, modal);
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.height, height: original.width });
  await insideViewport(page, modal);
  const input = page.getByPlaceholder("文本内容", { exact: true });
  await input.fill("横竖屏编辑后保存");
  const submit = page.getByRole("button", { name: "创建", exact: true });
  await insideViewport(page, submit);
  await submit.tap();
  await expect(page.getByTestId("closed")).toBeVisible();
  await expect(page.getByTestId("sent")).toHaveText("横竖屏编辑后保存");
});

for (const scenario of ["host-check", "host-check&mode=sancheck", "timeline-dialog", "bonus", "skill"]) {
  test(`${scenario}: dialog fits and bottom actions remain reachable`, async ({ page }) => {
    await page.goto(`?scenario=${scenario}`);
    const modal = page.locator(".overlay-modal");
    await insideViewport(page, modal);
    if (scenario.startsWith("host-check")) {
      await page.getByRole("button", { name: /要求全体/ }).tap();
      if (!scenario.includes("sancheck")) await page.getByPlaceholder("如：侦查、聆听、图书馆...").fill("侦查");
    }
    const action = modal.getByRole("button").last();
    await action.scrollIntoViewIfNeeded();
    await insideViewport(page, action);
    await action.tap();
    await expect(page.getByTestId("closed")).toBeVisible();
  });
}

test("touch reveals notebook editing and timeline withdrawal without hover", async ({ page }) => {
  await page.goto("?scenario=touch-actions");
  const edit = page.getByTitle("编辑分类", { exact: true });
  await expect(edit).toHaveCSS("opacity", "1");
  await edit.tap();
  await page.getByRole("textbox").fill("Renamed");
  await page.getByRole("button", { name: "保存", exact: true }).tap();
  await expect(page.getByTestId("updated")).toHaveText("Renamed");
  const withdraw = page.getByTitle("撤回", { exact: true });
  await expect(withdraw).toHaveCSS("opacity", "1");
  await withdraw.tap();
  await page.getByRole("button", { name: "确认撤回", exact: true }).tap();
  await expect(page.getByTestId("sent")).toHaveText("withdrawn");
});

test("sidebar switches at tablet breakpoint and supports pointer resizing", async ({ page }) => {
  await page.goto("?scenario=sidebar");
  const sidebar = page.getByTestId("sidebar");
  if (page.viewportSize()!.width < 1024) await expect(sidebar).toHaveCount(0);
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(sidebar).toBeVisible();
  const handle = page.getByTitle("拖动调整宽度，双击恢复默认", { exact: true });
  const before = (await sidebar.boundingBox())!.width;
  const handleBox = (await handle.boundingBox())!;
  // Mouse input also emits real PointerEvents in both engines; CDP below
  // separately covers trusted touch input and cancellation.
  await page.mouse.move(handleBox.x + handleBox.width / 2, 100);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 80, 100);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(before + 80);
  await expect(page.getByTestId("resizing")).toHaveText("false");
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(sidebar).toHaveCount(0);
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(before + 80);
});

test("iPad sidebar responds to trusted touch drag and pointer cancellation", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch input is Chromium-only");
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("?scenario=sidebar");
  const sidebar = page.getByTestId("sidebar");
  const before = (await sidebar.boundingBox())!.width;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: before + 10, y: 100 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: before + 90, y: 100 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(before + 80);
  await expect(page.getByTestId("resizing")).toHaveText("false");
  await page.getByRole("button", { name: "收起侧边栏", exact: true }).tap();
  await expect(sidebar).toHaveCount(0);
});
