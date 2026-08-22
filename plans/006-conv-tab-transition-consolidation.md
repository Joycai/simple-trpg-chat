# 006 — 收敛 conv-tab 的主题级 transition 覆盖

- **Status**: DONE（已应用到工作树，lint 通过；多主题手感验收待人工过一遍）
- **Commit**: ddd5690
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Easing & duration
- **Estimated scope**: 7 文件（6 个 theme.css + ConversationPanel.tsx），净删约 6 行

## Problem

会话侧栏的频道/私聊 Tab（`.conv-tab`）是房间里最常被悬停的目标之一。组件自己声明了 150ms 的颜色过渡：

```tsx
/* src/components/room/chat/ConversationPanel.tsx:96（:120 同）— 现状 */
className={`w-full text-left transition-colors duration-150 cursor-pointer rounded-[6px] conv-tab ${
```

但六个主题在 theme.css 里各自硬编码了一条 transition，选择器 `[data-theme="x"] .conv-tab`（特异性 0,2,0）压过 Tailwind 工具类（0,1,0），组件的 150ms **全部失效**：

```css
/* 以下 6 处逐字相同 — 现状 */
/* src/themes/cthulhu/theme.css:97 */
/* src/themes/rainglass/theme.css:96 */
/* src/themes/shrine/theme.css:106 */
/* src/themes/parchment/theme.css:100 */
/* src/themes/aether/theme.css:103 */
/* src/themes/aether/theme.css:457（[data-mode="light"] 块内） */
  transition: background-color 0.25s ease-in-out, border-color 0.25s ease-in-out, box-shadow 0.25s ease-in-out, color 0.25s ease-in-out;
```

```css
/* src/themes/default/theme.css:128 — 现状（同样压制组件，且 300ms） */
[data-theme="default"] .conv-tab {
  border-left: 3px solid transparent;
  transition: border-color 0.3s;
}
```

三重问题：hover/颜色变化按审计标准该用 `ease` 而非 `ease-in-out`；250–300ms 对高频 hover 偏慢（预算 ~150ms）；同一份值复制六遍，调整需要改六个文件，且不存在任何令牌。

## Target

**单一事实来源在组件**：主题层不再声明 `transition`，全部删除；组件的工具类从 `transition-colors` 扩成 `transition`（Tailwind 默认属性集含 background-color、border-color、color、box-shadow——覆盖主题此前过渡的全部属性），150ms、Tailwind 默认缓动 `cubic-bezier(0.4, 0, 0.2, 1)`。

```tsx
/* ConversationPanel.tsx:96 — 目标 */
className={`w-full text-left transition duration-150 cursor-pointer rounded-[6px] conv-tab ${
/* :120 同样把 transition-colors 换成 transition，其余不动 */
```

```css
/* 6 处 0.25s ease-in-out 行与 default:128 的 transition: border-color 0.3s 行 — 整行删除 */
```

## Repo conventions to follow

- 主题只负责视觉皮肤（背景、边框、阴影），运动语义收在组件/globals.css —— 与 overlay 系统"`.overlay-drawer`/`.overlay-modal` 是主题样式钩子而非动画类"的既定原则一致（见 useOverlayTransition.ts 尾注）。
- 本仓库已有先例：RoomTopBar 的 iconBtn（RoomTopBar.tsx:195）就是组件级 `transition` 工具类统一全组按钮。

## Steps

1. `src/components/room/chat/ConversationPanel.tsx:96` 与 `:120`：`transition-colors duration-150` → `transition duration-150`。
2. 删除以下 7 行（每行都是规则块内独立一行，删除后保留块的其余声明）：
   - `src/themes/cthulhu/theme.css:97`
   - `src/themes/rainglass/theme.css:96`
   - `src/themes/shrine/theme.css:106`
   - `src/themes/parchment/theme.css:100`
   - `src/themes/aether/theme.css:103`
   - `src/themes/aether/theme.css:457`
   - `src/themes/default/theme.css:128`（`transition: border-color 0.3s;` 一行）
3. 确认再无残留：`grep -rn "conv-tab" src/themes/` 的结果块中不应再出现 `transition:`。

## Boundaries

- 不动各主题 `.conv-tab` 规则块里的其他声明（background/border/box-shadow 视觉皮肤）。
- 不动各 theme.css 里 `:134/:138/:143` 附近属于其他元素的 `transition: border-color 0.2s ease, box-shadow 0.2s ease` 行。
- 不引入新 CSS 变量/令牌（组件工具类已是单一来源，无需令牌）。
- 若行号漂移，按引用代码原文定位；找不到则停下报告。

## Verification

- **Mechanical**: `pnpm lint` 通过；`grep -n "transition" src/themes/*/theme.css` 中与 `.conv-tab` 同块的行为 0。
- **Feel check**（`pnpm dev`，逐主题切换：default / parchment / cthulhu / shrine / rainglass / aether，各看明暗两种模式）：
  - 悬停会话 Tab：背景/文字色 150ms 快速过渡，明显比之前的 250ms 利落；六个主题手感一致。
  - 点击切换 Tab：active 态的左边框与背景渐变即时正确（这些是视觉皮肤，不受本改动影响）。
  - default 主题：active Tab 左边框出现速度从 300ms 变为 150ms。
- **Done when**: 组件的 150ms 在所有主题下真实生效，主题层零 transition 声明。
