# Character System

## Storage

Character data is stored as JSON in `roomMembers.characterData`. Each player has one character per room.

## COC 7th Edition Support

Types defined in `src/lib/character-types.ts`:

**Core attributes** (STR, CON, SIZ, DEX, APP, INT, POW, EDU) — set manually or rolled.

**Derived stats** (auto-calculated):
- HP = (CON + SIZ) / 10
- MP = POW / 5
- SAN = POW (initial)
- Move rate based on STR/DEX/SIZ comparison

**Custom attributes**: Freeform key-value pairs for non-COC systems.

**Resources**: HP current/max, SAN current/max, MP current/max.

## Skills

Skills are stored separately in `roomSkills` (one row per skill per player per room), not inside `characterData`. The sanity skill (`san`) is synced between `roomSkills` and `characterData.resources.san` when updated.

Actions: `src/app/actions/skills.ts`

## Character Actions (`src/app/actions/character.ts`)

- Initialize COC attributes for a new character
- Save/update the full character sheet
- Manage custom attributes (add, edit, delete)
- Retrieve character snapshot (used during export)

## UI

`src/components/CharacterPanel.tsx` — full sheet editor with attribute inputs, derived stat display, HP/SAN/MP trackers, and custom attribute management.

## Export Integration

Character snapshots are included in room exports (`src/app/actions/export.ts`), capturing the state of each player's sheet at export time.
