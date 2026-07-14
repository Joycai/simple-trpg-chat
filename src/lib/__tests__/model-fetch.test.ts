import { describe, it, expect } from "vitest";
import { buildModelsRequest, parseModelsResponse } from "@/lib/model-fetch";
import { AI_VENDORS, COMPAT_VENDOR_ID, getVendor, getVendorModelPreset, normalizeVendorId } from "@/lib/provider-presets";

describe("buildModelsRequest", () => {
  it("uses Bearer auth and {endpoint}/models for OpenAI-compatible vendors", () => {
    for (const vendorId of ["openai", "deepseek", "google", COMPAT_VENDOR_ID]) {
      const req = buildModelsRequest(vendorId, "https://api.example.com/v1", "sk-test");
      expect(req.url).toBe("https://api.example.com/v1/models");
      expect(req.headers).toEqual({ Authorization: "Bearer sk-test" });
    }
  });

  it("uses x-api-key + anthropic-version for the anthropic vendor", () => {
    const req = buildModelsRequest("anthropic", "https://api.anthropic.com/v1", "sk-ant-test");
    expect(req.url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(req.headers["x-api-key"]).toBe("sk-ant-test");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    expect(req.headers.Authorization).toBeUndefined();
  });

  it("strips trailing slashes from the endpoint", () => {
    const req = buildModelsRequest("openai", "https://api.openai.com/v1///", "k");
    expect(req.url).toBe("https://api.openai.com/v1/models");
  });

  it("falls back to Bearer auth for unknown vendor ids", () => {
    const req = buildModelsRequest("whatever", "https://api.example.com", "k");
    expect(req.headers).toEqual({ Authorization: "Bearer k" });
  });
});

describe("parseModelsResponse", () => {
  it("parses the OpenAI-style { data: [{ id }] } shape", () => {
    const json = { object: "list", data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] };
    expect(parseModelsResponse(json)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("parses the Anthropic shape (data entries with extra fields)", () => {
    const json = {
      data: [
        { type: "model", id: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
        { type: "model", id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
      ],
      has_more: false,
    };
    expect(parseModelsResponse(json)).toEqual(["claude-haiku-4-5", "claude-sonnet-5"]);
  });

  it("strips the Google models/ prefix and handles the native { models } shape", () => {
    expect(parseModelsResponse({ data: [{ id: "models/gemini-2.5-flash" }] })).toEqual(["gemini-2.5-flash"]);
    expect(parseModelsResponse({ models: [{ name: "models/gemini-2.5-pro" }] })).toEqual(["gemini-2.5-pro"]);
  });

  it("dedupes and sorts", () => {
    const json = { data: [{ id: "b" }, { id: "a" }, { id: "b" }] };
    expect(parseModelsResponse(json)).toEqual(["a", "b"]);
  });

  it("returns an empty list for malformed payloads", () => {
    expect(parseModelsResponse(null)).toEqual([]);
    expect(parseModelsResponse("nope")).toEqual([]);
    expect(parseModelsResponse({ data: "nope" })).toEqual([]);
    expect(parseModelsResponse({ data: [{ foo: 1 }, null] })).toEqual([]);
  });
});

describe("vendor registry", () => {
  it("has unique ids and a default endpoint for every non-compat vendor", () => {
    const ids = AI_VENDORS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of AI_VENDORS) {
      if (v.id === COMPAT_VENDOR_ID) continue;
      expect(v.endpoint).toMatch(/^https:\/\//);
      expect(v.models.length).toBeGreaterThan(0);
    }
  });

  it("normalizes unknown vendor ids to the compat vendor", () => {
    expect(normalizeVendorId("openai")).toBe("openai");
    expect(normalizeVendorId("nope")).toBe(COMPAT_VENDOR_ID);
    expect(normalizeVendorId(undefined)).toBe(COMPAT_VENDOR_ID);
  });

  it("looks up model presets by vendor + model id", () => {
    const deepseek = getVendor("deepseek")!;
    const flash = getVendorModelPreset("deepseek", deepseek.models[0].id);
    expect(flash).toBeDefined();
    expect(getVendorModelPreset("deepseek", "not-a-model")).toBeUndefined();
    expect(getVendorModelPreset("nope", "x")).toBeUndefined();
  });
});
