import { test, expect, type Page } from "@playwright/test";

/**
 * Behavioural cover for the `afterEnter` queue in `src/lib/useOverlayTransition.ts`.
 *
 * The invariant: deferring a panel's mount-time work behind the enter animation
 * must never *lose* that work. `markInventoryViewedAction` is the one that would
 * hurt — it clears the backpack's unread flags, so a dropped call means the
 * "new item" highlight comes back on every subsequent open.
 *
 * Read this as a characterization test, not as cover for a known-broken build:
 * it passes against the pre-`afterEnter`-hardening code too. Measured on
 * Chromium, closing mid-enter does NOT cancel the enter — the exit's WAAPI
 * animation *replaces* it on `transform`, and a replaced animation still fires
 * `finish`, so the queue is released on schedule. The test pins that behaviour
 * down so a future change to how the queue is released (or to Motion's
 * interruption semantics, whose `finished` promise has no reject path at all)
 * cannot silently start dropping the acknowledgement.
 *
 * LOCAL FIXTURE: needs the `test_kp` host account and room #1 from the rebuilt
 * dev database. Not wired into CI.
 */

// This spec drives its own login, so it must not inherit the admin storageState.
test.use({ storageState: { cookies: [], origins: [] } });

const OPEN_BACKPACK = 'button[title^="背包"]';
const DRAWER = ".overlay-drawer";
const CLOSE = '.overlay-drawer button[aria-label*="关闭"]';

/**
 * Measured end of the drawer's enter, not `visualDuration` (0.42s). That option
 * is time-to-target; the spring's settle tail runs past it, and `data-animating`
 * is only dropped when the animation actually finishes — ~700ms in practice.
 */
const ENTER_END_MS = 700;

/**
 * When to close in the fast-close phase. Must sit after the last mount-time load
 * has been handed to `afterEnter` (~300ms, and the loads run twice under
 * StrictMode in dev) and before the enter releases the queue. Closing earlier
 * races the loads and lands in a different, always-worked path.
 */
const CLOSE_AT_MS = 450;

/**
 * Both tests are vacuous under `prefers-reduced-motion: reduce` — the hook then
 * marks the panel entered immediately, nothing is ever queued, and no
 * `data-animating` is set. Assert the precondition rather than assume it.
 */
async function assertMotionEnabled(page: Page) {
  const reduced = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(reduced, "prefers-reduced-motion must be off or these assertions prove nothing").toBe(
    false,
  );
}

async function loginAsHost(page: Page) {
  await page.goto("/login");
  await page.fill("#username", "test_kp");
  await page.fill("#password", "test_kp123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("backpack read-ack survives a close inside the enter animation", async ({ page }) => {
  const seen: { id: string; phase: string }[] = [];
  let phase = "init";
  page.on("request", (req) => {
    const id = req.headers()["next-action"];
    if (id) seen.push({ id, phase });
  });

  await loginAsHost(page);
  await page.goto("/rooms/1");
  await page.waitForSelector(OPEN_BACKPACK);
  await assertMotionEnabled(page);

  // --- Warm-up, discarded. The room page fires a batch of one-time actions of
  // its own on first load; opening the drawer once gets them out of the way so
  // the two recorded phases differ only in when the drawer was closed. ---
  phase = "warmup";
  await page.click(OPEN_BACKPACK);
  await page.waitForSelector(DRAWER);
  await page.waitForTimeout(ENTER_END_MS + 700);
  await page.click(CLOSE);
  await page.waitForSelector(DRAWER, { state: "detached" });
  await page.waitForTimeout(400);

  // --- Control: open, let the enter settle completely, then close. ---
  phase = "settled";
  await page.click(OPEN_BACKPACK);
  await page.waitForSelector(DRAWER);
  await page.waitForTimeout(ENTER_END_MS + 700);
  await page.click(CLOSE);
  await page.waitForSelector(DRAWER, { state: "detached" });
  await page.waitForTimeout(400);

  // --- Subject: open, close well inside the enter, expect the same traffic. ---
  phase = "fastClose";
  await page.click(OPEN_BACKPACK);
  await page.waitForSelector(DRAWER);
  // The window that matters is narrow and specific: late enough that the loads
  // have resolved and their commits are sitting in the queue, early enough that
  // the enter has not finished and released it. Closing before the loads land
  // exercises a different (and always-worked) path, where `afterEnter` is
  // handed work only after `close()` has already run.
  await page.waitForTimeout(CLOSE_AT_MS);
  await page.click(CLOSE);
  await page.waitForSelector(DRAWER, { state: "detached" });
  await page.waitForTimeout(900); // let the unmount flush drain

  const idsFor = (p: string) => new Set(seen.filter((s) => s.phase === p).map((s) => s.id));
  const settled = idsFor("settled");
  const fastClose = idsFor("fastClose");

  // The settled run is the reference: 3 loads + the acknowledgement.
  expect(settled.size).toBeGreaterThanOrEqual(4);
  // Every action the settled open fired must also fire when closed mid-enter.
  expect([...settled].every((id) => fastClose.has(id))).toBe(true);
  expect(fastClose.size).toBe(settled.size);
});

test("drawer carries data-animating for the enter, and drops it once settled", async ({ page }) => {
  await loginAsHost(page);
  await page.goto("/rooms/1");
  await page.waitForSelector(OPEN_BACKPACK);
  await assertMotionEnabled(page);

  await page.click(OPEN_BACKPACK);
  // In flight: the CSS frost-suppression hook must be on the panel.
  await expect(page.locator(`${DRAWER}[data-animating]`)).toHaveCount(1);
  // Settled: the hook is removed so the theme's frost returns.
  await expect(page.locator(`${DRAWER}[data-animating]`)).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator(DRAWER)).toHaveCount(1);
});
