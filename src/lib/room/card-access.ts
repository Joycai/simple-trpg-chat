/**
 * Who gets an entry point to another member's character card — the member
 * list, the members dialog, a chat avatar and the host overview all ask this
 * one question, so the answer can't drift between them (the sidebar used to
 * hide bots while the members dialog showed them).
 *
 * The room host (or an admin) opens any other member's card, bots included,
 * in host edit mode; players have no entry to other cards. The server
 * enforces writes separately (`resolveSheetWriter`).
 */
export function canOpenMemberCard(viewer: { id: number; isHost: boolean }, memberId: number): boolean {
  return viewer.isHost && memberId !== viewer.id;
}

/** Members whose required fields aren't all set — the overview badge. */
export function countIncomplete(
  completions: ReadonlyMap<number, { requiredTotal: number; requiredSet: number }>,
  excludeIds: ReadonlyArray<number>,
): number {
  let n = 0;
  for (const [id, c] of completions) {
    if (!excludeIds.includes(id) && c.requiredSet < c.requiredTotal) n += 1;
  }
  return n;
}
