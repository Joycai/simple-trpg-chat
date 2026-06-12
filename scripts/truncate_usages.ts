import { db } from "../src/db";
import { aiTokenUsages } from "../src/db/schema";

async function main() {
  console.log("Truncating aiTokenUsages...");
  await db.delete(aiTokenUsages);
  console.log("Truncated successfully.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
