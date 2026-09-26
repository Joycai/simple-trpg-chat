"use client";

import { useEffect, useState } from "react";
import { getMyInventory } from "@/app/actions/inventory";
import type { NotebookLinkEntity } from "@/lib/room/notebook";

/**
 * The viewer's backpack entries as linkable mention entities (dedupe by item id),
 * so event descriptions resolve `@Title` against what the viewer actually holds.
 * Re-fetches on `refreshKey`.
 */
export function useBackpackEntities(roomId: number, refreshKey?: number): NotebookLinkEntity[] {
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  useEffect(() => {
    let alive = true;
    getMyInventory(roomId)
      .then((rows) => {
        if (!alive) return;
        const seen = new Set<number>();
        const out: NotebookLinkEntity[] = [];
        for (const dist of rows as Array<{ item?: { id: number; type: string; title: string } | null }>) {
          const item = dist.item;
          if (item && !seen.has(item.id)) {
            seen.add(item.id);
            out.push({ id: item.id, type: item.type, title: item.title });
          }
        }
        setEntities(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, refreshKey]);
  return entities;
}
