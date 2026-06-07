import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';

// Default SQLite instance (always available, zero-config)
const sqlite = new Database(path.join(process.cwd(), 'sqlite.db'));

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

export let db = drizzle(sqlite, { schema });

/**
 * Initialize the database adapter.
 *
 * By default, uses SQLite with zero configuration.
 * If system_config contains db_type = 'postgresql' with a valid connection
 * string, switches to PostgreSQL dynamically.
 *
 * Call this once at server startup (e.g. in instrumentation.ts or layout.tsx).
 */
export async function initDb(): Promise<void> {
  try {
    // Read db_type from system_config (using SQLite to bootstrap)
    const configRows = db.select({
      key: schema.systemConfig.key,
      value: schema.systemConfig.value,
    }).from(schema.systemConfig).all();

    const configMap = new Map(configRows.map(r => [r.key, r.value]));
    const dbType = configMap.get('db_type');
    const pgUrl = configMap.get('db_pg_url');

    if (dbType === 'postgresql' && pgUrl) {
      const { drizzle: pgDrizzle } = await import('drizzle-orm/postgres-js');
      const postgres = (await import('postgres')).default;

      const client = postgres(pgUrl, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      db = pgDrizzle(client, { schema }) as any;
      console.log('[DB] Switched to PostgreSQL');
    }
  } catch {
    // If anything fails, keep the default SQLite instance
    console.log('[DB] Using default SQLite');
  }
}

/**
 * Test a PostgreSQL connection string.
 * Returns { ok: true } on success, { ok: false, error } on failure.
 */
export async function testPgConnection(connectionString: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const postgres = (await import('postgres')).default;
    const client = postgres(connectionString, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Try a simple query
    await client`SELECT 1`;
    await client.end({ timeout: 3 });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}
