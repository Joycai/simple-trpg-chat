/**
 * Notebook (记事本) — pure helpers shared by the client panel, the markdown
 * renderer and the server actions. No DB / React imports so everything here is
 * unit-testable (src/lib/__tests__/notebook.test.ts).
 *
 * Mention model: a note's markdown may contain `@标题` tokens that link an
 * entry of the author's backpack (inventory item / clue / character / info).
 * Tokens store the plain title, not an id — resolution happens at render time
 * by longest-title prefix match against the entities currently in the
 * backpack, so a deleted item automatically degrades to plain text.
 */

/**
 * The 7 predefined label colors a category can pick from. Stored as keys in
 * notebook_categories.color; each key maps to theme-token classes client-side
 * (COLOR_META in notebook-helpers), so labels recolor with the active theme.
 */
export const NOTEBOOK_COLORS = ['primary', 'accent', 'success', 'warning', 'danger', 'ai', 'neutral'] as const;
export type NotebookColor = (typeof NOTEBOOK_COLORS)[number];

export const NOTE_TITLE_MAX = 100;
export const NOTE_CONTENT_MAX = 20_000;
export const CATEGORY_NAME_MAX = 20;
/** Per user per room — enough for real use, low enough to stop runaway growth. */
export const CATEGORY_MAX_COUNT = 12;

/** A linkable backpack entry, as surfaced to the @-picker and the renderer. */
export interface NotebookLinkEntity {
  id: number;
  /** inventory item type: 'clue' | 'info' | 'character' | 'item' */
  type: string;
  title: string;
}

export type MentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; entity: NotebookLinkEntity };

/**
 * Split a plain-text run into text/mention segments. At each `@`, the longest
 * entity title that prefixes the following text wins; an `@` matching nothing
 * stays literal text (the "degrade to plain text" behavior for deleted items).
 */
export function segmentMentions(text: string, entities: NotebookLinkEntity[]): MentionSegment[] {
  if (entities.length === 0 || !text.includes('@')) {
    return text ? [{ kind: 'text', text }] : [];
  }
  const sorted = [...entities]
    .filter((e) => e.title.length > 0)
    .sort((a, b) => b.title.length - a.title.length);
  const segments: MentionSegment[] = [];
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') { i++; continue; }
    const after = text.slice(i + 1);
    const entity = sorted.find((e) => after.startsWith(e.title));
    if (!entity) { i++; continue; }
    if (i > plainStart) segments.push({ kind: 'text', text: text.slice(plainStart, i) });
    segments.push({ kind: 'mention', text: entity.title, entity });
    i += 1 + entity.title.length;
    plainStart = i;
  }
  if (plainStart < text.length) segments.push({ kind: 'text', text: text.slice(plainStart) });
  return segments;
}

/** Distinct entities a note's content links to, in first-appearance order. */
export function extractMentions(content: string, entities: NotebookLinkEntity[]): NotebookLinkEntity[] {
  const seen = new Set<number>();
  const out: NotebookLinkEntity[] = [];
  for (const seg of segmentMentions(content, entities)) {
    if (seg.kind === 'mention' && !seen.has(seg.entity.id)) {
      seen.add(seg.entity.id);
      out.push(seg.entity);
    }
  }
  return out;
}

/**
 * Reduce markdown to plain text for search snippets: drops heading/quote/list
 * markers, emphasis and code fences, and unwraps [label](url) links.
 */
export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HighlightSegment { text: string; hl: boolean }

/** Split text into highlighted/plain runs for every occurrence of `query`. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return text ? [{ text, hl: false }] : [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const segments: HighlightSegment[] = [];
  let pos = 0;
  while (pos < text.length) {
    const hit = lower.indexOf(needle, pos);
    if (hit === -1) { segments.push({ text: text.slice(pos), hl: false }); break; }
    if (hit > pos) segments.push({ text: text.slice(pos, hit), hl: false });
    segments.push({ text: text.slice(hit, hit + q.length), hl: true });
    pos = hit + q.length;
  }
  return segments;
}

export interface SearchableNote {
  id: number;
  title: string;
  content: string;
}

export interface NoteSearchResult<T extends SearchableNote> {
  note: T;
  /** Higher = more relevant (title hits outweigh content hits). */
  score: number;
  /** Plain-text excerpt around the first content hit; empty when only the title matched. */
  snippet: string;
}

const SNIPPET_RADIUS = 18;

/**
 * Case-insensitive substring search over title + markdown-stripped content,
 * sorted by relevance (title hits count 10, content hits 1 each).
 *
 * `plainByNoteId` is an optional precomputed `stripMarkdown` cache. Without it
 * every keystroke re-runs eight regexes over every note's full body (each up to
 * NOTE_CONTENT_MAX), which the caller can hoist to a memo keyed on the notes
 * alone. Optional so existing callers and tests are unaffected.
 */
export function searchNotes<T extends SearchableNote>(
  notes: T[],
  query: string,
  plainByNoteId?: Map<number, string>,
): NoteSearchResult<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: NoteSearchResult<T>[] = [];
  for (const note of notes) {
    const titleHit = note.title.toLowerCase().includes(q);
    const plain = plainByNoteId?.get(note.id) ?? stripMarkdown(note.content);
    const lower = plain.toLowerCase();
    let contentHits = 0;
    let firstHit = -1;
    let pos = lower.indexOf(q);
    while (pos !== -1) {
      if (firstHit === -1) firstHit = pos;
      contentHits++;
      pos = lower.indexOf(q, pos + q.length);
    }
    if (!titleHit && contentHits === 0) continue;
    let snippet = '';
    if (firstHit !== -1) {
      const start = Math.max(0, firstHit - SNIPPET_RADIUS);
      const end = Math.min(plain.length, firstHit + q.length + SNIPPET_RADIUS * 2);
      snippet = `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
    }
    results.push({ note, score: (titleHit ? 10 : 0) + contentHits, snippet });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * The `@query` currently being typed at `caret` in the editor textarea, or
 * null when the caret isn't inside a mention draft. A draft ends at the caret
 * and starts at the nearest `@` with no whitespace in between (bounded so a
 * lone `@` deep in prose doesn't reopen the picker forever).
 */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const MAX_QUERY = 12;
  const from = Math.max(0, caret - MAX_QUERY - 1);
  for (let i = caret - 1; i >= from; i--) {
    const ch = text[i];
    if (ch === '@') return { start: i, query: text.slice(i + 1, caret) };
    if (/\s/.test(ch)) return null;
  }
  return null;
}
