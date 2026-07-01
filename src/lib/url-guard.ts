// SSRF protection: validates that a URL is safe for outbound AI API calls.
// Any authenticated user (not just admins) can register a provider endpoint,
// so this must resolve the hostname and check the *actual* IP — a regex over
// the URL string can't catch a hostname that simply resolves to an internal
// address (DNS rebinding, `internal-service.local`, etc).
import dns from "node:dns/promises";
import net from "node:net";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

const IPV4_BLOCKED_RANGES: [string, string][] = [
  ["0.0.0.0", "0.255.255.255"], // "this" network
  ["10.0.0.0", "10.255.255.255"], // RFC1918
  ["100.64.0.0", "100.127.255.255"], // CGNAT
  ["127.0.0.0", "127.255.255.255"], // loopback
  ["169.254.0.0", "169.254.255.255"], // link-local (incl. cloud metadata)
  ["172.16.0.0", "172.31.255.255"], // RFC1918
  ["192.0.0.0", "192.0.0.255"], // IETF protocol assignments
  ["192.168.0.0", "192.168.255.255"], // RFC1918
  ["198.18.0.0", "198.19.255.255"], // benchmarking
  ["224.0.0.0", "255.255.255.255"], // multicast + reserved/broadcast
];

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // fail closed on anything unparseable
  return IPV4_BLOCKED_RANGES.some(([start, end]) => {
    const s = ipv4ToInt(start)!;
    const e = ipv4ToInt(end)!;
    return n >= s && n <= e;
  });
}

// Expands any valid IPv6 literal (including `::` shorthand and a trailing
// embedded IPv4, e.g. "::ffff:127.0.0.1") into its 128-bit value. Node's
// `URL` parser canonicalizes IPv4-mapped addresses to hex groups
// (`::ffff:7f00:1` rather than `::ffff:127.0.0.1`), so this must handle both.
function ipv6ToBigInt(ip: string): bigint | null {
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) ip = ip.slice(0, zoneIdx);

  const expandLast = (groups: string[]): string[] | null => {
    if (groups.length === 0) return groups;
    const last = groups[groups.length - 1];
    if (!last.includes(".")) return groups;
    const n = ipv4ToInt(last);
    if (n === null) return null;
    const hi = ((n >>> 16) & 0xffff).toString(16);
    const lo = (n & 0xffff).toString(16);
    return [...groups.slice(0, -1), hi, lo];
  };

  const doubleColonIdx = ip.indexOf("::");
  let groups: string[];
  if (doubleColonIdx !== -1) {
    if (ip.indexOf("::", doubleColonIdx + 1) !== -1) return null; // multiple "::"
    const leftRaw = ip.slice(0, doubleColonIdx);
    const rightRaw = ip.slice(doubleColonIdx + 2);
    const headRaw = leftRaw ? leftRaw.split(":") : [];
    const tailRaw = rightRaw ? rightRaw.split(":") : [];
    const head = expandLast(headRaw);
    const tail = expandLast(tailRaw);
    if (head === null || tail === null) return null;
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    const expanded = expandLast(ip.split(":"));
    if (expanded === null) return null;
    groups = expanded;
  }

  if (groups.length !== 8) return null;

  const sixteen = BigInt(16);
  let result = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    result = (result << sixteen) | BigInt(parseInt(g, 16));
  }
  return result;
}

function isBlockedIPv6(ip: string): boolean {
  const value = ipv6ToBigInt(ip);
  if (value === null) return true; // fail closed on anything unparseable

  if (value === BigInt(0) || value === BigInt(1)) return true; // :: and ::1
  if (value >> BigInt(118) === BigInt(1018)) return true; // fe80::/10 link-local
  if (value >> BigInt(121) === BigInt(126)) return true; // fc00::/7 unique local

  if (value >> BigInt(32) === BigInt(0xffff)) {
    // ::ffff:0:0/96 — IPv4-mapped; validate the embedded IPv4 address.
    const v4 = value & BigInt(0xffffffff);
    const dotted = [24, 16, 8, 0]
      .map((shift) => Number((v4 >> BigInt(shift)) & BigInt(0xff)))
      .join(".");
    return isBlockedIPv4(dotted);
  }

  return false;
}

function isBlockedIP(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true; // fail closed if it's not a recognizable IP at all
}

export async function validateApiEndpoint(url: string): Promise<{ valid: boolean; error?: string }> {
  if (!url) return { valid: false, error: "Endpoint URL is required" };
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Endpoint must use HTTPS" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost") {
    return { valid: false, error: "Endpoint must not point to a private or loopback address" };
  }

  const directFamily = net.isIP(hostname);
  let addresses: string[];
  if (directFamily) {
    addresses = [hostname];
  } else {
    try {
      const results = await dns.lookup(hostname, { all: true, verbatim: true });
      addresses = results.map((r) => r.address);
    } catch {
      return { valid: false, error: "Endpoint hostname could not be resolved" };
    }
  }

  if (addresses.length === 0 || addresses.some(isBlockedIP)) {
    return { valid: false, error: "Endpoint must not point to a private or loopback address" };
  }

  return { valid: true };
}
