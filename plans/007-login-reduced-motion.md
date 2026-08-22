# 007 — 登录页环境动画的 prefers-reduced-motion 门控

- **Status**: DONE（已应用到工作树，lint 通过；reduce 模式手感验收待人工过一遍）
- **Commit**: 76265ce
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 个 theme.css（cthulhu / rainglass / parchment），每个追加一个 media 块

## Problem

主题层（`src/themes/`）没有任何 `prefers-reduced-motion` 处理（全仓该查询只出现在 globals.css 与两个 JS hook 里）。登录/注册页的拟物场景包含 16 个无限循环环境动画，其中 **10 个是位移/变换类——前庭失调的触发源**，且部分覆盖整个视口背景：

| 主题 | 类/选择器 | 动画（位移内容） |
| --- | --- | --- |
| cthulhu | `.login-page-bg::before` | `cthulhu-fog-drift 34s`（translateX ±2.5%，全视口） |
| cthulhu | `.login-page-bg::after` | 同上 26s 反向 |
| cthulhu | `.cth-fog-far` | `cthulhu-fog-slide 19s`（translateX ±9px） |
| cthulhu | `.cth-fog-near` | 同上 24s 反向 |
| cthulhu | `.cth-beam` | `cthulhu-beam-sweep 9s`（rotate ±8deg） |
| rainglass | `.rg-anim-slide` | `rainglass-drop-slide 9s`（translateY 0→86px） |
| rainglass | `.rg-anim-drip` | `rainglass-drip-fall 5.6s`（translateY 0→98px + scaleY） |
| parchment | `.prch-flame` | `parchment-flame 3.2s`（scaleY/scaleX 脉动） |
| parchment | `.prch-quill` | `parchment-quill-sway 7s`（rotate 摇摆） |
| parchment | `.prch-mote` | `parchment-mote 6s`（translateY 浮动） |

动画能找到的位置（行号相对 commit 76265ce，请按类名/选择器定位）：cthulhu/theme.css 约 :228-240（login-page-bg 两个伪元素）与 :350-370（fog/beam）；rainglass/theme.css 约 :335-345；parchment/theme.css 约 :360-385。

**明确不门控**（纯 opacity，非前庭触发，频率 3-9s 无光敏风险）：cthulhu 的 lamp-flicker / harbor-blink、parchment 的 glow / ink-glint、rainglass 的 neon-breathe ×2、shrine 的 flicker ×2、aether 的 nixie-flicker / spark。审计标准是"保留 opacity/颜色反馈，去除位置变化"——shrine 与 aether 因此完全不需要改动。

## Target

在上表 3 个 theme.css 各自**文件末尾**追加一个 media 块，块内选择器**逐字复用**各动画规则自己的选择器（特异性持平，后出现者胜，无需 `!important`），值一律 `animation: none`：

```css
/* cthulhu/theme.css — 文件末尾追加 */
/* Reduced motion: the drifting fog / sweeping beam are vestibular triggers.
   Opacity-only flicker (lamp, harbor light) stays — flicker is not motion. */
@media (prefers-reduced-motion: reduce) {
  [data-theme="cthulhu"] .login-page-bg::before,
  [data-theme="cthulhu"] .login-page-bg::after,
  [data-theme="cthulhu"] .cth-fog-far,
  [data-theme="cthulhu"] .cth-fog-near,
  [data-theme="cthulhu"] .cth-beam {
    animation: none;
  }
}
```

rainglass 与 parchment 同构（选择器换成上表各自的；注释同样一句话说明门控的是位移、保留的是 flicker）。**注意**：块内选择器必须与文件中实际的动画规则选择器一致——若实际规则带有额外前缀（如 `[data-mode]` 变体或不同的父级链），以文件中的原文为准逐字复制。

静止回退状态无需额外处理：`animation: none` 让各元素停在基础 CSS 状态（静止的雾层/雨珠/烛焰），场景仍完整，只是不动。

## Repo conventions to follow

- 现有 reduced-motion 写法参照 globals.css:249-251 与 :308-314（media 块内直接改 animation，不动元素其他属性）。
- 主题文件内注释用英文短句（与各 theme.css 现有注释风格一致，如 aether 的 "nixie tubes ionize with a slow uneven flicker"）。

## Steps

1. `src/themes/cthulhu/theme.css`：先定位 5 条动画规则确认其确切选择器，在文件末尾按 Target 追加 media 块。
2. `src/themes/rainglass/theme.css`：同法，选择器为 `.rg-anim-slide`、`.rg-anim-drip` 所在规则的原文。
3. `src/themes/parchment/theme.css`：同法，选择器为 `.prch-flame`、`.prch-quill`、`.prch-mote` 所在规则的原文。
4. 全量核对：`grep -rn "prefers-reduced-motion" src/themes/` 应恰好 3 个文件各 1 处；shrine / aether / default 零改动。

## Boundaries

- 只追加 media 块，不修改、不移动任何既有规则或 keyframes。
- 不动纯 opacity 动画（上文"明确不门控"清单）。
- 不动 shrine / aether / default 主题文件。
- 若某个类在文件中找不到动画规则（drift），停下报告。

## Verification

- **Mechanical**: `pnpm lint` 通过；步骤 4 的 grep 结果符合预期。
- **Feel check**（`pnpm dev`，访问 /login，DevTools Rendering 面板切换 `prefers-reduced-motion: reduce`）：
  - cthulhu：雾层与光束静止，灯塔 lamp 的闪烁**仍在**。
  - rainglass：雨珠不再滑落/滴落，霓虹 breathe **仍在**。
  - parchment：烛焰不再跳动、羽毛笔不摆、尘埃不浮，烛光 glow **仍在**。
  - 关闭 reduce：全部环境动画恢复。
  - shrine / aether 登录页在两种设置下行为不变。
- **Done when**: reduce 模式下登录页零位移动画、opacity 氛围保留，普通模式无回归。
