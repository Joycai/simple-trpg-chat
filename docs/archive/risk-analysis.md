# 🔍 Simple TRPG Chat — 风险分析报告

> **日期**: 2026-06-08 &emsp; **分支**: `hot-fix` &emsp; **审阅对象**: 全体开发者

基于对项目代码的全面审查，以下是按优先级分类的风险点及修复建议。

---

## 🔴 高风险 (Security / Data Safety)

### R1. Bot 工具调用中的 SQL LIKE 拼接

**文件**: `src/lib/ai_agent.ts:355`

```typescript
sql`${messages.content} LIKE ${'%' + query + '%'}`
```

`query` 直接来自 AI 模型的 tool call 返回值。如果 AI 端点被攻破或模型产生恶意输出，可能被利用进行 SQL 注入。

**建议修复**:
```typescript
// 1. 先清洗 query 中的特殊字符
const sanitized = query.replace(/[%_]/g, '\\$&');
// 2. 使用参数化
sql`${messages.content} LIKE ${'%' + sanitized + '%'}`
```

---

### R2. 加密密钥在非生产环境回退到硬编码值

**文件**: `src/lib/encryption.ts:51-63`

```typescript
function getEncryptionKey(): Buffer {
  const rawKey = process.env.AI_ENCRYPTION_KEY;
  if (!rawKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AI_ENCRYPTION_KEY environment variable is missing!");
    }
    return crypto.scryptSync("dev-secret-key", "salt", 32); // ⚠️ 硬编码
  }
  return crypto.scryptSync(rawKey, "salt", 32);
}
```

如果生产部署时忘记设置 `AI_ENCRYPTION_KEY` 环境变量，且 `NODE_ENV` 未被正确设置为 `"production"`，API Key 将使用硬编码的开发密钥加密，等同于明文存储。

**建议修复**: 去掉环境判断，只要缺少环境变量就拒绝启动；开发环境通过 `.env.local` 提供。

---

### R3. 密钥派生的 Salt 为静态值

**文件**: `src/lib/encryption.ts:58,62`

```typescript
crypto.scryptSync(rawKey, "salt", 32);
```

所有加密密钥派生使用相同的固定 salt `"salt"`，降低了暴力破解和彩虹表攻击的难度。

**建议修复**: 从环境变量读取独立的 salt，或使用随机生成并持久化的 salt。

---

### R4. Bot 账号凭据可预测

**文件**: `src/app/actions/bot.ts:32-33`

```typescript
const botUsername = `bot_${crypto.randomBytes(4).toString("hex")}`;
const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
```

Bot 用户名格式为 `bot_<8位hex字符>`，搜索空间仅 2^32，可被枚举。虽然在 Credentials provider 中并未阻止 bot 登录，但攻击者可遍历用户名尝试撞库。

**建议修复**: 在 `authorize()` 回调中增加判断——`isBot === true` 的用户直接返回 `null`，禁止凭证登录。

---

### R5. SSE 端点缺乏连接数限制

**文件**: `src/app/api/rooms/[id]/events/route.ts`

- 无 per-user 连接数限制
- 无全局连接上限
- 恶意用户可创建大量 SSE 连接耗尽文件描述符和内存

**建议修复**: 引入基于 userId 的连接计数（利用 `events.ts` 中的 EventEmitter 可统计 listener 数量），超过阈值（如 3 个/用户）时拒绝新连接。

---

## 🟡 中风险 (Architecture / Reliability)

### R6. 进程内 EventEmitter — 无法水平扩展

**文件**: `src/lib/events.ts`

整个实时消息系统基于 Node.js 进程内 `EventEmitter`：

| 限制 | 影响 |
|------|------|
| 只能单进程部署 | 无法横向扩展应对多用户 |
| 进程重启丢失所有连接 | SSE 客户端全部断开需重连 |
| 无消息持久化队列 | 重启窗口内的消息可能丢失推送 |
| `setMaxListeners(1000)` | 硬编码上限，超过后 Node.js 会打印警告 |

**建议**: 当前用户量下可接受。如果计划扩展，考虑引入 Redis Pub/Sub 作为 EventEmitter 的后端。

---

### R7. Bot 之间无互相激活防护 — 潜在的无限对话循环

**文件**: `src/app/actions/room.ts:173-193`, `src/lib/ai_agent.ts:241`

```
用户 @mention BotA → BotA 调用 send_message 工具回复 → 消息写入
  → sendMessageAction 中检查 @mention → 如果 BotA 回复中 @mention 了 BotB
    → 触发 BotB → BotB 回复 → 再次触发 BotA → ...
```

虽然单个 bot 的 `while (iterations < 3)` 限制了工具调用轮次，但 bot 之间跨调用链的互相触发没有全局保护。

**建议修复**:
1. 全局 bot 冷却时间（如 5 秒内同一 bot 不重复激活）
2. Bot 消息中跳过 `@mention` 检测
3. 增加全局递归深度计数器

---

### R8. 消息全量加载无分页

**文件**: `src/app/rooms/[id]/page.tsx:70-74`

```typescript
const roomMessages = await db
  .select().from(messages)
  .where(eq(messages.roomId, roomId))
  .orderBy(messages.createdAt);
// 无条件加载全部历史消息
```

长期会话中消息可达数千条：
- **服务端**: 单次查询返回全量数据，内存和序列化开销大
- **客户端**: `RoomClient.tsx` 中 `messages` state 无限增长，React diff 越来越慢

**建议修复**: 实现游标分页——初始加载最近 100 条，向上滚动时加载更早的消息。

---

### R9. AI API 调用无速率限制

**文件**: `src/lib/ai_agent.ts:244`, `src/app/actions/room.ts:176-193`

Bot 激活完全无冷却：
- 用户反复 @mention bot 可快速消耗宿主 AI API 额度
- 私聊 bot 同样没有限制
- 没有请求失败后的退避重试策略

**建议修复**:
1. 在 `users.botConfigJson` 或内存中记录 `lastTriggeredAt`
2. 冷却期内（如 3-5 秒）跳过触发
3. API 调用失败时实现指数退避

---

### R10. SSE 连接生命周期管理

**文件**: `src/components/RoomClient.tsx:238-311`

- `seenIdsRef` 用 `size > 500` 阈值修剪是临时方案，不在根本解决去重问题
- Next.js HMR 开发模式下 `EventSource` 连接累积（即使有 `sseRef.current.close()`）
- `setStatus("error")` 后的重连没有最大重试次数限制

**建议**: 使用 `AbortController` 统一管理 SSE 生命周期，增加最大重连次数。

---

### R11. SQLite WAL 文件可能无限增长

**文件**: `src/db/index.ts:10`

```typescript
sqlite.pragma('journal_mode = WAL');
```

WAL 模式启用后没有设置 `wal_autocheckpoint` 或定期执行 checkpoint。目前 git status 已显示 `sqlite.db-shm` 和 `sqlite.db-wal` 文件。

**建议修复**: 启动时设置 `PRAGMA wal_autocheckpoint = 1000`（每 1000 页自动 checkpoint），或增加定时任务。

---

## 🟢 低风险 (Quality / Maintainability)

### R12. 代码重复 — sendMessage / rollDice 双份实现

**文件**: `src/app/actions/room.ts` vs `src/app/actions/message.ts`

两个文件实现了几乎相同的功能：

| 功能 | `room.ts` | `message.ts` |
|------|----------|-------------|
| 发送消息 | `sendMessageAction()` | `sendMessage()` |
| 投骰子 | `rollDiceAction()` | `rollDice()` |

`message.ts` 似乎是早期版本，未被实际引用但容易造成混淆。

**建议**: 确认 `message.ts` 是否还有调用方，如无则删除。

---

### R13. 类型安全缺失 — 大量 `as any` 类型断言

**文件**: 全局约 20+ 处 `(session.user as any)`

```typescript
// auth.ts:27-30
(session.user as any).role
// auth.config.ts:14
(auth?.user as any).role === "admin"
// 遍布所有 server actions
parseInt((session.user as any).id)
```

NextAuth 的 session.user 类型未做扩展声明。

**建议修复**: 创建 `src/types/next-auth.d.ts`:
```typescript
import "next-auth";
declare module "next-auth" {
  interface User {
    role?: string;
    username?: string;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      username: string;
    } & DefaultSession["user"];
  }
}
```

---

### R14. 错误处理不一致

**位置**: 全局

| 模式 | 示例 | 问题 |
|------|------|------|
| `throw new Error()` | 大部分 server actions | 与 CLAUDE.md 约定冲突 |
| `.catch(console.error)` | `room.ts:190` | 静默吞掉所有错误 |
| `return { success: false }` | `commands.ts` | 只在命令引擎中使用 |

**建议**: 统一使用返回 `{ success, error? }` result 对象的模式，与 CLAUDE.md 保持一致。

---

### R15. 随机数生成实现分散

**位置**: 4 个文件

| 文件 | 函数 | 用途 |
|------|------|------|
| `src/lib/utils.ts:22` | `rollDie()` | 工具函数 |
| `src/lib/commands.ts:121` | 内联 `Math.random()` | 技能检定 |
| `src/app/actions/room.ts:200` | 内联 `Math.random()` | 骰子投掷 |
| `src/lib/ai_agent.ts:279` | 内联 `Math.random()` | Bot 投骰 |

对 TRPG 场景 `Math.random()` 可接受，但分散的实现不利于统一修改（如未来换用 `crypto.randomInt`）。

**建议**: 所有 dice roll 统一调用 `src/lib/utils.ts` 中的 `rollDice()` 函数。

---

### R16. 缺少自动化测试

- `package.json` 中无 `vitest` / `jest` / `playwright` 等测试框架
- 项目中没有 `*.test.ts` 或 `*.spec.ts` 文件
- 无 `test` 脚本

**建议**: 至少覆盖：
- `encryption.ts` — 加解密 round-trip
- `commands.ts` — 指令解析逻辑
- `auth.ts` — 认证流程
- Server actions — 权限校验

---

### R17. Bot 配置 JSON 无 Schema 校验

**文件**: `src/db/schema.ts:55` — `botConfigJson: text`

```typescript
const config = botUser.botConfigJson ? JSON.parse(botUser.botConfigJson) : {};
```

`JSON.parse` 的返回值是 `any`，字段增减无编译时保护，运行时也不做校验。

**建议**: 使用 `zod` 定义 bot config schema，读写时做 parse + validate。

---

### R18. 安全头配置缺失

**文件**: `next.config.ts`

未显式配置 Content-Security-Policy、CORS 等安全头。虽然 Next.js 有默认保护，但对于处理用户生成内容和第三方 API Key 的应用，建议审查并加强。

---

## 📊 风险汇总

| 类别 | 高风险 | 中风险 | 低风险 | 合计 |
|------|:------:|:------:|:------:|:----:|
| 安全 (Security) | 5 | 1 | 1 | **7** |
| 架构/可靠性 (Architecture) | 0 | 5 | 0 | **5** |
| 质量/可维护性 (Quality) | 0 | 0 | 6 | **6** |
| **合计** | **5** | **6** | **6** | **17** |

---

## 🎯 建议修复优先级

### P0 — 立即修复（1-2 天内）

| ID | 问题 | 影响 |
|----|------|------|
| R9 | AI API 无速率限制 | 可能造成经济损失 |
| R2 | 加密密钥回退硬编码 | 生产环境 API Key 泄露 |
| R7 | Bot 之间互相激活 | 可能无限消耗 API 额度 |

### P1 — 本迭代修复

| ID | 问题 | 影响 |
|----|------|------|
| R1 | SQL LIKE 拼接 | 潜在注入风险 |
| R4 | Bot 凭据可预测 | 账号安全 |
| R5 | SSE 无连接限制 | 资源耗尽 |
| R8 | 消息全量加载 | 性能退化 |

### P2 — 下个迭代修复

| ID | 问题 |
|----|------|
| R3 | 静态 salt |
| R6 | EventEmitter 单进程限制 |
| R10 | SSE 生命周期管理 |
| R11 | WAL 文件增长 |
| R12-R18 | 代码质量和可维护性 |

---

*Generated by Claude Code analysis — 2026-06-08*
