import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptySheet } from "../sheet-v2";

let lockedRows: Array<{ id: number; characterData: string | null }> = [];
const calls: string[] = [];
const writes: string[] = [];

vi.mock("@/db", () => {
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ for: (mode: string) => { calls.push(`select for ${mode}`); return lockedRows; } }) }),
    }),
    update: () => ({
      set: (v: { characterData: string }) => ({ where: () => { calls.push("update"); writes.push(v.characterData); } }),
    }),
  };
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => {
        calls.push("begin");
        const r = await fn(tx);
        calls.push("commit");
        return r;
      },
    },
  };
});

import { updateSheetRow } from "../sheet-row";

beforeEach(() => {
  lockedRows = [];
  calls.length = 0;
  writes.length = 0;
});

describe("updateSheetRow", () => {
  it("reads the row with a lock and writes the step's sheet in the same transaction", async () => {
    lockedRows = [{ id: 1, characterData: "raw" }];
    const sheet = { ...emptySheet("coc7th"), attributes: { str: 50 } };
    let seen: string | null = null;
    const out = await updateSheetRow(5, 2, (raw) => { seen = raw; return { sheet, result: 7 }; });
    expect(seen).toBe("raw");
    expect(out).toEqual({ status: "ok", result: 7, sheet });
    expect(calls).toEqual(["begin", "select for update", "update", "commit"]);
    expect(JSON.parse(writes[0])).toEqual(sheet);
  });

  it("writes nothing when the step returns no sheet", async () => {
    lockedRows = [{ id: 1, characterData: null }];
    const out = await updateSheetRow(5, 2, () => ({ result: "skip" }));
    expect(out).toEqual({ status: "ok", result: "skip", sheet: null });
    expect(calls).not.toContain("update");
  });

  it("reports a missing member without running the step", async () => {
    const step = vi.fn(() => ({ result: 0 }));
    expect(await updateSheetRow(5, 2, step)).toEqual({ status: "notMember" });
    expect(step).not.toHaveBeenCalled();
  });

  it("refuses a sheet over the size cap", async () => {
    lockedRows = [{ id: 1, characterData: null }];
    const sheet = { ...emptySheet("basic"), bio: "x".repeat(70_000) };
    const out = await updateSheetRow(5, 2, () => ({ sheet, result: 1 }));
    expect(out).toEqual({ status: "tooLarge", result: 1 });
    expect(writes).toHaveLength(0);
  });
});
