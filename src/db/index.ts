import { sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema';

function readDbConfig(): { url: string } {
  // Resolve the connection URL the same way drizzle.config.ts does, so the app
  // and drizzle-kit (db:push/studio) always target the same database:
  // DATABASE_URL wins, then fall back to db.config.json.
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL };
  }
  const configPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('[DB] DATABASE_URL not set and db.config.json not found. Run setup.sh (Linux/macOS) or setup.bat (Windows) to configure PostgreSQL.');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.url) {
    throw new Error('[DB] PostgreSQL URL not configured. Run setup.sh (Linux/macOS) or setup.bat (Windows).');
  }
  return { url: config.url };
}

const config = readDbConfig();

declare global {
  var __dbClient: ReturnType<typeof postgres> | undefined;
}

const client = globalThis.__dbClient || postgres(config.url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__dbClient = client;
}

export const db = pgDrizzle(client, { schema: pgSchema });
// Surfaced in the admin dashboard (dbType). PostgreSQL is the only dialect.
export const currentDialect = 'postgresql' as const;

console.log('[DB] Initialized PostgreSQL');

export function sqlNow() {
  return sql`NOW()`;
}
