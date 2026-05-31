/**
 * Simple TRPG Chat — Database Schema (Drizzle ORM)
 *
 * Tables: users | rooms | room_members | messages
 *
 * === Extension Points for Future Features ===
 * - 道具栏 / 角色卡: room_members.character_data JSON 字段
 * - 线索卡: messages.type 枚举预留 'clue'; 未来新增 clue_cards + clue_visibility 表
 *
 * @see docs/internal/schema-design.md for design rationale
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================
// Enums (represented as text unions — SQLite has no native enum)
// ============================================================

/** User roles */
export const USER_ROLES = ['admin', 'host', 'player'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Room status */
export const ROOM_STATUS = ['active', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

/** Available themes */
export const THEMES = ['default', 'parchment', 'cthulhu', 'shrine'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Message types.
 * 'clue' is reserved for the future clue-card feature.
 */
export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

// ============================================================
// Tables
// ============================================================

/**
 * users
 *
 * All accounts (Admin / Host / Player) live in one table.
 * Role-based access is enforced at the application layer.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('player'),
  displayName: text('display_name').notNull(), // default name shown in admin list
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * rooms
 *
 * Created by a Host. Players join with a secret_key.
 * A host can have multiple active rooms.
 */
export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hostId: integer('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  secretKey: text('secret_key').notNull(),
  theme: text('theme', { enum: THEMES }).notNull().default('default'),
  status: text('status', { enum: ROOM_STATUS }).notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * room_members
 *
 * Many-to-many: users <-> rooms.
 * nickname is room-scoped (player can have different nicknames per room).
 * character_data JSON is reserved for future character sheet / inventory features.
 */
export const roomMembers = sqliteTable('room_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(), // room-scoped display name
  joinedAt: text('joined_at').notNull().default(sql`(datetime('now'))`),
  /**
   * Reserved JSON field for future features:
   * - 角色卡: HP, attributes, skills
   * - 道具栏: inventory items
   *
   * MVP: NULL (not used). Future: JSON string parsed at app layer.
   */
  characterData: text('character_data'), // JSON, nullable — EXTENSION POINT
});

/**
 * messages
 *
 * Chat messages, dice results, and system notifications.
 * is_private: true = only visible to host + sender (暗骰).
 * dice_detail: JSON string storing full roll breakdown.
 * nickname is a SNAPSHOT taken at send time (changing nickname later
 * won't retroactively rename old messages).
 */
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(), // snapshot at send time
  content: text('content').notNull(),   // message body (text) or dice notation
  type: text('type', { enum: MESSAGE_TYPES }).notNull().default('text'),
  /**
   * Dice roll detail JSON format:
   * { "dice": "d20", "count": 2, "results": [15, 8], "sum": 23, "modifier": 0 }
   * NULL for non-dice messages.
   */
  diceDetail: text('dice_detail'), // JSON, nullable
  /** true = 暗骰 (only visible to host + sender) */
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// Indexes (performance-critical queries)
// ============================================================

// Messages: fetching history for a room ordered by time
// CREATE INDEX idx_messages_room_created ON messages(room_id, created_at);

// Room members: listing members of a room
// CREATE INDEX idx_room_members_room ON room_members(room_id);

// Room members: finding a user's joined rooms
// CREATE INDEX idx_room_members_user ON room_members(user_id);

// ============================================================
// Relations (Drizzle ORM)
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  rooms: many(rooms, { relationName: 'hostRooms' }),
  roomMemberships: many(roomMembers),
  messages: many(messages),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, { fields: [rooms.hostId], references: [users.id], relationName: 'hostRooms' }),
  members: many(roomMembers),
  messages: many(messages),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(rooms, { fields: [roomMembers.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomMembers.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, { fields: [messages.roomId], references: [rooms.id] }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
}));
