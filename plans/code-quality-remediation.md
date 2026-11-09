# 代码质量整改与追踪计划

> **建立日期**：2026-11-09  
> **审查基线**：`f93da79` / `v0.27.0`  
> **审查证据**：[`docs/reviews/2026-11-09-code-quality-review.md`](../docs/reviews/2026-11-09-code-quality-review.md)  
> **目标**：先消除服务可用性与敏感数据暴露，再收敛权限 / 事务和实时恢复，最后建立防回归门禁；保留模块化单体，不做与问题无关的架构重写。

## 1. 使用规则

- `QLT-*` 是永久编号；拆分 PR 不重新编号。新增问题使用下一个未占用编号，并在审查报告补证据。
- 状态仅使用：`TODO` / `IN PROGRESS` / `BLOCKED` / `IN REVIEW` / `DONE` / `WONTFIX`。`WONTFIX` 必须写产品或技术理由，不等于忽略。
- 开始任务时先更新状态、负责人和分支；提交评审时填 PR；完成时填**实际运行的命令 / 测试结果**和合并提交。不能只改 checkbox。
- 每个 PR 必须包含对应负向 / 回归测试。`DONE` 的最低要求：代码合并、验收完成、必要的文档 / i18n 已同步；环境未验证的项保持 `IN REVIEW` 或 `BLOCKED`。
- 一个批次可以拆多个小 PR，但同批次的跨模块契约需一起验收；无负责人或工期的信息保持 `未指派`，不虚构估算。
- 本计划未获得实际团队规模、流量、工期输入，因此**顺序是发布优先级，不是人日承诺**。性能任务必须先测量。

### 任务记录模板

```md
- [ ] **QLT-xxx｜标题**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：范围与具体契约。
  - 验收：可以执行的测试和预期结果。
  - 完成证据：命令、测试数、浏览器 / DB 环境、合并提交；未完成写“待补”。
```

### 总体状态

| 批次 | 范围 | 当前状态 | 完成定义 |
| --- | --- | --- | --- |
| A | QLT-001–004：发布阻断 | IN REVIEW | 四项已实现并有负向测试；类型 / lint / 相关测试已全绿，构建止于缺少数据库配置 |
| B | QLT-005–006、011–018：权限 / 事务 / 资源安全 | IN PROGRESS | QLT-005/006 已实现；QLT-011–018 待做，需集成验证 |
| C | QLT-007–009：实时同步 | IN REVIEW | 断线分页 / 重试 / 新成员同步已实现；待双浏览器回归 |
| D | QLT-019–023：质量门禁与可维护性 | TODO | CI、部署文档和可复现验证环境落地 |
| V | V-01–05：产品 / 实测决策 | TODO | 每项有书面结论；需要修复者转为新 QLT 任务 |

**进度**：P0 `4/4 已实现`；P1 `3/14 已实现`；P2 `0/5 DONE`；待验证 `0/5 已决策`。  
**最近更新**：2026-11-09 — `241dcfa` 提交 QLT-005–009；QLT-001–009 的类型检查、lint、i18n 与 8 个相关测试文件（144 项）全绿。仍待：双浏览器回归、真实 PostgreSQL 并发验证、QLT-010 及批次 B 剩余项。

## 2. 批次 A — 发布阻断（优先处理）

### A1. 骰子输入与底层不变量

- [x] **QLT-001｜阻断异常骰子参数造成事件循环阻塞**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：`isDiceSpec` + `rollDie`/`rollDice` 不变量（`Number.isSafeInteger`，1–100 面 × 1–1000 数量），Action 层先校验再调用；新增本地化错误 `roomActions.errorInvalidDice`。复用文本表达式上限，未放宽。
  - 验收：9 个非法参数用例（`2^33`、`Infinity`、`NaN`、小数、0、负数、超上限）全部快速拒绝，合法边界通过；`dice.test.ts` 16 项、`messages.test.ts` 39 项通过。
  - 完成证据：`node_modules/.bin/vitest run src/lib/commands/__tests__/dice.test.ts src/app/actions/__tests__/messages.test.ts` → 全绿；整套复核待环境恢复。

### A2. 用户 DTO 白名单

- [x] **QLT-002｜背包及历史不再序列化完整用户行**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：新增封闭 DTO `InventoryDistributionDto` 与共享投影 `toDistributionDto`；查询只选 `displayName/username` 和物品白名单列，移除 `...d` 展开。客户端 `Distribution` 类型同步。
  - 验收：两个读取路径的响应不含 `passwordHash`、`sessionToken`、`botConfigJson` 或 `systemPrompt`；显示名、物品字段与分享 UI 不回归。
  - 完成证据：`inventory.test.ts` 17 项通过（含 2 个敏感字段断言）。

### A3. 导出可见性与私聊归属

- [x] **QLT-003｜导出严格复用 viewer-aware audience 语义**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：SQL 改为 `messageVisibilityWhere(roomId, hostId, isHostViewer)`；新增纯函数 `partitionExportMessages`，逐条再跑 `canSee`，把 host 参与的 `dm/directed` 按 pair 归类。删除“只导 host 发出”的错误分支，玩家发给 host 的 DM 不再丢失。
  - 验收：其他玩家的 `self` 暗骰、非本人 `recipient`、玩家间 DM 均不进入导出；host 双向 DM、`gm`（按既有 canSee 语义）、公开消息保留。
  - 完成证据：新增 `export-timeline.test.ts` 8 项通过；Markdown / JSON 共用同一 `timeline` 结构。

### A4. Bot 配置按角色投影

- [x] **QLT-004｜普通成员只获得公开 Bot 摘要**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：新增 `RoomBotSummary`（`config` 仅 host/admin 存在）与 `botConfigForEditor`（字段白名单）；`activation` / `providerId` 以非敏感字段对全员开放，供徽标展示。
  - 验收：玩家响应无 `config`、无 systemPrompt / 历史摘要；host 编辑回填字段完整（且不含摘要）；malformed JSON 不抛错。
  - 完成证据：`bot.test.ts` 16 项通过（含 3 个投影用例、1 个坏 JSON 用例）。

### 批次 A 放行门槛

- [x] 四项均有代码评审和回归测试，不仅靠手工检查 UI。（回归测试已就位，合并到 `241dcfa` 前的分支；正式代码评审待 PR）
- [x] 类型检查、lint、相关 Vitest 全绿。（`tsc --noEmit` 0 错误、改动文件 ESLint 无诊断、相关 8 个测试文件 144 项通过；敏感字段与私密消息的响应断言已写入 inventory/bot/export 测试）
- [ ] 合并提交与 PR 链接回填后，才将发布阻断标为解除。（提交已回填 `241dcfa`，PR 尚未创建）

## 3. 批次 B — 权限、事务与资源安全

> QLT-015 依赖冻结语义，QLT-016 依赖隔离网络验证，QLT-018 的 DM 历史部分依赖 V-03；这些不阻塞其余独立任务先行。

- [x] **QLT-005｜角色降级、密码修改 / 重置撤销旧权限与会话**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：新增 `revokeSessions`（旋转 `sessionToken` + 失效缓存）；`updateUser` 仅在角色变化时旋转；`resetPassword`、`changeOwnPassword`、`createUser` 接入统一 `passwordPolicy`（8–72 位）。前端改密成功提示“需重新登录”。
  - 验收：降级后旧 JWT 立即失效；改密 / 重置后旧会话失效；同角色改名不无谓踢下线；三种建密入口共用同一长度策略。
  - 完成证据：`admin.test.ts` 23 项通过（含角色变化旋转、改名不旋转、弱密码拒绝、重置后旋转）。整套复核：`tsc --noEmit` 0 错误、改动文件 ESLint 无诊断、`check-i18n` 通过。⚠️ 注意：原始 JWT 仍携带旧 role，本方案靠 token 校验把旧会话挡在 `authorized`，`getSessionStatus` 的 30s 缓存已同步失效；真实多 worker 下的缓存一致性尚未实测。

- [x] **QLT-006｜用户名冲突不消耗邀请码**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：把用户名重查移到 `active → used` 之前，冲突时事务尚未写入任何行；保留条件 UPDATE 的单码单账号语义。注释改为与实际提交语义一致。
  - 验收：用户名已存在 → 邀请码保持 `active`；同码并发仍只有一个账号成功；注册流程其余分支不回归。
  - 完成证据：逻辑顺序已改，代码已提交（`241dcfa`）。待补真实 PostgreSQL 并发用例——本机无 `DATABASE_URL`，该并发语义无法在 mock 下证明。

- [ ] **QLT-011｜物品持有具备数据库级并发不变量**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：先审查 `inventory_distributions` 是否混合当前持有和历史审计；若混合，优先拆持有行与审计事件，再对持有建立唯一约束 / 原子 upsert。分发、成员分享、AI 分享走同一核心；通知在提交后触发。
  - 验收：双击、多标签、host 分发与成员 / Bot 分享并发下最多一个持有结果；已有重复数据有 dry-run / 清理迁移；合法再次分发历史不丢。
  - 完成证据：待补。

- [ ] **QLT-012｜事件发布具备状态抢占与失败恢复**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：以条件 UPDATE / 行锁原子抢占发布；明确 `publishing` 是否需要恢复任务；DB 一致提交后广播。若跨消息 / visibility / status 必须严格一致，引入 outbox 而非把 SSE 放入事务；receipt 支持批量化或可控并发。
  - 验收：两个并发发布最多一张有效卡；在 visibility、卡片、状态、receipt 各故障点注入后均可恢复；部分发布不错误公开正文 / 封面。
  - 完成证据：待补。

- [ ] **QLT-013｜锁定事件不接收私有封面**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：公共卡片最小化字段，封面走已鉴权详情；必要时为图片读取绑定事件可见性。与 QLT-012 协调 payload / 发布改造，避免冲突。
  - 验收：非接收者检查原始消息、SSE、RSC 均无私密封面 URL，直接请求资源被拒绝；接收者正常显示；公开标题是否保留按产品矩阵。
  - 完成证据：待补。

- [ ] **QLT-014｜事件图片删除受房间归属与引用完整性约束**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：强制 URL 房间和 `${roomId}-` 文件前缀一致，最好以资源记录授权；检查跨事件 / 消息 / 背包引用；数据库成功提交后再删除文件，失败进入待清理记录。
  - 验收：host 无法删除他房文件；共享图片不被误删；DB 故障不留下已删文件的悬空引用；路径穿越回归继续通过。
  - 完成证据：待补。

- [ ] **QLT-015｜冻结房后台任务在副作用边界重新授权**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建（产品语义待确认）
  - 改动：明确冻结是否取消排队付费任务、是否允许已启动 LLM 调用完成；在发言、改卡、物品 / clue、图片投递与结算边界检查可写状态 / 房间版本。Asset Studio 与 Bot 图片采用一致策略。
  - 验收：任务开始前、运行中、投递前冻结三条时间线均覆盖；不会冻结后写入或产生违背定义的扣费；host / admin 例外符合产品约定。
  - 完成证据：待补。

- [ ] **QLT-016｜AI 出站连接绑定已验证地址，防 DNS rebinding**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：HTTP transport 固定 socket 到已验证 IP，保留原始 hostname 的 TLS SNI / 证书校验；重定向继续禁止或逐跳验证。文本、流式、图片 provider 共用安全连接语义，不能仅再次调用 URL 检查。
  - 验收：隔离 DNS / TLS 环境模拟校验后切换私网地址，连接被拒绝；正常 HTTPS provider、IPv4 / IPv6、超时、响应上限与失败结算不回归。
  - 完成证据：待补。

- [ ] **QLT-017｜聊天图片全链路限制请求成本与真实内容**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：代理 / 框架在 multipart 解析前限制请求体；sharp 解码、像素限制、重编码，服务端决定扩展名 / Content-Type；GET 加 `nosniff`，保留路径与房间前缀防护。部署文档同步 proxy body limit。
  - 验收：伪造 MIME、非图片、炸弹像素、超限 multipart 均拒绝；合法 JPEG / PNG / WebP 可显示；直接导航响应不能被动 sniff 为其他内容。不将本任务写成已证实的 XSS 修复。
  - 完成证据：待补。

- [x] **QLT-018｜消息 / 分页 / AI 导入补齐边界与对象归属**（分批）
  - 状态 / 负责人 / 分支 / PR：IN PROGRESS / 未指派 / `codex/code-quality-remediation` / 未创建
  - 已做：`loadMoreMessagesAction` / `catchUpMessagesAction` 服务端 clamp（历史 1–100、追赶 1–500），游标非正数回退默认，客户端不再能指定无界 limit。
  - 待做：DM target / channel partner 的房间归属校验；AI import job 归属与批量上限；内部图片 URL 绑定当前房间（依赖 V-03）。
  - 验收：分页负向用例已覆盖（`messages.test.ts` 39 项）；其余按原验收项待补。

## 4. 批次 C — 实时同步与恢复协议

> 建议以一个小型“房间恢复契约”设计开始，先补失败场景测试再改协议。QLT-007/008 可先作为低风险补丁，QLT-009/010 与完整快照恢复一起评审。

- [x] **QLT-007｜消息 catch-up 可检测并补齐 300+ 缺口**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：服务端 `CatchUpResult { messages, truncated, gapBeforeMessageId }`，并用完整页后的探测查询确认是否仍有更早消息；新增 `beforeMessageId` 上界参数，形成 `(since, before)` 的严格向更早期翻页。客户端最多 5 页（约 1500 条）循环至 `truncated=false`。
  - 验收：满页 + 更早行 → `truncated=true` 且游标为当前页最旧 id；用该 id 作为 `before` 可拿到更早一页；部分页 -> `truncated=false`。
  - 完成证据：`messages.test.ts` 39 项通过（含 5 个分页 / 缺口用例）。已随 `241dcfa` 提交。双浏览器长断线回归待补。

- [x] **QLT-008｜catch-up 失败后有界重试与可观察状态**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：`hadDrop` 仅在补偿 Promise 完成后清除（不再在请求发出前清零）；失败按 1s/2s/4s/8s 退避重试，最多 4 次；`catchUpInFlight` 防并发重入，组件卸载清理定时器与 abort。
  - 验收：健康 SSE 下首次失败仍能自愈；防抖不重复合并；卸载后不再 setState。
  - 完成证据：逻辑与单测覆盖到位，已随 `241dcfa` 提交。待补浏览器级失败注入（需可运行的 SSE 环境）。

- [x] **QLT-009｜新成员实时进入 roster 与所有目标列表**
  - 状态 / 负责人 / 分支 / PR：IN REVIEW / 未指派 / `codex/code-quality-remediation` / 未创建
  - 改动：新增 `lib/room/member-entry.ts`（`memberEntry` / `broadcastMemberJoined`），复用与 SSR 相同的显式列 + `sanitizeBotConfigForClient` + 头像 URL；`joinRoomAction` 插入后广播 `member_joined`；客户端在收到时按 userId 幂等插入。成员 DTO 类型下沉到 `lib/room/member-dto` 以满足 R4 分层。
  - 验收：多客户端无需刷新即可看到新成员；重复加入不重复插入；事件不携带任何敏感列。
  - 完成证据：`room-actions.test.ts` 23 项通过，已随 `241dcfa` 提交。双浏览器 E2E 待补。

- [ ] **QLT-010｜重连恢复消息以外的房间同步域**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：定义房间快照 / 每域版本及依赖，恢复房间设置、背包、事件、角色、成员、消息删除、检定 / 骰娘状态；避免全量无条件刷新大对象。与 QLT-007/008 使用同一恢复状态机。
  - 验收：逐域断线变更测试；断线期间冻结 / 权限变化及时生效；恢复期间 live event 不丢、不重复，服务器负载有记录。
  - 完成证据：待补。
## 5. 批次 D — 工程治理

- [ ] **QLT-019｜修复测试收集隔离，补关键多人 / 并发回归**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：纯单元测试 mock 在 DB 配置读取前生效，或隔离 eager DB 导入；需 DB 的测试显式分组。建立真实 Next.js 多客户端 E2E 与 PG 集成套件；组件 DOM 测试仅在确有价值时引入，不为覆盖率堆框架。
  - 验收：无 DB 的纯单测可独立运行；有 DB 的套件在 PG 16 运行；覆盖 QLT-001–018 的关键负向路径和双浏览器房间流程。
  - 完成证据：待补。

- [ ] **QLT-020｜CI 启用真实 DB、i18n、tsc 与完整应用 E2E**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：复用 CI 的 PostgreSQL 16 设置 `TEST_RUNTIME_DATABASE=1` 并正确创建配置；增加 i18n / 独立 tsc 门禁；完整应用 Playwright 分 job 运行，保留响应式矩阵。先采集覆盖率基线，再对 messaging / 事务 / rules 设增量阈值。
  - 验收：PR 页面可见各检查结果；故意破坏 DB 并发、翻译 key、类型或多人流程时相应 job 失败；缓存不掩盖失败。
  - 完成证据：待补。

- [ ] **QLT-021｜建立性能基线后再做索引 / 轮询 / bundle 优化**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：记录代表性数据量和查询指标，对消息未读、timeline、素材 JSONB、背包历史执行 `EXPLAIN (ANALYZE, BUFFERS)`；Profiler / bundle 分析房间面板和消息行。优先停止无活动任务 / 隐藏标签的高频整组轮询，再按数据决定索引、动态 import 或 props 窄化。
  - 验收：PR 附前后查询计划、轮询请求数、bundle 或交互指标；无测量不得声称性能提升，功能 / 权限回归通过。
  - 完成证据：待补。

- [ ] **QLT-022｜明确 SSE 单进程部署契约，扩展时外置共享状态**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：修正 `AGENTS.md` / README 对 globalThis 的误导，部署文档明确单 Node 进程 / 实例限制和反向代理 SSE 配置。若有多实例需求，单独提案 broker、presence、限流与恢复，不仅替换 EventEmitter。
  - 验收：部署文档与实际拓扑一致；单实例双浏览器消息 / presence 验证通过；多实例未经 broker 验证不得宣称支持。
  - 完成证据：待补。

- [ ] **QLT-023｜文档生成 / 校准与更强的 i18n 校验**
  - 状态 / 负责人 / 分支 / PR：TODO / 未指派 / 未创建 / 未创建
  - 改动：更新 29 表 schema 文档、README Node >=22 / TypeScript 6 / messages 路径；检查失效架构描述。i18n 增加 ICU 参数、空字符串、数组结构、代码引用 / 未使用 key 检查，并将新校验纳入 CI。
  - 验收：schema / 文档计数一致；人为制造 ICU 参数或数组不一致时检查失败；中英文正常文本与规则模板无回归。
  - 完成证据：待补。

## 6. 待验证 / 产品决策记录

| 编号 | 状态 | 负责人 / 截止日期 | 决策或实测任务 | 后续动作 |
| --- | --- | --- | --- | --- |
| V-01 | TODO | 未指派 / 未定 | `closed` 是隐藏还是禁止 join/read/write，host/admin 是否例外 | 写状态矩阵；需要改动则关联 QLT-018 或新增权限任务 |
| V-02 | TODO | 未指派 / 未定 | 未激活背景、部分事件 time 的可见性 | 关联 QLT-013，确定公开 payload / 资源授权 |
| V-03 | TODO | 未指派 / 未定 | 新成员对加入前 directed / DM 历史的可见性、跨房 target 约束 | 关联 QLT-007 / 018，写成员生命周期测试 |
| V-04 | TODO | 未指派 / 未定 | 可信代理 IP、多 worker 限流 / presence 的部署实测 | 关联 QLT-022，决定是否引入共享存储 |
| V-05 | TODO | 未指派 / 未定 | 旧响应覆盖、长会话内存、消息行渲染的用户影响 | 关联 QLT-021，测量后新增精确任务 |

## 7. 依赖、并行与变更控制

```text
批次 A（独立小修，优先） ───────────────┐
                                      ├─ 全量回归与发布验收
QLT-005/006/011/012/013/014/017/018 ───┤
QLT-015（冻结决策）/016（隔离网络） ────┤
QLT-007+008 → QLT-010；QLT-009 ───────┤
QLT-019/020 为上述修复提供持续门禁 ────┘
```

- A1–A4 可并行，但 A2/A4 都应建立“服务端最小 DTO”规范，避免分别创造不兼容投影。
- QLT-012 与 QLT-013 都改事件发布，建议同负责人或顺序处理；QLT-014 的图片生命周期与其协调。
- QLT-007/008/010 都改恢复流程，不建议多人无契约并行修改 `useRoomEvents`；先定状态机。
- QLT-011 的表约束先 dry-run 查重并做备份 / 回滚方案；禁止未评估历史语义直接添加唯一索引。
- QLT-016 的 HTTP transport 变更必须覆盖 AI 计费 / 图片结算，避免网络拒绝后错误扣费。
- 所有用户可见新增错误保持 `messages/zh.json` / `messages/en.json` 同步，server action 使用 `Fail` / `Done` 与本地化错误。

## 8. 发布与回滚策略

1. **A 完成前**：不以“测试大多通过”为发布依据；报告中的 P0 未关闭。
2. **小步合并**：A 每项单独 PR；B/C 的协议或 schema 改动单独评审，避免一个 PR 同时改变权限、消息格式和数据库。
3. **迁移**：先备份、查重、验证前后兼容；物品模型变更采用可回滚的 expand / migrate / contract，不在一次部署中直接破坏旧代码读取。
4. **灰度**：至少验证 host / player / admin、单 / 多标签、断网重连、冻结、Bot / 图片任务；观察 SSE 重连率、消息缺口、DB 冲突、AI 结算异常。
5. **回滚**：代码回滚与数据回滚分别写清；外部消息格式新增字段应向后兼容，已提交的业务 / 计费记录不能用删库方式回退。
6. **最终证据**：干净环境通过 `pnpm lint && pnpm tsc --noEmit && pnpm i18n:check && pnpm test && pnpm build`，真实 DB / E2E 结果附 PR；当前本机构建受环境保护阻断的事实不能替代此验收。

## 9. 进度日志

| 日期 | 编号 / 批次 | 状态变化 | PR / 提交 / 验证证据 | 备注 |
| --- | --- | --- | --- | --- |
| 2026-11-09 | 全部 | TODO | 审查报告与整改计划建立 | 未修改业务代码；开始执行前更新本表和具体任务 |
| 2026-11-09 | A / QLT-001–004 | TODO → IN REVIEW | 分支 `codex/code-quality-remediation`，提交 `5f85833` | dice/messages/inventory/bot/export 定向测试通过 |
| 2026-11-09 | B / QLT-005–006 | TODO → IN REVIEW | `241dcfa` | admin 23 项通过；邀请码顺序已修正 |
| 2026-11-09 | C / QLT-007–009 | TODO → IN REVIEW | `241dcfa` | messages 39 项、room-actions 23 项通过 |
| 2026-11-09 | 验证 | 解除阻断 | `241dcfa` | 沙箱 `sandbox-exec: data object length exceeds maximum` 一度导致所有 Bash 失效；恢复后已复跑：`tsc --noEmit` 0 错误、改动文件 ESLint 无诊断、`check-i18n` 通过、相关 8 个测试文件 144 项全绿 |
| 2026-11-09 | 验证 | 已知基线缺陷 | — | 完整套件 1213 通过 / 1 失败 / 11 跳过。唯一失败为 `auth-config.test.ts` 超时；已用 `git stash` 在干净基线复现，确认与本次改动无关（属测试对动态 `import("./db")` mock 不生效的既有问题） |
| 2026-11-09 | 构建 | 环境阻断 | — | `next build` 编译 + TypeScript 阶段通过（2.5s / 10.5s），止于收集页面数据时缺少 `DATABASE_URL`，非代码问题 |
