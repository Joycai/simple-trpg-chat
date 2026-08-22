# 009 — 令牌外手写 cubic-bezier 清理（五处收归缓动令牌）

- **Status**: DONE（已应用到工作树，lint 通过；手风琴/FLIP 手感验收待人工过一遍）
- **Commit**: 30547a9
- **Severity**: LOW（其中 FLIP 时长超预算一项为 MEDIUM）
- **Category**: Cohesion & tokens / Easing & duration
- **Estimated scope**: 3 文件 5 处，纯值替换

## Problem

仓库的缓动令牌集是 globals.css:161-162 的 `--ease-spring-smooth` / `--ease-spring-snappy`（fallback 均为 `cubic-bezier(0.32, 0.72, 0, 1)`，在 `@supports` 下升级为采样自弹簧方程的 `linear()` 曲线）。以下五处绕开了令牌手写曲线，**永远停留在降级档**——当浏览器支持 `linear()` 时，全应用都在真弹簧曲线上运动，唯独这五处还是普通贝塞尔，动效语言在此分叉：

```tsx
/* 以下 4 处逐字相同（手风琴展开/收起）— 现状 */
/* src/components/room/inventory/InventoryModals.tsx:144 与 :256 */
/* src/components/room/event/EventEditor.tsx:151 与 :226 */
<div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${…Expanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
```

```tsx
/* src/components/room/event/EventManagePanel.tsx:102 — 现状（FLIP 列表重排） */
el.style.transition = "transform 360ms cubic-bezier(0.2,0.85,0.25,1)";
```

`(0.16,1,0.3,1)` 是 expo-out，`(0.2,0.85,0.25,1)` 是第三种变体——都与令牌的感知邻域接近却各不相同。另外 FLIP 的 360ms 超出 UI 动效 300ms 上限（这是列表行滑到新位置的"屏上移动"，不是 modal；事件发布/撤回可连续触发时行会长时间悬在半空）。

## Target

```tsx
/* 4 处手风琴 — 目标（只换缓动，时长不动） */
<div className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-spring-smooth)] ${…
```

```tsx
/* EventManagePanel.tsx:102 — 目标（令牌 + 降回预算内） */
el.style.transition = "transform 250ms var(--ease-spring-smooth)";
```

选 `--ease-spring-smooth`（长距离/形变的平滑弹簧，drawer 同款）：手风琴是内容形变、FLIP 是行位移，都属"屏上移动"，与 snappy（弹出类）语义区分一致。`linear()` 采样曲线形状与时长无关（globals.css:177-178 注释），套在 300ms/250ms 上直接可用。

## Repo conventions to follow

- Tailwind 任意值引用令牌的写法先例：LobbyClient.tsx 筛选指示条的 `ease-[var(--ease-spring-snappy)]`（计划 005 引入）。
- JS 内联样式里 CSS 变量可直接写进 transition 简写（浏览器在 computed 时解析）。

## Steps

1. `InventoryModals.tsx:144` 与 `:256`：`ease-[cubic-bezier(0.16,1,0.3,1)]` → `ease-[var(--ease-spring-smooth)]`。
2. `EventEditor.tsx:151` 与 `:226`：同上。
3. `EventManagePanel.tsx:102`：整串替换为 `el.style.transition = "transform 250ms var(--ease-spring-smooth)";`。
4. 核对：`grep -rn "cubic-bezier" src/components/` 应零命中（令牌外曲线只应存在于 globals.css 与 useOverlayTransition.ts 的令牌/弹簧定义处）。

## Boundaries

- 不动手风琴的 `grid-rows` 机制与 `duration-300`。
- 不动 EventManagePanel 的 FLIP 测量/invert 逻辑（:81-107 仅 :102 一行）。
- 不动 globals.css 与 useOverlayTransition.ts 里的曲线定义。
- 若行号漂移按代码原文定位；找不到停下报告。

## Verification

- **Mechanical**: `pnpm lint` 通过；步骤 4 的 grep 零命中。
- **Feel check**（`pnpm dev`）：
  - 背包物品编辑弹窗与事件编辑器里展开/收起描述区：300ms 形变依旧顺滑，支持 `linear()` 的浏览器（Chrome/Edge/Safari 新版）里应带轻微弹簧质感，与 overlay 抽屉同语言。
  - 主持人事件面板发布/撤回一个事件：行滑动到新位置 250ms 完成，比之前利落；快速连续操作时行不再长时间悬在半空（FLIP 用 getBoundingClientRect 测量含在途 transform，中断重定向不跳）。
- **Done when**: `src/components/` 零手写 cubic-bezier，五处全部走令牌。
