import { describe, it, expect, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

const { validateApiEndpoint } = await import("../url-guard");

describe("validateApiEndpoint", () => {
  it("rejects non-https URLs", async () => {
    const result = await validateApiEndpoint("http://api.example.com/v1");
    expect(result.valid).toBe(false);
  });

  it("rejects literal loopback IPv4", async () => {
    const result = await validateApiEndpoint("https://127.0.0.1/v1");
    expect(result.valid).toBe(false);
  });

  it("rejects literal link-local IPv4 (cloud metadata range)", async () => {
    const result = await validateApiEndpoint("https://169.254.169.254/latest/meta-data");
    expect(result.valid).toBe(false);
  });

  it("rejects literal RFC1918 IPv4", async () => {
    expect((await validateApiEndpoint("https://10.0.0.5/v1")).valid).toBe(false);
    expect((await validateApiEndpoint("https://192.168.1.1/v1")).valid).toBe(false);
    expect((await validateApiEndpoint("https://172.16.0.1/v1")).valid).toBe(false);
  });

  it("rejects literal loopback/link-local IPv6", async () => {
    expect((await validateApiEndpoint("https://[::1]/v1")).valid).toBe(false);
    expect((await validateApiEndpoint("https://[fe80::1]/v1")).valid).toBe(false);
    expect((await validateApiEndpoint("https://[fc00::1]/v1")).valid).toBe(false);
  });

  it("rejects an IPv4-mapped IPv6 loopback (dotted form)", async () => {
    const result = await validateApiEndpoint("https://[::ffff:127.0.0.1]/v1");
    expect(result.valid).toBe(false);
  });

  it("rejects an IPv4-mapped IPv6 loopback (canonical hex-group form)", async () => {
    // Node's URL parser normalizes ::ffff:127.0.0.1 to this form.
    const result = await validateApiEndpoint("https://[::ffff:7f00:1]/v1");
    expect(result.valid).toBe(false);
  });

  it("accepts a literal public IPv6 address", async () => {
    const result = await validateApiEndpoint("https://[2606:4700:4700::1111]/v1");
    expect(result.valid).toBe(true);
  });

  it("rejects localhost", async () => {
    const result = await validateApiEndpoint("https://localhost/v1");
    expect(result.valid).toBe(false);
  });

  it("rejects a hostname that resolves to a private address (DNS rebinding)", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const result = await validateApiEndpoint("https://attacker-controlled.example/v1");
    expect(result.valid).toBe(false);
  });

  it("accepts a hostname that resolves only to public addresses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "203.0.113.10", family: 4 }]);
    const result = await validateApiEndpoint("https://api.openai.com/v1");
    expect(result.valid).toBe(true);
  });

  it("rejects when the hostname fails to resolve", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const result = await validateApiEndpoint("https://does-not-exist.invalid/v1");
    expect(result.valid).toBe(false);
  });
});
