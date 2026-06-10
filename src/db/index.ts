import { sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema';

function readDbConfig(): { url: string } {
  const configPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('[DB] db.config.json not found. Run setup.sh to configure PostgreSQL.');
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.url) {
    throw new Error('[DB] PostgreSQL URL not configured. Run setup.sh.');
  }
  return { url: config.url };
}

const config = readDbConfig();

const client = postgres(config.url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = pgDrizzle(client, { schema: pgSchema });
export const currentDialect: 'postgresql' = 'postgresql';

console.log('[DB] Initialized PostgreSQL');

export function sqlNow() {
  return sql`NOW()`;
}

export function sqlBool(val: boolean) {
  return val;
}
