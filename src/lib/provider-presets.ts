/**
 * Quick-preset provider definitions — single source of truth for the
 * "preset provider" dropdown shown in the admin AI page and the user-side
 * AI providers tab. Each entry seeds the create/edit form (name, endpoint,
 * model) and optionally pre-fills per-token rates for the admin form.
 *
 * Adding a new preset here automatically surfaces it in both call sites.
 */

export interface ProviderPreset {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  /** Per-million-token input rate (USD). Admin-only. */
  tokenRateInput?: number;
  /** Per-million-token cached-input rate (USD). Admin-only. */
  tokenRateCached?: number;
  /** Per-million-token output rate (USD). Admin-only. */
  tokenRateOutput?: number;
  /** Two-letter abbreviation displayed in the dropdown badge. */
  badgeLetters: string;
}

export const CUSTOM_PRESET_ID = "custom";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o",
    tokenRateInput: 0.15,
    tokenRateCached: 0.075,
    tokenRateOutput: 0.6,
    badgeLetters: "OA",
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    tokenRateInput: 0.015,
    tokenRateCached: 0.005,
    tokenRateOutput: 0.06,
    badgeLetters: "DS",
  },
  {
    id: "deepseek-pro",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    tokenRateInput: 0.15,
    tokenRateCached: 0.075,
    tokenRateOutput: 0.6,
    badgeLetters: "DS",
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** Strip protocol for the dropdown subtitle. Falls back to the raw URL on parse error. */
export function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}
