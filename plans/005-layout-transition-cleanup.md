# 005 — 清理布局属性动画（重排热点 + transition-all 收口）

- **Status**: DONE（含可选后台步骤，已应用到工作树，机器验证通过；手感验收清单待人工过一遍）
- **Commit**: cf83357
- **Severity**: MEDIUM（其中分栏把手一项接近 HIGH）
- **Category**: Performance
- **Estimated scope**: 3 文件核心 + 4 文件可选，约 15 行

## Problem

**1. 分栏拖拽把手在 hover 时动画宽度，逐帧重排整个聊天列。**

```tsx
/* src/components/room/RoomClient.tsx:905 — 现状 */
className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-all duration-150 shrink-0 relative z-10 group"
```

`w-1 → w-1.5`（4px→6px）经 `transition-all` 变成约 9 帧的**宽度动画**；把手是会话侧栏与聊天列之间的 `shrink-0` flex 子项，每一中间帧都把聊天列（全应用最重的子树，完整消息列表）重排 1–2px。鼠标每次无意扫过分隔线都触发一遍，`:active` 拖拽时再来一遍。作者意图显然只是颜色过渡，宽度是被 `transition-all` 顺带卷进来的。

**2. 大厅筛选指示条用 `left` 滑动而不是 transform。**

```tsx
/* src/components/lobby/LobbyClient.tsx:265 — 现状 */
className="filter-indicator absolute bottom-0 h-[2px] rounded-full transition-all duration-300 ease-out"
style={{ left: `${tabIndex * 33.33}%`, width: '33.33%' }}
```

动画 `left` 走布局+绘制路径；`transition-all` 还把 `width` 卷入作用域；300ms 用在 Tab 点击反馈上也偏慢（预算 150–250ms）。

**3. 房间内 HP/SAN/MP 条用 `transition-all` 包着宽度过渡。**

```tsx
/* src/components/room/character/AttributesTab.tsx:202 — 现状 */
<div className="h-full rounded-full transition-all"
```

游戏进行中每次改血量/理智都触发。小进度条的宽度过渡本身可接受（业界惯例，scaleX 会压扁圆角端帽），问题在 `transition-all` 把颜色、圆角等全部属性卷入，且未限定作用域。

**4.（可选，低优先）管理后台各进度条同病：**
`ServerLoadSection.tsx:36/:61`、`ImageCacheSection.tsx:56`、`AdminImageCacheManager.tsx:102` 均为 `transition-all duration-500`（500ms 超 UI 预算），`TokenUsageDashboard.tsx:211` 为 `transition-all` 动画内联 `height`（N 根柱同时逐帧重排）。

## Target

```tsx
/* RoomClient.tsx:905 — 目标：宽度瞬时跳变（2px 不可感知），只过渡颜色 */
className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-colors duration-150 shrink-0 relative z-10 group"
```

```tsx
/* LobbyClient.tsx:265 — 目标：transform 滑动，200ms，令牌缓动 */
className="filter-indicator absolute bottom-0 left-0 h-[2px] rounded-full transition-transform duration-200 ease-[var(--ease-spring-snappy)]"
style={{ width: "33.33%", transform: `translateX(${tabIndex * 100}%)` }}
```

（`translateX(100%)` 以元素自身宽度为单位，元素宽 33.33%，因此 `tabIndex * 100%` 与原 `left: tabIndex * 33.33%` 落点完全一致。）

```tsx
/* AttributesTab.tsx:202 — 目标：作用域收窄到 width */
<div className="h-full rounded-full transition-[width] duration-300"
```

可选步骤（后台）：四处 `transition-all duration-500` → `transition-[width] duration-300`；TokenUsageDashboard.tsx:211 → `transition-[height] duration-300`。

## Repo conventions to follow

- 属性作用域写法先例：`InventoryModals.tsx:144` 的 `transition-[grid-template-rows]`。
- 缓动令牌：`var(--ease-spring-snappy)`（globals.css:162）；Tailwind 任意值写法 `ease-[var(--ease-spring-snappy)]` 在本仓库同类场景可用。

## Steps

1. `RoomClient.tsx:905`：`transition-all` → `transition-colors`（其余保持不动）。
2. `LobbyClient.tsx:265`：按 Target 替换 className 与 style（`left` 固定为 0 移入 className，位移改 `transform`）。确认 `.filter-indicator` 在主题 CSS 中没有额外的 `left/transition` 规则（`grep -rn "filter-indicator" src/`），若有冲突停下报告。
3. `AttributesTab.tsx:202`：`transition-all` → `transition-[width] duration-300`。
4. （可选）后台四处按 Target 收口。若时间有限可整体跳过本步，不影响验收。

## Boundaries

- 不改分栏拖拽逻辑（useSidebar.ts）与指示条的定位算式含义。
- 不把进度条改成 scaleX 方案（圆角端帽会变形，明确不做）。
- 不新增依赖。
- 行号漂移按引用代码原文定位；找不到停下报告。

## Verification

- **Mechanical**: `pnpm lint`、`pnpm build` 通过。
- **Feel check**（`pnpm dev`）：
  - 鼠标反复扫过房间分栏把手：颜色平滑过渡，宽度瞬时 2px 跳变应不可察觉；DevTools Performance 面板录制扫过动作，Layout 事件不再随 hover 逐帧出现。
  - 大厅切换三个筛选 Tab：指示条 200ms 滑到位，落点与 Tab 文字对齐无偏移；快速连点两个 Tab，滑动中途重定向（transition 天然可中断）不回跳。
  - 打开人物卡改 HP：血条 300ms 平滑到新宽度，颜色变化（若有）瞬时完成。
- **Done when**: 三个核心站点无 `transition-all`，指示条不再动画 `left`。
