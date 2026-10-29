# AI 图片生成

## 使用

1. 管理后台 `/admin/ai` → 图片生成服务：选择类型、协议、模型/部署 ID、API 基础地址、API Key、尺寸及费率，勾选全站共享。
2. 个人设置 → AI 服务：同样可配置个人图片服务。密钥只在服务端加密存储，编辑时留空保留。
3. 房间 → Bot 设置：Bot 仍需配置对话模型；启用 `imageGen` 并选择图片服务。可用服务限定为房主私有或管理员共享，保存和运行时都检查。
4. 在房间中 @Bot 描述要生成的图。工具立即返回后台任务编号，Bot 可以继续处理下一条消息，图片完成后独立发送到原频道。每轮最多提交一次任务，默认单张；私聊触发时只发送到原私聊。图片使用现有房间图片缓存及访问校验。

支持 GPT-Image 2、2.5 Sunburst/Flare，Gemini Nano Banana 2/2.1/Pro，Seedream 5.0 Pro/Flash，wan2.7-image-pro、qwen-image-3.0、qwen-image-2.1-pro。
模型 ID 可覆盖，供不同地区、接入点和网关使用。类型决定参数能力，不从自定义模型名猜测协议。OpenAI Images 兼容选项只是明确选择的网关协议，不表示官方 Gemini/百炼提供 Images 端点。未实现聊天式出图、Responses 出图、图生图/参考图和异步万相任务；万相采用原生同步接口。

## 升级

部署前运行 `pnpm db:push`（新增 `image_providers`、`image_generations`；已部署预览版也需补充 `request_encrypted`、`started_at` 及队列索引），然后重启服务。没有新依赖或必填环境变量；沿用 `AI_ENCRYPTION_KEY` 和 `CHAT_IMAGE_DIR`。部署需持久化图片缓存目录。管理员原有缓存清理会同时清理生成的聊天图片，消息保留占位回退。

## 请求与安全

- `src/lib/ai/image/config.ts`：客户端可用的模型及参数表、Zod 校验。
- `protocol.ts`：四种报文适配，显式单图/尺寸，忽略 Gemini 思考图。
- `transport.ts`：生成和下载前分别执行 SSRF 校验，拒绝重定向；下载不携带 API 凭据；响应有 32 MiB 上限，整体请求十分钟超时。付费 POST 不自动重试。
- `generate.ts`：提交时检查权限并原子预留点数、写入 queued 任务；模型只收到任务编号。后台执行验证真实图片格式和像素上限、编码 WebP、逐张存盘并通过 `dispatchMessage` 发图。工具不能指定服务、密钥、接收者或输出 URL。
- `worker.ts` / `src/instrumentation.ts`：自托管 Node 服务启动后台执行器，每进程最多并发 4 个图片任务，数据库 `FOR UPDATE SKIP LOCKED` 保证跨进程唯一认领。执行器适用于持续运行的 Node 部署；会冻结进程的 serverless 部署需另行配置常驻 worker。
- 排队任务保存加密的 prompt、服务配置/凭据、房间、Bot、原私聊收件人和语言快照；终态清除加密请求。执行前复查 Bot/房主/服务权限，交付前再次核对成员。失败或部分交付向原频道发送通知，生成状态不占用聊天 typing 指示器。
- 沿用现有 `resolveToolCall` 执行端白名单。未启用的 imageGen 不能执行。每轮调用过一次后，失败也不允许模型自动重试。

## 点数与恢复

费率是站点每张单图生成的 AI 点数，不是厂商账单金额。每次请求一张，意外多回图会交付但不追加点数。固定服务配置的尺寸/质量对应其费率；需要不同档位价格时添加独立服务。

共享服务对房主扣点，管理员及个人服务不扣点。请求前锁定用户行检查余额并预留单图费率，避免并发透支；价格、模型、尺寸和共享状态保存快照。未交付退回站点预留点数，部分交付保留单图收费。退款通过锁定调用行保证幂等。上游超时/失败不代表上游未收费；未知张数和用量保留 null，不伪装零用量。原始上游 usage 单独保留，不与按张费率叠加。HTTP 错误、HTTP 200 中的业务错误和无可用图片的响应均保留可读取的 usage、请求 ID 和错误代码，不保存或向用户暴露原始错误正文。

上游成功后，在下载前保存加密的产物来源回执（URL 或 base64）及用量、张数。回执沿用 AI_ENCRYPTION_KEY 加密，不在客户端读接口返回；可供运维解密恢复产物，签名 URL 仍受厂商有效期限制。当前核对脚本只结算，不自动恢复/重发图片。消息广播异常时先查消息是否已入库；无法确认时保持待核对状态，不立即退款。回执持久化本身若失败，仍无法保证跨进程恢复。

重启后 queued 任务自动继续；已认领的 pending/generated 任务不会自动重发，避免未知上游结果造成重复收费。运维运行 `pnpm db:reconcile-images` 查看自任务开始（旧记录回退到创建时间）超过 30 分钟的待核对记录；确认后运行 `pnpm db:reconcile-images --apply`。脚本依据已落库的图片消息结算，有交付保留预留点数、无交付退款，不会重新请求上游。日志只打印调用 ID、状态、张数及点数。个人配置区域显示最近 30 次调用状态和点数。

## Bot 运行时并发约束

- 每条持久化聊天消息独立触发，不因同一 Bot 前一请求未完成或 3 秒冷却而丢弃；同一消息提及多个 Bot 时并发触发。
- 运行入口及手动触发接口要求 Bot 属于本房间；掷骰/发图工具缺省继承当前私聊频道。
- `respond_check` 与玩家检定共享请求行锁，先原子认领再执行；明确的执行前失败释放认领，异常结果不自动重复执行。
- 摘要只原子合并历史摘要和游标，旧摘要请求不能覆盖新游标；Bot 设置更新也以字段合并保留并发摘要。
- 对话模型仍受五分钟运行预算约束；图片任务有独立的十分钟网络预算，不参与后续对话轮的 deadline。
- 本地 PostgreSQL 回归：`TEST_RUNTIME_DATABASE=1 pnpm exec vitest run src/lib/ai/__tests__/runtime-db.test.ts`（隔离测试数据并清理，不调用付费接口）。

## 协议依据（2026-10-29 核对）

- OpenAI Images API: https://developers.openai.com/api/reference/resources/images/methods/generate
- Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Nano Banana 2.1: https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1
- Seedream 5.0 Pro: https://docs.volcengine.com/docs/ark/seedream-5-0-pro
- Alibaba image models: https://www.alibabacloud.com/help/en/model-studio/image-model/

兼容中转及具体账号的模型可用性需按其契约配置；未进行真实付费能力探测。
