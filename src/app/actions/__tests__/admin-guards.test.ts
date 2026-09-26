import { describe, it, expect, vi, beforeEach } from "vitest";

// Write actions outside admin.ts that gate on the admin role return a
// localized error instead of throwing (Next.js redacts thrown messages).

const requireAdmin = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: () => requireAdmin() }));
let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

const write = vi.fn();
function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["values", "set", "where", "returning", "onConflictDoUpdate"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown) => Promise.resolve([{}]).then(resolve);
  return c;
}
vi.mock("@/db", () => ({
  db: {
    insert: () => { write(); return chain(); },
    update: () => { write(); return chain(); },
    delete: () => { write(); return chain(); },
  },
  sqlNow: vi.fn(),
}));

import { createBotPresetAction, updateBotPresetAction, deleteBotPresetAction } from "../bot-presets";
import { setSiteTheme, setSiteThemeMode, updateUserThemePreference } from "../theme";

const preset = { name: "n", defaultNickname: "d", systemPrompt: "p", allowEditPrompt: true };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockImplementation(() => Promise.resolve());
  session = { user: { id: "1", role: "admin" } };
});

describe("bot-presets write actions", () => {
  it("reject a non-admin without writing", async () => {
    requireAdmin.mockImplementation(() => Promise.reject(new Error("Unauthorized")));
    const fail = { success: false, error: "admin.errorNotAdmin" };
    expect(await createBotPresetAction(preset)).toEqual(fail);
    expect(await updateBotPresetAction(1, preset)).toEqual(fail);
    expect(await deleteBotPresetAction(1)).toEqual(fail);
    expect(write).not.toHaveBeenCalled();
  });

  it("succeed for an admin", async () => {
    expect(await createBotPresetAction(preset)).toMatchObject({ success: true });
    expect(await deleteBotPresetAction(1)).toEqual({ success: true });
  });
});

describe("theme setters", () => {
  it("reject a non-admin site theme change without writing", async () => {
    session = { user: { id: "2", role: "host" } };
    const fail = { success: false, error: "admin.errorNotAdmin" };
    expect(await setSiteTheme("default")).toEqual(fail);
    expect(await setSiteThemeMode("dark")).toEqual(fail);
    expect(write).not.toHaveBeenCalled();
  });

  it("reject a signed-out personal preference save", async () => {
    session = null;
    expect(await updateUserThemePreference("default")).toEqual({ success: false, error: "theme.errorNotAuthenticated" });
  });

  it("reject a session with an unusable user id", async () => {
    session = { user: { id: "abc", role: "player" } };
    expect(await updateUserThemePreference("default")).toEqual({ success: false, error: "theme.errorInvalidSession" });
  });
});
