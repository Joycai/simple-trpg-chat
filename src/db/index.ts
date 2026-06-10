import { sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema';

function hasDbConfig(): boolean {
  const configPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(configPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return !!(config.url);
  } catch { return false; }
}

// Noop DB for CI/build environments without PostgreSQL
function createNoopDb() {
  return new Proxy({} as any, {
    get(_, prop) {
      return new Proxy(() => ({}), {
        get(_, subProp) {
          return new Proxy(() => [], {
            get: () => () => [],
          });
        },
        apply: () => [],
      });
    },
  });
}

let _db: any;
export const db = hasDbConfig()
  ? (() => {
      const configPath = path.join(process.cwd(), 'db.config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const client = postgres(config.url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
      console.log('[DB] Initialized PostgreSQL');
      return pgDrizzle(client, { schema: pgSchema });
    })()
  : (() => {
      console.log('[DB] No db.config.json — using noop DB for build/CI');
      return createNoopDb();
    })();

export const currentDialect: 'postgresql' = 'postgresql';

export function sqlNow() {
  return sql`NOW()`;
}

export function sqlBool(val: boolean) {
  return val;
}
