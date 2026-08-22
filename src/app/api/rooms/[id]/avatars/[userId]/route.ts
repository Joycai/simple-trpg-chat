export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { auth } from "@/auth";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { parseAvatarDataUrl, avatarVersion } from "@/lib/avatars";

/**
 * Serves a room member's avatar by reference. Avatars are stored as base64
 * JPEG in roomMembers.avatar; the room page hands clients a URL to this route
 * (see roomAvatarUrl) instead of inlining the data URL, so the browser
 * fetches and decodes each avatar exactly once. The `v` query param is a
 * content hash — when present and matching, the response is immutable-cached.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id, userId } = await params;
  const roomId = parseInt(id);
  const memberUserId = parseInt(userId);
  if (isNaN(roomId) || isNaN(memberUserId)) {
    return new Response("Invalid id", { status: 400 });
  }

  // Same gate as the SSE endpoint: room members (and admins) only.
  try {
    await checkRoomAccess(roomId, false);
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const [row] = await db
    .select({ avatar: roomMembers.avatar })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, memberUserId)))
    .limit(1);
  if (!row?.avatar) return new Response("Not found", { status: 404 });

  // Re-validate on the way out (defense-in-depth; also yields decoded bytes).
  const parsed = parseAvatarDataUrl(row.avatar);
  if (!parsed.ok) return new Response("Not found", { status: 404 });

  const version = avatarVersion(row.avatar);
  const etag = `"${version}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // A versioned URL can cache forever — a new avatar gets a new `v`. An
  // unversioned request still revalidates via ETag.
  const versionMatches = req.nextUrl.searchParams.get("v") === version;
  return new Response(new Uint8Array(parsed.bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(parsed.bytes.length),
      "Cache-Control": versionMatches
        ? "private, max-age=31536000, immutable"
        : "private, no-cache",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
