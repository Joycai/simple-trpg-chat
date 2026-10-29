/** Replay a sanitized reconciliation receipt after a database outage. Dry run by default. */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { normalizeUsage } from '@/lib/ai/protocol/usage';
import { recordTokenUsage } from '@/lib/ai/usage';
const schema = z.object({
  userId: z.number().int().positive(), providerId: z.number().int().positive(), attemptId: z.string().uuid(),
  model: z.string().min(1), protocol: z.enum(['chat', 'messages', 'responses', 'gemini']), status: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.object({ input: z.number().nonnegative(), cached: z.number().nonnegative(), output: z.number().nonnegative() }),
  usage: z.object({ raw: z.record(z.string(), z.unknown()) }),
});
async function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file || (flag && flag !== '--apply')) throw new Error('Usage: reconcile-ai-usage <receipt.json> [--apply]');
  const input = schema.parse(JSON.parse(await readFile(file, 'utf8')));
  const usage = normalizeUsage(input.protocol, input.usage.raw);
  console.log(JSON.stringify({ attemptId: input.attemptId, providerId: input.providerId, status: usage.status, apply: flag === '--apply' }));
  if (flag === '--apply') await recordTokenUsage(input.userId, input.providerId, usage.inputTotal ?? 0, usage.cacheRead ?? 0, usage.outputTotal ?? 0, { ...input, usage });
}
main().then(() => process.exit(0)).catch(() => { console.error('Usage reconciliation failed; no receipt content has been printed.'); process.exit(1); });
