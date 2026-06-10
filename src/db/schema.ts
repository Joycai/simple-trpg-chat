/**
 * Simple TRPG Chat — Database Schema (Drizzle ORM)
 *
 * Tables: users | rooms | room_members | messages | room_skills | system_config | host_ai_config
 *         | inventory_items | inventory_distributions | clue_cards | clue_visibility
 */

import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core';
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

/** Rule templates for character sheet initialization */
export const RULE_TEMPLATES = ['basic', 'coc7th'] as const;
export type RuleTemplate = (typeof RULE_TEMPLATES)[number];

export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue', 'check_request'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Inventory item types */
export const INVENTORY_ITEM_TYPES = ['info', 'character', 'item'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

/** Inventory distribution actions */
export const INVENTORY_ACTIONS = ['created', 'shared'] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

// ============================================================
// Tables
// ============================================================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('player'),
  displayName: text('display_name').notNull(),
  isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
  botConfigJson: text('bot_config_json'), // SysPrompt, Model, Activation, Summary
  themePreference: text('theme_preference'), // nullable: null = use site default
  sessionToken: text('session_token'), // Single-session: updated on login, verified in JWT
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
  ruleTemplate: text('rule_template', { enum: RULE_TEMPLATES }).notNull().default('basic'),
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

/**
 * room_dm_reads
 * 
 * Stores last read timestamp for each DM conversation (per partner) in a room.
 */
export const roomDmReads = sqliteTable('room_dm_reads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  partnerUserId: integer('partner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: text('last_read_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.partnerUserId),
}));

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: integer('target_user_id'), // V3.14: Support for private distribution/share notifications
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

/**
 * inventory_items
 * 
 * Templates created by Host/GM.
 */
export const inventoryItems = sqliteTable('inventory_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id),
  type: text('item_type', { enum: INVENTORY_ITEM_TYPES }).notNull(),
  title: text('title').notNull(),
  contentJson: text('content_json').notNull(), // Type-specific content
  imageUrl: text('image_url'), // Reserved extension point
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * inventory_distributions
 * 
 * Tracks which player has which item.
 * Supports "KP -> Player" and "Player -> Player" flow.
 */
export const inventoryDistributions = sqliteTable('inventory_distributions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  fromUserId: integer('from_user_id').notNull().references(() => users.id),
  toUserId: integer('to_user_id').notNull().references(() => users.id),
  action: text('action', { enum: INVENTORY_ACTIONS }).notNull().default('created'),
  viewed: integer('viewed', { mode: 'boolean' }).notNull().default(false), // unread badge, nullable for migration safety
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  idx_to_user_room: index('idx_dist_to_user_room').on(t.toUserId, t.roomId),
  idx_item_id: index('idx_dist_item_id').on(t.itemId),
}));

/**
 * clue_cards
 *
 * Host-created clue templates. A clue card holds title, content, and an optional
 * image URL. Visibility is controlled via the clue_visibility table.
 */
export const clueCards = sqliteTable('clue_cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * clue_visibility
 *
 * Controls which players can see which clues.
 * - userId = NULL → visible to ALL players (public clue)
 * - userId = <id>  → visible only to that specific player
 */
export const clueVisibility = sqliteTable('clue_visibility', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clueId: integer('clue_id').notNull().references(() => clueCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id'), // NULL = public/visible to all
  revealedAt: text('revealed_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  idx_clue_id: index('idx_clue_vis_clue_id').on(t.clueId),
  idx_user_id: index('idx_clue_vis_user_id').on(t.userId),
}));

// ============================================================
// Relations
// ============================================================

export const usersRelations = relations(users, ({ many, one }) => ({
  rooms: many(rooms, { relationName: 'hostRooms' }),
  roomMemberships: many(roomMembers),
  messages: many(messages),
  skills: many(roomSkills),
  aiConfig: one(hostAiConfig),
  sentDistributions: many(inventoryDistributions, { relationName: 'sender' }),
  receivedDistributions: many(inventoryDistributions, { relationName: 'recipient' }),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  host: one(users, { fields: [rooms.hostId], references: [users.id], relationName: 'hostRooms' }),
  members: many(roomMembers),
  messages: many(messages),
  skills: many(roomSkills),
  inventoryItems: many(inventoryItems),
  distributions: many(inventoryDistributions),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(rooms, { fields: [roomMembers.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomMembers.userId], references: [users.id] }),
}));

export const roomSkillsRelations = relations(roomSkills, ({ one }) => ({
  room: one(rooms, { fields: [roomSkills.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomSkills.userId], references: [users.id] }),
}));

export const roomDmReadsRelations = relations(roomDmReads, ({ one }) => ({
  room: one(rooms, { fields: [roomDmReads.roomId], references: [rooms.id] }),
  user: one(users, { fields: [roomDmReads.userId], references: [users.id] }),
  partner: one(users, { fields: [roomDmReads.partnerUserId], references: [users.id] }),
}));

export const hostAiConfigRelations = relations(hostAiConfig, ({ one }) => ({
  user: one(users, { fields: [hostAiConfig.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, { fields: [messages.roomId], references: [rooms.id] }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  room: one(rooms, { fields: [inventoryItems.roomId], references: [rooms.id] }),
  creator: one(users, { fields: [inventoryItems.creatorId], references: [users.id] }),
  distributions: many(inventoryDistributions),
}));

export const inventoryDistributionsRelations = relations(inventoryDistributions, ({ one }) => ({
  room: one(rooms, { fields: [inventoryDistributions.roomId], references: [rooms.id] }),
  item: one(inventoryItems, { fields: [inventoryDistributions.itemId], references: [inventoryItems.id] }),
  sender: one(users, { fields: [inventoryDistributions.fromUserId], references: [users.id], relationName: 'sender' }),
  recipient: one(users, { fields: [inventoryDistributions.toUserId], references: [users.id], relationName: 'recipient' }),
}));

export const clueCardsRelations = relations(clueCards, ({ one, many }) => ({
  room: one(rooms, { fields: [clueCards.roomId], references: [rooms.id] }),
  creator: one(users, { fields: [clueCards.creatorId], references: [users.id] }),
  visibility: many(clueVisibility),
}));

export const clueVisibilityRelations = relations(clueVisibility, ({ one }) => ({
  clue: one(clueCards, { fields: [clueVisibility.clueId], references: [clueCards.id] }),
  user: one(users, { fields: [clueVisibility.userId], references: [users.id] }),
}));

// ============================================================
// Login History
// ============================================================

export const DEVICE_TYPES = ['mobile', 'desktop', 'tablet', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const loginHistory = sqliteTable('login_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent'),
  deviceType: text('device_type', { enum: DEVICE_TYPES }).notNull().default('unknown'),
  loginAt: text('login_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ({
  idxUserLogin: index('idx_login_history_user').on(t.userId, t.loginAt),
}));

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, { fields: [loginHistory.userId], references: [users.id] }),
}));
