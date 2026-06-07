"use server";

import { db, testPgConnection } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

/** Read DB configuration from system_config */
export async function getDbConfigAction() {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Admin only");
  }

  const rows = db.select().from(systemConfig).all();
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }

  return {
    dbType: config.db_type || "sqlite",
    pgUrl: config.db_pg_url || "",
  };
}

/** Save DB configuration to system_config (upsert) */
export async function saveDbConfigAction(dbType: string, pgUrl: string) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Admin only");
  }

  // Upsert db_type
  const existingType = db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, "db_type"))
    .get();

  if (existingType) {
    db.update(systemConfig)
      .set({ value: dbType, updatedAt: new Date().toISOString() })
      .where(eq(systemConfig.key, "db_type"))
      .run();
  } else {
    db.insert(systemConfig)
      .values({ key: "db_type", value: dbType })
      .run();
  }

  // Upsert db_pg_url
  const existingUrl = db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, "db_pg_url"))
    .get();

  if (existingUrl) {
    db.update(systemConfig)
      .set({ value: pgUrl, updatedAt: new Date().toISOString() })
      .where(eq(systemConfig.key, "db_pg_url"))
      .run();
  } else {
    db.insert(systemConfig)
      .values({ key: "db_pg_url", value: pgUrl })
      .run();
  }

  return { success: true };
}

/** Test PostgreSQL connection (does not save) */
export async function testDbConnectionAction(connectionString: string) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Admin only");
  }

  return await testPgConnection(connectionString);
}
