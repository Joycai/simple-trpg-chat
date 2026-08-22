# 008 — 修正 overlay-pop 对底部锚定消费者的入场方向；清理 .animate-in 站点的失效 duration-* 类

- **Status**: DONE（已应用到工作树，lint 通过；快捷键提示方向的手感验收待人工过一遍）
- **Commit**: b880375
- **Severity**: LOW（两项打包）
- **Category**: Physicality & origin / Cohesion & tokens
- **Estimated scope**: 5 文件，约 8 行

## Problem

**A. 快捷键提示从上方进入，但锚点在右下。**

```css
/* src/app/globals.css:254-261 — 现状 */
@keyframes overlay-pop-in {
  from { transform: scale(0.95) translateY(-6px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}
.overlay-pop {
  animation: overlay-pop-in var(--overlay-pop-dur) var(--ease-spring-snappy) both;
  transform-origin: var(--overlay-pop-origin, top center);
}
```

```tsx
/* src/components/room/RoomClient.tsx:1043-1045 — 现状 */
<div className="fixed bottom-24 right-4 z-30 flex items-center gap-2.5 bg-surface theme-border rounded-theme shadow-xl pl-3.5 pr-2 py-2.5 overlay-pop"
  style={{ transformOrigin: "bottom right" }} role="status">
```

`translateY(-6px)` 是为向下展开的下拉菜单硬编码的。快捷键提示锚定屏幕右下（`fixed bottom-24 right-4`），origin 设了 `bottom right`，却从上方 6px 落下——向锚定边移动而不是从锚定边长出，origin 与位移互相矛盾。

**B. 4 处 `.animate-in` 站点残留失效的 `duration-*` 类。**

globals.css:286-288 已注明：`duration-*` 是 Tailwind 的 transition-duration，到不了 animation-duration；`.animate-in` 实际跑 `--enter-dur` 默认 180ms。以下 4 个元素都没有任何 `transition` 工具类会消费这个属性——纯粹的死类，且向维护者谎报意图（改数字不会有任何效果）：

```tsx
/* src/components/shared/ImagePreview.tsx:174 — 现状 */
className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center overflow-hidden animate-in fade-in duration-150"
/* src/components/room/chat/ChatInput.tsx:387 — 现状 */
<div className="absolute bottom-full left-12 mb-2 z-10 animate-in slide-in-from-bottom-2 duration-200">
/* src/components/room/chat/ChatMessage.tsx:1539 — 现状（代理弹层） */
… py-1.5 animate-in fade-in zoom-in-95 duration-100">
/* src/components/room/chat/ChatMessage.tsx:1864 — 现状（消息右键菜单） */
… z-30 animate-in fade-in zoom-in-95 duration-100 ${
```

（第 5 处 ResourceStatusTooltip 已在计划 001 中清理。）

## Target

**A**：把关键帧的 Y 位移参数化为带回退的自定义属性——`var()` 带 fallback 恒可解析，不会触发旧 `linear()` 事故那种"整条 animation 声明失效"（那次的根因是自定义属性本身承载了不受支持的函数，见 useOverlayTransition.ts 头注）：

```css
/* globals.css — 目标 */
@keyframes overlay-pop-in {
  from { transform: scale(0.95) translateY(var(--overlay-pop-y, -6px)); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}
```

```tsx
/* RoomClient.tsx:1045 — 目标：底部锚定 → 从下方 6px 升起 */
style={{ transformOrigin: "bottom right", "--overlay-pop-y": "6px" } as React.CSSProperties} role="status">
```

其余 8 个 `.overlay-pop` 消费者（RoomTopBar ×4、UserDropdown、ThemeSwitcher、NotebookViewer、ConversationPanel）都是向下展开、origin top，走 `-6px` 回退值，行为不变、零改动。

**B**：从 4 个 className 中删除 `duration-150` / `duration-200` / `duration-100`（各删一个 token，其余不动）。不试图"恢复原意图的时长"——globals.css:286-288 说明当初就是有意收敛到单一 180ms 的，删掉谎报的类即是完成。

## Repo conventions to follow

- 自定义属性 + 回退值的参数化模式即 `.overlay-pop` 自己的 `var(--overlay-pop-origin, top center)`（globals.css:260），照抄同一形状。
- TSX 内联样式写自定义属性需 `as React.CSSProperties` 断言（仓库内已有先例可 grep `CSSProperties`）。

## Steps

1. globals.css：`translateY(-6px)` → `translateY(var(--overlay-pop-y, -6px))`（keyframe 的 from 行，仅此一处）。
2. RoomClient.tsx:1045：style 对象加 `"--overlay-pop-y": "6px"`，并给整个对象加 `as React.CSSProperties` 断言（若尚无）。
3. ImagePreview.tsx:174：删 `duration-150`。
4. ChatInput.tsx:387：删 `duration-200`。
5. ChatMessage.tsx:1539 与 :1864：各删 `duration-100`。删除前确认该元素 className 中确无 `transition` 系工具类（:1864 的模板串尾部也要看完）；若有，停下报告。
6. 核对：`grep -rn "animate-in" src/components/ | grep "duration-"` 应零命中。

## Boundaries

- 不动其余 8 个 `.overlay-pop` 消费者。
- 不动 `.animate-in` 的 CSS 定义与 `--enter-dur`。
- 不动 002 引入的 `rowEnterClass`/`pillEnterClass` 条件逻辑。
- 若行号漂移按代码原文定位；找不到停下报告。

## Verification

- **Mechanical**: `pnpm lint` 通过；步骤 6 的 grep 零命中。
- **Feel check**（`pnpm dev`）：
  - 首次进房触发快捷键提示（或清 localStorage 重进）：提示从右下角**向上**升起 6px 入场，DevTools Animations 面板调 10% 速度确认方向。
  - 随便打开一个 TopBar 下拉：仍从上方 -6px 落下，与改动前一致（回退值路径）。
  - 打开图片预览、@ 提及面板、消息右键菜单：入场动画时长与改动前无任何变化（删的全是死类）。
- **Done when**: 快捷键提示方向与锚点一致；`animate-in` 站点零 `duration-*` 残留。
