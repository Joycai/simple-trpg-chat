import { describe, it, expect } from "vitest";
import { botActivationMode, getBotStatus } from "../botStatus";

describe("botActivationMode", () => {
  it("returns manual only for an explicit manual setting", () => {
    expect(botActivationMode(JSON.stringify({ activation: "manual" }))).toBe("manual");
  });

  it("treats both stored spellings of mention mode as mention", () => {
    // BotManager stores "@mention"; the agent config schema defaults to "mention".
    expect(botActivationMode(JSON.stringify({ activation: "@mention" }))).toBe("mention");
    expect(botActivationMode(JSON.stringify({ activation: "mention" }))).toBe("mention");
  });

  it("falls back to mention for missing, empty, or unknown values", () => {
    expect(botActivationMode(null)).toBe("mention");
    expect(botActivationMode(undefined)).toBe("mention");
    expect(botActivationMode("{}")).toBe("mention");
    expect(botActivationMode(JSON.stringify({ activation: "always" }))).toBe("mention");
  });

  it("falls back to mention for malformed JSON instead of muting the bot", () => {
    expect(botActivationMode("not json")).toBe("mention");
  });
});

describe("getBotStatus", () => {
  const bot = (providerId?: number) => ({
    isBot: true,
    botConfigJson: JSON.stringify(providerId ? { providerId } : {}),
  });

  it("reports nothing for non-bot users", () => {
    expect(getBotStatus({ isBot: false }, false, [])).toEqual({ isBotDisabled: false, isProviderError: false });
    expect(getBotStatus(null, true, [])).toEqual({ isBotDisabled: false, isProviderError: false });
  });

  it("marks the bot disabled when AI is globally off", () => {
    expect(getBotStatus(bot(1), false, [1])).toEqual({ isBotDisabled: true, isProviderError: false });
  });

  it("marks a provider error when the provider is missing or stale", () => {
    expect(getBotStatus(bot(), true, [1])).toEqual({ isBotDisabled: false, isProviderError: true });
    expect(getBotStatus(bot(99), true, [1])).toEqual({ isBotDisabled: false, isProviderError: true });
    expect(getBotStatus({ isBot: true, botConfigJson: "not json" }, true, [1])).toEqual({ isBotDisabled: false, isProviderError: true });
  });

  it("reports healthy when the provider is valid", () => {
    expect(getBotStatus(bot(1), true, [1])).toEqual({ isBotDisabled: false, isProviderError: false });
  });
});
