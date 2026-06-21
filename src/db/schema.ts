/**
 * Simple TRPG Chat — PostgreSQL Schema (Drizzle ORM)
 *
 * Single source of truth for the database (PostgreSQL only). 17 tables:
 *   Identity:   users
 *   Room core:  rooms | room_members | room_skills | room_dm_reads
 *   Messaging:  messages
 *   Inventory:  inventory_items | inventory_distributions
 *   Clues:      clue_cards | clue_visibility
 *   AI economy: ai_providers | ai_token_usages | ai_point_logs
 *   Platform:   system_config | daily_stats | bot_presets | login_history
 *
 * See docs/arch/database.md for column-level reference.
 */

import { pgTable, text, integer, serial, boolean, timestamp, unique, index, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { Audience } from '@/lib/messaging/audience';

// ============================================================
// Enums (shared with schema.ts)
// ============================================================

export const USER_ROLES = ['admin', 'host', 'player'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROOM_STATUS = ['active', 'closed'] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

export const THEMES = ['default', 'parchment', 'cthulhu', 'shrine', 'rainglass', 'aether'] as const;
export type Theme = (typeof THEMES)[number];

// Color mode (orthogonal to theme). Canonical definition lives in the
// client-safe theme registry (src/themes/types.ts) so UI components can import
// it without pulling in db/server code; re-exported here to co-locate with the
// theme_mode columns and the THEMES/Theme enum used for room validation.
export { THEME_MODES, type ThemeMode } from '@/themes/types';

export const DICE_RULES = ['basic', 'coc7th'] as const;
export type DiceRules = (typeof DICE_RULES)[number];

export const RULE_TEMPLATES = ['basic', 'coc7th'] as const;
export type RuleTemplate = (typeof RULE_TEMPLATES)[number];

export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue', 'check_request', 'image'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const INVENTORY_ITEM_TYPES = ['clue', 'info', 'character', 'item'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export const INVENTORY_ACTIONS = ['created', 'shared'] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

export const DEVICE_TYPES = ['mobile', 'desktop', 'tablet', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

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
  themePreference: text('theme_preference'),
  themeModePreference: text('theme_mode_preference'),
  sessionToken: text('session_token'),
  isBanned: boolean('is_banned').notNull().default(false),
  aiPoints: doublePrecision('ai_points').notNull().default(0.0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  hostId: integer('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  secretKey: text('secret_key').notNull(),
  theme: text('theme').notNull().default('default'),
  themeMode: text('theme_mode').notNull().default('auto'),
  diceRules: text('dice_rules').notNull().default('basic'),
  ruleTemplate: text('rule_template').notNull().default('basic'),
  status: text('status').notNull().default('active'),
  frozen: boolean('frozen').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const roomMembers = pgTable('room_members', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  characterData: text('character_data'),
  avatarColor: text('avatar_color'),
  avatar: text('avatar'),
}, (t) => ({
  // A user has exactly one membership per room. The unique index also serves the
  // hot (roomId)-prefixed lookups (player list, membership checks). Existing rows
  // must be deduped before `db:push` adds this — see src/db/dedup-room-members.ts.
  unq: unique().on(t.roomId, t.userId),
}));

export const roomSkills = pgTable('room_skills', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  skillValue: integer('skill_value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.skillName),
}));

export const roomDmReads = pgTable('room_dm_reads', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  partnerUserId: integer('partner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.roomId, t.userId, t.partnerUserId),
}));

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // The directed user / DM partner for visibility (`canSee`): dm, directed, recipient.
  targetUserId: integer('target_user_id'),
  nickname: text('nickname').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull().default('text'),
  diceDetail: text('dice_detail'),
  // Single source of truth for visibility — see src/lib/messaging/audience.ts.
  audience: text('audience').$type<Audience>().notNull().default('everyone'),
  // WHERE the message renders (orthogonal to WHO sees it): null = public feed;
  // otherwise the DM partner defining the channel (with `userId`). Lets a hidden
  // roll / psychology notify issued in a DM stay in that DM. See `channelOf`.
  channelUserId: integer('channel_user_id'),
  // Legacy mirror of `audience !== 'everyone'`, kept for backward compatibility.
  // Written by the message router; no visibility logic reads it anymore.
  isPrivate: boolean('is_private').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_messages_room_id_id: index('idx_messages_room_id_id').on(t.roomId, t.id),
  idx_messages_user_id: index('idx_messages_user_id').on(t.userId),
  idx_messages_target_user_id: index('idx_messages_target_user_id').on(t.targetUserId),
}));

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});


export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('item_type').notNull(),
  title: text('title').notNull(),
  contentJson: text('content_json').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const inventoryDistributions = pgTable('inventory_distributions', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  fromUserId: integer('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: integer('to_user_id').references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull().default('created'),
  viewed: boolean('viewed').notNull().default(false),
  // Set true when the host edits the item after the recipient has already viewed it,
  // so the backpack can flag the held copy as "updated" (vs a freshly-received "new").
  updated: boolean('updated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_to_user_room: index('idx_dist_to_user_room').on(t.toUserId, t.roomId),
  idx_item_id: index('idx_dist_item_id').on(t.itemId),
}));

export const clueCards = pgTable('clue_cards', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const clueVisibility = pgTable('clue_visibility', {
  id: serial('id').primaryKey(),
  clueId: integer('clue_id').notNull().references(() => clueCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  revealedAt: timestamp('revealed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_clue_id: index('idx_clue_vis_clue_id').on(t.clueId),
  idx_user_id: index('idx_clue_vis_user_id').on(t.userId),
}));

// ============================================================
// Relations
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  rooms: many(rooms, { relationName: 'hostRooms' }),
  roomMemberships: many(roomMembers),
  messages: many(messages),
  skills: many(roomSkills),
  sentDistributions: many(inventoryDistributions, { relationName: 'sender' }),
  receivedDistributions: many(inventoryDistributions, { relationName: 'recipient' }),
  aiPointLogs: many(aiPointLogs),
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
// Login History (#114)
// ============================================================

export const loginHistory = pgTable('login_history', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent'),
  deviceType: text('device_type').notNull().default('unknown'),
  loginAt: timestamp('login_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxUserLogin: index('idx_login_history_user').on(t.userId, t.loginAt),
}));

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, { fields: [loginHistory.userId], references: [users.id] }),
}));

// ============================================================
// AI Providers (#118)
// ============================================================

export const aiProviders = pgTable('ai_providers', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  apiEndpoint: text('api_endpoint').notNull().default('https://api.openai.com/v1'),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  apiKeyHint: text('api_key_hint'),  // last 4 chars of plaintext key, for UI masking without decrypt
  model: text('model').notNull().default('gpt-4o'),
  isShared: boolean('is_shared').notNull().default(false),
  tokenRateInput: doublePrecision('token_rate_input').notNull().default(0.0),
  tokenRateCached: doublePrecision('token_rate_cached').notNull().default(0.0),
  tokenRateOutput: doublePrecision('token_rate_output').notNull().default(0.0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const aiProvidersRelations = relations(aiProviders, ({ one }) => ({
  owner: one(users, { fields: [aiProviders.ownerId], references: [users.id] }),
}));

// ============================================================
// AI Token Usages
// ============================================================

export const aiTokenUsages = pgTable('ai_token_usages', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: integer('provider_id').notNull().references(() => aiProviders.id, { onDelete: 'cascade' }),
  day: text('day').notNull(), // YYYY-MM-DD
  inputTokens: integer('input_tokens').notNull().default(0),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.day, t.userId, t.providerId),
}));

export const aiTokenUsagesRelations = relations(aiTokenUsages, ({ one }) => ({
  user: one(users, { fields: [aiTokenUsages.userId], references: [users.id] }),
  provider: one(aiProviders, { fields: [aiTokenUsages.providerId], references: [aiProviders.id] }),
}));

export const dailyStats = pgTable('daily_stats', {
  date: text('date').primaryKey(),
  visitCount: integer('visit_count').notNull().default(0),
  peakOnline: integer('peak_online').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ============================================================
// Bot Presets (#Goal)
// ============================================================

export const botPresets = pgTable('bot_presets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  defaultNickname: text('default_nickname').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  allowEditPrompt: boolean('allow_edit_prompt').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

// ============================================================
// AI Point Change History/Logs
// ============================================================

export const aiPointLogs = pgTable('ai_point_logs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  beforePoints: doublePrecision('before_points').notNull(),
  afterPoints: doublePrecision('after_points').notNull(),
  type: text('type').notNull(), // 'usage' | 'admin'
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxUserIdCreatedAt: index('idx_ai_point_logs_user_created').on(t.userId, t.createdAt),
}));

export const aiPointLogsRelations = relations(aiPointLogs, ({ one }) => ({
  user: one(users, { fields: [aiPointLogs.userId], references: [users.id] }),
}));

