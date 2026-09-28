/**
 * This browser tab's id, sent as the `origin` of the writes it makes so
 * `character_updated` can tell a tab its own write apart from the same user's
 * write in another tab or device (see `lib/character/broadcast.ts`).
 *
 * Random per page load, created on first use. Not `crypto.randomUUID`: that
 * only exists in secure contexts, and rooms are also served over plain http
 * on a LAN. It needs no secrecy — only to differ between two open tabs.
 */
let id: string | undefined;

export function tabId(): string {
  id ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return id;
}
