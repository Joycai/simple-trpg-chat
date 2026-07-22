/**
 * Triangle Agency character-sheet data model. Owned by the triangle rule module
 * (moved out of the shared `character-types.ts`). Self-contained.
 */

/**
 * Triangle Agency's 9 Qualifications. Free-set numbers with no derivation —
 * checks in this system are always 6d4 counting 3s, so the values are
 * reference bookkeeping (e.g. Quality Assurance counts), not roll modifiers.
 */
export interface TaQualities {
  attentiveness: number;
  duplicity: number;
  dynamism: number;
  empathy: number;
  initiative: number;
  persistence: number;
  presence: number;
  professionalism: number;
  subtlety: number;
}

/**
 * Triangle Agency sheet meta. Commendations/reprimands are unbounded
 * accumulating counters (no `*Max` pair — they render as counter cards,
 * not fill bars).
 */
export interface TaSheet {
  commendations?: number;
  reprimands?: number;
}

export const TA_DEFAULT_QUALITIES: TaQualities = {
  attentiveness: 0, duplicity: 0, dynamism: 0,
  empathy: 0, initiative: 0, persistence: 0,
  presence: 0, professionalism: 0, subtlety: 0,
};
