/**
 * Vendor-aware model listing helpers — pure functions shared by the
 * `fetchProviderModels` server action and its tests. Network I/O stays in
 * the action; this module only builds the request and parses the response.
 */

import { parseProtocolConfig, resolveConnection } from "./protocol/config";
import { getVendor } from "@/lib/ai/provider-presets";

export interface ModelsRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Build the GET request for a vendor's model list.
 *
 * All OpenAI-compatible vendors (OpenAI, DeepSeek, Google's compat layer,
 * newAPI, …) expose `GET {endpoint}/models` with a Bearer key. Anthropic's
 * native list lives at the same path but wants `x-api-key` +
 * `anthropic-version` headers instead.
 */
export function buildModelsRequest(vendorId: string, endpoint: string, apiKey: string, protocolConfig?: unknown): ModelsRequest {
  if (protocolConfig != null) {
    const config = parseProtocolConfig(protocolConfig);
    const c = resolveConnection(endpoint, apiKey, config.model ?? "model-list", config);
    const url = new URL(c.url);
    url.pathname = config.protocol === "gemini" ? url.pathname.replace(/\/models\/[^/]+:[^/]+$/, "/models") : url.pathname.replace(/\/(chat\/completions|responses|messages)$/, "/models");
    url.search = config.protocol === "messages" ? "?limit=1000" : "";
    return { url: url.toString(), headers: c.headers };
  }
  const base = endpoint.replace(/\/+$/, "");
  if (getVendor(vendorId)?.modelListAuth === "anthropic") {
    return {
      url: `${base}/models?limit=1000`,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };
  }
  return {
    url: `${base}/models`,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

/**
 * Extract model ids from a list response. Handles:
 * - OpenAI / DeepSeek / Anthropic / Google-compat: `{ data: [{ id }] }`
 * - Google native (defensive fallback):            `{ models: [{ name: "models/…" }] }`
 *
 * Google ids may arrive prefixed with `models/`; the bare name is what the
 * OpenAI-compat chat endpoint accepts, so the prefix is stripped.
 */
export function parseModelsResponse(json: unknown): string[] {
  const out = new Set<string>();
  if (json && typeof json === "object") {
    const body = json as { data?: unknown; models?: unknown };
    const entries = [
      ...(Array.isArray(body.data) ? body.data : []),
      ...(Array.isArray(body.models) ? body.models : []),
    ];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const { id, name } = entry as { id?: unknown; name?: unknown };
      const raw = typeof id === "string" && id ? id : typeof name === "string" ? name : "";
      if (!raw) continue;
      out.add(raw.replace(/^models\//, ""));
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
