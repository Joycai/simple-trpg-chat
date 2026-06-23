# Room Left Side / Item Creation — Spec & Backlog

## 创建道具 / 查看道具 Modals — type-specific fields

The unified create/edit modal (`CreateEditModal`) and the view modal (`DetailModal`),
both in `src/components/room/inventory/InventoryModals.tsx`, were aligned to the
"远古神社" design (per-type accent tabs, per-type titles/badges, character avatar +
identity subtitle, wood-grain action buttons).

### Persisted metadata (DONE)

These type-specific fields are now stored on `inventory_items` (nullable columns) and
flow end-to-end: create/edit modal → `meta` state in `InventoryPanel` →
`create/updateInventoryItemAction` → DB → read back in `DetailModal`. Only the metadata
relevant to the chosen type is written; the rest is set to `null`.

| Type | Field | Column | Control |
| ---- | ----- | ------ | ------- |
| 情报 info | 来源 (source) | `source` text | KP叙述 / 玩家发现 / 系统事件 |
| 情报 info | 可见性 (visibility) | `visibility` text | 全体可见 / 仅 KP 可见 |
| 角色 character | 与调查员关系 (relation) | `relation` text | 盟友 / 中立 / 敌对 / 未知 |
| 物品 item | 类别 (category) | `category` text | 武器 / 工具 / 消耗品 / 其他 |
| 物品 item | 数量 (quantity) | `quantity` integer | select 1–10 |

Enum value → i18n key maps and badge colours live in `inventory-helpers.ts`
(`sourceKey` / `visibilityKey` / `relationKey` / `categoryKey` / `relationBadgeClass`,
plus `ItemMeta` / `DEFAULT_ITEM_META`). Older rows (pre-migration) have null metadata and
fall back to the create defaults in the detail view.

> **Migration note:** the 5 columns were added with `ALTER TABLE inventory_items ADD
> COLUMN IF NOT EXISTS …` rather than `pnpm db:push`, because drizzle-kit push is currently
> blocked on an *unrelated* pre-existing drift (the `ai_token_usages` unique constraint,
> which it wants to apply by truncating the table — answer **No** / avoid). `schema.ts` is
> the source of truth and now matches the DB for these columns.

## 分发道具 Modal (player-side `ShareModal`) — unified multi-select

When a player taps 分发 / 使用·分发 in `DetailModal`, the wood button now opens a dedicated
`ShareModal` (in `InventoryModals.tsx`), unified across all four item types:

- **Item summary card** — type-tinted icon + title + meta line (`类型 [· 来源/关系] [· 类别 · ×数量]`)
  + "来自 {giver}".
- **Target list** — every room member **except the viewer and the host**. Bots are always
  selectable (tagged `BOT`; they have no SSE presence). Human members are selectable only
  while online; offline humans are shown disabled with a 离线 label.
  Online status comes from `onlineUserIds` (SSE presence), threaded
  RoomClient → RoomOverlays → InventoryPanel → ShareModal. Avatar letter badges use
  `avatarColor` (falls back to `getRandomColorForUser`).
- **全选在场调查员** selects all online targets; the footer button reads 分发给 {N} 人 and is
  disabled at 0.
- Confirm loops `shareItemAction` over the selected ids (skipping any that error, e.g. a
  recipient who already owns the item).

Host exclusion uses `room.hostId` (new `hostId` prop on `InventoryPanel`). The host's own
`DistributeModal` is unchanged and still lists all members (it can distribute to bots).

> Note: target eligibility requires the player to be **online** (per the design's offline
> disabling). In a single-session local test only the current user is connected, so other
> humans show 离线 — exercising the multi-select/confirm path needs a second online player.

### Still backlog

1. **初始持有人 (initial holder)** — the create modal's holder `<select>` is still UI-only
   (placeholder option only). To wire it: pass the room `players` list into
   `CreateEditModal`, and on create, if a holder is chosen, insert an
   `inventory_distributions` row (reuse the distribute path so the recipient is notified).
2. **角色 "最后目击" (last-seen)** — shown in the original design's character info box but has
   no data field; the box currently shows only 创建时间 (`createdAt`). Add a column +
   control if this becomes a real requirement.
3. The 持有 / holder row in `DetailModal` is data-driven (distribution history for host,
   the viewer's own `detailDist` otherwise) and hides when no holder name is available.
