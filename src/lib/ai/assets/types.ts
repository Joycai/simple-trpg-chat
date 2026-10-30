import { z } from 'zod';
export const AssetKind = z.enum(['portrait', 'item', 'clue', 'character']);
export type AssetKind = z.infer<typeof AssetKind>;
export const ASSET_LIMIT = 20;
export const ASSET_DAYS = 7;
export const assetUrl = (id: string) => `/api/assets/${id}`;
export function assetIdFromUrl(url: string | null | undefined) {
  return url?.match(/^\/api\/assets\/([0-9a-f-]{36})$/)?.[1] ?? null;
}
export type AssetView = { id: string; url: string; prompt: string; createdAt: string; expiresAt: string; retained: boolean };
export type AssetService = { id: number; name: string; model: string; size: string; points: number; shared: boolean; quote: string };
export type AssetTask = { id: string; status: string; points: number; createdAt: string };
export type AssetSessionView = { id: string; targetKey: string; prompt: string; createdAt: string };
export type StudioState = { services: AssetService[]; balance: number; sessions: AssetSessionView[]; assets: AssetView[]; tasks: AssetTask[]; portraitUrl: string | null };
/** Only explicitly supplied profile fields/attributes belong in a generation prompt. */
export function describeAsset(fields: Array<[string, string | number | null | undefined]>) {
  return fields.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label}: ${String(value).trim()}`).join('\n').slice(0, 7000);
}
export const Submission = z.object({
  sessionId: z.uuid(), requestId: z.uuid(), providerId: z.number().int().positive(),
  quote: z.string().max(128), draftPrompt: z.string().max(7500), prompt: z.string().trim().min(1).max(8000),
});
