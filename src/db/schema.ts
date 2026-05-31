/**
 * Simple TRPG Chat — Database Schema (Drizzle ORM)
 *
 * Tables: users | rooms | room_members | messages | room_skills | system_config | host_ai_config
 */

import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================
// Enums
// ============================================================

export const USER_ROLES = ['admin', 'host', 'player'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROOM_STATUS = ['active', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

export const THEMES = ['default', 'parchment', 'cthulhu', 'shrine'] as const;
export type Theme = (typeof THEMES)[number];

/** Pluggable dice rules */
export const DICE_RULES = ['basic', 'coc7th'] as const;
export type DiceRules = (typeof DICE_RULES)[number];

export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

// ============================================================
// Tables
// ============================================================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('player'),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hostId: integer('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  secretKey: text('secret_key').notNull(),
  theme: text('theme', { enum: THEMES }).notNull().default('default'),
  diceRules: text('dice_rules', { enum: DICE_RULES }).notNull().default('basic'),
  status: text('status', { enum: ROOM_STATUS }).notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const roomMembers = sqliteTable('room_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  joinedAt: text('joined_at').notNull().default(sql`(datetime('now'))`),
  characterData: text('character_data'), // Reserved for complex cards
});

/**
 * room_skills
 * 
 * Stores user skills per room. 
 * Managed via .st command or Skill Panel.
 */
export const roomSkills = sqliteTable('room_skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  skillValue: integer('skill_value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.skillName),
}));

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  content: text('content').notNull(),
  type: text('type', { enum: MESSAGE_TYPES }).notNull().default('text'),
  diceDetail: text('dice_detail'), // JSON
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** Global system configurations */
export const systemConfig = sqliteTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/** Host-specific AI configurations */
export const hostAiConfig = sqliteTable('host_ai_config', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  apiEndpoint: text('api_endpoint').notNull().default('https://api.openai.com/v1'),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  model: text('model').notNull().default('gpt-4o'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ============================================================
// Relations
// ============================================================

export const usersRelations = relations(users, ({ many, one }) => ({
  rooms: many(rooms, { relationName: 'hostRooms' }),
  roomMemberships: many(roomMembers),
  messages: many(messages),
  skills: many(roomSkills),
  aiConfig: one(hostAiConfig),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, { fields: [rooms.hostId], references: [users.id], relationName: 'hostRooms' }),
  members: many(roomMembers),
  messages: many(messages),
  skills: many(roomSkills),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(rooms, { fields: [roomMembers.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomMembers.userId], references: [users.id] }),
}));

export const roomSkillsRelations = relations(roomSkills, ({ one }) => ({
  room: one(rooms, { fields: [roomSkills.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomSkills.userId], references: [users.id] }),
}));

export const hostAiConfigRelations = relations(hostAiConfig, ({ one }) => ({
  user: one(users, { fields: [hostAiConfig.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, { fields: [messages.roomId], references: [rooms.id] }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
}));
