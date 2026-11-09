# 代码质量审查报告 — 2026-11-09

> **基线**：`f93da79`（`v0.27.0`）  
> **范围**：Next.js / React 客户端、Server Actions 与 API、鉴权与消息隐私、PostgreSQL 一致性、SSE、AI / 上传、测试 / CI / 部署文档。  
> **配套整改看板**：[`plans/code-quality-remediation.md`](../../plans/code-quality-remediation.md)  
> **性质**：静态代码审查与本地工具验证；未进行线上渗透测试、数据库压测或浏览器性能剖析。  
> **证据约定**：行号对应上述基线，代码变更后应按函数名重新定位。确认项有完整静态调用链；静态可推导的并发 / 断线问题需由指定集成测试完成行为复现。

## 1. 结论

项目的模块化单体结构、消息可见性抽象、角色卡锁、AI 用量结算及 CI 基础值得保留；**不建议因本次发现重写架构**。

当前版本的短板是部分 Server Action 绕过既有安全抽象、断线恢复协议不完整、部分多步写入缺少原子性，以及测试门禁未覆盖关键多人流程。**4 项 P0 发布阻断问题、14 项 P1 重要问题、5 项 P2 工程治理问题列入整改计划；另保留 5 项待验证 / 产品决策，不计入确认缺陷。**

P0 项均尚未在真实服务端执行恶意输入或越权 PoC：拒绝采样死循环不做实际执行；敏感字段、导出和 Bot 配置问题由返回结构及字段定义确认。上线判断应以修复后的真实环境验收为准。

### 审查统计

| 分类 | 数量 | 含义 |
| --- | ---: | --- |
| P0 | 4 | 服务可用性或敏感数据暴露，发布前必须修复 |
| P1 | 14 | 权限撤销、事务一致性、实时同步、资源级授权 |
| P2 | 5 | 测试门禁、i18n、性能治理、部署约束、文档漂移 |
| V（待验证） | 5 | 需实测或产品定义，不能直接当作漏洞修复 |
| 合计 | 28 | 23 项确认 / 可推导整改 + 5 项待验证 |

## 2. 已执行的质量检查

| 检查 | 结果 | 边界 / 解释 |
| --- | --- | --- |
| `pnpm exec eslint` | 通过 | 独立执行无诊断；此前后台串联命令的 `EPIPE` 是工具输出问题，不是 lint 代码诊断 |
| `pnpm tsc --noEmit` | 通过 | TypeScript 无错误 |
| `pnpm i18n:check` | 通过 | 仅证明中英文 key 集合一致 |
| `pnpm test` | **未通过** | 89 文件：83 通过、2 跳过、4 收集失败；1164 tests passed、11 skipped |
| `pnpm build` | **未完成** | 编译前清理 `.next/turbopack` 被当前执行环境的批量删除保护拦截，非编译错误 |
| 完整应用 Playwright | 未运行 | 响应式 fixture 不能替代真实多人 / Next.js 流程 |
| PostgreSQL 集成与 `EXPLAIN` | 未运行 | 本机未配置 `DATABASE_URL` / `db.config.json` |
| React Profiler / bundle / 线上压测 | 未运行 | 不将性能候选问题表述为已发生的慢查询或卡顿 |

### 测试失败的具体原因

`server-load.test.ts`、SSE `route.test.ts`、`dice-announcer.test.ts`、`tab-id.test.ts` 在模块收集阶段触达 `src/db/index.ts` 的配置读取。即使其中部分测试意图使用 mock，也仍要求数据库配置存在。这属于需要修复的测试基座隔离问题，而不是“1164 项通过即代表全套通过”。

另有 11 个真实 PostgreSQL 测试（`runtime-db.test.ts` 2 个、`studio-db.test.ts` 9 个）由 `TEST_RUNTIME_DATABASE !== '1'` 跳过。

## 3. 做得好的设计

| 领域 | 证据 | 价值 |
| --- | --- | --- |
| 消息可见性 | `src/lib/messaging/audience.ts`、`router.ts` | `audience`（谁可见）与 `channelUserId`（何处展示）集中建模，SQL、SSE 和客户端共享语义 |
| 角色卡并发 | `src/lib/character/sheet-row.ts:38-58` | `SELECT … FOR UPDATE` 防止整份 JSON 的读改写丢失更新 |
| AI 结算与图片队列 | `src/lib/ai/usage.ts`、`src/lib/ai/image/worker.ts` | 幂等 attempt、事务、行锁、`SKIP LOCKED` 等具备明确并发依据 |
| 上传与素材 | `src/lib/media/uploads.ts`、背景 / 生成图片处理 | 路径穿越防护、部分图片重编码、素材对象级授权和 `nosniff` |
| 工程分层 | `eslint.config.mjs` | client / lib / actions / schema 的依赖边界进入 lint，而非只依赖文档 |
| CI 基础 | `.github/workflows/ci.yml`、`lint.yml` | Node 22 / 24、PostgreSQL 16、构建和响应式浏览器测试已有基础 |

## 4. P0 — 发布阻断问题

### QLT-001：骰子运行时参数可触发同步无限循环

**证据**：`src/app/actions/messages.ts:203-213` → `src/lib/messaging/dice-roll.ts:14-24` → `src/lib/commands/dice.ts:15-40`。

`rollDiceAction` 仅检查可写房间权限，没有运行时数值校验。`faces > 2^32` 时 `Math.floor(2^32 / faces) === 0`，拒绝采样的 `limit` 为零，循环没有 `await`，会永久占用事件循环；`count = Infinity` 也会无限循环，超大有限数量可耗尽 CPU / 内存。

**前置条件**：任意可写房间成员。**处理**：Action 与底层函数均校验 `Number.isSafeInteger`，统一有界面数和数量；对 `NaN`、`Infinity`、小数、异常大数、字符串 / 对象补测试。不要实际执行会挂起的 PoC。

### QLT-002：背包接口返回完整用户敏感行

**证据**：`src/app/actions/inventory.ts:392-414`；字段定义 `src/db/schema.ts:117-135`。

普通成员可调用的 `getMyInventory` 加载 `sender: true` / `recipient: true`，返回时 `...d` 保留完整 relation，包括 `passwordHash`、`sessionToken`、`botConfigJson`、角色、封禁状态等。`getDistributionHistory`（`433-450`）有相同过度返回，但其入口要求 host / admin。

**处理**：在查询或服务端 DTO 中显式白名单，仅保留所需 id / username / displayName 等；不以“前端未展示”作为脱敏，并增加递归敏感字段断言。加密 provider key 位于独立表，本项未证明其被返回。

### QLT-003：房间导出绕过在线消息可见性，且漏导私聊

**证据**：`src/app/actions/export.ts:45-113`，尤其是 `65-69` 全量读取与 `91-104` 自写过滤。

导出未使用 `messageVisibilityWhere`。主持人正常在线不可见的其他用户 `self` 暗骰、`recipient` 私密通知会进入 timeline；玩家发给主持人的 DM 又因 `msg.userId !== hostId` 被跳过。

**处理**：主持人导出也必须复用 viewer-aware audience 过滤，私聊归属按 host 实际参与关系组织。覆盖 `everyone/self/recipient/directed/dm/gm`、双向 DM 和 admin viewer。需先明确导出是否永远遵循在线可见性；本报告默认不扩大主持人的既有阅读权限。

### QLT-004：普通成员可读取完整 Bot 配置及潜在私聊摘要

**证据**：`src/app/actions/bot.ts:94-111`；既有脱敏约定 `src/lib/ai/bot-status.ts:16-29`。

`getRoomBotsAction` 只要求 membership，却直接返回解析后的 `botConfigJson`。项目已有注释明确完整配置包含 system prompt、historical summary 和其他 host-private 材料，SSR 路径已经使用 `sanitizeBotConfigForClient`，此 Action 未复用。

**处理**：普通成员只返回公开 Bot 摘要；编辑所需完整配置仅 host / admin 可读。敏感摘要是否包含某段私聊取决于此前生成内容，但配置越权返回本身已确认。

## 5. P1 — 权限、事务与实时一致性

### QLT-005：角色降级与密码变更不撤销旧权限 / 会话

`src/app/actions/admin.ts:97-135` 清除的缓存只含 token / ban，JWT role 仅在登录时写入（`src/auth.config.ts:145-176`），旧 admin 可继续被 `requireAdmin` 和 `checkRoomAccess` 信任。`src/app/actions/user.ts:35-53` 与 `admin.ts:218-225` 更新密码但不旋转 session token。

**处理**：实时角色 / 权限版本校验或角色变化强制会话失效；密码修改 / 重置接入同一撤销机制。统一密码策略（注册 8 位、自助改密 3 位、admin 重置无运行时长度校验）。

### QLT-006：用户名已存在时邀请码仍被消耗

`src/app/actions/invite.ts:199-224` 先将邀请码置为 `used`，发现用户名存在时 `return "username_taken"`。事务回调正常返回即提交，与“自动回滚”的注释不符；结果是未创建账号却消耗邀请码。

**处理**：冲突时抛出受控结果 / 显式回滚；事务外预检只用于 UX，事务内仍需防竞态。补同码并发和用户名冲突测试。

### QLT-007：断线补偿会留下不可自动修复的消息缺口

`src/app/actions/messages.ts:352-370` 倒序取最新 300 条；`src/components/room/hooks/useRoomEvents.ts:77-100` 合并后以最大 id 继续追赶。若断线期间超过 300 条，中间缺口无法被下一次 `id > sinceId` 自动补回，客户端也不知道被截断。

**处理**：升序分段追赶直到游标追平，或返回 `truncated/gapBefore` 并提供显式恢复；不得通过客户端可控 limit 获得无界读取。

### QLT-008：补偿失败后，健康连接不会主动重试

`useRoomEvents.ts:77-120` 在 Promise 成功前清除 `hadDrop`；catch 注释称下次重连再试，但当前连接若持续健康就不会发生该重连。

**处理**：成功后才确认恢复完成；失败有界退避重试，或让连接重新进入恢复状态。与 QLT-007 同 PR 验收。

### QLT-009：新成员加入后，其他在线客户端 roster 不新增

`src/app/actions/room.ts:95-114` 只广播 `character_updated`；载荷定义见 `src/lib/character/broadcast.ts:30-60`。`useRoomEvents.ts:131-149,228-245` 仅更新既有成员和角色 Map，没有新增成员摘要的路径。

**处理**：增加 `member_joined` 完整最小成员摘要，或触发明确的 roster 重读；验收同时覆盖 roster、DM 目标、道具接收人、完成度和在线状态。

### QLT-010：SSE 重连只补偿消息，不恢复其他同步域

`useRoomEvents.ts:113-245` 显示重连仅调用消息补偿；房间设置、背包、事件、角色卡、成员资料、删除消息、检定状态等依赖后续增量事件或刷新。

**处理**：重连恢复统一房间快照，或每域版本游标 + 定向重读；避免为每次重连无条件重读所有大对象。

### QLT-011：道具分发 / 分享的防重复持有不原子

`src/lib/room/inventory-share.ts:50-79` 与 `src/app/actions/inventory.ts:239-296` 都是先读后写；`src/db/schema.ts:274-289` 没有匹配当前持有语义的唯一约束。双击、多标签、host 分发与成员分享可形成重复持有和重复通知。

**处理**：先厘清“当前持有”与“历史审计”是否应分表，再设计约束 / upsert / 事务；现有历史表若允许多次合法分发，不能盲目直接加唯一索引。需清理已有重复并做真实 PG 并发测试。

### QLT-012：事件发布缺少状态抢占和可恢复提交

`src/app/actions/event.ts:350-405` 依次写 visibility、插入并广播卡片、更新事件状态、逐个发 receipt，无事务或 `unpublished → publishing` 抢占。中途失败或重复发布会留下卡片与状态不一致、部分 receipt 或孤儿卡片。

**处理**：条件 UPDATE / 行锁抢占；数据库形成可恢复提交后再广播，跨消息与状态需要时采用 transactional outbox；不将 SSE 发送简单包进 DB 事务。

### QLT-013：部分公开事件把封面 URL 发给非接收者

`event.ts:383-391` 将第一张图片写入 `cover`；`101-118` 以 `audience: "everyone"` 持久化并广播。锁定 React 卡不渲染不等于数据脱敏；图片 GET 目前按房间 membership 和文件名前缀授权。

**处理**：公开 payload 只含明确可公开字段，封面通过受控事件详情读取；若图片承载私有内容，补充资源级 visibility。

### QLT-014：事件图片删除缺少当前房间对象归属

`event.ts:57-72` 仅按 URL 文件名删除；`discardEventImagesAction`（`294-306`）只检查 URL 在当前房间事件中的引用，没有要求 `${roomId}-` 文件前缀。知道其他房间文件名时，host 可越房删除文件；随机文件名不是对象级授权。

**处理**：URL roomId 与文件前缀双重校验，最好由数据库资源记录授权；删除前核对跨事件 / 消息 / 背包共享引用。数据库提交后再删文件，失败留待清理任务。

### QLT-015：冻结房对已运行 Agent / Bot 图片任务缺少副作用复核

`src/lib/ai/agent.ts` 的运行上下文与工具循环、`src/lib/ai/image/job-access.ts` 未像 Asset Studio 一样在任务期间统一检查 `room.frozen`。冻结前排队的任务仍可能发言、改卡、分发或产生付费图片。

**处理**：先定义冻结是否取消排队中的付费任务，再在副作用 / 投递边界复核可写状态；长任务需要取消或房间状态版本。此为静态确认的检查缺失，实际冻结窗口由并发测试验证。

### QLT-016：AI outbound 的 DNS 校验与 socket 连接存在 TOCTOU

`src/lib/ai/protocol/transport.ts:18-24` 先 `validateApiEndpoint(url)` 再 `fetch(url)`；`src/lib/security/url-guard.ts` 做 DNS / 私网检查，但实际 socket 未固定到已验证 IP。`redirect: "error"` 不能防 DNS rebinding。

**处理**：连接层固定已验证 IP，同时保留 hostname 用于 TLS SNI / 证书校验；继续禁重定向或逐跳验证。**不得宣称必然可读取所有内网服务**：HTTPS、证书、JSON / 图片协议与部署网络限制实际影响，需隔离环境集成测试。

### QLT-017：聊天图片只信声明 MIME，且大小检查晚于 multipart 解析

`src/app/api/rooms/[id]/images/route.ts:40-79` 先 `req.formData()` 后检查 1 MB 文件上限，原始字节按 `file.type` 写盘；GET `images/[filename]/route.ts:62-70` 未设置 `X-Content-Type-Options: nosniff`。

**处理**：代理 / 框架限制整个请求体，sharp 解码限像素并重编码，响应加 `nosniff`。**未据此断言存储型 XSS**，直接导航、MIME sniffing、解码器行为需另行实测。

### QLT-018：消息与分页输入缺少统一运行时边界 / 对象归属

- `src/app/actions/messages.ts:146-155`、`src/lib/messaging/dice-roll.ts:32-49`：DM target / channel partner 未统一验证当前房间 membership；当前未证明非成员可读源房间消息。
- `messages.ts:339-370`：`limit` 和游标直接接收客户端值，缺整数、正数和最大值约束。
- `src/app/actions/ai-import.ts` 的取消 job 与批量导入：需补 job 房间 / 用户归属、数组数量和文本上限。

**处理**：在消息路由和 Action 边界统一验证，不能只修 UI；历史分页建议 1–100、catch-up 由服务端固定上限，批量导入有总量与单项上限。

## 6. P2 — 工程与维护治理

| 编号 | 发现 | 证据与建议 |
| --- | --- | --- |
| QLT-019 | 测试基座与关键流程缺口 | 4 文件收集依赖 DB 配置；89 个 Vitest 文件，约 1012 个声明位置（`.each` 另展开）；Node 环境无组件 DOM 测试基座。修 mock / 导入隔离，新增真实 PG 与多人浏览器套件 |
| QLT-020 | CI 未启用已有真实 PG 测试，缺 i18n 与完整应用 E2E | `.github/workflows/ci.yml:66-80` 有 PG 但未设 `TEST_RUNTIME_DATABASE=1`；没有 `pnpm i18n:check` / 完整 `test:e2e`。补独立 `tsc` 门禁，先测覆盖率基线再对关键域设阈值 |
| QLT-021 | 性能优化需要先测量 | AI 素材面板无活动任务也每 4 秒整组轮询；部分 JSONB / 消息查询索引和房间 overlay 静态导入是候选热点。先做 DB 指标、`EXPLAIN (ANALYZE, BUFFERS)`、React Profiler / bundle，再优化，不预设收益 |
| QLT-022 | SSE 是单进程架构，主指南易误导 | `src/lib/server/events.ts:9-35` 是进程内 EventEmitter；`docs/arch/realtime.md:12-16` 正确说明 single-process only，`AGENTS.md:132-145` 的“workers share hub”易被理解为跨进程。明确单实例部署；水平扩展需 broker，并同步在线状态、限流等进程内状态 |
| QLT-023 | 文档和 i18n 校验存在漂移 / 浅检查 | schema 实际 29 个 `pgTable`，文件头写 21，`AGENTS.md` / `docs/arch/database.md` 写 23；README 有 Node / TS 版本和路径漂移。`scripts/check-i18n.ts` 只查 key 对称，补 ICU 参数、空值、数组结构和代码引用校验 |

## 7. 待验证与产品决策（不计入已确认漏洞）

| 编号 | 待回答的问题 | 建议验证 |
| --- | --- | --- |
| V-01 | `rooms.status = closed` 是仅大厅隐藏，还是禁止加入 / 读取 / 写入？ | 产品状态机确认后，在 `checkRoomAccess` / join / read / write 统一实现 |
| V-02 | 非激活背景、部分公开事件的 time 是否属于 GM 私有预备材料？ | 明确资源可见性矩阵，再决定 GET 与公开 payload 是否收紧 |
| V-03 | 新成员能否读加入前的 directed / DM 历史，跨房 target 是否永远非法？ | 明确历史归属与成员生命周期；补跨房 / 中途加入测试 |
| V-04 | 登录 / 注册限流、在线状态在多 worker 下是否符合部署形态？ | 检查可信代理 IP 配置，实测多实例；若共享状态则外置 Redis 等存储 |
| V-05 | 旧响应覆盖、长会话内存、消息行 memo 失效是否达到用户可感知程度？ | 延迟注入测试、长会话压力测试、React Profiler；以数据决定优化 |

## 8. 推荐验收门槛

1. QLT-001 至 QLT-004 修复及负向回归全部通过，才可撤销发布阻断。
2. QLT-005 至 QLT-018 完成各自验收；涉及冻结、closed、历史可见性的事项先取得产品结论。
3. `pnpm lint`、`pnpm tsc --noEmit`、`pnpm i18n:check`、完整 `pnpm test`、`pnpm build` 在干净环境通过。
4. 启用真实 PostgreSQL 测试，覆盖物品并发、事件重复发布、会话撤销；双浏览器覆盖新成员、DM、301+ 离线消息和断线失败重试。
5. 在隔离环境验证 SSE 部署约束、AI 出站安全和上传行为；生产发布仍须代码评审与灰度观察。

具体任务状态、负责人、PR 和证据填写在整改看板，**报告不随每日进度反复改写；若代码基线或产品决策改变，新增复审记录并保留本报告。**
