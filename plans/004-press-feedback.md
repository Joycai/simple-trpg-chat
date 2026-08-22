# 004 — 给高频按钮补上按压反馈

- **Status**: DONE（已应用到工作树，机器验证通过；手感验收清单待人工过一遍）
- **Commit**: cf83357
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 3 文件，约 10 行（纯 className 追加）

## Problem

全仓 `active:scale|active:translate|active:brightness|active:opacity` 只有一处命中：

```tsx
/* src/components/room/chat/ChatArea.tsx:138 — 全仓唯一的按压反馈，也是本计划的范本 */
className="… transition-all transform hover:scale-110 active:scale-95 group"
```

产品里按得最多的控件全部没有 `:active` 状态，只有颜色 hover：

```tsx
/* src/components/room/chat/ChatInput.tsx:549 — 发送按钮（全产品最高频控件）— 现状 */
className={`flex items-center justify-center w-10 h-10 rounded-theme font-bold transition shrink-0 shadow-[var(--theme-glow)] ${…}`}
```

- ChatInput.tsx `:462, :484, :504, :519, :531` — 输入栏 5 枚 `w-9 h-9` 工具按钮（快速检定、图片、贴纸、骰子、私聊），全部只有 `transition` + 颜色变化。
- RoomTopBar.tsx:195 — 顶栏全部图标按钮共享的 `iconBtn` 令牌：

```tsx
/* src/components/room/RoomTopBar.tsx:195 — 现状 */
const iconBtn = "relative flex items-center justify-center w-9 h-9 rounded-theme border transition-colors cursor-pointer";
```

- DiceRoller.tsx:123 — 骰子面数按钮（`transition-all duration-150`），且它带 400ms 长按加骰手势（:48-63, :119），当前按下瞬间**没有任何视觉状态**，用户无从得知按压已注册。

每一次发消息、每一次掷骰都落在一个毫无触觉确认的按钮上。审计标准：按压反馈为 `:active` 缩至 0.95–0.98，transition 覆盖 transform。

## Target

统一用 Tailwind `active:scale-95`（40px 以下小按钮取 0.95，与范本一致），前提是元素的 transition 属性集包含 `transform`：

- `transition`（Tailwind 默认集）**已含** transform —— ChatInput 各按钮直接追加类即可。
- `transition-colors` **不含** transform —— iconBtn 需改为 `transition`。
- `transition-all` 已含 —— DiceRoller 直接追加。

## Repo conventions to follow

- 范本：`ChatArea.tsx:138` 的 `active:scale-95`。
- 顶栏按钮样式统一走 `iconBtn` 字符串令牌（RoomTopBar.tsx:192-195 注释明确说明按钮统一尺寸/行为都收在这里）——改令牌一处，全顶栏生效。

## Steps

1. `ChatInput.tsx:549`（发送按钮）：className 模板串首段追加 `active:scale-95`（保留原有 `transition`）。
2. `ChatInput.tsx:462, :484, :504, :519, :531`：五枚工具按钮各追加 `active:scale-95`（它们已有 `transition`；若个别写的是 `transition-colors`，同时改成 `transition`）。
3. `RoomTopBar.tsx:195`：
   ```tsx
   const iconBtn = "relative flex items-center justify-center w-9 h-9 rounded-theme border transition active:scale-95 cursor-pointer";
   ```
4. `DiceRoller.tsx:123`：面数按钮 className 追加 `active:scale-[0.96]`（长按手势至少获得按下确认；完整的长按进度指示留待后续，不在本计划）。

## Boundaries

- 只追加/替换列出的 className 片段，不改任何 onClick/onPointerDown 逻辑。
- 不给列表行、Tab、链接加按压反馈（本计划只覆盖"按钮形"控件）。
- 不新增 CSS、不新增依赖。
- 行号漂移则按引用代码原文定位；找不到停下报告。

## Verification

- **Mechanical**: `pnpm lint`、`pnpm build` 通过。
- **Feel check**（`pnpm dev`）：
  - 按住发送按钮不放：按钮缩至 95% 并停在那里；松开回弹。反馈应在 `transition` 默认 150ms 内完成，无迟滞感。
  - 快速连点骰子面数按钮：每次点击都有独立的按压-回弹，连点不粘滞（transition 可中断重定向，天然满足）。
  - 顶栏每个图标按钮（角色/背包/记事本/事件/成员/设置）逐个点按确认缩放生效且边框颜色过渡未丢失。
  - 移动端视口（DevTools 切 mobile）点按发送：触摸下 `:active` 同样触发。
- **Done when**: 上述控件按压全部有 0.95 缩放反馈，且无原有颜色过渡回归。
