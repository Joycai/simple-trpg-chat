# LLM 协议层完善计划

日期：2026-10-29。状态：已实施，已完成离线协议、项目测试及本地数据库/浏览器验证；未进行付费供应商实测。范围依据：本轮源码审查与用户要求。

## 1. 目标与边界

完成 Chat Completions、Anthropic Messages、OpenAI Responses、Gemini generateContent 四种协议的底层支持，覆盖 reasoning、effort、函数工具、usage、请求/响应校验与超时。

- 不改页面、控件、用户操作流程、聊天 SSE 契约或展示节奏；正文仍完整返回后展示。
- 保留 Bot 触发规则、工具权限、工具执行顺序、最多五轮及末轮收尾策略、可见性过滤、导入结果处理、播报回退行为。
- 协议层实现流式和非流式，业务默认保持非流式；必要时可在服务端聚合流式结果，前端不消费增量。
- reasoning 与正文分离，不增加思考展示；签名、密文、原始续轮载体只用于合法的协议续轮。
- 本轮不新增模型发现 UI、多模态产品功能、搜索/代码执行等服务端工具、自动协议探测或自动跨协议重试。
- 已根据后续用户授权在 codex/llm-protocol-foundation 分支实施，并在确认的本机开发库应用增量迁移；保留现有 AGENTS.md 工作区改动。付费供应商探测未执行。

## 2. 已确认的迁移入口

| 入口 | 当前位置 | 必须保留的业务行为 |
| --- | --- | --- |
| Bot 工具循环 | src/lib/ai/agent.ts | 权限、消息路由、工具预算、finally 用量归集 |
| 历史摘要 | src/lib/ai/agent.ts | 现有触发时机、历史可见性、摘要存储方式 |
| AI 导入 | src/app/actions/ai-import.ts | 当前取消入口、JSON 解析与条目过滤 |
| 掷骰播报 | src/lib/ai/dice-announcer.ts | 熔断、限时、短句输出、失败时本地回退 |
| 连接测试 | src/app/actions/ai.ts | 现有按钮与返回对象形状 |
| 模型列表 | src/lib/ai/model-fetch.ts、src/app/actions/ai-providers.ts | 原有选择器流程，补齐配置后的协议路由 |

## 3. 架构决策

建议目录为 src/lib/ai/protocol/：types.ts、config.ts、capabilities.ts、transport.ts、errors.ts、usage.ts、client.ts、adapters/{chat,messages,responses,gemini}.ts，以及同目录 __tests__/。

1. 一族一个适配器；厂商/渠道差异由声明式画像表达，不建立厂商子类。
2. 统一内部请求、消息、工具定义、工具结果、返回状态和用量模型。业务不再处理原始 choices、content blocks 或 candidates。
3. 统一 complete() 和 stream() 入口；流事件用明确的判别字段，区分正文、reasoning、工具、usage 和终态，避免未知事件被当成正文。
4. 结果区分 completed、tool_calls、truncated、blocked、incomplete 等状态；传输失败使用类型化错误，保留已获得的 usage。EOF 不等于成功。
5. 原始续轮载体附带来源绑定：provider/route、协议、实际请求模型及需要的会话约束。同名模型不能作为跨端点回传依据。跨来源时只重建可移植内容，无法合法重建则提前失败。
6. 仅显式支持的字段进入 wire；内部元数据不透传。请求转换不得修改调用方消息。

## 4. 配置兼容

- 保留 aiProviders 单行供应商模型，不在本轮重构为渠道/线路/模型多表。
- 增加可空、带版本的协议配置（建议 JSONB）：protocol、auth、endpointMode、模型能力/参数覆盖；协议四值为 chat/messages/responses/gemini。
- 老记录无协议配置时明确使用 chat，保留当前地址、鉴权与模型选择。不得仅凭 vendor=anthropic/google 自动改原生协议。
- 新协议由受校验的后端配置入口或维护脚本显式设置；脚本支持检查/试运行，密钥继续使用现有加密字段，不通过命令行明文参数传递。
- 现有创建/编辑 action 的旧调用不需要新参数；编辑旧字段不能清除隐藏的协议配置。切换端点/模型后重新校验覆盖配置，不能沿用不适用的能力画像。
- 统一 resolveConnection()，所有生成、连接测试与模型列表入口共用。区分 base URL 与完整端点，幂等处理尾斜杠、版本前缀，拒绝含义不明的组合。
- 保持当前 HTTPS/SSRF 策略；每次实际请求和重试检查目标，禁止自动跳转绕过目标验证。
- 配置与能力按实际请求模型解析：Bot 当前使用 botConfig.model，导入使用 provider.model。本轮不悄悄改变选择优先级；不匹配时不得套用另一模型的能力。

## 5. 分阶段实施

### P0：统一契约与离线基线

- [x] 定义四协议、统一消息/工具/终态/错误/usage 类型及可校验的配置 schema。
- [x] 建立五个调用入口的行为回归基线与四协议响应 fixtures；标明来源和日期，不把 mock 当成在线支持证明。
- [x] 定义模型能力三态：支持、不支持、未知；显式未知配置不默认降为 chat。
- [x] 阅读实施时的本地 Next.js 文档及相关协议官方文档，复核变化字段；记录平台 × 协议 × 模型证据。

### P1：传输层与 Chat 迁移

- [x] 实现统一 HTTP 客户端：鉴权、URL、请求验证、JSON/SSE 解码、响应大小上限、请求标识与脱敏诊断。
- [x] 合并调用方取消信号、每次请求超时、总 deadline；流式另有首事件/空闲超时。deadline 覆盖响应体读取、退避与全部重试。
- [x] 保留导入现有 60 秒、连接测试 10 秒和播报现有时限；为 Agent/摘要配置有限时限，先采用可覆盖的 120 秒单次、300 秒整轮预算，结合验证调整。
- [x] 取消不重试；鉴权/校验/确定性 4xx 不重试；429/可恢复 5xx 在总预算内有限退避并支持 Retry-After。收到生成内容、开始工具执行或取消后不重放请求；结果不明的网络失败不盲目重试，以免重复计费。
- [x] Chat 支持标准文本、tool_calls、reasoning 原字段回传；SSE 按 index 拼接工具参数，处理 usage-only 空 choices、跨字节/跨行数据、错误信封与异常结束。
- [x] 删除无条件剥除 reasoning 的逻辑，改为能力画像决定回传；模型专用字段不发送到不适用的端点。
- [x] 先迁移既有 Chat 入口，验证正常输出行为等价，再添加其余适配器。

### P2：Messages、Responses、Gemini

| 协议 | 必须实现的请求和续轮能力 | 必须处理的响应 |
| --- | --- | --- |
| Messages | system 抽取、合法角色/内容块、tool_use/tool_result 配对、必填输出预算、版本头、thinking blocks 原样回传 | text/thinking/signature/redacted blocks、增量工具 JSON、stop_reason、拒绝、pause_turn、流内错误 |
| Responses | instructions/input 转换、扁平函数工具、显式工具严格性、store:false、function_call_output、完整 output items 回传；按要求请求 encrypted reasoning | output items 与 call_id、completed/failed/incomplete、refusal、error、增量事件和最终结果去重 |
| Gemini | systemInstruction/contents、functionDeclarations、functionCall/functionResponse 配对、原始 parts 与 thoughtSignature 回传、模型名/URL 编码 | candidates/parts、thought、usageMetadata、promptFeedback、finishReason、函数调用、流内错误 |

- [x] 三个适配器均完成非流式与流式解析。SDK 聚合结果与原生 SSE 的增量/累计语义分别按实际格式处理，不能统一盲拼。
- [x] Messages 的 pause_turn、Responses incomplete、Gemini 拦截/缺签名等归一化为非成功状态；不在本轮引入隐式无限续跑。
- [x] 对四协议执行两轮工具契约测试：工具请求 → 工具结果 → 最终文本，检查签名和 reasoning 在第二轮请求中保持完整。

### P3：Reasoning、effort 与工具完整性

- [x] 分开建模“是否启用思考”“强度”“token budget”“续轮载体”；unset 表示不发送，off 不等同于最低档。
- [x] 内部 effort 词汇映射到各协议的 effort、thinking budget/level 和声明的厂商方言；仅发送目标模型支持的值，不靠模型名称模糊匹配。
- [x] 明确不支持的请求在发送前失败；未知能力且未显式请求时不注入参数。不静默降低用户指定强度，也不自动做付费探测。
- [x] reasoning 文本、加密字段和签名分开处理，不尝试解码签名，不写进用户聊天或常规日志。
- [x] 工具 schema、choice(auto/none/required/named)、调用 ID、函数名、参数 JSON 和结果配对在适配层统一校验。
- [x] 保留业务层执行白名单。遇到空/重复 ID、截断参数或不完整工具历史，安全停止或在语义明确时重建；不向下一轮发送损坏历史。
- [x] 保持最后一轮不产生工具副作用；目标不支持该约束时显式报告能力不匹配，不能悄悄继续执行工具。

### P4：Usage 与异常结果处理

- [x] 单独保留原始 usage 与归一化字段：inputTotal、inputUncached、cacheRead、cacheWrite、outputTotal、reasoningOutput，以及 reported/partial/missing 状态；缺失用 null，不用 0。
- [x] Chat/Responses 不把已包含于 output total 的 reasoning 再加一次；缓存细分按字段来源去重。
- [x] Messages 按非重叠输入桶合计；Gemini 按官方字段语义处理正文/思考及工具输入，避免漏算或双算。
- [x] 兼容缓存字段别名，但标准字段与别名同时存在时不能重复加。DeepSeek 当前官方文档已包含 prompt_tokens_details.cached_tokens，不能沿用“永远不提供标准字段”的旧假设。
- [x] 在判断空正文、截断、拒绝之前收集 usage；异常、取消、部分输出保留已知量，未知部分不伪造零消耗。多次请求分别归集，流事件快照不重复累加。
- [x] 增加最小请求用量明细表：唯一 attempt ID、关联调用、协议/模型、状态、原始/归一化 usage、费率快照、结算状态；不存提示词、reasoning 或密钥。
- [x] 保留现有三档费率和 UI；映射规则明确为普通输入（包含尚无独立价格的 cacheWrite）、cacheRead、总输出。此为应用现有计价口径，不声称等于供应商账单。
- [x] 明细与既有每日聚合/扣点事务使用幂等键，避免重复结算；持久化失败可观测并可重试，不遮蔽模型结果。不扩展为支付/账单系统。
- [x] 修复摘要错误终态仍覆盖旧值/推进游标的问题；连接测试校验合法成功响应，保持原返回形状，不能以 HTTP 200 单独判成功。

### P5：全入口接线与交付

- [x] 五个生成入口和模型列表不再自行拼接协议请求、解析 usage、定义重试；业务只处理统一结果。
- [x] 旧配置读取、新配置维护、旧表单保存、缺失 usage、取消与超时全部通过回归。
- [x] 更新 docs/arch/ai-system.md、协议配置/迁移说明、能力证据及支持矩阵。
- [x] 提供非破坏性的数据库迁移和回退说明；保留旧聚合数据，不凭空回填历史明细。

## 6. 验收标准

1. 四协议均通过离线普通文本、两轮工具、思考续轮、effort 映射、usage 的契约测试。
2. 请求测试涵盖错误地址/鉴权配置、未知协议、不支持参数、工具历史不完整、输入不被修改、私有元数据不泄漏。
3. 响应测试涵盖 HTTP 200 错误信封、非 JSON、空内容、拒绝、截断、缺 usage、流内失败、半截 SSE、缺终态、重复终态、超限响应。
4. 超时/取消测试使用可控 mock 时钟与本地 HTTP fixtures，覆盖读取响应体和退避期间取消；验证重试预算和无重复工具执行。
5. 用量测试验证缓存/推理不重复计算、未知与零区分、失败仍记已知 usage、重复结算无重复扣点、费率变化不改历史明细。
6. 业务回归证明触发、工具权限/顺序、五轮预算、导入取消、摘要可见性、播报回退及原 action 返回契约保持一致。
7. 执行 pnpm lint、pnpm test、pnpm build；涉及 Next.js 入口时按 next-dev-loop 验证运行时。现有浏览器流程做相关回归，不新增协议设置 UI。
8. 有凭据及明确预算后再进行最小在线验证（每目标组合普通文本 + 工具续轮，必要时流式/effort）；未实测项标记为“离线契约验证”，不写“线上已支持”。

## 7. 实施顺序与完成定义

推荐提交顺序：P0 → P1 → P2 → P3 → P4 → P5。P2 每族独立提交，所有阶段在同一功能分支集成验证；不提前启用未接好用量与异常处理的协议。

完成意味着四协议可通过后端显式配置用于现有全部业务入口，正常交互保持不变，失败路径有确定终态，用量可追溯，既有配置无需用户操作即可继续使用。

参考技能：llm-api-integration（审查、分层、迁移、reasoning、工具和错误观测）、llm-provider-config（兼容迁移）、ai-usage-accounting（用量语义与幂等结算）。技能参考实现中的厂商结论须在实施时复核，不自动修改技能知识库。


## 8. 实施记录

- 统一入口：`src/lib/ai/protocol/client.ts`；业务及计费入口：`provider.ts`。
- 四适配器、JSON/SSE 解析、reasoning/effort/输出控制、工具续轮、请求/响应校验、超时与取消已实现。
- 现有 Bot、摘要、导入、播报、连接测试和模型列表已接入；未改动任何 UI 组件或 i18n 文案。
- 增量迁移：`docs/migrations/2026-10-29-llm-protocol.sql`；仅在本机开发库应用。部署到其他环境前需先应用迁移。
- 新增后端维护命令：`db:configure-ai-protocol` 与 `db:reconcile-ai-usage`，均默认 dry-run。
- 运行与配置文档：`docs/arch/llm-protocols.md`。
- 验证：`pnpm lint`、`pnpm test`（77 文件、1064 项）、生产构建；本机 PostgreSQL 临时 schema 中并发重复结算只扣费一次，费率快照和汇总准确，临时 schema 已清理。
- 浏览器使用 next-dev-loop 检查现有页面；Next.js 所有路由编译检查无错误。已恢复的本地登录会话用于只读检查原有 AI 设置入口，不调用付费模型。
- 证据范围：协议 fixtures 为离线契约验证。供应商 × 渠道 × 模型在线兼容性仍需有凭据和预算后的验证，不以本轮测试宣称所有网关已实测。
- 计费失败恢复：有限次数幂等重试后输出脱敏 reconciliation receipt，由维护命令补记；依赖应用日志保留，不引入外部账单队列。
