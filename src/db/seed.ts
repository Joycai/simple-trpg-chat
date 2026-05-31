import { db } from "./index";
import { users } from "./schema";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("admin123", 10);

  await db.insert(users).values({
    username: "admin",
    passwordHash,
    role: "admin",
    displayName: "Administrator",
  }).onConflictDoNothing();

  console.log("Admin user created (username: admin, password: admin123)");
}

seed().catch(console.error);
