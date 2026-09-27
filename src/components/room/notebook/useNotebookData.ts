"use client";

import { useEffect, useState } from "react";
import { getMyNotebookAction } from "@/app/actions/notebook";
import { getMyInventory } from "@/app/actions/inventory";
import { getMyEventsAction } from "@/app/actions/event";
import type { NotebookLinkEntity } from "@/lib/room/notebook";
import type { Distribution } from "@/components/room/inventory/inventory-types";
import type { Category, Note } from "./notebook-types";

/**
 * The notebook's data, loaded when the drawer opens (no SSE: nothing here is
 * visible to anyone else): the viewer's notes and categories, plus the `@`
 * link targets — backpack entries and readable events. `afterEnter` holds each
 * commit until the drawer's slide has settled.
 */
export function useNotebookData(roomId: number, afterEnter: (fn: () => void) => void) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  // Full backpack rows behind the link entities, so a clicked chip can open
  // the same detail view the backpack shows (keyed by inventory item id).
  // The distribution rides along: DetailModal derives the 持有 line from it.
  const [distsById, setDistsById] = useState<Map<number, Distribution>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // allSettled, not all: the notes are the panel's reason to exist, while
      // the backpack and event lists only enrich `@` mentions. Failing them
      // together meant one blip on either extra showed "no notes yet" to
      // someone whose notes were fine — and invited them to rewrite one.
      const [notebook, inventory, myEvents] = await Promise.allSettled([
        getMyNotebookAction(roomId),
        getMyInventory(roomId),
        getMyEventsAction(roomId),
      ]);
      if (!alive) return;

      // Every state commit below goes through `afterEnter`: rendering the note
      // list mid-slide is exactly the main-thread work that used to show up as
      // a stuttering drawer. The fetch itself already ran, and the queue keeps
      // these in the order they were handed over.
      //
      // Each closure re-checks `alive`. The guard above only covers the instant
      // the fetch resolved — `afterEnter` can hold a commit past a later re-run
      // of this effect, and a stale run must not clobber the live one.
      if (notebook.status === "fulfilled") {
        afterEnter(() => {
          if (!alive) return;
          setNotes(notebook.value.notes as Note[]);
          setCategories(notebook.value.categories as Category[]);
          setError(false);
        });
      } else {
        afterEnter(() => {
          if (alive) setError(true);
        });
      }

      // Mentions degrade gracefully: with no entities `segmentMentions` returns
      // the text unchanged, so an `@Title` just reads as plain text.
      const byId = new Map<number, Distribution>();
      const linkable: NotebookLinkEntity[] = [];
      if (inventory.status === "fulfilled") {
        // Backpack entries → linkable entities (dedupe by item id: shared
        // copies of the same item may produce several distributions).
        for (const dist of inventory.value as Distribution[]) {
          const item = dist.item;
          if (item && !byId.has(item.id)) {
            byId.set(item.id, dist);
            linkable.push({ id: item.id, type: item.type, title: item.title });
          }
        }
      }
      if (myEvents.status === "fulfilled") {
        // Events the viewer may read are also linkable (#7). Negate the id so it
        // never collides with a backpack item id in the shared entity list.
        for (const ev of myEvents.value) {
          linkable.push({ id: -ev.id, type: "event", title: ev.title });
        }
      }
      afterEnter(() => {
        if (!alive) return;
        setEntities(linkable);
        setDistsById(byId);
        setLoading(false);
      });
    })();
    return () => { alive = false; };
  }, [roomId, retryKey, afterEnter]);

  /** Re-read notes and categories after a write. */
  const reload = async () => {
    const notebook = await getMyNotebookAction(roomId);
    setNotes(notebook.notes as Note[]);
    setCategories(notebook.categories as Category[]);
  };

  const retry = () => setRetryKey((k) => k + 1);

  return { notes, categories, entities, distsById, loading, error, retry, reload };
}
