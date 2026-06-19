// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require('postgres');
const sql = postgres("postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat");

async function main() {
  console.log("Truncating tables...");
  await sql`TRUNCATE TABLE ai_token_usages CASCADE;`;
  console.log("Truncated successfully.");
  await sql.end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
