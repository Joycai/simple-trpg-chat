import { describe, expect, it } from "vitest";
import { tabId } from "../tab-id";
import { cleanOrigin } from "@/lib/character/broadcast";

describe("tabId", () => {
  it("is stable for the page and passes the server's origin check", () => {
    const id = tabId();
    expect(tabId()).toBe(id);
    expect(cleanOrigin(id)).toBe(id);
  });
});
