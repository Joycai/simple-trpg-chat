# 003 — 用有限次到达提示取代房间界面里的无限循环动画

- **Status**: TODO
- **Commit**: cf83357
- **Severity**: HIGH
- **Category**: Purpose & frequency / Accessibility
- **Estimated scope**: 5 文件 + globals.css，约 30 行

## Problem

房间（用户连续盯几小时的界面）的常驻 chrome 里有多处**永不停止**的注意力动画，且全部在 `prefers-reduced-motion` 覆盖之外（globals.css:308 只覆盖 `.overlay-pop` 与 `.animate-in`；Tailwind 的 `animate-bounce`/`animate-pulse` 自身不设门控）：

```tsx
/* src/components/room/RoomTopBar.tsx:306（:327、:340 同构）— 现状 */
<span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce shadow-md">
```

三枚未读徽标可同时无限上下弹跳，直到用户清空未读——可能持续数小时，位于永久余光区。而**到达瞬间**（0→1 或数字递增）反而是硬切换，毫无动效：注意力预算花在了完全错误的半边。

```tsx
/* src/components/room/chat/ChatArea.tsx:146 — 现状 */
<div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-widest bg-accent/5 py-1 px-2 rounded-md border border-accent/20 animate-pulse">
```

私聊模式横幅在整段私聊期间持续脉动，正压在用户打字的输入框上方。状态已由强调色、边框、文字、退出按钮四重表达，脉动是第五重且永不停。

```tsx
/* src/components/room/chat/ConversationPanel.tsx:148 — 现状 */
<span className="… rounded-full bg-danger text-white text-[9px] font-bold px-1 animate-pulse">
```

未读数是**静态数字**，不是不确定进度——pulse 是进度语义被挪用为强调。同文件 `:142` 的 provider-error 标签、`MembersDialog.tsx:99`（AI 禁用图标）与 `:116`（警告标签）同理（持久状态不需要动画表达）。

```tsx
/* src/components/room/chat/ChatMessage.tsx:1466 — 现状 */
className="check-request-button bg-accent hover:bg-accent-hover text-accent-foreground w-8 h-8 rounded-full flex items-center justify-center transition animate-bounce shadow-[var(--theme-glow)]"
```

待响应检定按钮是真实 CTA（比徽标正当），但它在滚动的消息流里无限弹跳，多个待定时同时弹。有限次弹跳传达同样的信息。

## Target

**到达时动，静止时停。** 在 globals.css 新增两个有限动画工具类（挂进现有 reduced-motion 块），徽标用"到达弹入"，CTA 用"三次弹跳后静止"；纯状态标签直接删动画。

```css
/* globals.css — 新增，放在 .animate-in 定义（:296-302）之后 */

/* 徽标到达/递增时的一次性弹入。key 到计数值上，数字变化即重放。 */
@keyframes badge-in {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
.badge-in { animation: badge-in 400ms var(--ease-spring-snappy) both; }

/* 有限次注意力弹跳（检定 CTA）：3 次后静止。 */
@keyframes attention-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-25%); }
}
.attention-bounce { animation: attention-bounce 0.8s ease-in-out 3; }
```

并把这两个类追加进 globals.css:308 的 reduced-motion 块：

```css
@media (prefers-reduced-motion: reduce) {
  .overlay-pop,
  .animate-in,
  .badge-in,
  .attention-bounce {
    animation-duration: 1ms;
    animation-timing-function: linear;
  }
}
```

（`.attention-bounce` 在 1ms × 3 次下等效不可见，符合"保留反馈、去除位移"。）

## Repo conventions to follow

- 动效工具类集中在 globals.css 的 mount-in-place 段（:267 起），紧邻 `.animate-in` 系统；缓动一律引用 `var(--ease-spring-snappy)` 令牌。
- 重放机制用 React `key`（值变即重挂载重放）——与 PaneTransition 的 paneKey 思路一致。

## Steps

1. globals.css：按 Target 添加 `badge-in` / `attention-bounce` 关键帧与类，并扩展 :308 的 reduced-motion 块。
2. `RoomTopBar.tsx:306`：`animate-bounce` → `badge-in`，并给该 span 加 `key={unreadItems}`。
3. `RoomTopBar.tsx:327`：同上，`key={unreadEvents}`。
4. `RoomTopBar.tsx:340`：同上，`key={totalUnread}`。
5. `ConversationPanel.tsx:148`：`animate-pulse` → `badge-in`，加 `key={conv.unread}`。
6. `ConversationPanel.tsx:142`：删除 `animate-pulse`（不加任何替代——持久错误状态由颜色与文字表达）。
7. `ChatArea.tsx:146`：删除 `animate-pulse`。
8. `MembersDialog.tsx:99` 与 `:116`：删除 `animate-pulse`。
9. `ChatMessage.tsx:1466`：`animate-bounce` → `attention-bounce`。
10. 全仓确认再无其他 `animate-bounce`：`ChatArea.tsx:139` 的 `group-hover:animate-bounce`（滚动到底按钮图标）一并删除——悬停瞄准 40px 目标时图标不该逃跑；保留按钮自身的 `hover:scale-110 active:scale-95` 即可。

## Boundaries

- **不动** `animate-spin`（加载指示是正确用法）与骨架屏的 `animate-pulse`（InventorySkeletons、EventCard——不确定进度，正确用法）。
- 不动 `ChatArea.tsx:121` 机器人打字中的 `animate-pulse`（进行中状态，正确用法）。
- 不改任何徽标的显隐条件与计数逻辑。
- 若行号漂移，按引用代码原文定位；找不到则停下报告。

## Verification

- **Mechanical**: `pnpm lint`、`pnpm build` 通过；`grep -rn "animate-bounce" src/` 应为 0 命中。
- **Feel check**（两账号进同一房间）：
  - 对方送出物品/事件/私聊：TopBar 对应徽标**弹入一次**后静止；再来一条未读，数字变化时重放弹入。
  - 进入私聊 Tab：横幅静止显示，不再脉动。
  - 发起检定请求：目标端按钮弹跳 3 次（约 2.4s）后静止，仍可点击。
  - DevTools Rendering 面板开 `prefers-reduced-motion: reduce`：徽标即时出现，无弹跳。
  - 挂着未读徽标干别的事 30 秒：余光里应当再无任何持续运动。
- **Done when**: 房间常驻界面在静止状态下没有任何无限循环的位移动画。
