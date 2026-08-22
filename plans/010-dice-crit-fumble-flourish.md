# 010 — 骰子大成功/大失败的一次性到达高光

- **Status**: DONE（已应用到工作树，lint 通过；高光手感验收待人工实掷验证）
- **Commit**: 842ab4a
- **Severity**: LOW（additive——补充机会 M2）
- **Category**: Missed opportunities
- **Estimated scope**: 2 文件（globals.css + ChatMessage.tsx），约 25 行新增

## Problem

大成功/大失败是 TRPG 里情绪密度最高的稀有时刻，DOM 钩子早已就位——消息气泡携带 `data-grade`（ChatMessage.tsx:1922，`isDice ? diceMeta?.grade : undefined`），六个主题都消费 `[data-grade="critical"]/[data-grade="fumble"]` 做**静态**着色（气泡 success/danger 满铺 + 图标/数值变色）。但到达时刻只有和普通文本消息完全相同的 180ms fade-rise——延迟预算最充足的地方一分未花。

前置条件（均已满足，执行前确认）：
- 计划 002 的 `entered` 门控在 ChatMessage 组件体内可用——高光**只在实时到达时播放**，历史加载/翻页/切 Tab 静默；
- 主题对 grade 气泡只设背景/边框/文字色，无 box-shadow/transform 冲突；
- 全主题聊天气泡无 `backdrop-filter`，transform 动画合成器安全。

## Target

**大成功——凯旋式弹起**：轻微缩起后过冲到 1.05 再落定，带一瞬亮度提升（filter 在合成器加速集内）：

```css
/* globals.css — 新增，放在 .attention-bounce 定义之后 */

/* Dice crit/fumble arrival flourish — the rare, high-emotion moment.
   Gated to live-arrived rolls via the `entered` flag (plan 002); history
   mounts render the static themed card. Transform/filter only — the chat
   bubble carries no backdrop-filter in any theme, so this composites. */
@keyframes dice-crit-in {
  0%   { transform: scale(0.92); filter: brightness(1); }
  55%  { transform: scale(1.05); filter: brightness(1.15); }
  100% { transform: scale(1);    filter: brightness(1); }
}
@keyframes dice-fumble-in {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  45% { transform: translateX(4px); }
  70% { transform: translateX(-2px); }
  85% { transform: translateX(1px); }
}
.dice-flourish[data-grade="critical"] {
  animation: dice-crit-in 500ms var(--ease-spring-snappy) 120ms both;
}
.dice-flourish[data-grade="fumble"] {
  animation: dice-fumble-in 450ms ease-in-out 120ms both;
}
```

**大失败——受挫式抖动**：±5px 衰减水平抖动（失败的经典肢体语言），不缩放不发光。

120ms 延迟让消息行自己的 180ms fade-rise 先大体落地，高光作为第二拍读出（`both` 回填在延迟期把 crit 气泡持在 0.92——读作蓄力）。挂进 globals.css 现有 reduced-motion 块（`.overlay-pop, .animate-in, .badge-in, .attention-bounce` 列表追加 `.dice-flourish[data-grade="critical"], .dice-flourish[data-grade="fumble"]`）——1ms 下等效无位移，主题静态着色仍完整传达结果。

**ChatMessage.tsx**：气泡 div（:1915-1930 的 className 模板串，即携带 `data-grade` 的元素）追加条件类：

```tsx
${entered && isDice ? "dice-flourish" : ""}
```

（普通 grade 的骰子气泡即使带类也匹配不到任何动画规则——attribute 选择器完成第二重门控；success/failure 不配高光，稀有性就是价值。）

## Repo conventions to follow

- 关键帧与工具类集中在 globals.css 的 mount-in-place 段，紧邻 `.badge-in`/`.attention-bounce`（计划 003 引入），注释风格一致。
- 缓动引用 `var(--ease-spring-snappy)` 令牌（弹出类语义）。
- `entered` 一次性捕获语义来自计划 002——不要新建状态，直接复用。

## Steps

1. globals.css：按 Target 添加两组关键帧与两条类规则，追加进 reduced-motion 块。
2. ChatMessage.tsx：定位携带 `data-grade` 的气泡 div（搜 `data-grade={isDice`），在其 className 模板串中追加 `${entered && isDice ? "dice-flourish" : ""}`（放在静态类之后、原有条件类之前均可，注意模板串语法完整）。
3. 核对：`grep -n "dice-flourish" src/` 应恰好 globals.css 3 处（2 类规则 + reduce 块）+ ChatMessage.tsx 1 处。

## Boundaries

- 不动主题的静态 grade 着色规则。
- 不给 success/failure/其他 grade 加动画。
- 不动 `entered` 的定义与 002 的门控链。
- 不用 box-shadow 动画（paint 层）；只允许 transform 与 filter。
- 若找不到气泡 div 或 `entered` 不在作用域内，停下报告。

## Verification

- **Mechanical**: `pnpm lint` 通过；步骤 3 的 grep 计数符合。
- **Feel check**（`pnpm dev`，可用 `.rd100` 反复掷骰直到出 ≤5 与 ≥96，或临时把房间规则的阈值调宽）：
  - 实时掷出大成功：气泡在 fade-rise 落地后第二拍弹起过冲、一瞬提亮，500ms 内完成，不重放。
  - 实时掷出大失败：气泡水平抖动衰减收住，无缩放。
  - 刷新页面：历史里的大成功/大失败气泡**静止**出现（只有主题着色）。
  - DevTools Animations 面板 10% 速度确认过冲峰值在 1.05、抖动幅度衰减序列正确。
  - Rendering 面板开 reduce：高光消失，着色仍在。
  - rainglass 主题下重复一次（确认无逐帧重模糊卡顿）。
- **Done when**: 高光只在实时到达的 critical/fumble 上播放一次，历史与 reduce 模式零动画。
