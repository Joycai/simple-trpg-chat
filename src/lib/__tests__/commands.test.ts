import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { eq } from "drizzle-orm";

// Mock database module
vi.mock("@/db", () => {
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const Database = require("better-sqlite3");

  const sqlite = new Database(":memory:");
  const testDb = drizzle(sqlite);

  return {
    db: testDb,
    currentDialect: "sqlite",
    sqlNow: () => {
      const { sql } = require("drizzle-orm");
      return sql`(datetime('now'))`;
    },
    sqlBool: (val: boolean) => (val ? 1 : 0),
  };
});

// 3. Mock authentication
vi.mock("@/auth", () => {
  return {
    auth: vi.fn().mockResolvedValue({
      user: {
        id: "1",
        name: "Test User",
        role: "player",
      },
    }),
  };
});

// 4. Mock events and next/cache
vi.mock("@/lib/events", () => ({
  broadcastToRoom: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// 5. Mock rollDie and rollDice to allow custom roll results in checks
vi.mock("../utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils")>();
  const rollDieMock = vi.fn((faces) => actual.rollDie(faces));
  const rollDiceMock = vi.fn((faces, count) => {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(rollDieMock(faces));
    }
    const sum = results.reduce((a, b) => a + b, 0);
    return { results, sum, notation: `${count}d${faces}` };
  });
  return {
    ...actual,
    rollDie: rollDieMock,
    rollDice: rollDiceMock,
  };
});

// Import the modules under test after mocks
import { executeCommand } from "../commands";
import { db } from "@/db";
import { rollDie, rollDice } from "../utils";

describe("Commands Engine", () => {
  beforeAll(() => {
    // Run migrations on the in-memory database
    migrate(db, {
      migrationsFolder: path.resolve(__dirname, "../../../drizzle"),
    });
  });

  beforeEach(async () => {
    vi.mocked(rollDie).mockClear();
    vi.mocked(rollDice).mockClear();

    // Clean up database tables before each test
    await db.delete(schema.messages);
    await db.delete(schema.roomSkills);
    await db.delete(schema.roomMembers);
    await db.delete(schema.rooms);
    await db.delete(schema.users);

    // Insert dummy user, room and member
    await db.insert(schema.users).values({
      id: 1,
      username: "testuser",
      passwordHash: "hash",
      displayName: "Test User",
      role: "player",
    });

    await db.insert(schema.rooms).values({
      id: 1,
      name: "Test Room",
      hostId: 1,
      secretKey: "secret",
      diceRules: "basic",
    });

    await db.insert(schema.roomMembers).values({
      id: 1,
      roomId: 1,
      userId: 1,
      nickname: "Test User",
    });
  });

  it("should ignore messages not starting with a dot", async () => {
    const result = await executeCommand(1, 1, "hello world");
    expect(result.isCommand).toBe(false);
  });

  it("should return error for unknown command", async () => {
    const result = await executeCommand(1, 1, ".unknown_cmd");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown command");
  });

  it("should handle .help command", async () => {
    const result = await executeCommand(1, 1, ".help");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.message.content).toContain("指令帮助");
  });

  it("should set skills using .st", async () => {
    const result = await executeCommand(1, 1, ".st 侦查 50 聆听 60");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message.content).toContain("技能已更新：侦查 50, 聆听 60");

    // Verify DB update
    const skills = await db.select().from(schema.roomSkills).where(eq(schema.roomSkills.userId, 1));
    expect(skills).toHaveLength(2);
    expect(skills.find(s => s.skillName === "侦查")?.skillValue).toBe(50);
    expect(skills.find(s => s.skillName === "聆听")?.skillValue).toBe(60);
  });

  it("should fail .rc if skill is not set", async () => {
    const result = await executeCommand(1, 1, ".rc 心理学");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("心理学' 未设置");
  });

  it("should run skill check using .rc when skill is set", async () => {
    // Set skill first
    await db.insert(schema.roomSkills).values({
      roomId: 1,
      userId: 1,
      skillName: "侦查",
      skillValue: 70,
    });

    const result = await executeCommand(1, 1, ".rc 侦查");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message.content).toContain("侦查检定");
    expect(result.message.type).toBe("dice");

    // Check detail JSON structure
    const detail = JSON.parse(result.message.diceDetail);
    expect(detail.dice).toBe("d100");
    expect(detail.check.skillName).toBe("侦查");
    expect(detail.check.target).toBe(70);
  });

  it("should apply COC 7th critical rules if room rules are set to coc7th and roll is <= 5", async () => {
    // Set room to coc7th
    await db.update(schema.rooms).set({ diceRules: "coc7th" }).where(eq(schema.rooms.id, 1));

    // Set skill
    await db.insert(schema.roomSkills).values({
      roomId: 1,
      userId: 1,
      skillName: "侦查",
      skillValue: 70,
    });

    // Mock rollDie to return 1 (critical/大成功)
    vi.mocked(rollDie).mockReturnValueOnce(1);

    const result = await executeCommand(1, 1, ".rc 侦查");
    expect(result.message.content).toContain("大成功！");
    
    const detail = JSON.parse(result.message.diceDetail);
    expect(detail.check.grade).toBe("critical");
  });

  it("should apply COC 7th fumble rules if room rules are set to coc7th and roll is >= 96", async () => {
    // Set room to coc7th
    await db.update(schema.rooms).set({ diceRules: "coc7th" }).where(eq(schema.rooms.id, 1));

    // Set skill
    await db.insert(schema.roomSkills).values({
      roomId: 1,
      userId: 1,
      skillName: "侦查",
      skillValue: 70,
    });

    // Mock rollDie to return 98 (fumble/大失败)
    vi.mocked(rollDie).mockReturnValueOnce(98);

    const result = await executeCommand(1, 1, ".rc 侦查");
    expect(result.message.content).toContain("大失败！");
    
    const detail = JSON.parse(result.message.diceDetail);
    expect(detail.check.grade).toBe("fumble");
  });

  it("should handle .rd<N> command without count and with count", async () => {
    // Mock rollDie to return 42
    vi.mocked(rollDie).mockReturnValueOnce(42);

    const result = await executeCommand(1, 1, ".rd100");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message.content).toContain("1d100");
    expect(result.message.content).toContain("42");

    const detail = JSON.parse(result.message.diceDetail);
    expect(detail.dice).toBe("d100");
    expect(detail.count).toBe(1);
    expect(detail.results).toEqual([42]);

    // Test with count
    vi.mocked(rollDie).mockReturnValueOnce(10).mockReturnValueOnce(20);
    const result2 = await executeCommand(1, 1, ".rd20 2");
    expect(result2.success).toBe(true);
    expect(result2.message.content).toContain("2d20");
    
    const detail2 = JSON.parse(result2.message.diceDetail);
    expect(detail2.dice).toBe("d20");
    expect(detail2.count).toBe(2);
    expect(detail2.results).toEqual([10, 20]);
  });

  it("should fail .st on invalid format", async () => {
    const result = await executeCommand(1, 1, ".st 侦查");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("格式错误");
  });

  it("should handle .st compact format and upsert updating skill value", async () => {
    // Compact format
    const result = await executeCommand(1, 1, ".st 侦查50聆听60");
    expect(result.success).toBe(true);
    expect(result.message.content).toContain("侦查 50, 聆听 60");

    let skills = await db.select().from(schema.roomSkills).where(eq(schema.roomSkills.userId, 1));
    expect(skills.find(s => s.skillName === "侦查")?.skillValue).toBe(50);
    expect(skills.find(s => s.skillName === "聆听")?.skillValue).toBe(60);

    // Upsert updating
    const result2 = await executeCommand(1, 1, ".st 侦查 75");
    expect(result2.success).toBe(true);
    skills = await db.select().from(schema.roomSkills).where(eq(schema.roomSkills.userId, 1));
    expect(skills.find(s => s.skillName === "侦查")?.skillValue).toBe(75);
  });

  it("should fail .rc if empty skill name is provided or room is not found", async () => {
    const result = await executeCommand(1, 1, ".rc");
    expect(result.isCommand).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("用法：.rc 侦查");

    const result2 = await executeCommand(999, 1, ".rc 侦查");
    expect(result2.isCommand).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Room not found");
  });

  it("should evaluate basic rule checks without applying coc7th critical/fumble rules", async () => {
    // Room rules are set to "basic" by default
    await db.insert(schema.roomSkills).values({
      roomId: 1,
      userId: 1,
      skillName: "侦查",
      skillValue: 70,
    });

    // Mock rollDie to return 1 (which is success, not critical under basic)
    vi.mocked(rollDie).mockReturnValueOnce(1);
    const result1 = await executeCommand(1, 1, ".rc 侦查");
    expect(result1.message.content).not.toContain("大成功！");
    expect(result1.message.content).toContain("成功");
    const detail1 = JSON.parse(result1.message.diceDetail);
    expect(detail1.check.grade).toBe("success");

    // Mock rollDie to return 98 (which is failure, not fumble under basic)
    vi.mocked(rollDie).mockReturnValueOnce(98);
    const result2 = await executeCommand(1, 1, ".rc 侦查");
    expect(result2.message.content).not.toContain("大失败！");
    expect(result2.message.content).toContain("失败");
    const detail2 = JSON.parse(result2.message.diceDetail);
    expect(detail2.check.grade).toBe("failure");
  });
});
