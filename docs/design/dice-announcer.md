# 设计文档：投娘（掷骰播报 Bot）Dice Announcer

> 状态：设计定稿，待实现。
> 本文档面向实现者（Claude Code），所有文件路径、函数名、字段名均已对照当前代码核实。

## 1. 需求

房主可在房间设置中指定一个**已在本房间内的 bot** 作为"投娘"（掷骰播报员）。开启后：

1. 玩家的每一次掷骰——无论来自命令（`.r/.rd/.rc/.ra/.sc/.rh/.rch/.rah`）、🎲 骰子面板、快速检定面板（◎），还是响应房主的检定请求——其结果卡片改由投娘的视觉身份呈现。
2. 播报卡片相比原始玩家卡片，额外展示**投掷者的玩家昵称**，以及一句**简短的骚话**（对结果的人格化评价）。
3. 主持人的暗投（`.rh` 等，audience `self`）遵循同样逻辑，可见性不变（仍只有投掷者可见）。
4. 房间里没有 bot 时不能开启；被指定的 bot 被删除时功能自动关闭。
5. 投娘失去响应时平滑降级：LLM 不可用→用预置语料池骚话；bot 本身失效→回到普通玩家卡片。

骚话生成策略（已定稿）：**LLM 为主 + 语料池兜底**。
卡片时序（已定稿）：**瞬发卡片 + 异步补骚话**（骰子卡片零延迟送达，骚话稍后通过 SSE 补丁写入）。

## 2. 核心架构决策（务必遵守）

### 2.1 消息归属不换人，只换"皮"

**绝对不要**把骰子消息的 `actorUserId` 改成投娘。可见性系统（`audience: self/dm/gm`，`src/lib/messaging/audience.ts` 的 `canSee`）、检定请求的 `respondedUserIds` 记账、客户端"自己的骰"判定全部键在 `actorUserId` 上；换人会导致暗投对投掷者不可见等严重问题。

正确做法是沿用 `proxiedBy` 的先例（`commands.ts` 的 `attachProxy`，把展示元数据塞进 `diceDetail`）：消息仍归属玩家，`diceDetail` 追加：

```jsonc
{
  // ……原有骰子字段不变……
  "announcer": {
    "userId": 42,          // 投娘的 botUserId
    "nickname": "投娘小幸", // 投娘在本房的 roomMembers.nickname（写入时快照）
    "quip": "……",          // 骚话；初始派发时不存在，异步补丁写入
    "quipPending": true     // 初始 true；补丁写入 quip 时置 false/删除
  }
}
```

客户端检测到 `announcer` 字段时把卡片渲染成投娘的视觉身份（见 §7）。降级 = 不附加该字段 = 与现状完全一致的玩家卡片。

### 2.2 骚话生成不走 `runAgent`

`runAgent`（`src/lib/ai_agent.ts`）是带 5 轮工具循环、历史摘要、上下文构建、3 秒防风暴冷却的重型 agent，不适合每骰一次的高频场景。新建独立轻量模块 `src/lib/dice-announcer.ts`（§5），单次 completion、无工具、硬超时。**现有 `agentCooldowns` 冷却机制完全不动、不复用。**

顺带说明：骰子消息不会误触发投娘 bot 的 @提及路径——`sendMessageAction` 的 bot 激活检查只对 `type === "text"` 生效，且命令分支在此之前已 return（`src/app/actions/room.ts` ~L280-330），无需额外处理。

### 2.3 两阶段送达

- **阶段一（同步，零延迟）**：掷骰照常执行，派发时 `diceDetail` 已带 `announcer`（含 `quipPending: true`）。卡片立即出现，以投娘身份呈现，暂无骚话。
- **阶段二（异步，fire-and-forget）**：后台生成骚话（LLM 优先，超时/失败降级语料池），`db.update(messages)` 把 `quip` 合并进该消息的 `diceDetail`，并广播 `dice_quip_update` SSE 事件让在线客户端就地补丁。语料池兜底保证 quip 最终必有值。

## 3. 数据库

`src/db/schema.ts` 的 `rooms` 表新增一列（模式照抄同表的 `backgroundId`）：

```ts
// 投娘：被指定为掷骰播报员的 bot 用户。null = 功能关闭。
// set null 级联：删除 bot（users 行）时自动关闭播报，不留悬空引用。
diceAnnouncerBotId: integer('dice_announcer_bot_id')
  .references(() => users.id, { onDelete: 'set null' }),
```

无需新表。迁移：`pnpm db:push`（交互模式若出现 ai_token_usages truncate 提示答 No，见 CLAUDE.md）。

## 4. 服务端：注入点

所有掷骰派发只有两个咽喉点，都要注入：

### 4.1 `src/lib/commands.ts` → `emitCommandMessage`（~L106）

4 个 dice 调用点（`.r` 系 ~L262、表达式掷骰 ~L304、`runRuleCheck` 检定 ~L721、`.sc` 理智 ~L814）全部经过它。在 `emitCommandMessage` 内部对 `type === "dice"` 做注入：

```ts
// type === "dice" 时：
const ann = await resolveAnnouncer(roomId, userId); // §5.1；非骰子消息不查
const finalDetail = ann ? attachAnnouncer(diceDetail, ann) : diceDetail;
const msg = await dispatchMessage({ ...原参数, diceDetail: finalDetail });
if (ann && msg) {
  // fire-and-forget，绝不 await —— 骚话失败不能影响掷骰
  scheduleQuip({ roomId, messageId: msg.id, announcer: ann, roll: {...} }).catch(console.error);
}
return msg;
```

`attachAnnouncer` 写在 `dice-announcer.ts`，模式照抄 `attachProxy`（defensive JSON parse，失败原样返回）。`announcer` 与 `proxiedBy*` 可以共存（代投 + 播报同时成立）。

### 4.2 `src/app/actions/room.ts` → `rollDiceAction`（~L364）

🎲 面板路径，不经过 `executeCommand`。同样调 `resolveAnnouncer` / `attachAnnouncer` / `scheduleQuip`。逻辑与 4.1 完全一致，共享 `dice-announcer.ts` 里的实现，不要复制粘贴。

### 4.3 覆盖面确认（实现时自测）

- 快速检定面板（◎）：拼 `.rc` 命令走 `sendMessageAction` → `executeCommand` → 4.1 覆盖，无需改 `QuickCheckPanel.tsx`。
- 响应检定请求（玩家点击/房主代投）：`respondToCheckRequestAction` 内部走 `executeCommand` 或 `rollDiceAction` → 已覆盖。
- bot 自己的掷骰（`respond_check`/`roll_skill_check`/`roll_dice` 工具、投娘本人）：**跳过播报**（`resolveAnnouncer` 对 roller 是 bot 时返回 null，§5.1），避免自吹自擂。
- `.st`、`.help` 等非 dice 消息：不受影响。

## 5. 新模块 `src/lib/dice-announcer.ts`

集中放：announcer 解析、diceDetail 打标、quip 生成（LLM + 语料池 + 熔断 + 限流）、补丁广播。**纯逻辑部分（语料池选取、熔断状态机、attachAnnouncer/mergeQuip）拆成无 DB 依赖的纯函数**，配套 vitest（`src/lib/__tests__/dice-announcer.test.ts`）。

### 5.1 `resolveAnnouncer(roomId, rollerUserId)`

```
返回 { botUserId, nickname, botConfigJson } | null
null 条件（任一）：
  - rooms.diceAnnouncerBotId 为 null
  - roller 自己是 bot（users.isBot，含投娘本人）
  - 指定的 bot 已不是本房成员，或 users.isBot 已为 false（脏配置防御）
```

实现：`rooms` ⟕ `users` ⟕ `roomMembers` 一次 join 查询。**注意**：这条查询会出现在每次掷骰的热路径上，保持单查询；未开启播报的房间（`diceAnnouncerBotId IS NULL`）要最快短路。

### 5.2 `scheduleQuip(ctx)` — 异步骚话流水线

输入上下文：`{ roomId, messageId, announcer, roll: { rollerNickname, skillName?, notation, resultText, grade? , hidden } }`。`grade` 是规则模块的 `VisualGrade`（`"critical" | "success" | "failure" | "fumble"`，见 `src/lib/rules/types.ts` L123 与 `commands.ts` 的 `gradeDisplay`）；纯表达式掷骰（`.r 3d6`）没有 grade，传 null。

流水线（顺序执行，任何一步失败落到下一层）：

1. **限流检查**：房间令牌桶（§5.4）无余量 → 直接语料池。
2. **熔断检查**：熔断器 open → 直接语料池。
3. **LLM 生成**：
   - 从 `announcer.botConfigJson`（复用 `ai_agent.ts` 的 `parseBotConfig`，或导出它）取 `providerId`/`model`/`systemPrompt`。providerId 缺失、provider 行不存在、全局 `ai_enabled !== "true"`、共享 provider 且房主点数耗尽（判定逻辑照抄 `runAgent` L254-287）→ 语料池。
   - 单次 `{endpoint}/chat/completions` 调用：复用 `fetchWithBackoff` 但 `maxRetries = 1`（补骚话不值得重试烧钱），外层用 `AbortController` 包 **2500ms 硬超时**。
   - prompt：system = bot 的 `systemPrompt` + 固定后缀指令（"你是掷骰播报员。用一句话（≤40字）点评这次掷骰结果，符合你的人设。只输出这一句话，不要复述数字以外的编造内容。使用与玩家相同的语言。"）；user = `玩家「{rollerNickname}」投掷 {skillName?} {notation}，结果：{resultText}（{grade 的本地化文案}）`。`max_tokens: 80`。
   - 记账：`recordTokenUsage(room.hostId, provider.id, ...)`（同 `runAgent`）。
   - 输出清洗：trim、截断 60 字符、`checkSensitiveWords` 命中 → 丢弃转语料池。
   - 成功 → 熔断器记 success；失败/超时 → 记 failure。
4. **语料池兜底**：按 `grade`（null 归入 "plain" 组）从 i18n 语料池随机抽一句（§5.5）。
5. **写库 + 广播**（§6）。

### 5.3 熔断器

照 CLAUDE.md 的 globalThis 强制约定（多 worker 共享，同 `agentCooldowns`/EventEmitter 模式）：

```ts
declare global { var __quipBreaker: Map<number, { fails: number; openUntil: number }> | undefined; }
```

Key = botUserId。连续 **3** 次 LLM 失败 → open **5 分钟**（期间纯语料池，不再为每骰白等超时）；期满半开放行一次探测。纯函数状态机 + 测试。

### 5.4 限流（成本控制，非冷却）

Key = roomId，globalThis 令牌桶：容量 **3**，回填 **1 枚/2 秒**。群体检定 5 人齐投时前 3 个走 LLM、其余走语料池，不排队不丢播报。常量放在 `dice-announcer.ts` 顶部（CLAUDE.md：长度/上限常量与 feature 常量同住 `src/lib/`）。

### 5.5 语料池

i18n 键 `messages/{zh,en}.json` → `diceAnnouncer.quips.{critical|success|failure|fumble|plain}.{0..5}`（每组 6 句），服务端 `getTranslations` 取，随机下标纯函数化（注入 `Math.random` 以便测试）。语料风格：轻佻但不越界（会过敏感词的场景是 LLM 输出，语料池是我们自己写的，直接写安全的）。**注意语料池路径让任何 bot 都能当投娘——即使它没配 AI provider，功能照常工作，只是永远用预置台词。这是有意的特性，文档/UI 提示里说明。**

## 6. 补丁写库 + SSE 事件 `dice_quip_update`

quip 就绪后：

1. 重读该 `messages` 行，defensive parse `diceDetail`（同 `ai_agent.ts` respond_check 的防御性重读模式，L789-796），合并 `announcer.quip`、去掉 `quipPending`，`db.update`。行已被删/parse 失败 → 静默放弃。
2. 广播（`src/lib/events.ts` 的 `broadcastToRoom`）：

```ts
broadcastToRoom(roomId, {
  type: "dice_quip_update",
  messageId: msg.id,        // ⚠️ 不要放在 `id` 字段——SSE 按 id 去重，
                            // 原消息已投递过同 id 会被丢弃（见 room.ts L607 NOTE，
                            // check_update 同样的坑）
  quip,
  audience: msg.audience,   // 镜像原消息的可见性三元组，SSE 端的 canSee
  userId: msg.userId,       //   过滤器（events/route.ts L111-116）自动保证
  targetUserId: msg.targetUserId, // 暗投/DM 的骚话补丁只发给应见者
});
```

## 7. 客户端

### 7.1 `src/components/room/hooks/useRoomEvents.ts`

新增 `dice_quip_update` 分支，照抄 `check_update` 处理（L79-98）：按 `messageId` 定位消息，parse `diceDetail`，写入 `announcer.quip`、清 `quipPending`，`setMessages` 替换。离线用户无需特殊处理——重进房走全量拉取，读到的已是落库后的完整 diceDetail。

### 7.2 `src/components/room/chat/ChatMessage.tsx`

dice 气泡解析 `diceDetail` 处（~L1629 附近已解析 `proxiedByNickname`）读取 `announcer`：

- **视觉身份**：头像与发送者名显示为投娘（头像用 `announcer.userId` 从成员表查——房间成员头像数据客户端已有，同现有头像回退逻辑：无头像则字母色块）。名字旁加小徽章「播报」（i18n），样式参考 `proxyRolledBy` 芯片（~L1727）。
- **玩家名**：卡片内容区首行显著展示投掷者昵称（消息自身的 `nickname` 就是玩家昵称，直接用），如「**阿岚** 的检定」。
- **骚话**：卡片底部一行斜体/弱化样式；`quipPending` 时渲染一个轻量占位（三个点的呼吸动画即可，不要 spinner），收到补丁后替换。极端情况下补丁丢失（SSE 断线错过、进程崩溃），占位不能永久呼吸——挂载 8 秒后自动隐去占位，仅当后续收到补丁或重进房时再显示 quip。
- **不变项**：气泡左右对齐、「自己的消息」判定、检定响应按钮禁用逻辑等一切基于 `msg.userId` 的行为保持原样（归属仍是玩家）。
- 全部用语义 Tailwind token（`bg-surface` / `text-text` / `border-border` 系），禁止硬编码颜色（CLAUDE.md 约定）。

## 8. 设置入口

### 8.1 Server action（`src/app/actions/room.ts`）

新增 `setDiceAnnouncerAction(roomId: number, botUserId: number | null)`：

- 权限：房主。按 CLAUDE.md 错误约定：**不要裸 throw**，包一层（照抄 `background.ts` 的 `requireRoomHost` 模式），返回 `{ success: true } | { success: false, error }`，error 用服务端 `getTranslations` 本地化。
- 校验（zod 或手写均可，按约定放 action 边界）：`botUserId !== null` 时——目标 users 行存在且 `isBot === true`，且是本房 `roomMembers` 成员；否则拒绝。
- 写 `rooms.diceAnnouncerBotId`，广播 `room_settings_updated`（现有事件，客户端已处理刷新），`revalidatePath`。

### 8.2 UI（`src/components/room/RoomSettings.tsx`）

新增设置项（放在现有常规设置区，或与背景图 tab 并列，实现者依现有 tab 结构就近安排）：

- 开关 + bot 下拉（数据源 `getRoomBotsAction`，已有）。房间无 bot 时开关禁用并显示提示「房间内没有 bot，先在 Bot 管理中创建」（i18n）。
- 选中的 bot 被删除后（FK 置 null），下次打开设置显示为关闭状态——无需额外处理，读库即所见。
- 辅助文案说明：未配置 AI provider 的 bot 也可担任，将使用预置台词。
- 确认/提示遵循约定：不用 `alert/confirm`，用 `ConfirmDialog` / `Notice`。

### 8.3 i18n

`messages/zh.json` + `messages/en.json` 同步新增：设置区文案、「播报」徽章、语料池 `diceAnnouncer.quips.*`。跑 `scripts/check-i18n.ts` 验证键对齐。

## 9. 需求 5 的降级矩阵（验收对照）

| 故障 | 表现 |
| ---- | ---- |
| LLM 超时 / provider 报错 / 点数耗尽 / AI 全局关闭 | 卡片仍为投娘播报，骚话来自语料池 |
| 连续 3 次 LLM 失败 | 熔断 5 分钟，期间语料池直出（无超时等待） |
| 骚话命中敏感词 | 丢弃，语料池替换 |
| 投娘 bot 被删除 | FK 置 null，之后所有骰回到普通玩家卡片 |
| 投娘退出房间 / isBot 脏数据 | `resolveAnnouncer` 返回 null → 普通玩家卡片 |
| 补丁 SSE 丢失 | 占位 8s 自动隐去；落库成功则重进房可见 quip |
| 掷骰高频突发 | 限流：超额部分语料池，播报不丢 |

## 10. 实现顺序（建议的 commit 粒度）

1. schema 列 + `pnpm db:push`。
2. `src/lib/dice-announcer.ts` 纯逻辑（attachAnnouncer/mergeQuip/熔断/限流/语料池选取）+ vitest。
3. `resolveAnnouncer` + 两个注入点（`emitCommandMessage`、`rollDiceAction`），先只打标不生成 quip——此时卡片已能以投娘身份渲染（配合步骤 5 联调）。
4. `scheduleQuip` LLM 流水线 + 写库 + `dice_quip_update` 广播。
5. 客户端：`useRoomEvents` 分支 + `ChatMessage` 播报变体。
6. `setDiceAnnouncerAction` + `RoomSettings` UI + i18n（含语料池文案）+ `check-i18n`。
7. 手工验收 §9 矩阵 + §4.3 覆盖面清单（命令 / 面板 / 快速检定 / 检定响应 / 暗投 / DM / 代投共存 / bot 掷骰跳过）。

## 11. 明确不做（本期范围外）

- 不新增 activation 类型、不改 `runAgent` / `agentCooldowns`。
- 不做投娘对掷骰的"追问式"互动（那是 @提及路径的既有能力）。
- 不做骚话的历史上下文感知（连续大失败梗等）——留待后续把最近 N 次结果摘要塞进 prompt，本期 prompt 只含单次掷骰。
- 不改 `docs/spec/command_spec.md`（命令语法零变化）。
