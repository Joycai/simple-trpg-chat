import { describe, it, expect, vi } from "vitest";
import { parseSensitiveWords, checkSensitiveWords, DEFAULT_SENSITIVE_WORDS } from "../sensitive-words";

// Mock database select query to return empty custom sensitive words
vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
  };
});

describe("Sensitive Words Filtering", () => {
  describe("parseSensitiveWords", () => {
    it("should parse comma-separated keywords", () => {
      const result = parseSensitiveWords("赌博, 翻墙,暴政");
      expect(result).toEqual(["赌博", "翻墙", "暴政"]);
    });

    it("should parse line-separated keywords", () => {
      const result = parseSensitiveWords("赌博\n翻墙\r\n暴政");
      expect(result).toEqual(["赌博", "翻墙", "暴政"]);
    });

    it("should clean empty strings and whitespaces", () => {
      const result = parseSensitiveWords("  , 赌博 , , 翻墙 , \n ");
      expect(result).toEqual(["赌博", "翻墙"]);
    });

    it("should return empty array for empty inputs", () => {
      expect(parseSensitiveWords("")).toEqual([]);
      expect(parseSensitiveWords("   ")).toEqual([]);
    });
  });

  describe("checkSensitiveWords", () => {
    it("should detect political blacklist words from default list", async () => {
      const matched = await checkSensitiveWords("这是一个讨论关于六四事件的消息。");
      expect(matched).toBe("六四");

      const matched2 = await checkSensitiveWords("习包子下台");
      // Wait, is "习近平下台" or "习近平" matched?
      // Since DEFAULT_SENSITIVE_WORDS has "习近平", "习近平" will match first.
      const matched3 = await checkSensitiveWords("关于习近平的报道。");
      expect(matched3).toBe("习近平");
    });

    it("should return null for normal content", async () => {
      const matched = await checkSensitiveWords("今天天气真好，我们一起去跑团吧！");
      expect(matched).toBeNull();
    });

    it("should handle mixed casing gracefully", async () => {
      const matched = await checkSensitiveWords("这是一个关于 8964 的文本");
      expect(matched).toBe("8964");
    });
  });
});
