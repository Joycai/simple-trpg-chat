/**
 * Resolve a bot's activation mode from its config JSON. The UI stores
 * "@mention" while the agent config schema defaults to "mention" — anything
 * other than an explicit "manual" counts as mention-triggered, so legacy or
 * malformed values never silently mute a bot.
 */
export function botActivationMode(botConfigJson: string | null | undefined): "mention" | "manual" {
  try {
    const cfg = JSON.parse(botConfigJson || "{}");
    return cfg?.activation === "manual" ? "manual" : "mention";
  } catch {
    return "mention";
  }
}

/**
 * Host-facing projection of a bot's config for the management panel. Only the
 * fields the editor form binds to; never the historical summary or any future
 * host-private key that happens to live in the JSON.
 */
export function botConfigForEditor(botConfigJson: string | null | undefined): {
  systemPrompt?: string;
  model?: string;
  activation?: string;
  enableTools?: string[];
  providerId?: number;
  imageProviderId?: number;
} {
  if (!botConfigJson) return {};
  try {
    const cfg = JSON.parse(botConfigJson) as Record<string, unknown>;
    const out: ReturnType<typeof botConfigForEditor> = {};
    if (typeof cfg.systemPrompt === "string") out.systemPrompt = cfg.systemPrompt;
    if (typeof cfg.model === "string") out.model = cfg.model;
    if (typeof cfg.activation === "string") out.activation = cfg.activation;
    if (Array.isArray(cfg.enableTools)) {
      out.enableTools = cfg.enableTools.filter((x): x is string => typeof x === "string");
    }
    if (typeof cfg.providerId === "number") out.providerId = cfg.providerId;
    if (typeof cfg.imageProviderId === "number") out.imageProviderId = cfg.imageProviderId;
    return out;
  } catch {
    return {};
  }
}

/**
 * Client-facing projection of a bot's config. The full JSON carries the
 * system prompt, historical summary, and other host-private material;
 * `getBotStatus` on the client only ever reads `providerId`, so that is the
 * only field allowed to leave the server.
 */
export function sanitizeBotConfigForClient(botConfigJson: string | null | undefined): string | null {
  if (!botConfigJson) return null;
  try {
    const cfg = JSON.parse(botConfigJson);
    return JSON.stringify({ providerId: cfg?.providerId ?? null });
  } catch {
    return null;
  }
}

export interface BotStatus {
  isBotDisabled: boolean;
  isProviderError: boolean;
}

/** The bot fields every room member may see — no prompt, tools or summary. */
export interface RoomBotSummary {
  id: number;
  memberId: number;
  nickname: string;
  name: string | null;
  avatarColor: string | null;
  /** Normalized activation mode, for the badge line. */
  activation: "mention" | "manual";
  /** Provider id only (the UI needs it to show the provider-error badge). */
  providerId: number | null;
  /** Host/admin only. Absent for players, so a member's payload never carries it. */
  config?: ReturnType<typeof botConfigForEditor>;
}

/** Read just the `providerId` out of a bot config without parsing it twice. */
export function botConfigProviderId(botConfigJson: string | null | undefined): number | null {
  if (!botConfigJson) return null;
  try {
    const pid = (JSON.parse(botConfigJson) as { providerId?: unknown })?.providerId;
    return typeof pid === "number" ? pid : null;
  } catch {
    return null;
  }
}

// Resolve whether a member's bot is usable: disabled when AI is off globally,
// provider-error when its configured providerId is missing or no longer valid.
export function getBotStatus(
  usersRecord: { isBot?: boolean; botConfigJson?: string | null } | null | undefined,
  aiEnabled: boolean,
  validProviderIds: number[],
): BotStatus {
  if (!usersRecord?.isBot) return { isBotDisabled: false, isProviderError: false };
  if (!aiEnabled) return { isBotDisabled: true, isProviderError: false };

  try {
    const cfg = JSON.parse(usersRecord.botConfigJson || "{}");
    const pid = cfg.providerId;
    if (!pid || !validProviderIds.includes(pid)) {
      return { isBotDisabled: false, isProviderError: true };
    }
  } catch {
    return { isBotDisabled: false, isProviderError: true };
  }

  return { isBotDisabled: false, isProviderError: false };
}
