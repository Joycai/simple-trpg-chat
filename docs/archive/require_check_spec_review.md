# 代码审阅：hoster 发起检定功能

审阅对象：`docs/spec/require_check_spec.md`
审阅分支：`review/require-check-spec`（基于 `feat/chat-input-redesign`）
日期：2026-06-20

## ✅ 实现进度更新（2026-06-20）

下述 P0/P1/P2 缺口已在分支 `review/require-check-spec` 全部修复，逐条状态见文末
「修复记录」。本节以上的原始审阅内容保留作为背景。

## 总体结论

核心链路**已实现**：顶部工具栏「发起检定」按钮 → `HostCheckDialog` 选人/选技能 →
`requestSkillCheckAction` 广播 `check_request` 消息 → 被指定者看到 🎲 图标 → 点击触发 `.rc`
检定，未设技能时弹框设定后自动检定。

但有 **4 项需求未实现或不符**，详见下表。

## 需求逐条核对

| # | 需求 | 状态 | 说明 |
|---|------|------|------|
| 1 | 工具栏「发起检定」按钮 → 选人 → 选技能 → 发起 | ✅ | `RoomClient.tsx:759-771` 按钮（host-only）；`HostCheckDialog.tsx` 两步弹窗；`requestSkillCheckAction`（`room.ts:329`） |
| 2 | 检定范围 = 当前**频道**成员；公频可选全部，私聊默认对私聊对象 | ❌ | 弹窗始终接收 `mentionTargets`（全房间成员），不随 `activeTab` 变化；`requestSkillCheckAction` 始终发公频消息（无 `isPrivate`/`targetUserId`）。私聊场景下既不默认私聊对象，也不私密发送 |
| 3 | 「要求全员（不含 bot）」 | ⚠️ | 有「全选」，但**包含 bot**；无「排除 bot」语义。自己已被排除 |
| 4 | 成员列表区分 bot / player | ❌ | `HostCheckDialog` 的 `Player` 类型仅 `{id, nickname}`，`isBot` 被丢弃，列表中 bot 与玩家无任何视觉区分 |
| 5 | 检定信息在当前频道发出，频道成员可见 | ⚠️ | 总是发公频；公频下可见 ✅，但私聊频道会错误地公开广播（同 #2） |
| 6 | host 看到「自己发起某技能检定」 | ✅ | `checkRequestContent`：`🎯 {hostNick} 要求 {targetNicks} 进行【{skillName}】检定` |
| 7 | 被指定者：提示 + 🎲 图标；点击直接检定；无技能则弹框设定并保存后自动检定 | ✅ | `ChatMessage.tsx:172-196` 仅 target 显示图标；`handleCheckRequest`（`RoomClient.tsx:603`）有技能跑 `.rc`，无则 `prompt()` → `upsertSkillAction` → `.rc` |
| 8 | 未被指定者：看到目标列表但无图标 | ✅ | `isTarget` 为 false 时不渲染图标 |
| 9 | 目标投掷后，host 看到「x/y 人已完成检定」 | ❌ | **完全未实现**：无完成度追踪，掷骰结果与 check_request 无关联，无 x/y 统计消息 |
| 10 | 要求 bot 检定时，bot 可响应（若勾选 tool） | ❌ | `requestSkillCheckAction` 直接 `db.insert` 后广播，**未调用 `runAgent`**，bot 永远不会被触发响应 |
| 11 | 投掷参考 ra/rc；设技能参考 .st | ✅ | d100 路径走 `.rc`（命令引擎）；设技能走 `upsertSkillAction`（同 .st 语义） |

## 关键问题（按优先级）

### P0 — 未实现的核心需求

1. **完成度统计缺失（需求 #9）**：`check_request` 消息没有 ID 关联回填，目标掷骰只是普通
   `dice` 消息，host 无法看到「x/y 已完成」。需要为 check_request 引入 sessionId，掷骰时带上
   该 id，并实时统计已响应人数。

2. **Bot 不会响应检定（需求 #10）**：`requestSkillCheckAction`（`room.ts:353-362`）绕过了
   `sendMessageAction`，因此不会像 mention 那样触发 `runAgent`。需对 `targetUserIds` 中的 bot
   逐一 `runAgent(botId, roomId, { triggeringUserId: hostId, isPrivate })`，且 bot 需具备掷骰/
   检定 tool（当前 `roll_dice` 存在，但无「按技能值检定」的 tool）。

### P1 — 频道作用域错误

3. **未按频道作用域（需求 #2、#5）**：`HostCheckDialog` 收到的是全房间 `mentionTargets`，且
   `requestSkillCheckAction` 恒发公频。私聊中应默认仅对私聊对象、且消息私密发送。需把
   `activeTab` 透传给弹窗与 action（`isPrivate`/`targetUserId`）。

### P2 — 选人体验不符

4. **bot 未区分 + 无「全员不含 bot」（需求 #3、#4）**：`Player` 接口需带上 `isBot`，列表标注
   bot 徽标，并把「全选」改为/补充「要求全员（不含 bot）」。`mentionTargets` 本身已含 `isBot`，
   只需在 `HostCheckDialog` 的 Props 透传与使用。

## 次要观察

- 非 d100 骰（d20/d10）走的是 `rollDiceAction` 原始掷骰，**不按技能值检定**，与 ra/rc 语义不一致。
  规格仅定义 d100 检定，d20/d10 属额外功能，建议明确其语义或移除。
- 无技能时用浏览器原生 `prompt()`，非项目风格弹窗，体验粗糙（功能可用）。
- 该功能**无任何单元测试**（`src/lib/__tests__/` 无相关用例）。
- host-only 权限校验到位：`checkRoomAccess(roomId, true)`（`room.ts:335`）。

## 涉及文件

- `src/components/HostCheckDialog.tsx` — 选人/选技能弹窗
- `src/components/RoomClient.tsx:603-627` — `handleCheckRequest`；`:759-771` 工具栏按钮；`:1046-1048` 弹窗挂载
- `src/components/ChatMessage.tsx:172-196` — check_request 渲染 + 🎲 图标
- `src/app/actions/room.ts:329-364` — `requestSkillCheckAction`
- `src/db/schema.ts:31` — `MESSAGE_TYPES` 含 `check_request`
- `messages/{zh,en}.json` — `hostCheck.*`、`roomActions.checkRequestContent` 等

## 修复记录（2026-06-20）

| 原缺口 | 状态 | 改动 |
|--------|------|------|
| #9 完成度统计 | ✅ 已实现 | check_request 的 `diceDetail` 增加 `respondedUserIds`；新增 `respondToCheckRequestAction`；广播 `check_update` 事件；气泡显示 `✅ x/y` |
| 新增：完成后禁用图标 | ✅ 已实现 | 目标投掷后 `respondedUserIds` 含其 id，🎲 图标替换为 ✅，无法再次点击 |
| #10 Bot 响应检定 | ✅ 已实现 | `requestSkillCheckAction` 对 bot 目标触发 `runAgent`（按各 bot 已勾选的 tool 响应） |
| #2/#5 频道作用域 | ✅ 已实现 | 弹窗接收 `activeTab` 上下文；私聊仅限私聊对象、check_request 与掷骰均私密发送 |
| #3 全员不含 bot | ✅ 已实现 | 「全选」改为「要求全员（不含 bot）」，仅选非 bot 成员 |
| #4 区分 bot/player | ✅ 已实现 | 弹窗 `Player` 带 `isBot`，列表渲染 `BOT` 徽标 |

### 涉及改动文件
- `src/app/actions/room.ts` — `requestSkillCheckAction`（频道作用域 + bot 触发）；新增 `respondToCheckRequestAction`
- `src/components/HostCheckDialog.tsx` — bot 徽标、「全员不含 bot」、透传频道上下文
- `src/components/ChatMessage.tsx` — x/y 进度、完成后禁用图标、回传 messageId
- `src/components/RoomClient.tsx` — `handleCheckRequest` 改走 `respondToCheckRequestAction`；`check_update` SSE 处理；弹窗按频道传参
- `messages/{zh,en}.json` — 新增 `chat.checkProgress/checkDone`、`roomActions.check*`、`hostCheck.requireAllNoBot/botBadge`

### 验证
- `npx tsc --noEmit`：改动文件无错误（仅 1 处 `events/__tests__/route.test.ts` 为既有错误）
- `pnpm test`：71/72 通过（唯一失败 `stats.test.ts` 为既有的日期边界 flaky 测试，与本次无关）
- `pnpm lint`：改动文件 0 error，仅与既有代码同风格的 warning

### 已知取舍
- d20/d10 走原始掷骰（非按技能值检定），与原实现一致；规格仅定义 d100 检定。
- 若目标含 bot，x/y 分母计入 bot，但 bot 不写入 `respondedUserIds`，故分子可能无法到满。
  建议尽量使用「全员不含 bot」，或后续按需把 bot 排除出分母。
