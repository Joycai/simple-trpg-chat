# Character System

## Model: a declarative schema per rule

Each rule declares its character sheet once, as data — `RuleModule.sheet`
(`src/lib/rules/sheet-schema.ts`) — plus a pure `derive(attributes)`:

| Kind | What it is | Examples |
| --- | --- | --- |
| attribute | A number the player sets; feeds checks and derivations. `min`/`max`/`default`/`required`, optional `badge` and `inStatus` | COC STR…LUCK, d20 abilities, 狩魂者 体魄/智慧/心魂 |
| resource | A state value: a `bar` (`current / max`) or an unbounded `counter`. The max is derived, player-set (`editable`), or absent; the unset current is `"max"`, a number, or a derived value | HP / SAN / MP, d20 HP (editable max), Triangle 嘉奖/处分 |
| derived | Computed by `derive`, never stored, never writable. `display` decides where it shows (`hidden` for inputs like a resource max) | COC MOV / DB / 体格, 狩魂者 术法强度 / 灵识 |
| standard skill | A preset row of the rule's skill list with a base value (fixed or from an attribute); may be required. Skills themselves stay in `room_skills` | COC 7th skill list (信用评级 required) |

Adding a rule means writing a schema, `derive`, and `migrateLegacy` — no
per-rule read/write code. The self-check in `src/lib/rules/__tests__/sheet-schema.test.ts`
covers every registered rule.

## Storage (v2)

`roomMembers.characterData` holds a `CharacterSheetV2` (`src/lib/character/sheet-v2.ts`):
profile fields, `attributes` and `resources` keyed by the schema's field keys,
and `customAttributes`. **Only values someone set are stored** — an absent key
means "unset" and reads as the field's default, which is what lets completion
tell "the player chose 50" apart from "nobody touched it". Derived values are
recomputed on every read.

Pre-v2 rows (one bag per rule: `cocAttributes` / `d20Sheet` / …) are upgraded
on read by `parseSheet` / `parseSheetOrNull` (`src/lib/character/sheet-store.ts`)
through the rule's `migrateLegacy`; a row whose own rule no longer matches the
room but that carries the room rule's bag reads under the room rule. Every
write stores v2. `pnpm db:migrate-sheets [--room <id>] [--apply]` upgrades the
remaining rows in place (dry run by default, idempotent; a row the app wrote
while the script ran is left alone and reported).

## Reading and writing

- `resolveSheet(rule, sheet)` — defaults, derived values, resource bounds, `isSet` per field.
- `applySheetEdit(rule, sheet, edit)` — **the single write path**: whitelists
  keys to the schema, rounds and clamps, `null` clears, derived keys are
  ignored, stored currents re-clamp when an attribute change lowers a max.
  Returns the new sheet and the changed paths (`sheetDiff`).
- `sheetCompletion` / `memberCompletion` — per-field state (`set` / `missing` /
  `default` / `custom`) and the required set/total against the room's rule.

Every writer runs its edit inside `updateSheetRow` (`lib/character/sheet-row.ts`):
a `SELECT … FOR UPDATE` on the member row, the edit, the write — so two
writers overlapping on one sheet (the host's overview ± and the player's `.st`)
serialize instead of one reverting the other.

A relative change is sent as one: `resources.<key>.delta` steps from the value
the locked sheet reads as (unset included), clamped like any write, so two
writers changing the same resource both land. The overview ± sends `delta: ±1`;
`.sc` rolls against the locked SAN and applies `delta: -loss` in the same step,
so its card's target and old → new are what was stored. An absolute
`current` wins over a `delta` in the same patch.

Writers: `editCharacterAction(roomId, targetUserId, edit)` (panel, host,
overview), `rebuildCharacterForRoomRuleAction(roomId, targetUserId)`, `.st` (`lib/commands/set-skill-command.ts`), `.sc`
(`sanity-check-command.ts`), the skills form's 理智值 row (`character-stat-sync.ts`), the AI `set_character_card` tool
(`lib/character/sheet-ai.ts` maps its arguments to a `SheetEdit`), and the
skills actions (`upsertSkillAction` / `deleteSkillAction`, optional target).
Who may write is one rule, `resolveSheetWriter` (`lib/auth/sheet-access.ts`):
the member, the room host, or an admin; frozen rooms are host/admin only.
A sheet built for another rule is not written by `.st` (it asks for the
rebuild); bots' sheets are rebuilt for the room rule before an AI write. The
member accepts the rebuild prompt on entry; the host can rebuild any member's
card (bots included) from the panel's rule-mismatch banner.

Every write broadcasts `character_updated { userId, vital, completion, origin }`
(`lib/character/broadcast.ts`): the member list's vital, completion badges,
and open panels follow it. `origin` is the writing browser tab's id
(`lib/ui/tab-id.ts`), sent by writes whose tab refreshes itself afterwards
(own panel save, `.st` / `.sc` from chat, own skills); that tab skips the
reload, every other tab — the same user's other tabs and devices included —
reloads. A host editing someone else's card, a proxy roll and the AI send no
origin, so the host's overview and views follow too. The broadcast
reads the sheet, room rule and skills itself and emits while holding the
member's row lock — the lock sheet writes take — so one member's events go
out in order and the last one always matches the database. Callers can't
pass a payload in; they call it after their write has committed.

Each stored write also bumps the sheet's `rev` (`updateSheetRow`), and save
replies carry the stored copy. The panel keeps whichever of its two copies —
the loaded one and the one its save returned — has the higher `rev`
(`newerSheet`), so a page refresh that raced a save can't bring back the old
values.

## Skills

Skills live in `roomSkills` (one row per skill per member per room), not in
the sheet. Standard skills from the schema match stored rows by name or alias
(COC 侦查/侦察, 信用评级/信用). Setting 理智值 through the skills form syncs the
SAN resource.

## UI

- `CharacterPanel` (`src/components/room/character/`) — three modes: own card,
  host editing another member (every field, saved to that member), read-only
  view. State: `useSheetDraft` (baseline + a `SheetEdit` draft, previewed with
  the same `applySheetEdit` the server uses; overlapping edits from others are
  flagged). Completion bar with jump-to-field chips, per-field state frames,
  derived block, skills tab with the standard list, close guard for unsaved
  changes.
- `HostSheetOverview` — the host's overview (top-bar IdCard button): every
  member's completion and resource steppers that save at once.
- Top bar: missing-required badge on the character button; incomplete-member
  badge on the overview button. Member list: completion mark for the host.
- Read-only status: `readStatusView` / `primaryVital` (`lib/rules/status-view.ts`)
  for the avatar hover card and the member list.

## Export

Room exports include `sheetSnapshot` (`lib/character/sheet-export.ts`) per
member — attributes, labelled resources, displayed derived values — also used
by the AI's `my_character` tool.
