/**
 * Simple TRPG Chat — PostgreSQL Schema (Drizzle ORM)
 *
 * Mirror of schema.ts for PostgreSQL dialect.
 * Tables: users | rooms | room_members | messages | room_skills | system_config
 *         | host_ai_config | inventory_items | inventory_distributions
 *         | clue_cards | clue_visibility
 */

import { pgTable, text, integer, serial, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// Enums (shared with schema.ts)
// ============================================================

export const USER_ROLES = ['admin', 'host', 'player'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROOM_STATUS = ['active', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

export const THEMES = ['default', 'parchment', 'cthulhu', 'shrine'] as const;
export type Theme = (typeof THEMES)[number];

export const DICE_RULES = ['basic', 'coc7th'] as const;
export type DiceRules = (typeof DICE_RULES)[number];

export const RULE_TEMPLATES = ['basic', 'coc7th'] as const;
export type RuleTemplate = (typeof RULE_TEMPLATES)[number];

export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue', 'check_request'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const INVENTORY_ITEM_TYPES = ['info', 'character', 'item'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export const INVENTORY_ACTIONS = ['created', 'shared'] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

// ============================================================
// Tables
// ============================================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('player'),
  displayName: text('display_name').notNull(),
  isBot: boolean('is_bot').notNull().default(false),
  botConfigJson: text('bot_config_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  hostId: integer('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  secretKey: text('secret_key').notNull(),
  theme: text('theme').notNull().default('default'),
  diceRules: text('dice_rules').notNull().default('basic'),
  ruleTemplate: text('rule_template').notNull().default('basic'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roomMembers = pgTable('room_members', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  characterData: text('character_data'),
});

export const roomSkills = pgTable('room_skills', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  skillValue: integer('skill_value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.skillName),
}));

export const roomDmReads = pgTable('room_dm_reads', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  partnerUserId: integer('partner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.partnerUserId),
}));

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: integer('target_user_id'),
  nickname: text('nickname').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull().default('text'),
  diceDetail: text('dice_detail'),
  isPrivate: boolean('is_private').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hostAiConfig = pgTable('host_ai_config', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  apiEndpoint: text('api_endpoint').notNull().default('https://api.openai.com/v1'),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  model: text('model').notNull().default('gpt-4o'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id),
  type: text('item_type').notNull(),
  title: text('title').notNull(),
  contentJson: text('content_json').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryDistributions = pgTable('inventory_distributions', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  fromUserId: integer('from_user_id').notNull().references(() => users.id),
  toUserId: integer('to_user_id').notNull().references(() => users.id),
  action: text('action').notNull().default('created'),
  viewed: boolean('viewed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idx_to_user_room: index('idx_dist_to_user_room').on(t.toUserId, t.roomId),
  idx_item_id: index('idx_dist_item_id').on(t.itemId),
}));

export const clueCards = pgTable('clue_cards', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clueVisibility = pgTable('clue_visibility', {
  id: serial('id').primaryKey(),
  clueId: integer('clue_id').notNull().references(() => clueCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id'),
  revealedAt: timestamp('revealed_at', { withTimezone: true }).notNull().defaultNow(),
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
