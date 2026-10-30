import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/db';
import { generatedAssets, inventoryItems, inventoryDistributions, roomMembers, rooms, users } from '@/db/schema';
import { and, eq, or, gt } from 'drizzle-orm';
import { assetIdFromUrl, assetUrl } from './types';
export const ASSET_DIR = process.env.AI_ASSET_DIR || path.join(process.cwd(), 'cache', 'ai-assets');
export async function writeAssetFile(id: string, bytes: Buffer) {
  await fs.mkdir(ASSET_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSET_DIR, `${id}.webp`), bytes, { flag: 'wx' });
}
export type AssetTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Called in the same transaction as the target write; cleanup locks the same row. */
export async function retainAsset(tx: AssetTx, url: string | null | undefined, roomId: number, userId: number) {
  if (!url) return;
  const id = assetIdFromUrl(url);
  if (!id) {
    // Reject absolute/encoded aliases of the protected endpoint as well.
    if (/\/api\/assets/i.test(url) || /%2fapi/i.test(url)) throw new Error('Invalid asset reference');
    return;
  }
  const [asset] = await tx.select().from(generatedAssets).where(and(eq(generatedAssets.id, id), eq(generatedAssets.roomId, roomId))).for('update');
  if (!asset || (asset.ownerId !== userId && !asset.retained) || (!asset.retained && (asset.hidden || Date.parse(asset.expiresAt) <= Date.now()))) throw new Error('Unavailable asset');
  // Retained files may only be reused by their owner or where already visible.
  if (asset.ownerId !== userId && !(await canReadAsset(id, userId))) throw new Error('Unavailable asset');
  await tx.update(generatedAssets).set({ retained: true }).where(eq(generatedAssets.id, id));
}
export async function canReadAsset(id: string, userId: number) {
  const [asset] = await db.select().from(generatedAssets).where(eq(generatedAssets.id, id));
  if (!asset) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [room] = await db.select().from(rooms).where(eq(rooms.id, asset.roomId));
  if (!user || !room) return null;
  const [member] = await db.select({ id: roomMembers.id }).from(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, userId)));
  const host = room.hostId === userId || user.role === 'admin';
  if (!member && !host) return null;
  if (asset.ownerId === userId && (asset.retained || (!asset.hidden && Date.parse(asset.expiresAt) > Date.now()))) return asset;
  if (!asset.retained) return null;
  const url = assetUrl(id);
  const [portrait] = await db.select({ id: roomMembers.id }).from(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.portraitUrl, url)));
  if (portrait) return asset;
  const items = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.roomId, room.id), eq(inventoryItems.imageUrl, url)));
  for (const item of items) {
    if (host) return asset;
    const [distribution] = await db.select({ id: inventoryDistributions.id }).from(inventoryDistributions).where(and(eq(inventoryDistributions.roomId, room.id), eq(inventoryDistributions.itemId, item.id), eq(inventoryDistributions.toUserId, userId)));
    if (distribution) return asset;
  }
  return null;
}
export const availableAsset = () => or(eq(generatedAssets.retained, true), gt(generatedAssets.expiresAt, new Date().toISOString()));
