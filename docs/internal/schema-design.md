# Simple TRPG Chat — Schema Design Rationale (B1)

**Version**: V1.0
**Status**: Historical — superseded
**Author**: @Anela + @水月

> ⚠️ **This is a historical MVP design-rationale document, kept for context only.**
> It reflects the original SQLite, 4-table design and the legacy `is_private`
> visibility model. The project has since migrated to **PostgreSQL** with a
> **17-table schema**, and message visibility is now owned by the `audience` +
> `channelUserId` model (the `is_private` column is a derived legacy mirror).
> For the current schema see [`docs/arch/database.md`](../arch/database.md) and
> [`docs/arch/realtime.md`](../arch/realtime.md); the source of truth is
> `src/db/schema.ts`.

---

## 1. Design Goals

- **MVP 最小化**：只建实际使用的表和字段，不预建未来功能的空表
- **扩展点显式标注**：在代码注释中标注所有后期扩展口，确保 C 阶段不会堵死改造路径
- **SQLite 原生**：利用 SQLite 特性（`datetime('now')` 默认值、`AUTOINCREMENT`），不依赖数据库级功能（无存储过程、无触发器）
- **跨数据库可迁移**：所有类型和约束使用 Drizzle ORM 的通用子集，后期迁移 PostgreSQL 无需改 Schema 逻辑

---

## 2. Table Design

### 2.1 `users` — 统一账号表

Admin / Host / Player 三种角色共用一张表，通过 `role` 字段区分。

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| username | TEXT | NOT NULL, UNIQUE | 登录名 |
| password_hash | TEXT | NOT NULL | bcrypt/argon2 hash |
| role | TEXT | NOT NULL, CHECK(role IN ('admin','host','player')) | 角色 |
| display_name | TEXT | NOT NULL | Admin 创建时设置的默认名 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | |

**设计决策**：
- 三合一而非分表：MVP 规模下字段差异极小（仅 role 不同），分表增加 JOIN 复杂度
- 无 email 字段：MVP 不要求邮箱验证，后期可加

### 2.2 `rooms` — 房间表

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| name | TEXT | NOT NULL | 房间名 |
| host_id | INTEGER | NOT NULL, FK → users.id | 主持人 |
| secret_key | TEXT | NOT NULL | 加入密钥 |
| status | TEXT | NOT NULL, CHECK(status IN ('active','closed')) | 状态 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | |
| updated_at | TEXT | NOT NULL, DEFAULT datetime('now') | |

**设计决策**：
- `secret_key` 明文存储：MVP 无加密需求，密钥由 Host 口头分发。后期可 hash
- `status` 支持关闭：关闭后不显示在列表中，但历史消息保留
- 一个 Host 可创建多个房间（无 UNIQUE(host_id, name) 约束）

### 2.3 `room_members` — 房间成员关联表

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| room_id | INTEGER | NOT NULL, FK → rooms.id, CASCADE | |
| user_id | INTEGER | NOT NULL, FK → users.id, CASCADE | |
| nickname | TEXT | NOT NULL | 房间级显示名 |
| joined_at | TEXT | NOT NULL, DEFAULT datetime('now') | |
| character_data | TEXT | NULLABLE | **EXTENSION POINT** — JSON，后期存角色卡/道具栏 |

**设计决策**：
- `nickname` 在 room_members 而非 users：同一玩家在不同房间可用不同昵称（跑团刚需）
- `character_data` JSON 字段：MVP 为 NULL，后期存入 `{"hp": 10, "maxHp": 10, "attributes": {...}, "inventory": [...]}`
- CASCADE 删除：房间删除时成员关系自动清理

### 2.4 `messages` — 消息表

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| id | INTEGER | PK, AUTOINCREMENT | |
| room_id | INTEGER | NOT NULL, FK → rooms.id, CASCADE | |
| user_id | INTEGER | NOT NULL, FK → users.id, CASCADE | |
| nickname | TEXT | NOT NULL | **快照** — 发送时的昵称 |
| content | TEXT | NOT NULL | 消息正文或骰点表达式 |
| type | TEXT | NOT NULL, CHECK(type IN ('text','dice','system','clue')) | |
| dice_detail | TEXT | NULLABLE | JSON — 骰点详情 |
| is_private | INTEGER | NOT NULL, DEFAULT 0 | 0=公开, 1=暗骰 |
| created_at | TEXT | NOT NULL, DEFAULT datetime('now') | |

**设计决策**：
- **nickname 快照**：消息存储发送时的 nickname 值，而非 JOIN room_members。如果用户改了昵称，历史消息不会全体变化（UX 优于关联查询）
- **dice_detail JSON 格式**：
  ```json
  {
    "dice": "d20",
    "count": 2,
    "results": [15, 8],
    "sum": 23,
    "modifier": 0
  }
  ```
- **type 枚举预留 `clue`**：后期线索卡推送功能使用
- **is_private 暗骰**：查询时过滤 `WHERE is_private = 0 OR user_id = :currentUser OR room.host_id = :currentUser`

---

## 3. Index Strategy

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_messages_room_created` | (room_id, created_at) | 房间历史消息分页查询 |
| `idx_room_members_room` | (room_id) | 房间在线成员列表 |
| `idx_room_members_user` | (user_id) | 用户已加入房间列表 |

- MVP 数据量（单房间 < 10 万条消息）下索引足够
- 无需全文索引（聊天消息不做全文搜索）

---

## 4. Extension Points (后期改造路径)

### 4.1 道具栏 + 角色卡
- **路径**：解析 `room_members.character_data` JSON → MVP 不做 → 后期创建独立 `characters` 表并迁移数据
- **无破坏性变更**：character_data 为 NULL 时不影响任何查询

### 4.2 线索卡
- **路径**：创建 `clue_cards` + `clue_visibility` 表 → 消息 type 'clue' 复用现有 messages 表推送线索到聊天频道
- **DDL 已在 schema.ts 注释中预定义**

### 4.3 数据库迁移 (SQLite → PostgreSQL)
- **路径**：Drizzle ORM 提供统一的 Schema API → 更换连接器即可
- **需手动处理**：`datetime('now')` → PostgreSQL 的 `NOW()`，`AUTOINCREMENT` → `SERIAL`/`GENERATED ALWAYS AS IDENTITY`

---

## 5. ER Diagram (ASCII)

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  users   │       │ room_members │       │  rooms   │
├──────────┤       ├──────────────┤       ├──────────┤
│ id (PK)  │───┐   │ id (PK)      │   ┌──│ id (PK)  │
│ username │   │   │ room_id (FK) │───┘  │ name     │
│ pwd_hash │   ├───│ user_id (FK) │      │ host_id  │───┐
│ role     │   │   │ nickname     │      │ secret   │   │
│ disp_name│   │   │ joined_at    │      │ status   │   │
└──────────┘   │   │ char_data    │      └──────────┘   │
               │   └──────────────┘                      │
               │                                         │
               │   ┌──────────────┐                      │
               │   │  messages    │                      │
               │   ├──────────────┤                      │
               └───│ user_id (FK) │                      │
                   │ room_id (FK) │──────────────────────┘
                   │ nickname     │
                   │ content      │
                   │ type         │
                   │ dice_detail  │
                   │ is_private   │
                   │ created_at   │
                   └──────────────┘
```
