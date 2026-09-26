"use client";

import { useEffect, useState } from "react";
import { getRoomItems } from "@/app/actions/inventory";
import type { NotebookLinkEntity } from "@/lib/room/notebook";

/**
 * The room's full item catalog (every clue / intel / character / item the host
 * created, regardless of who holds it) as linkable mention entities. This backs
 * the host's `@` suggestions when authoring an event, so a reference can point
 * at anything in the pool — not just what the host personally carries. Fetches
 * only when `enabled` (host-only server action), so players never call it.
 */
export function useRoomCatalogEntities(roomId: number, enabled: boolean, refreshKey?: number): NotebookLinkEntity[] {
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getRoomItems(roomId)
      .then((rows) => {
        if (!alive) return;
        const seen = new Set<number>();
        const out: NotebookLinkEntity[] = [];
        for (const it of rows as Array<{ id: number; type: string; title: string }>) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            out.push({ id: it.id, type: it.type, title: it.title });
          }
        }
        setEntities(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, enabled, refreshKey]);
  return entities;
}
