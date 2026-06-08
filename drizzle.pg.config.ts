import { defineConfig } from 'drizzle-kit';

/**
 * PostgreSQL drizzle-kit configuration.
 *
 * Uses DATABASE_URL environment variable for the connection string.
 * Usage: DATABASE_URL="postgres://..." pnpm db:push:pg
 */
export default defineConfig({
  schema: './src/db/schema.pg.ts',
  out: './drizzle-pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
