/** Optional local PostgreSQL integration check. All writes use a disposable schema. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { normalizeUsage } from '../../src/lib/ai/protocol/usage';
async function main() {
  const url = process.env.DATABASE_URL || JSON.parse(readFileSync('db.config.json', 'utf8')).url;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('This test requires a local database');
  const schema = `test_ai_usage_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = postgres(url, { max: 1 });
  const client = postgres(url, { max: 4, connection: { search_path: schema } });
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    for (const table of ['users', 'ai_providers', 'ai_token_usages', 'ai_usage_attempts', 'ai_point_logs']) {
      await admin`CREATE TABLE ${admin(schema)}.${admin(table)} (LIKE public.${admin(table)} INCLUDING ALL)`;
    }
    // Explicit ids avoid advancing the original serial sequence copied by LIKE.
    await client`INSERT INTO users (id, username, password_hash, display_name, role, ai_points) VALUES (1, 'test', 'unused', 'Test', 'host', 10)`;
    await client`INSERT INTO ai_providers (id, owner_id, name, api_key_encrypted, model, is_shared, token_rate_input, token_rate_cached, token_rate_output) VALUES (1, 1, 'test', 'unused', 'test-model', true, 99, 99, 99)`;
    globalThis.__dbClient = client;
    const { recordTokenUsage } = await import('../../src/lib/ai/usage');
    const receipt = { attemptId: crypto.randomUUID(), protocol: 'chat' as const, model: 'test-model', status: 'completed', day: '2026-10-29', rates: { input: 1, cached: 0.1, output: 2 }, usage: normalizeUsage('chat', { prompt_tokens: 1000000, prompt_tokens_details: { cached_tokens: 500000 }, completion_tokens: 100000 }) };
    await Promise.all(Array.from({ length: 4 }, () => recordTokenUsage(1, 1, 1000000, 500000, 100000, receipt)));
    const [balance] = await client`SELECT ai_points FROM users WHERE id=1`;
    assert.equal(Number(balance.ai_points), 9.25);
    const [totals] = await client`SELECT input_tokens, cached_input_tokens, output_tokens FROM ai_token_usages`;
    assert.deepEqual([totals.input_tokens, totals.cached_input_tokens, totals.output_tokens], [1000000, 500000, 100000]);
    const [counts] = await client`SELECT (SELECT count(*) FROM ai_usage_attempts)::int AS attempts, (SELECT count(*) FROM ai_point_logs)::int AS logs`;
    assert.deepEqual([counts.attempts, counts.logs], [1, 1]);
    await recordTokenUsage(1, 1, 0, 0, 0, { ...receipt, attemptId: crypto.randomUUID(), usage: normalizeUsage('chat') });
    const [missing] = await client`SELECT count(*)::int AS count FROM ai_usage_attempts WHERE settlement='missing'`;
    assert.equal(missing.count, 1);
    await recordTokenUsage(1, 1, 0, 500000, 0, { ...receipt, attemptId: crypto.randomUUID(), usage: normalizeUsage('chat', { prompt_tokens_details: { cached_tokens: 500000 } }) });
    const [partial] = await client`SELECT input_tokens, cached_input_tokens FROM ai_token_usages`;
    assert.deepEqual([partial.input_tokens, partial.cached_input_tokens], [1500000, 1000000]);
    await client`UPDATE users SET ai_points=0.1 WHERE id=1`;
    await recordTokenUsage(1, 1, 1000000, 500000, 100000, { ...receipt, attemptId: crypto.randomUUID() });
    const [deduction] = await client`SELECT amount, before_points, after_points FROM ai_point_logs WHERE before_points=0.1`;
    assert.deepEqual([Number(deduction.amount), Number(deduction.before_points), Number(deduction.after_points)], [-0.1, 0.1, 0]);
    console.log('PASS: concurrent idempotent settlement, price snapshot, partial and missing usage, balance/log consistency');
  } finally {
    await client.end();
    await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
    await admin.end();
  }
}
main().catch(() => { console.error('Database integration check failed'); process.exitCode = 1; });
