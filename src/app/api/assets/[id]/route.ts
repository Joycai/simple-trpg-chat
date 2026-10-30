import { auth } from '@/auth';
import { canReadAsset, ASSET_DIR } from '@/lib/ai/assets/storage';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const asset = await canReadAsset(id, Number(session.user.id));
  if (!asset) return new Response(null, { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(ASSET_DIR, `${id}.webp`));
    return new Response(bytes, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 404 }); }
}
