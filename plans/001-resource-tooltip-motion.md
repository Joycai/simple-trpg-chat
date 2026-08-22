# 001 — 修复头像悬浮状态卡的动效（三重故障合并修复）

- **Status**: DONE（已应用到工作树，机器验证通过；手感验收清单待人工过一遍）
- **Commit**: cf83357
- **Severity**: HIGH
- **Category**: Performance / Interruptibility / Physicality
- **Estimated scope**: 2 文件（ResourceStatusTooltip.tsx、ChatMessage.tsx），约 10 行改动

## Problem

聊天区每个头像的悬浮状态卡（`ResourceStatusTooltip`）是全房间触发频率最高的浮层之一，一个元素上叠了三个互相放大的问题：

```tsx
/* src/components/room/chat/ResourceStatusTooltip.tsx:74 — 现状 */
className="fixed w-52 bg-surface/95 backdrop-blur-md border border-border shadow-2xl rounded-theme p-3 text-xs text-text flex flex-col gap-2.5 select-none transition-all duration-200 animate-in fade-in zoom-in-95 duration-150 z-[100]"
style={{ top: coords.top, left: coords.left }}
```

1. **`transition-all` 对抗逐帧定位**。`ChatMessage.tsx:1287-1315` 用 rAF 节流的 scroll 监听逐帧写入新的 `top`/`left`（内联 style）。`transition-all` 把这两个布局属性也纳入 200ms 过渡，于是滚动时卡片以 200ms 的惯性橡皮筋式拖在头像后面，永远追不上锚点。
2. **`duration-200` 与 `duration-150` 冲突**。两者都编译为 `transition-duration`，谁生效取决于 Tailwind 产物顺序而不是书写顺序；且 `duration-*` 根本到不了 `animation-duration`（globals.css:286-288 已注明），入场实际跑的是 `--enter-dur` 默认 180ms——三个时长数字全在说谎。
3. **`backdrop-blur-md` 在变换动画期间逐帧重采样**。入场 `zoom-in-95` 是 transform 关键帧；带 backdrop-filter 的元素每移动一帧都要对背后内容重新采样重模糊——这正是本仓库 `data-animating` 机制（globals.css:230-240）存在的原因，但该机制只由 `useOverlayTransition` 盖章，纯 CSS 关键帧站点得不到抑制。而卡片底色是 `bg-surface/95`（95% 不透明），模糊效果本身几乎不可见——极高成本换近零收益。

另外：`ui-enter` 关键帧不设 `transform-origin`，默认 center——这张 208px 宽、内容多时高约 200px 的卡片锚定在 32px 头像右侧 8px 处，从中心放大意味着两轴各约 10px 的漂移，而不是"从头像处长出来"。且 `onMouseEnter` 立即挂载（无 hover 意图延迟），光标沿头像列扫过时每个头像都完整重放一次入场并触发一次角色数据请求。

内部资源条也有同样的 `transition-all`：

```tsx
/* src/components/room/chat/ResourceStatusTooltip.tsx:118（:181 同）— 现状 */
className="h-full rounded-full transition-all duration-300"
style={{ width: `${pct}%`, backgroundColor: `rgb(${color})` }}
```

## Target

```tsx
/* ResourceStatusTooltip.tsx:74 — 目标 */
className="fixed w-52 bg-surface/95 border border-border shadow-2xl rounded-theme p-3 text-xs text-text flex flex-col gap-2.5 select-none animate-in fade-in zoom-in-95 origin-top-left z-[100]"
```

- 删除：`backdrop-blur-md`、`transition-all`、`duration-200`、`duration-150`
- 新增：`origin-top-left`（Tailwind 会生成 `transform-origin: top left`，与锚点"头像右上方"一致）
- 定位更新不再有任何 transition：滚动时 1:1 跟随头像。
- 入场保留 `animate-in fade-in zoom-in-95`（180ms `--enter-dur`，本仓库自建系统，globals.css:296-302 已含 reduced-motion 折叠）。

```tsx
/* ResourceStatusTooltip.tsx:118 与 :181 — 目标 */
className="h-full rounded-full transition-[width] duration-300"
```

Hover 意图延迟（在 ChatMessage.tsx 中）：

```tsx
/* 模式 — 用 ref 存计时器；120ms 内离开则不挂载 */
const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// onMouseEnter：
hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
// onMouseLeave：
if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
hoverTimerRef.current = null;
setIsHovered(false);
```

## Repo conventions to follow

- 入场动画走 `.animate-in` 自建系统（globals.css:290-302），不引入新关键帧。
- `transition-[width]` 的属性作用域写法在本仓库已有先例：`InventoryModals.tsx:144` 的 `transition-[grid-template-rows]`。
- 不要给这个纯 CSS 站点接 `beginMotion`/`data-animating` —— 删除 `backdrop-blur-md` 后该机制不再需要。

## Steps

1. `src/components/room/chat/ResourceStatusTooltip.tsx:74`：按 Target 替换根元素 className（删 4 个类、加 `origin-top-left`）。
2. 同文件 `:118` 与 `:181`：`transition-all duration-300` → `transition-[width] duration-300`。
3. `src/components/room/chat/ChatMessage.tsx`：找到设置 `isHovered` 的 `handleMouseEnter`（在 :1718 附近被 `onMouseEnter` 引用）与对应 `onMouseLeave`（:1719 附近，内联 `() => setIsHovered(false)`）。加 `hoverTimerRef`，进入时 120ms 延迟置 true，离开时清计时器并置 false。组件卸载时也要清计时器（在现有 cleanup 或新 useEffect 中）。注意：`handleMouseEnter` 若还触发角色数据预取，预取可以保持立即执行（提前取数无害），只延迟 `setIsHovered`。

## Boundaries

- 不改 `coords` 的计算逻辑与 rAF 节流（ChatMessage.tsx:1287-1315 保持原样）。
- 不改卡片内部布局/内容结构，只动列出的动效类。
- 不新增依赖；不引入新 keyframes。
- 若发现代码与本计划引用的行号/代码不符（commit 漂移），停下报告，不要即兴发挥。

## Verification

- **Mechanical**: `pnpm lint` 通过；`pnpm build` 通过。
- **Feel check**（`pnpm dev`，进入任意有其他成员消息的房间）：
  - 悬停对方头像：卡片从头像侧（左上角）长出，不再从中心漂移。
  - 悬停卡片打开状态下滚动聊天区：卡片与头像**零延迟**同步移动，无橡皮筋拖尾。
  - 光标快速沿多条消息的头像列扫过：不再连环弹出（120ms 意图延迟吞掉扫过）。
  - DevTools Rendering 面板开启 `prefers-reduced-motion: reduce`：卡片仍立即出现（1ms 折叠），无移动。
  - 视觉回归：卡片底色 95% 不透明，去掉模糊后外观应无可感知差异——在 rainglass 主题下对比确认一次。
- **Done when**: 以上全部成立，且根元素 className 中不再含 `transition-all`、`backdrop-blur-md`、重复 `duration-*`。
