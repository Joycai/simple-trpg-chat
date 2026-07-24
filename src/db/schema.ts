/**
 * Simple TRPG Chat — PostgreSQL Schema (Drizzle ORM)
 *
 * Single source of truth for the database (PostgreSQL only). 21 tables:
 *   Identity:   users | invite_codes
 *   Room core:  rooms | room_members | room_skills | room_dm_reads | room_backgrounds
 *   Messaging:  messages
 *   Inventory:  inventory_items | inventory_distributions
 *   Clues:      clue_cards | clue_visibility
 *   Notebook:   notebook_categories | notebook_notes
 *   AI economy: ai_providers | ai_token_usages | ai_point_logs
 *   Platform:   system_config | daily_stats | bot_presets | login_history
 *
 * See docs/arch/database.md for column-level reference.
 */

import { pgTable, text, integer, serial, boolean, timestamp, unique, index, numeric, type AnyPgColumn } from 'drizzle-orm/pg-core';
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

/**
 * Whitelist of rule-id values accepted on `rooms.rule_template`.
 *
 * IMPORTANT: must stay in lockstep with the rule registry in
 * `@/lib/rules/registry.ts`. When adding a new rule (e.g. `dnd5e`),
 * register it in the registry AND append it here so the schema-level
 * validators in `src/app/actions/room.ts` accept it. This list is kept literal
 * (not derived from `listRuleIds()`) so the schema layer stays free of any
 * dependency on the rules subsystem; a drift-guard test in
 * `src/lib/__tests__/rules.test.ts` fails if the two ever diverge.
 */
export const RULE_TEMPLATES = ['basic', 'coc7th', 'dnd5e', 'triangle', 'shouhun'] as const;
export type RuleTemplate = (typeof RULE_TEMPLATES)[number];

export const MESSAGE_TYPES = ['text', 'dice', 'system', 'clue', 'check_request', 'image', 'sticker'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/**
 * Sub-classification of `type='system'` messages, used by the chat UI to pick
 * the right pill style (success / error / room event / scene marker). `null`
 * keeps the legacy neutral pill — most one-off notices (inventory, clue, host
 * tooling) don't need a kind and stay null. Source of truth is the database;
 * UI never sniffs content text to infer a kind.
 *
 * `inventory-dispatch` carries a structured payload in `diceDetail` (action +
 * item + recipient + optional count) so the chat UI can render an icon + chip
 * pill instead of the plain text fallback — see `DispatchPill` in ChatMessage.
 */
export const SYSTEM_KINDS = ['st', 'error', 'room-event', 'scene-marker', 'help', 'inventory-dispatch', 'inventory-receipt', 'timeline-divider', 'event-card', 'event-receipt'] as const;
export type SystemKind = (typeof SYSTEM_KINDS)[number];

export const INVENTORY_ITEM_TYPES = ['clue', 'info', 'character', 'item'] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export const INVENTORY_ACTIONS = ['created', 'shared'] as const;
export type InventoryAction = (typeof INVENTORY_ACTIONS)[number];

/**
 * Publication state of a story event (事件模块). The single source of truth for
 * the host-facing three-state indicator (未公开 / 部分公开 / 完全公开):
 *   unpublished → only the host/creator can see it (no public card yet).
 *   partial     → published to a subset; `story_event_visibility` rows enumerate
 *                 who may read the content. Others see a locked card.
 *   full        → published to everyone; visibility is not enumerated (late
 *                 joiners see it too — gated by room membership).
 * Retracting returns an event to `unpublished` and clears its visibility rows.
 */
export const EVENT_STATUSES = ['unpublished', 'partial', 'full'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const DEVICE_TYPES = ['mobile', 'desktop', 'tablet', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/**
 * Invite-code lifecycle. `active` is the only non-terminal state:
 *   active → used     registration consumed the code
 *   active → expired  48h TTL elapsed (lazy sweep; quota refunded)
 *   active → revoked  creator cancelled it (quota refunded)
 */
export const INVITE_CODE_STATUS = ['active', 'used', 'expired', 'revoked'] as const;
export type InviteCodeStatus = (typeof INVITE_CODE_STATUS)[number];

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
  aiPoints: numeric('ai_points', { precision: 20, scale: 10, mode: 'number' }).notNull().default(0),
  // Remaining invite-code generations (hosts only; see docs/design/invite-registration.md).
  // -1 on generate, +1 on expire/revoke, reset to `invite.defaultQuota` by admin.
  inviteQuota: integer('invite_quota').notNull().default(4),
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
  ruleTemplate: text('rule_template').notNull().default('basic'),
  status: text('status').notNull().default('active'),
  frozen: boolean('frozen').notNull().default(false),
  // Currently active room background (null = background off). `set null` on
  // delete so removing a background can never leave a dangling reference —
  // see docs/design/room-background.md.
  backgroundId: integer('background_id').references((): AnyPgColumn => roomBackgrounds.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

/**
 * Host-uploaded room background images (docs/design/room-background.md).
 * Files live on disk under `cache/room-backgrounds/` (ROOM_BACKGROUND_DIR);
 * rows and files are created/deleted together. Unlike chat images this is
 * NOT a disposable cache — admin cleanup only touches it when explicitly
 * asked (`includeBackgrounds`).
 */
export const roomBackgrounds = pgTable('room_backgrounds', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  // On-disk filename: <roomId>-<ts>-<rand>.webp (always re-encoded WebP).
  filename: text('filename').notNull(),
  // Optional host-given label ("教堂内景") shown in the management grid.
  title: text('title'),
  // Post-compression size — lets admin stats SUM without hitting the disk.
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxRoom: index('idx_room_backgrounds_room').on(t.roomId),
}));

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
  // For type='system' only: a subtype tag so the UI can pick an icon/tint per
  // kind without parsing content. Null = neutral default pill.
  systemKind: text('system_kind').$type<SystemKind>(),
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
  // Type-specific metadata (nullable; populated per item type):
  //   info      → source ('kp'|'player'|'system'), visibility ('all'|'kp')
  //   character → relation ('ally'|'neutral'|'hostile'|'unknown')
  //   item      → category ('weapon'|'tool'|'consumable'|'other'), quantity
  source: text('source'),
  visibility: text('visibility'),
  relation: text('relation'),
  category: text('category'),
  quantity: integer('quantity'),
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

/**
 * Per-user-per-room notebook categories (记事本分类). User-editable: each
 * member manages their own set per room (4 localized defaults are lazily
 * seeded on first open — see getMyNotebookAction). `color` is one of the 7
 * NOTEBOOK_COLORS keys from src/lib/notebook.ts, mapped to theme tokens
 * client-side so labels recolor with the active theme.
 */
export const notebookCategories = pgTable('notebook_categories', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('neutral'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  // Also dedupes concurrent default-seeding (insert ... onConflictDoNothing).
  unq: unique().on(t.roomId, t.userId, t.name),
}));

/**
 * Per-user-per-room private notebook (记事本). Every member keeps their own set
 * of markdown notes inside a room; nobody else (host included) can read them.
 * `categoryId` points at one of the author's own notebook_categories; `set
 * null` on delete drops the note into the "uncategorized" bucket instead of
 * cascading. `content` is markdown; `@Title` tokens link backpack items by
 * title and degrade to plain text when the item disappears — nothing to
 * cascade here.
 */
export const notebookNotes = pgTable('notebook_notes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => notebookCategories.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  // Snapshot of the sender's display name when a note is a shared copy (null =
  // the owner's own note). Frozen at share time — the copy is independent, so
  // it stays attributed even if the sender is renamed or leaves the room.
  sourceName: text('source_name'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_notebook_room_user: index('idx_notebook_room_user').on(t.roomId, t.userId),
}));

export const clueVisibility = pgTable('clue_visibility', {
  id: serial('id').primaryKey(),
  clueId: integer('clue_id').notNull().references(() => clueCards.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  revealedAt: timestamp('revealed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_clue_id: index('idx_clue_vis_clue_id').on(t.clueId),
  idx_user_id: index('idx_clue_vis_user_id').on(t.userId),
}));

/**
 * Story events (事件模块) — host-authored narrative beats published to players
 * in stages. See docs/design/event-module.md.
 *
 * `description` is markdown with `@Title` mentions that resolve against the
 * *viewer's* backpack at render time (same mechanism as the notebook — stored
 * as plain titles, degrade to plain text). `timePayload` reuses the timeline
 * divider's TimelineDividerData JSON (optional). `imagesJson` is a JSON array
 * of 0–3 image URLs (first is the cover). `status` is the three-state source of
 * truth (EVENT_STATUSES); `sortOrder` drives host-controlled ordering.
 *
 * The event body never travels in the public-channel card broadcast — clients
 * fetch it through an access-gated action, so a locked card leaks nothing.
 */
export const storyEvents = pgTable('story_events', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  timePayload: text('time_payload'),
  imagesJson: text('images_json').notNull().default('[]'),
  status: text('status').$type<EventStatus>().notNull().default('unpublished'),
  sortOrder: integer('sort_order').notNull().default(0),
  // The public-channel announcement message (systemKind 'event-card') minted at
  // first publish, so promote/retract can update that same card in place rather
  // than posting a new one. Null until first published; set null if the message
  // is later deleted.
  cardMessageId: integer('card_message_id').references(() => messages.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idx_story_events_room: index('idx_story_events_room').on(t.roomId),
}));

/**
 * Who may read a `partial`-status event's content. One row per authorized
 * player (`full` events are NOT enumerated — membership gates them). `viewed`
 * drives the player's unread badge; `updated` re-flags an already-viewed row
 * when the host edits the event after publishing.
 */
export const storyEventVisibility = pgTable('story_event_visibility', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => storyEvents.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  viewed: boolean('viewed').notNull().default(false),
  updated: boolean('updated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  unq: unique().on(t.eventId, t.userId),
  idx_story_event_vis_user: index('idx_story_event_vis_user').on(t.userId),
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
  backgrounds: many(roomBackgrounds, { relationName: 'roomBackgrounds' }),
  activeBackground: one(roomBackgrounds, { fields: [rooms.backgroundId], references: [roomBackgrounds.id], relationName: 'activeRoomBackground' }),
}));

export const roomBackgroundsRelations = relations(roomBackgrounds, ({ one }) => ({
  room: one(rooms, { fields: [roomBackgrounds.roomId], references: [rooms.id], relationName: 'roomBackgrounds' }),
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

export const notebookCategoriesRelations = relations(notebookCategories, ({ one, many }) => ({
  room: one(rooms, { fields: [notebookCategories.roomId], references: [rooms.id] }),
  user: one(users, { fields: [notebookCategories.userId], references: [users.id] }),
  notes: many(notebookNotes),
}));

export const notebookNotesRelations = relations(notebookNotes, ({ one }) => ({
  room: one(rooms, { fields: [notebookNotes.roomId], references: [rooms.id] }),
  user: one(users, { fields: [notebookNotes.userId], references: [users.id] }),
  category: one(notebookCategories, { fields: [notebookNotes.categoryId], references: [notebookCategories.id] }),
}));

export const clueVisibilityRelations = relations(clueVisibility, ({ one }) => ({
  clue: one(clueCards, { fields: [clueVisibility.clueId], references: [clueCards.id] }),
  user: one(users, { fields: [clueVisibility.userId], references: [users.id] }),
}));

export const storyEventsRelations = relations(storyEvents, ({ one, many }) => ({
  room: one(rooms, { fields: [storyEvents.roomId], references: [rooms.id] }),
  creator: one(users, { fields: [storyEvents.creatorId], references: [users.id] }),
  visibility: many(storyEventVisibility),
}));

export const storyEventVisibilityRelations = relations(storyEventVisibility, ({ one }) => ({
  event: one(storyEvents, { fields: [storyEventVisibility.eventId], references: [storyEvents.id] }),
  user: one(users, { fields: [storyEventVisibility.userId], references: [users.id] }),
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
  vendor: text('vendor').notNull().default('openai-compatible'),  // ids from src/lib/provider-presets.ts AI_VENDORS
  model: text('model').notNull().default('gpt-4o'),
  isShared: boolean('is_shared').notNull().default(false),
  tokenRateInput: numeric('token_rate_input', { precision: 20, scale: 10, mode: 'number' }).notNull().default(0),
  tokenRateCached: numeric('token_rate_cached', { precision: 20, scale: 10, mode: 'number' }).notNull().default(0),
  tokenRateOutput: numeric('token_rate_output', { precision: 20, scale: 10, mode: 'number' }).notNull().default(0),
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
  amount: numeric('amount', { precision: 20, scale: 10, mode: 'number' }).notNull(),
  beforePoints: numeric('before_points', { precision: 20, scale: 10, mode: 'number' }).notNull(),
  afterPoints: numeric('after_points', { precision: 20, scale: 10, mode: 'number' }).notNull(),
  type: text('type').notNull(), // 'usage' | 'admin'
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => ({
  idxUserIdCreatedAt: index('idx_ai_point_logs_user_created').on(t.userId, t.createdAt),
}));

export const aiPointLogsRelations = relations(aiPointLogs, ({ one }) => ({
  user: one(users, { fields: [aiPointLogs.userId], references: [users.id] }),
}));

// ============================================================
// Invite Codes (invite-only registration)
// ============================================================

export const inviteCodes = pgTable('invite_codes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: text('code').notNull().unique(),
  creatorId: integer('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').$type<InviteCodeStatus>().notNull().default('active'),
  usedByUserId: integer('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  // createdAt + 48h, computed at insert time — the lazy sweep compares against NOW().
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
}, (t) => ({
  idxCreatorStatus: index('idx_invite_codes_creator_status').on(t.creatorId, t.status),
}));

export const inviteCodesRelations = relations(inviteCodes, ({ one }) => ({
  creator: one(users, { fields: [inviteCodes.creatorId], references: [users.id], relationName: 'createdInvites' }),
  usedBy: one(users, { fields: [inviteCodes.usedByUserId], references: [users.id], relationName: 'usedInvite' }),
}));
