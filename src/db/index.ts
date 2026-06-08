import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Default SQLite instance (always available, zero-config)
const sqlite = new Database(path.join(process.cwd(), 'sqlite.db'));

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export let db = drizzle(sqlite, { schema });

/** Tracks active dialect so sqlNow() returns correct SQL for each DB. */
let currentDialect: 'sqlite' | 'postgresql' = 'sqlite';

export function sqlNow() {
  return currentDialect === 'postgresql' ? sql`NOW()` : sql`(datetime('now'))`;
}

// ================================================================
// Database config file (db.config.json at project root)
// ================================================================

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
      console.warn('[DB] Invalid db.config.json: type must be "sqlite" or "postgresql". Falling back to SQLite.');
      return { type: 'sqlite' };
    }
    if (config.type === 'postgresql' && !config.url) {
      console.warn('[DB] db.config.json: type is "postgresql" but url is missing. Falling back to SQLite.');
      return { type: 'sqlite' };
    }
    return config;
  } catch (e: any) {
    console.warn(`[DB] Failed to parse db.config.json: ${e.message}. Falling back to SQLite.`);
    return { type: 'sqlite' };
  }
}

/**
 * Initialize the database adapter.
 *
 * Reads db.config.json at project root. If type is "postgresql" with a valid
 * url, switches from the default SQLite to PostgreSQL, loading the pg-core
 * schema (schema.pg.ts) dynamically.
 *
 * Call this once at server startup (e.g. in instrumentation.ts).
 */
export async function initDb(): Promise<void> {
  const config = readDbConfig();

  if (config.type === 'postgresql' && config.url) {
    try {
      const { drizzle: pgDrizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;
      const pgSchema = await import('./schema.pg');

      const client = postgres(config.url, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      currentDialect = 'postgresql';
      db = pgDrizzle(client, { schema: pgSchema }) as any;
      console.log('[DB] Switched to PostgreSQL');
    } catch (e: any) {
      console.error(`[DB] Failed to connect to PostgreSQL: ${e.message}. Using default SQLite.`);
    }
  } else {
    console.log('[DB] Using SQLite');
  }
}
