import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/db/schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { eq, and } from "drizzle-orm";

// 1. Mock database module
vi.mock("@/db", () => {
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const Database = require("better-sqlite3");

  const sqlite = new Database(":memory:");
  const testDb = drizzle(sqlite);

  // Add mock relational query support for sendMessageAction
  const queryMock = {
    roomMembers: {
      findMany: () => Promise.resolve([]),
    },
  };

  const proxiedDb = new Proxy(testDb, {
    get(target, prop) {
      if (prop === "query") return queryMock;
      return target[prop];
    },
  });

  return {
    db: proxiedDb,
    currentDialect: "sqlite",
    sqlNow: () => {
      const { sql } = require("drizzle-orm");
      return sql`(datetime('now'))`;
    },
    sqlBool: (val: boolean) => (val ? 1 : 0),
  };
});

// 2. Mock authentication session
let mockSession: any = {
  user: {
    id: "1",
    name: "Host User",
    role: "host",
  },
};

vi.mock("@/auth", () => {
  return {
    auth: vi.fn(() => Promise.resolve(mockSession)),
  };
});

// 3. Mock events and next/cache
vi.mock("@/lib/events", () => ({
  broadcastToRoom: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import the actions under test after mocks
import {
  createRoomAction,
  joinRoomAction,
  sendMessageAction,
  rollDiceAction,
  requestSkillCheckAction,
  updateNicknameAction,
  updateCharacterDataAction,
} from "../room";
import { db } from "@/db";

describe("Room Server Actions Integration", () => {
  beforeAll(() => {
    // Run migrations on the in-memory database
    migrate(db, {
      migrationsFolder: path.resolve(__dirname, "../../../../drizzle"),
    });
  });

  beforeEach(async () => {
    // Clean up database tables before each test
    await db.delete(schema.messages);
    await db.delete(schema.roomSkills);
    await db.delete(schema.roomMembers);
    await db.delete(schema.rooms);
    await db.delete(schema.users);

    // Default session: Host User
    mockSession = {
      user: {
        id: "1",
        name: "Host User",
        role: "host",
      },
    };

    // Insert host and player users
    await db.insert(schema.users).values({
      id: 1,
      username: "hostuser",
      passwordHash: "hash",
      displayName: "Host User",
      role: "host",
    });

    await db.insert(schema.users).values({
      id: 2,
      username: "playeruser",
      passwordHash: "hash",
      displayName: "Player User",
      role: "player",
    });
  });

  describe("createRoomAction", () => {
    it("should allow host to create a room successfully", async () => {
      const formData = new FormData();
      formData.append("name", "Fantastic TRPG Room");
      formData.append("key", "test-key");
      formData.append("theme", "cthulhu");
      formData.append("diceRules", "coc7th");
      formData.append("ruleTemplate", "coc7th");

      const result = await createRoomAction(formData);
      expect(result.success).toBe(true);
      expect(result.roomId).toBeDefined();
      expect(result.secretKey).toBe("test-key");

      // Verify room in DB
      const [room] = await db.select().from(schema.rooms).where(eq(schema.rooms.id, result.roomId!));
      expect(room).toBeDefined();
      expect(room.name).toBe("Fantastic TRPG Room");
      expect(room.hostId).toBe(1);
      expect(room.theme).toBe("cthulhu");
      expect(room.diceRules).toBe("coc7th");

      // Verify host joined as member
      const members = await db.select().from(schema.roomMembers).where(eq(schema.roomMembers.roomId, result.roomId!));
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(1);
      expect(members[0].nickname).toBe("Host User");
    });

    it("should prevent non-host from creating a room", async () => {
      // Set session to player
      mockSession = {
        user: {
          id: "2",
          name: "Player User",
          role: "player",
        },
      };

      const formData = new FormData();
      formData.append("name", "Player Room");

      const result = await createRoomAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Only hosts can create rooms");
    });
  });

  describe("joinRoomAction", () => {
    let roomId: number;

    beforeEach(async () => {
      const [newRoom] = await db.insert(schema.rooms).values({
        id: 10,
        name: "Test Room",
        hostId: 1,
        secretKey: "join-secret",
      }).returning();
      roomId = newRoom.id;
    });

    it("should allow player to join with correct credentials", async () => {
      // Set session to player
      mockSession = {
        user: {
          id: "2",
          name: "Player User",
          role: "player",
        },
      };

      const formData = new FormData();
      formData.append("roomId", roomId.toString());
      formData.append("key", "join-secret");

      const result = await joinRoomAction(formData);
      expect(result.success).toBe(true);

      // Verify player joined as member
      const member = await db.select().from(schema.roomMembers).where(
        and(
          eq(schema.roomMembers.roomId, roomId),
          eq(schema.roomMembers.userId, 2)
        )
      );
      expect(member).toHaveLength(1);
      expect(member[0].nickname).toBe("Player User");
    });

    it("should fail to join with invalid room ID or secret key", async () => {
      mockSession = {
        user: {
          id: "2",
          name: "Player User",
          role: "player",
        },
      };

      // Invalid secret key
      const formData = new FormData();
      formData.append("roomId", roomId.toString());
      formData.append("key", "wrong-secret");

      const result = await joinRoomAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid key");
    });
  });

  describe("sendMessageAction & rollDiceAction", () => {
    let roomId: number;

    beforeEach(async () => {
      const [newRoom] = await db.insert(schema.rooms).values({
        id: 20,
        name: "Message Room",
        hostId: 1,
        secretKey: "secret",
      }).returning();
      roomId = newRoom.id;

      // Join host as member
      await db.insert(schema.roomMembers).values({
        roomId,
        userId: 1,
        nickname: "Host Nickname",
      });
    });

    it("should successfully send public text message and save it in database", async () => {
      const msg = await sendMessageAction(roomId, "Hello World", "text");
      expect(msg).toBeDefined();
      expect(msg.content).toBe("Hello World");
      expect(msg.userId).toBe(1);
      expect(msg.nickname).toBe("Host Nickname");

      // Verify message in DB
      const messagesInDb = await db.select().from(schema.messages).where(eq(schema.messages.roomId, roomId));
      expect(messagesInDb).toHaveLength(1);
      expect(messagesInDb[0].content).toBe("Hello World");
    });

    it("should save private (DM) messages with correct targetUserId", async () => {
      const msg = await sendMessageAction(roomId, "Secret to player", "text", undefined, true, 2);
      expect(msg.isPrivate).toBe(true);
      expect(msg.targetUserId).toBe(2);

      // Verify message in DB
      const [dbMsg] = await db.select().from(schema.messages).where(eq(schema.messages.roomId, roomId));
      expect(dbMsg.isPrivate).toBe(true);
      expect(dbMsg.targetUserId).toBe(2);
    });

    it("should intercept dot commands and run executeCommand", async () => {
      // Send command .help
      const msg = await sendMessageAction(roomId, ".help", "text");
      expect(msg).toBeDefined();
      // .help should return system help text
      expect(msg.content).toContain("指令帮助");
      expect(msg.type).toBe("system");
    });
  });

  describe("requestSkillCheckAction", () => {
    let roomId: number;

    beforeEach(async () => {
      const [newRoom] = await db.insert(schema.rooms).values({
        id: 30,
        name: "Check Room",
        hostId: 1,
        secretKey: "secret",
      }).returning();
      roomId = newRoom.id;

      // Join host as member
      await db.insert(schema.roomMembers).values({
        roomId,
        userId: 1,
        nickname: "KP Nick",
      });

      // Join player as member
      await db.insert(schema.roomMembers).values({
        roomId,
        userId: 2,
        nickname: "Investigator Nick",
      });
    });

    it("should allow host to request a skill check on target users", async () => {
      const msg = await requestSkillCheckAction(roomId, [2], "聆听", "d100");
      expect(msg).toBeDefined();
      expect(msg.type).toBe("check_request");
      expect(msg.content).toContain("KP Nick 要求 Investigator Nick 进行【聆听】检定");

      const detail = JSON.parse(msg.diceDetail!);
      expect(detail.checkRequest.skillName).toBe("聆听");
      expect(detail.checkRequest.targetUserIds).toEqual([2]);
    });

    it("should fail if a player (non-host) requests a skill check", async () => {
      // Set session to player
      mockSession = {
        user: {
          id: "2",
          name: "Player User",
          role: "player",
        },
      };

      await expect(requestSkillCheckAction(roomId, [1], "聆听")).rejects.toThrow("Only host can request checks");
    });
  });
});
