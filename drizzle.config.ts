import * as path from 'path';
import * as fs from 'fs';

import { defineConfig } from 'drizzle-kit';

// Resolve the connection URL the same way the runtime client does (src/db/index.ts):
// DATABASE_URL takes highest priority, then fall back to db.config.json so that
// drizzle-kit commands (e.g. `pnpm db:push`) use the same connection as the app.
function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const configPath = path.join(process.cwd(), 'db.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.url) {
        return config.url;
      }
    } catch {
      // Fall through to the default below if db.config.json is malformed.
    }
  }

  return 'postgres://localhost:5432/simple_trpg_chat';
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: resolveDbUrl(),
  },
});
