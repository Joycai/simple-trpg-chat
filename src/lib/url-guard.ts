// SSRF protection: validates that a URL is safe for outbound AI API calls
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost[:/]/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
];

export function validateApiEndpoint(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: false, error: "Endpoint URL is required" };
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Endpoint must use HTTPS" };
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(url)) {
      return { valid: false, error: "Endpoint must not point to a private or loopback address" };
    }
  }
  try {
    new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
  return { valid: true };
}
