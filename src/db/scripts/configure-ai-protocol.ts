/** Server-side configuration; defaults to dry-run, never accepts an API key. */
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiProviders } from '@/db/schema';
import { parseProtocolConfig, resolveConnection } from '@/lib/ai/protocol/config';
async function main() {
  const args = process.argv.slice(2), providerId = Number(args[0]), file = args[1];
  if (!Number.isSafeInteger(providerId) || providerId <= 0 || !file || args.slice(2).some(x => x !== '--apply')) throw new Error('Usage: configure-ai-protocol <providerId> <config.json> [--apply]');
  const config = parseProtocolConfig(JSON.parse(await readFile(file, 'utf8')));
  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!provider) throw new Error('Provider not found');
  // Binding is explicit: changing the configured model requires revalidation.
  config.model ??= provider.model;
  const connection = resolveConnection(provider.apiEndpoint, 'validation-only', provider.model, config, provider.id, config.stream);
  console.log(JSON.stringify({ providerId, protocol: config.protocol, endpoint: connection.url, model: config.model, apply: args.includes('--apply') }, null, 2));
  if (args.includes('--apply')) await db.update(aiProviders).set({ protocolConfig: config }).where(eq(aiProviders.id, providerId));
}
main().then(() => process.exit(0)).catch(() => { console.error('Protocol configuration failed. Check provider id, endpoint, model and configuration schema.'); process.exit(1); });
