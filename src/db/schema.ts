/**
 * Simple TRPG Chat — Dynamic Schema
 *
 * Automatically selects SQLite or PostgreSQL schema based on db.config.json.
 * All server actions import from "@/db/schema" — this module resolves to the correct one.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

function isPostgres(): boolean {
  try {
    const configPath = path.join(process.cwd(), 'db.config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config.type === 'postgresql' && !!config.url;
  } catch {
    return false;
  }
}

const _require = createRequire(import.meta.url);
const m = isPostgres() ? _require('./schema.pg') : _require('./schema.sqlite');

export const {
  USER_ROLES, ROOM_STATUS, THEMES, DICE_RULES, RULE_TEMPLATES,
  MESSAGE_TYPES, INVENTORY_ITEM_TYPES, INVENTORY_ACTIONS, DEVICE_TYPES,
  users, rooms, roomMembers, messages, roomSkills, roomDmReads,
  systemConfig, hostAiConfig, aiProviders,
  inventoryItems, inventoryDistributions, clueCards, clueVisibility, loginHistory,
  usersRelations, roomsRelations, roomMembersRelations, messagesRelations,
  roomSkillsRelations, roomDmReadsRelations,
  aiProvidersRelations, inventoryItemsRelations, inventoryDistributionsRelations,
  clueCardsRelations, clueVisibilityRelations, loginHistoryRelations,
  systemConfigRelations,
} = m;

export type {
  UserRole, RoomStatus, Theme, DiceRules, RuleTemplate,
  MessageType, InventoryItemType, InventoryAction,
} from './schema.sqlite';
