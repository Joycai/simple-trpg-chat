/** Platform labels and legacy model suggestions shared by provider controls.
 * Native protocol endpoint presets live in vendor-config.ts. Model capability
 * settings are explicit per configured model, never inferred from these labels.
 */

export interface VendorModelPreset {
  /** Model id as sent in the `model` field of chat requests. */
  id: string;
  /** Per-million-token input rate (USD). Admin-only prefill. */
  tokenRateInput?: number;
  /** Per-million-token cached-input rate (USD). Admin-only prefill. */
  tokenRateCached?: number;
  /** Per-million-token output rate (USD). Admin-only prefill. */
  tokenRateOutput?: number;
}

export interface AiVendor {
  id: string;
  name: string;
  nameEn?: string;
  /** Explains which credentials/region this preset expects. */
  hintKey?: string;
  /** Default OpenAI-compatible base endpoint; empty for the generic compat vendor. */
  endpoint: string;
  /** Two-letter abbreviation displayed in the dropdown badge. */
  badgeLetters: string;
  /**
   * Auth style for GET {endpoint}/models. Legacy Chat uses Bearer;
   * Anthropic's native models endpoint wants x-api-key + anthropic-version.
   */
  modelListAuth: "bearer" | "anthropic";
  /** Known models, first entry is the default prefill. */
  models: VendorModelPreset[];
}

/** Generic OpenAI-compatible third party (newAPI, one-api, self-hosted, …). */
export const COMPAT_VENDOR_ID = "openai-compatible";

export const AI_VENDORS: AiVendor[] = [
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    badgeLetters: "OA",
    modelListAuth: "bearer",
    models: [
      { id: "gpt-4o", tokenRateInput: 0.15, tokenRateCached: 0.075, tokenRateOutput: 0.6 },
    ],
  },
  {
    id: "google",
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    badgeLetters: "GG",
    modelListAuth: "bearer",
    models: [
      { id: "gemini-2.5-flash", tokenRateInput: 0.3, tokenRateCached: 0.075, tokenRateOutput: 2.5 },
      { id: "gemini-2.5-pro", tokenRateInput: 1.25, tokenRateCached: 0.31, tokenRateOutput: 10 },
    ],
  },
  {
    id: "anthropic",
    name: "Claude",
    endpoint: "https://api.anthropic.com/v1",
    badgeLetters: "CL",
    modelListAuth: "anthropic",
    models: [
      { id: "claude-sonnet-5", tokenRateInput: 3, tokenRateCached: 0.3, tokenRateOutput: 15 },
      { id: "claude-haiku-4-5", tokenRateInput: 1, tokenRateCached: 0.1, tokenRateOutput: 5 },
    ],
  },
  { id: "qwen", name: "阿里千问", nameEn: "Alibaba Qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1", badgeLetters: "QW", modelListAuth: "bearer", models: [], hintKey: "presetChina" },
  { id: "qwen-token-plan", name: "阿里千问（Plan）", nameEn: "Alibaba Qwen (Plan)", endpoint: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", badgeLetters: "QP", modelListAuth: "bearer", models: [], hintKey: "presetQwenPlan" },
  { id: "volcengine", name: "字节火山", nameEn: "ByteDance Volcano", endpoint: "https://ark.cn-beijing.volces.com/api/v3", badgeLetters: "VE", modelListAuth: "bearer", models: [], hintKey: "presetChina" },
  { id: "volcengine-agent-plan", name: "字节火山（Agent Plan）", nameEn: "ByteDance Volcano (Agent Plan)", endpoint: "https://ark.cn-beijing.volces.com/api/plan/v3", badgeLetters: "VP", modelListAuth: "bearer", models: [], hintKey: "presetArkPlan" },
  {
    id: "deepseek",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    badgeLetters: "DS",
    modelListAuth: "bearer",
    models: [
      { id: "deepseek-v4-flash", tokenRateInput: 0.015, tokenRateCached: 0.005, tokenRateOutput: 0.06 },
      { id: "deepseek-v4-pro", tokenRateInput: 0.15, tokenRateCached: 0.075, tokenRateOutput: 0.6 },
    ],
  },
  {
    id: COMPAT_VENDOR_ID,
    name: "自定义",
    nameEn: "Custom",
    endpoint: "",
    badgeLetters: "OC",
    modelListAuth: "bearer",
    models: [],
  },
];

// Retired presets remain recognizable for existing saved configurations.
const LEGACY_VENDORS: AiVendor[] = [
  { id: "openrouter", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", badgeLetters: "OR", modelListAuth: "bearer", models: [] },
];
export function vendorOptions(current?: string): AiVendor[] {
  const legacy = LEGACY_VENDORS.find(v => v.id === current);
  return legacy ? [...AI_VENDORS, legacy] : AI_VENDORS;
}
export function vendorLabel(vendor: AiVendor, locale: string): string {
  return locale.startsWith('zh') ? vendor.name : vendor.nameEn ?? vendor.name;
}

export function getVendor(id: string | null | undefined): AiVendor | undefined {
  return [...AI_VENDORS, ...LEGACY_VENDORS].find((v) => v.id === id);
}

/** Coerce an arbitrary stored/submitted value to a known vendor id. */
export function normalizeVendorId(id: string | null | undefined): string {
  return getVendor(id)?.id ?? COMPAT_VENDOR_ID;
}

export function getVendorModelPreset(
  vendorId: string | null | undefined,
  modelId: string,
): VendorModelPreset | undefined {
  return getVendor(vendorId)?.models.find((m) => m.id === modelId);
}

/** Strip protocol for the dropdown subtitle. Falls back to the raw URL on parse error. */
export function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
