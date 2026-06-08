import { sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

import { drizzle as sqliteDrizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as sqliteSchema from './schema';

import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema.pg';

interface DbConfig {
  type: 'sqlite' | 'postgresql';
  url?: string;
}

function readDbConfig(): DbConfig {
  const configPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(configPath)) {
    return { type: 'sqlite' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as DbConfig;
    if (!config.type || !['sqlite', 'postgresql'].includes(config.type)) {
      return { type: 'sqlite' };
    }
    if (config.type === 'postgresql' && !config.url) {
      return { type: 'sqlite' };
    }
    return config;
  } catch (e: any) {
    return { type: 'sqlite' };
  }
}

export let db: import('drizzle-orm/better-sqlite3').BetterSQLite3Database<typeof sqliteSchema>;
export let currentDialect: 'sqlite' | 'postgresql' = 'sqlite';

const config = readDbConfig();

if (config.type === 'postgresql' && config.url) {
  try {
    const client = postgres(config.url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    currentDialect = 'postgresql';
    // @ts-ignore
    db = pgDrizzle(client, { schema: pgSchema });
    console.log('[DB] Synchronously initialized PostgreSQL');
  } catch (e: any) {
    console.error(`[DB] Failed to connect to PostgreSQL: ${e.message}. Using default SQLite.`);
    currentDialect = 'sqlite'; // fallback
  }
} 

if (currentDialect === 'sqlite') {
  const sqlite = new Database(path.join(process.cwd(), 'sqlite.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('wal_autocheckpoint = 1000');
  // @ts-ignore
  db = sqliteDrizzle(sqlite, { schema: sqliteSchema });
  console.log('[DB] Synchronously initialized SQLite');
}

export function sqlNow() {
  return currentDialect === 'postgresql' ? sql`NOW()` : sql`CURRENT_TIMESTAMP`;
}

export function sqlBool(val: boolean) {
  return currentDialect === 'postgresql' ? val : (val ? 1 : 0);
}
