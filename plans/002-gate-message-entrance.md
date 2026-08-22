# 002 — 消息入场动画只给真正新到达的消息

- **Status**: DONE（已应用到工作树，lint/609 测试/tsc 全过；手感验收清单待人工过一遍）
- **Commit**: cf83357
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 4 文件（useRoomEvents.ts、RoomClient.tsx、ChatArea.tsx、ChatMessage.tsx），约 40 行

## Problem

每条消息的根元素无条件携带入场动画：

```tsx
/* src/components/room/chat/ChatMessage.tsx:1713 — 现状 */
<div className={`flex gap-3 py-1.5 group animate-in fade-in slide-in-from-bottom-1 ${isOwn ? "flex-row-reverse" : ""}`}>
```

`.animate-in`（globals.css:296）是 CSS 关键帧，在**挂载**时触发，而不是"消息是新的"时触发。三条批量挂载路径全部误触发：

1. **进房初始加载**——最多 100 条历史消息在一次 commit 中全部 fade-rise（RoomClient.tsx:122 播种，ChatArea.tsx:76 map 渲染）。
2. **向上翻页**——RoomClient.tsx:466-469 一次前插 50 条旧消息，同时下一个 rAF 做滚动补偿（:478-483），50 条消息在视口跳变的背后集体升起。
3. **切换会话 Tab**（含 Alt+↑/↓ 键盘路径）——过滤集整体更换，进入 Tab 的所有消息重新挂载并重放动画。键盘触发的操作按审计标准不应有任何动画。

入场动画的目的是"状态指示：这条是新来的"。对历史消息它是纯装饰噪音，且频率极高（每次进房、每次翻页、每次切 Tab）。同样的无条件 `animate-in fade-in` 还出现在 ChatMessage.tsx 内的系统胶囊变体：`:1436, :1571, :1590, :1599, :1629, :1643`，以及子组件 `DispatchPill`（:857，渲染点 :880/:905）和 `ReceiptPill`（:979，渲染点 :1004/:1035）。

## Target

只有**通过 SSE 实时到达**（或本地即时生成，如错误胶囊）且**到达后 3 秒内渲染**的消息播放入场动画。历史加载、翻页、Tab 切换全部静默挂载。

机制：一张 `Map<string, number>`（消息 id → 到达时刻），由实时路径写入；渲染时查表判断。不删除条目（3 秒窗口自然失效，Map 随会话消息量线性增长，内存可忽略），因此对 React StrictMode 双挂载天然安全。

## Repo conventions to follow

- `seenIdsRef`（`useRef<Set<string>>`）已经以同样方式在 RoomClient 与 useRoomEvents 之间传递——新的 `liveEnterRef` 完全仿照它。
- ChatMessage 的 props 是显式接口逐个传递的（见 ChatArea.tsx:79-99），新 prop `enter` 照此追加。

## Steps

1. **RoomClient.tsx**：在 `seenIdsRef` 声明旁新增
   ```tsx
   const liveEnterRef = useRef(new Map<string, number>());
   ```
   传给 `useRoomEvents`（新参数）与 `<ChatArea liveEnterRef={liveEnterRef} …>`。
2. **RoomClient.tsx:625 与 :683**（本地错误胶囊，负 id）：在 `seenIdsRef.current.add(...)` 旁加
   ```tsx
   liveEnterRef.current.set(String(errorMsg.id), Date.now());
   ```
3. **src/components/room/hooks/useRoomEvents.ts**：hook 参数新增 `liveEnterRef: React.MutableRefObject<Map<string, number>>`。
   - 实时 SSE 路径 `:268`（`seenIdsRef.current.add(idStr)` 之后）：`liveEnterRef.current.set(idStr, Date.now());`
   - 断线重连补漏路径 `:78`（`seenIdsRef.current.add(String(m.id))` 之后）：`liveEnterRef.current.set(String(m.id), Date.now());`（补漏的消息对用户同样是新的，应当播放入场）。
4. **ChatArea.tsx**：props 接口加 `liveEnterRef`；在 `:76` 的 `tabMessages.map` 内计算并下传：
   ```tsx
   const enteredAt = liveEnterRef.current.get(String(msg.id));
   const enter = enteredAt !== undefined && Date.now() - enteredAt < 3000;
   ```
   `<ChatMessage … enter={enter} />`
5. **ChatMessage.tsx**：props 加 `enter?: boolean`（默认 `false`）。组件体内一次性捕获，派生两个类字符串：
   ```tsx
   const [entered] = useState(enter); // 捕获一次，后续重渲染不回退
   const rowEnterClass = entered ? "animate-in fade-in slide-in-from-bottom-1" : "";
   const pillEnterClass = entered ? "animate-in fade-in" : "";
   ```
   - `:1713` 根元素：`animate-in fade-in slide-in-from-bottom-1` → `${rowEnterClass}`。
   - `:1436, :1571, :1590, :1599, :1629, :1643`：各自的 `animate-in fade-in` → `${pillEnterClass}`。
   - `DispatchPill`（:857）与 `ReceiptPill`（:979）：各加 `enter?: boolean` prop，内部同样一次性捕获后替换 `:880/:905/:1004/:1035` 的 `animate-in fade-in`；调用点把外层的 `entered` 传入。
   - `:1505` 与 `:1826` 的代理弹层 `animate-in fade-in zoom-in-95 duration-100` **不改**——那是用户点击触发的弹层入场，不是消息入场。
6. `TimelineDivider.tsx:39` 的 `animate-in fade-in` **不在本计划范围**（时间线分割线出现频率极低，留待后续）。

## Boundaries

- 不改消息渲染内容、key、排序、去重逻辑。
- 不动 `.animate-in` 的 CSS 定义（globals.css）。
- 不新增依赖。
- 若行号对不上（commit 漂移），以引用的代码原文定位；仍找不到则停下报告。

## Verification

- **Mechanical**: `pnpm lint`、`pnpm test`、`pnpm build` 全部通过。
- **Feel check**（`pnpm dev`，两个浏览器登两个账号进同一房间）：
  - 刷新进房：历史消息**静止出现**，无集体升起。
  - 滚到顶部触发翻页：前插的旧消息无动画，视口无跳动叠加的错觉。
  - Alt+↑/↓ 切换会话 Tab：消息列表瞬时切换（PaneTransition 的面板动画仍在，属预期）。
  - 另一账号发一条消息：这条消息**有** fade-rise 入场。
  - 自己发消息：SSE 回显的那条有入场动画。
  - DevTools Animations 面板调到 10% 速度，确认新消息入场只在该条上播放，相邻历史消息不动。
- **Done when**: 三条批量路径零动画、实时消息保留动画，以上肉眼确认。
