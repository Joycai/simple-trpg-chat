import { sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema';

function readDbConfig(): { url: string } {
  const configPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('[DB] db.config.json not found. Run setup.sh (Linux/macOS) or setup.bat (Windows) to configure PostgreSQL.');
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
export const currentDialect: 'postgresql' = 'postgresql';

console.log('[DB] Initialized PostgreSQL');

export function sqlNow() {
  return sql`NOW()`;
}

export function sqlBool(val: boolean) {
  return val;
}
