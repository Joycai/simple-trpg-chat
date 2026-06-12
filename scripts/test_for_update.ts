import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, 1)).limit(1).for("update");
    console.log("Locked user:", user?.id);
  });
  console.log("Done");
  process.exit(0);
}

main();
