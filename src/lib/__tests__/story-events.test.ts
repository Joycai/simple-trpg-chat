import { describe, it, expect } from "vitest";
import {
  buildEventCardPayload,
  parseEventCardPayload,
  buildEventReceiptPayload,
  parseEventReceiptPayload,
  canViewEvent,
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
