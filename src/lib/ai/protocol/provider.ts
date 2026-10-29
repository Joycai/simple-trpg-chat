import 'server-only';
import { abortable } from './transport';
import { complete } from './client';
import { parseProtocolConfig, resolveConnection } from './config';
import type { CompletionRequest } from './types';
import { recordTokenUsage, type UsageReceipt } from '../usage';
export interface ProviderConnection {
  id: number; apiEndpoint: string; protocolConfig?: unknown;
  tokenRateInput?: number; tokenRateCached?: number; tokenRateOutput?: number;
}
/** All existing features keep their own policy, but use the same wire and accounting path. */
export async function completeForProvider(provider: ProviderConnection, apiKey: string, userId: number, request: CompletionRequest) {
  const config = parseProtocolConfig(provider.protocolConfig);
  const streaming = request.stream ?? config.stream ?? false;
  const connection = resolveConnection(provider.apiEndpoint, apiKey, request.model, config, provider.id, streaming);
  const day = new Date().toISOString().slice(0, 10);
  const rates = { input: provider.tokenRateInput ?? 0, cached: provider.tokenRateCached ?? 0, output: provider.tokenRateOutput ?? 0 };
  return complete(connection, { ...request, stream: streaming }, async attempt => {
    const receipt: UsageReceipt = { ...attempt, rates, day };
    for (let retry = 0; retry < 3; retry++) {
      try {
        await abortable(recordTokenUsage(userId, provider.id, attempt.usage.inputTotal ?? 0, attempt.usage.cacheRead ?? 0, attempt.usage.outputTotal ?? 0, receipt), AbortSignal.timeout(3000));
        return;
      }
      catch { if (retry === 2) console.error('[AI usage] Persistence exhausted; reconciliation required', JSON.stringify({ ...receipt, userId, providerId: provider.id })); }
    }
  });
}
