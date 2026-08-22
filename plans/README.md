# 动效改进计划（improve-animations 审计产出）

审计基准 commit：`cf83357`（2026-08-22）。所有计划自包含，可交给任意执行代理（含轻量模型）独立实施；执行方式示例：`improve-animations execute plans/001-resource-tooltip-motion.md`。

## 计划一览

| # | 计划 | 严重度 | 状态 |
| --- | --- | --- | --- |
| 001 | [修复头像悬浮状态卡的动效](001-resource-tooltip-motion.md) | HIGH | DONE |
| 002 | [消息入场动画只给真正新到达的消息](002-gate-message-entrance.md) | HIGH | DONE |
| 003 | [用有限次到达提示取代无限循环动画](003-finite-attention-cues.md) | HIGH | DONE |
| 004 | [给高频按钮补上按压反馈](004-press-feedback.md) | HIGH | DONE |
| 005 | [清理布局属性动画](005-layout-transition-cleanup.md) | MEDIUM | DONE |
| 006 | [收敛 conv-tab 的主题级 transition 覆盖](006-conv-tab-transition-consolidation.md) | MEDIUM | DONE |
| 007 | [登录页环境动画的 reduced-motion 门控](007-login-reduced-motion.md) | MEDIUM | DONE |
| 008 | [overlay-pop 方向修正 + 死 duration 清理](008-overlay-pop-direction-and-dead-durations.md) | LOW | DONE |
| 009 | [令牌外 cubic-bezier 清理](009-offtoken-cubic-bezier.md) | LOW | DONE |

## 推荐执行顺序与依赖

1. **001 → 005 → 004**：互相独立、纯机械改动，可任意顺序或并行（不同 worktree）。注意 001 与 005 都触碰 `ResourceStatusTooltip.tsx` 的资源条行（001 已覆盖该文件内的条，005 不再动它）；004 与 003 都触碰 `ChatArea.tsx:138-139` 附近（004 保留按钮的 `active:scale-95`，003 删除图标的 `group-hover:animate-bounce`——先做哪个都行，后做的以文件现状为准）。
2. **003**：引入新 CSS 工具类，改动面最广（5 文件），建议单独一个分支/PR。
3. **002**：唯一涉及数据流（新增 ref 传递链）的计划，代码评审成本最高，放最后单独做。

## 审计中确认但未列入计划的发现（后续候选）

- `ChatInput.tsx:458` 私聊模式边框 `transition-all duration-300` → 应为 `transition-colors duration-150`。
- ~~触屏无 `@media (hover: hover)` 门控~~ **已核实为误报**（2026-08-22）：Tailwind v4 默认把 `hover:` 变体编译为 `@media (hover: hover) { &:hover }`，本项目（v4.3.3）无 `@custom-variant hover` 覆盖，门控由框架产物承担；主题 CSS 亦无手写 `:hover` 位移。无需改动。
- `DiceRoller.tsx:48-63` 长按 400ms 加骰手势无进度指示（004 只补了按压确认）。
- 弹层双机制风格漂移：`.overlay-pop`（320ms CSS）与 JS popover 弹簧（0.22s）并排时手感不一致。

## 补充机会（additive，未成计划）

- 发送消息无本地乐观回显（`RoomClient.tsx:632-648` 等 SSE 回显才出现；`useRoomEvents.ts:274-287` 的占位替换机制已建好未用）。
- 骰子结果卡已带 `data-grade="critical"/"fumble"` 等钩子（`ChatMessage.tsx:1884-1891`），主题只用于静态配色——大成功/大失败这种稀有高情绪时刻可以有一次性入场动效。
- 检定请求从"待响应按钮"到"完成勾"是同位硬切换（`ChatMessage.tsx:1463-1472`），值得一个小交叉淡入。
