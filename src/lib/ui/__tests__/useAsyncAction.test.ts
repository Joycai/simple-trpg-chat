import { describe, it, expect } from "vitest";
import { IDLE, reduceOutcome, settle, type AsyncActionState } from "@/lib/ui/useAsyncAction";

describe("reduceOutcome", () => {
  const failed: AsyncActionState = { pending: false, error: "boom" };

  it("start sets pending and clears the previous error", () => {
    expect(reduceOutcome(failed, { type: "start" })).toEqual({ pending: true, error: null });
  });

  it("a success releases pending", () => {
    const running = reduceOutcome(IDLE, { type: "start" });
    expect(reduceOutcome(running, { type: "settle", outcome: { success: true } }))
      .toEqual({ pending: false, error: null });
  });

  it("keepPendingOnSuccess leaves pending set after a success only", () => {
    const running = reduceOutcome(IDLE, { type: "start" });
    expect(reduceOutcome(running, { type: "settle", outcome: { success: true }, keepPendingOnSuccess: true }).pending)
      .toBe(true);
    expect(reduceOutcome(running, { type: "settle", outcome: { success: false, error: "no" }, keepPendingOnSuccess: true }))
      .toEqual({ pending: false, error: "no" });
  });

  it("a failure releases pending and records the error", () => {
    const running = reduceOutcome(IDLE, { type: "start" });
    expect(reduceOutcome(running, { type: "settle", outcome: { success: false, error: "denied" } }))
      .toEqual({ pending: false, error: "denied" });
  });
});

describe("settle", () => {
  it("passes a returned result through", async () => {
    expect(await settle(async () => ({ success: false as const, error: "localized" }), [], "fallback"))
      .toEqual({ success: false, error: "localized" });
    expect(await settle(async () => ({ success: true as const }), [], "fallback"))
      .toEqual({ success: true });
  });

  it("treats a void return as success", async () => {
    expect(await settle(async () => {}, [], "fallback")).toEqual({ success: true });
  });

  it("maps a throw to the fallback error, never the thrown message", async () => {
    const outcome = await settle(async () => { throw new Error("An error occurred in the Server Components render"); }, [], "fallback");
    expect(outcome).toEqual({ success: false, error: "fallback" });
  });

  it("forwards the arguments", async () => {
    const seen: unknown[] = [];
    await settle(async (a: number, b: string) => { seen.push(a, b); }, [1, "two"], "");
    expect(seen).toEqual([1, "two"]);
  });
});
