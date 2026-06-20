export interface BotStatus {
  isBotDisabled: boolean;
  isProviderError: boolean;
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
