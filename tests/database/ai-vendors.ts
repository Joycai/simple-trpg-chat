/** Migration check in a disposable local schema, never against production rows. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
async function main() {
  const url = process.env.DATABASE_URL || JSON.parse(readFileSync('db.config.json', 'utf8')).url;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local database required');
  const schema = `test_ai_vendors_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = postgres(url, { max: 1 });
  const client = postgres(url, { max: 1, connection: { search_path: schema } });
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    await client`CREATE TABLE users (id integer PRIMARY KEY)`;
    await client`INSERT INTO users VALUES (1)`;
    await client`CREATE TABLE ai_providers (id integer PRIMARY KEY, owner_id integer, name text, vendor text, api_endpoint text, api_key_encrypted text, api_key_hint text, protocol_config jsonb)`;
    for (const [i, protocol] of ['chat', 'messages', 'responses', 'gemini'].entries()) {
      await client`INSERT INTO ai_providers VALUES (${i + 1}, 1, 'same name', 'custom', 'https://example.com/v1', ${'encrypted-' + i}, 'hint', ${protocol === 'chat' ? null : client.json({ version: 1, protocol, reasoning: { effort: 'high' } })})`;
    }
    const before = await client`SELECT * FROM ai_providers ORDER BY id`;
    const migration = readFileSync('docs/migrations/2026-10-29-ai-vendors.sql', 'utf8');
    await client.unsafe(migration);
    await client.unsafe(migration);
    const [count] = await client`SELECT count(*)::int AS n FROM ai_vendors`;
    assert.equal(count.n, 4, 'do not merge same-name vendors or duplicate on rerun');
    const after = await client`SELECT * FROM ai_providers ORDER BY id`;
    for (const [index, row] of after.entries()) {
      const { vendor_id, protocol_settings, ...original } = row;
      assert.deepEqual(original, before[index]); assert.ok(vendor_id);
      assert.ok(protocol_settings[before[index].protocol_config?.protocol ?? 'chat']);
    }
    const vendors = await client`SELECT * FROM ai_vendors ORDER BY legacy_provider_id`;
    for (const [i, v] of vendors.entries()) {
      assert.equal(v.api_key_encrypted, before[i].api_key_encrypted);
      assert.equal(v.routes[0].endpoint, before[i].api_endpoint);
      assert.equal(v.routes[0].protocol, before[i].protocol_config?.protocol ?? 'chat');
    }
    await assert.rejects(client`DELETE FROM ai_vendors WHERE id=${vendors[0].id}`);
    console.log('PASS: migration preserves model IDs, keys, endpoints and settings; rerun is idempotent; no unsafe vendor merging; referenced vendor deletion blocked');
  } finally { await client.end(); await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`; await admin.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
