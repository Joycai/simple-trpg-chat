import { describe, it, expect, vi, beforeEach } from "vitest";

// deleteProvider returns `{ success, error }` with a localized error instead
// of throwing (Next.js redacts thrown messages in production).

let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/security/encryption", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("@/lib/security/url-guard", () => ({ validateApiEndpoint: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

let existing: unknown[] = [];
const del = vi.fn();
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
  return c;
}
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => existing),
    delete: () => { del(); return chain(() => []); },
  },
  sqlNow: vi.fn(),
}));

import { deleteProvider } from "../ai-providers";

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "2", role: "host" } };
  existing = [{ id: 7, ownerId: 2 }];
});

describe("deleteProvider", () => {
  it("rejects a signed-out caller", async () => {
    session = null;
    expect(await deleteProvider(7)).toEqual({ success: false, error: "adminProviders.errorNotAuthenticated" });
  });

  it("reports a missing provider", async () => {
    existing = [];
    expect(await deleteProvider(7)).toEqual({ success: false, error: "adminProviders.errorProviderNotFound" });
  });

  it("refuses a non-owner who is not an admin", async () => {
    existing = [{ id: 7, ownerId: 3 }];
    expect(await deleteProvider(7)).toEqual({ success: false, error: "adminProviders.errorNotAuthorized" });
    expect(del).not.toHaveBeenCalled();
  });

  it("lets an admin delete another user's provider", async () => {
    session = { user: { id: "1", role: "admin" } };
    existing = [{ id: 7, ownerId: 3 }];
    expect(await deleteProvider(7)).toEqual({ success: true });
    expect(del).toHaveBeenCalledTimes(1);
  });
});
