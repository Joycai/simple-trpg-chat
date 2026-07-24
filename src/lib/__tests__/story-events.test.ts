import { describe, it, expect } from "vitest";
import {
  buildEventCardPayload,
  parseEventCardPayload,
  buildEventReceiptPayload,
  parseEventReceiptPayload,
  canViewEvent,
  resolveEventVisibility,
  isPublished,
  parseEventImages,
  serializeEventImages,
  MAX_EVENT_IMAGES,
} from "@/lib/story-events";

describe("event card payload", () => {
  it("round-trips metadata (no body ever included)", () => {
    const raw = buildEventCardPayload({ eventId: 7, title: "码头的枪声", mode: "full", cover: "/x.webp" });
    const parsed = parseEventCardPayload(raw);
    expect(parsed).toEqual({ eventId: 7, title: "码头的枪声", mode: "full", cover: "/x.webp" });
    // The serialized form must not smuggle a description field.
    expect(raw).not.toContain("description");
  });

  it("returns null for malformed / shape-mismatched payloads", () => {
    expect(parseEventCardPayload(null)).toBeNull();
    expect(parseEventCardPayload("not json")).toBeNull();
    expect(parseEventCardPayload(JSON.stringify({ eventCard: { title: "x" } }))).toBeNull();
    expect(parseEventCardPayload(JSON.stringify({ other: 1 }))).toBeNull();
  });
});

describe("event receipt payload", () => {
  it("round-trips", () => {
    const raw = buildEventReceiptPayload({ eventId: 3, title: "失踪的委托人" });
    expect(parseEventReceiptPayload(raw)).toEqual({ eventId: 3, title: "失踪的委托人" });
  });
  it("rejects bad shapes", () => {
    expect(parseEventReceiptPayload("{}")).toBeNull();
    expect(parseEventReceiptPayload(JSON.stringify({ eventReceipt: { eventId: "x", title: "y" } }))).toBeNull();
  });
});

describe("canViewEvent", () => {
  it("host/creator always sees, even unpublished", () => {
    expect(canViewEvent({ status: "unpublished", isHostOrCreator: true, isVisibleMember: false })).toBe(true);
    expect(canViewEvent({ status: "partial", isHostOrCreator: true, isVisibleMember: false })).toBe(true);
  });

  it("unpublished is host-only", () => {
    expect(canViewEvent({ status: "unpublished", isHostOrCreator: false, isVisibleMember: true })).toBe(false);
  });

  it("full is visible to any member regardless of enumeration", () => {
    expect(canViewEvent({ status: "full", isHostOrCreator: false, isVisibleMember: false })).toBe(true);
  });

  it("partial gates on enumerated membership", () => {
    expect(canViewEvent({ status: "partial", isHostOrCreator: false, isVisibleMember: true })).toBe(true);
    expect(canViewEvent({ status: "partial", isHostOrCreator: false, isVisibleMember: false })).toBe(false);
  });
});

describe("isPublished", () => {
  it("is true once partial or full", () => {
    expect(isPublished("unpublished")).toBe(false);
    expect(isPublished("partial")).toBe(true);
    expect(isPublished("full")).toBe(true);
  });
});

describe("event images", () => {
  it("parses, de-blanks, and clamps to MAX_EVENT_IMAGES", () => {
    expect(parseEventImages(null)).toEqual([]);
    expect(parseEventImages("nope")).toEqual([]);
    expect(parseEventImages(JSON.stringify({ not: "array" }))).toEqual([]);
    expect(parseEventImages(JSON.stringify(["/a", "", "/b", null, "/c", "/d"]))).toEqual(["/a", "/b", "/c"]);
  });

  it("serialize is the inverse (clamped)", () => {
    const urls = ["/a", "/b", "/c", "/d"];
    expect(parseEventImages(serializeEventImages(urls))).toEqual(["/a", "/b", "/c"]);
    expect(MAX_EVENT_IMAGES).toBe(3);
  });
});

describe("resolveEventVisibility — the single-event access decision", () => {
  const STATUSES = ["unpublished", "partial", "full"] as const;

  it("covers all 3 x 2 x 2 combinations explicitly", () => {
    const table: Array<[typeof STATUSES[number], boolean, boolean, boolean]> = [
      // status,        isHost, hasRow, expected visible
      ["unpublished", false, false, false],
      ["unpublished", false, true, false], // a stray row must NOT expose a draft
      ["unpublished", true, false, true],
      ["unpublished", true, true, true],
      ["partial", false, false, false], // not granted -> no body
      ["partial", false, true, true],
      ["partial", true, false, true],
      ["partial", true, true, true],
      ["full", false, false, true], // published to everyone
      ["full", false, true, true],
      ["full", true, false, true],
      ["full", true, true, true],
    ];
    expect(table).toHaveLength(STATUSES.length * 2 * 2);
    for (const [status, isHost, hasVisibilityRow, expected] of table) {
      expect(
        resolveEventVisibility({ status, isHost, hasVisibilityRow }).visible,
        `status=${status} isHost=${isHost} hasRow=${hasVisibilityRow}`,
      ).toBe(expected);
    }
  });

  it("never leaks an unpublished event to a non-host, row or not", () => {
    for (const hasVisibilityRow of [false, true]) {
      expect(resolveEventVisibility({ status: "unpublished", isHost: false, hasVisibilityRow }).visible).toBe(false);
    }
  });

  it("exposes host-only fields to the host and nobody else", () => {
    for (const status of STATUSES) {
      expect(resolveEventVisibility({ status, isHost: true, hasVisibilityRow: false }).exposeHostFields).toBe(true);
      expect(resolveEventVisibility({ status, isHost: false, hasVisibilityRow: true }).exposeHostFields).toBe(false);
    }
  });

  it("agrees with canViewEvent on every combination", () => {
    for (const status of STATUSES) {
      for (const isHost of [false, true]) {
        for (const hasRow of [false, true]) {
          expect(resolveEventVisibility({ status, isHost, hasVisibilityRow: hasRow }).visible).toBe(
            canViewEvent({ status, isHostOrCreator: isHost, isVisibleMember: hasRow }),
          );
        }
      }
    }
  });
});
