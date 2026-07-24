---
name: simple-trpg-chat-theme
description: >
  Complete knowledge base for creating or upgrading themes in the simple-trpg-chat project.
  Use this skill whenever the user asks to create a new theme, upgrade an existing theme,
  redesign a theme, or import a design spec into the theme system. Also use it when the
  user says "主题" / "theme" in combination with any of: create, add, upgrade, redesign,
  implement, fix, port, or references a specific theme name (parchment / cthulhu / shrine /
  rainglass / aether / default).
---

# Simple TRPG Chat — 主题系统完整 Feature 清单

> 本文件是创建新主题的唯一权威参考。每次实现主题时，逐节核对清单，确保零遗漏。

---

## 一、文件组织

```
src/themes/<id>/
├── theme.css          ← 唯一 CSS 文件，所有主题样式集中于此
└── <Id>LoginHero.tsx  ← 仅在需要自定义登录 hero 图标时创建

src/themes/types.ts    ← 注册主题元数据（ThemeId、THEMES 记录）
src/app/globals.css    ← @import 新主题 CSS
src/components/theme/ThemeDecor.tsx  ← 注册 LoginHero 组件（如有）
src/app/fonts.ts       ← 注册新字体（如有）
```

主题 ID 规则：小写英文，对应 `data-theme="<id>"`。

---

## 二、TypeScript 集成（必做）

### 2.1 `src/themes/types.ts`

**① 在 `ThemeId` 联合类型中添加新 ID：**
```ts
export type ThemeId = "default" | "parchment" | "cthulhu" | "shrine" | "rainglass" | "aether" | "<新id>";
```

**② 在 `THEMES` 记录中添加元数据：**
```ts
"<id>": {
  id: "<id>",
  name: "中文名",
  nameEn: "English Name",
  description: "中文描述（30字内，描述调色板和意境）",
  descriptionEn: "English description",
  swatch: { bg: "#rrggbb", border: "#rrggbb" },  // 暗色基准的代表色
  icon: "🎭",                                     // 可选 emoji，用于下拉列表
  decorations: {                                  // 可选，有自定义 hero 时加
    loginHero: "<id>",
  },
},
```

### 2.2 `src/app/globals.css`

在现有 @import 列表末尾追加：
```css
@import "../themes/<id>/theme.css";
```

### 2.3 `src/components/theme/ThemeDecor.tsx`（仅当有 LoginHero 时）

```ts
import { <Id>LoginHero } from "@/themes/<id>/<Id>LoginHero";
// 在 LOGIN_HERO_REGISTRY 中添加：
"<id>": <Id>LoginHero,
```

---

## 三、CSS Token 变量（必须全部声明）

每个主题必须在两个选择器块中声明所有变量：
- **暗色为基准的主题**：`[data-theme="<id>"]` = 暗色；`[data-theme="<id>"][data-mode="light"]` = 亮色覆盖
- **亮色为基准的主题**：`[data-theme="<id>"]` = 亮色；`[data-theme="<id>"][data-mode="dark"]` = 暗色覆盖

现有惯例：parchment / cthulhu / aether = 暗色基准；shrine / rainglass = 亮色基准。

> ⚠️ 所有颜色值必须是**裸 RGB 三元组**格式（`196 160 90`），不带 `rgb()`，不带 `#`。
> 这是因为 globals.css 中用 `rgb(var(--theme-primary) / 0.5)` 形式叠加透明度。

### 核心调色板（29 个变量，全部必填）

```css
[data-theme="<id>"] {
  /* 背景层次 */
  --theme-bg: R G B;              /* 页面底色 */
  --theme-surface: R G B;         /* 卡片/面板 */
  --theme-surface-alt: R G B;     /* 输入框/内嵌块 */

  /* 边框 */
  --theme-border: R G B;
  --theme-header-border: R G B;
  --theme-input-border: R G B;

  /* 文字 */
  --theme-text: R G B;            /* 主文字 */
  --theme-text-muted: R G B;      /* 次文字 */
  --theme-text-dim: R G B;        /* 暗淡/占位符 */

  /* 主色（primary）*/
  --theme-primary: R G B;
  --theme-primary-hover: R G B;
  --theme-primary-foreground: R G B;  /* 主色按钮上的文字 */

  /* 强调色（accent）*/
  --theme-accent: R G B;
  --theme-accent-hover: R G B;
  --theme-accent-foreground: R G B;

  /* 功能色 */
  --theme-danger: R G B;          /* 错误/危险 */
  --theme-success: R G B;         /* 成功/通过 */
  --theme-warning: R G B;         /* 警告 */

  /* AI 色 */
  --theme-ai: R G B;
  --theme-ai-hover: R G B;
  --theme-ai-foreground: R G B;

  /* 组件专用背景 */
  --theme-header-bg: R G B;
  --theme-input-bg: R G B;
  --theme-dice-card-bg: R G B;    /* 骰子结果卡背景 */
  --theme-dice-card-border: R G B;
  --theme-private-border: R G B;  /* 私信/暗语边框 */
  --theme-private-bg: R G B;
  --theme-scroll-btn: R G B;      /* 滚动到底部按钮 */

  /* 技能调色板（6色，被技能标签哈希使用） */
  --theme-skill-0: R G B;
  --theme-skill-1: R G B;
  --theme-skill-2: R G B;
  --theme-skill-3: R G B;
  --theme-skill-4: R G B;
  --theme-skill-5: R G B;
```

### 字体与圆角（必填）

```css
  /* 字体 */
  --theme-font: var(--font-xxx), 'Fallback', sans-serif;
  --theme-font-display: var(--font-xxx), serif;
  --theme-font-mono: var(--font-jetbrains), 'JetBrains Mono', monospace;

  /* 圆角 */
  --theme-radius: 0.75rem;        /* 统一圆角 */
  /* 可选：不对称风格（拟物化主题） */
  --theme-radius-tl: 0.75rem;
  --theme-radius-tr: 0.35rem;
  --theme-radius-br: 0.75rem;
  --theme-radius-bl: 0.35rem;
```

### 可选装饰变量

```css
  /* 阴影与光晕 */
  --theme-card-shadow: ...;       /* 卡片阴影 */
  --theme-glow: ...;              /* 焦点/悬停光晕（用于 shadow-[var(--theme-glow)]） */

  /* SVG 纹理 */
  --theme-surface-texture: url("data:image/svg+xml,...");  /* 叠加在 bg 上的微纹理 */

  /* SVG 分隔线（被 .conv-divider 使用） */
  --theme-divider: url("data:image/svg+xml,...");

  /* 顶栏通用功能区（角色/背包/记事本/成员）的统一"导航"身份色。
     消费端用 rgb(var(--theme-nav, 94 134 150))，不写则回退到一个冷调
     slate（在明暗底上都可读）。设计意图：一个冷色让通用区成组，且和
     主持人区的暖色语义色（accent/primary/ai）拉开——所以主题若要覆盖，
     请选一个和自身 primary/accent 都不同的冷调。可选。 */
  --theme-nav: R G B;
}
```

### 记事本正文排版令牌（`--theme-nb-*`，可选覆盖）

记事本（手札）正文由共享的 `MarkdownRenderer` 渲染，但**排版走一套独立的主题令牌**，
让每个主题塑造自己的手札气质。设计分两层：

- **结构层（共享，写一遍）**：`globals.css` 里作用域限定 `.notebook-note-body` 的规则——
  章节标题带前导竖条 + 底部细线、无序列表用自定义标记字形、引用块带竖条 + 引号、段落节奏。
  这层对所有主题一致，**不影响聊天气泡**（聊天不加 `.notebook-note-body` 包裹）。
  唯一动到 renderer 的是给标题追加 `md-h1` / `md-h2` / `md-h3` 类名做钩子（纯追加，聊天视觉不变）。
- **取值层（每个主题可选注入）**：下面的 `--theme-nb-*` 令牌。**消费端一律用 `var(令牌, 回退)`**，
  回退指向现有 `--theme-*`——所以**任何主题不写也自动带自己的主题色**。想要独特气质的主题，
  只在自己的 `[data-theme="<id>"]` 根块里覆盖几个即可（与调色板 token 并列）。

> ⚠️ 覆盖必须写在 `[data-theme="<id>"]` **根块**（或更高层），**不要**写在 `[data-theme="<id>"] .notebook-note-body`
> 上——因为消费端用的是 `var(令牌, 回退)`，`.notebook-note-body` 本身不声明这些令牌，令牌通过继承下沉即可。

| 令牌 | 作用 | 回退默认值 |
|---|---|---|
| `--theme-nb-heading-color` | 章节标题色 | `rgb(var(--theme-primary))` |
| `--theme-nb-heading-font` | 标题字体 | `var(--theme-font-display)` |
| `--theme-nb-heading-weight` | 标题字重 | `700` |
| `--theme-nb-heading-tracking` | 标题字距 | `0.02em` |
| `--theme-nb-heading-marker-color` | 前导竖条色 | `rgb(var(--theme-primary))` |
| `--theme-nb-heading-marker-width` | 前导竖条宽（设 `0` 隐藏） | `3px` |
| `--theme-nb-heading-rule` | 标题底部细线色 | `rgb(var(--theme-border))` |
| `--theme-nb-list-marker` | 无序列表标记字形 | `"◆"` |
| `--theme-nb-list-marker-color` | 列表标记色 | `rgb(var(--theme-primary))` |
| `--theme-nb-quote-border` | 引用块竖条色 | `rgb(var(--theme-accent))` |
| `--theme-nb-quote-bg` | 引用块底色 | `rgb(var(--theme-surface-alt) / 0.5)` |
| `--theme-nb-strong-color` | 加粗文字色 | `inherit` |
| `--theme-nb-body-leading` | 正文行高 | `1.8` |

**主题覆盖示例**（bespoke 笔触，之后逐主题微调）：

```css
[data-theme="shrine"] {
  --theme-nb-list-marker: "❖";                  /* 神社纹样 */
  --theme-nb-heading-font: var(--font-shippori); /* 明朝体标题 */
}
[data-theme="cthulhu"] {
  --theme-nb-strong-color: rgb(var(--theme-primary)); /* 暖金加粗，重点跳出 */
}
```

> 结构 + 回退默认已落地（六主题自动主题色、共用同一套字形/标记）。逐主题 bespoke 覆盖是后续微调，
> 加/改一个令牌即可，无需碰结构层。核心 CSS：`globals.css` 的 `.notebook-note-body` 段。

---

## 四、可用字体变量（已在 fonts.ts 注册）

| CSS 变量 | 字体名 | 适合场景 |
|---|---|---|
| `var(--font-inter)` | Inter | 现代无衬线正文 |
| `var(--font-space-grotesk)` | Space Grotesk | 现代展示标题 |
| `var(--font-jetbrains)` | JetBrains Mono | 等宽/代码 |
| `var(--font-lora)` | Lora | 优雅衬线正文（幻想/TRPG） |
| `var(--font-cinzel)` | Cinzel | 罗马碑铭风展示 |
| `var(--font-cormorant)` | Cormorant Garamond | 古典优雅展示/正文 |
| `var(--font-crimson)` | Crimson Text | 衬线正文 |
| `var(--font-special-elite)` | Special Elite | 打字机等宽 |
| `var(--font-courier-prime)` | Courier Prime | 打字机等宽（备选） |
| `var(--font-shippori)` | Shippori Mincho | 日文明朝体 |
| `var(--font-noto-serif-sc)` | Noto Serif SC | CJK 衬线 |
| `var(--font-marcellus)` | Marcellus | 小型大写字母展示 |

如需添加新字体，在 `src/app/fonts.ts` 中 import 并加入 `fontVariables` 数组。

---

## 五、组件 CSS 覆盖清单

下面按"基础 → 进阶"分层。**基础层**（Tier 1）是所有非 default 主题都应实现的；**进阶层**（Tier 2-3）在设计复杂度足够时实现。

---

### Tier 1 — 基础装饰（所有主题必做）

#### 5.1 页面背景氛围渐变

```css
[data-theme="<id>"] body,
[data-theme="<id>"] .bg-bg {
  background-color: rgb(var(--theme-bg));
  background-image:
    radial-gradient(60% 50% at 10% -5%, rgba(R,G,B, 0.18), transparent 70%),
    radial-gradient(55% 45% at 95% 100%, rgba(R,G,B, 0.12), transparent 70%),
    var(--theme-surface-texture);  /* 如有纹理 */
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 4px 4px;
}
```

亮色模式单独写一个 `[data-theme="<id>"][data-mode="light"] body` 块，颜色调整。

#### 5.2 会话侧栏

```css
[data-theme="<id>"] .conv-sidebar {
  background: linear-gradient(180deg, #... 0%, #... 100%);
  border-right: 2px solid rgba(R,G,B, 0.5);
}
```

#### 5.3 会话标签

```css
[data-theme="<id>"] .conv-tab {
  background: linear-gradient(...);
  border-left: 3px solid transparent;
  border-bottom: 1px solid rgba(R,G,B, 0.5);
  transition: all 0.25s ease-in-out;
}
[data-theme="<id>"] .conv-tab:hover {
  background: linear-gradient(...);
  color: rgb(var(--theme-text)) !important;
}
[data-theme="<id>"] .conv-tab.active {
  background: linear-gradient(90deg, rgb(var(--theme-primary) / 0.16) 0%, transparent 100%);
  border-left-color: rgb(var(--theme-primary));
  border-bottom-color: rgb(var(--theme-primary) / 0.35);
  color: rgb(var(--theme-primary)) !important;
}
```

#### 5.4 分隔线（.conv-divider）

分隔线使用 `--theme-divider` 变量驱动，SVG data URI 编码到 CSS 变量中：

```css
[data-theme="<id>"] .conv-divider {
  border: 0 !important;
  height: 16px;
  margin: 4px 8px;
  background-image: var(--theme-divider);
  background-repeat: no-repeat;
  background-position: center;
  filter: drop-shadow(0 0 3px rgba(R,G,B, 0.5));
}
```

设计分隔线 SVG 时：viewBox="0 0 120 16"，左右水平线 + 中央主题纹样（水滴/钻石/眼睛/花饰等）。

#### 5.5 线索 & 道具卡片

```css
[data-theme="<id>"] .clue-card,
[data-theme="<id>"] .inventory-card {
  background-color: #... !important;
  border: 1px solid #... !important;
  box-shadow: ... !important;
  position: relative;
  overflow: visible;
  transition: all 0.2s ease;
  /* 可覆盖卡片内文字颜色 */
  --theme-text: R G B;
  --theme-text-muted: R G B;
  --theme-text-dim: R G B;
  color: rgb(var(--theme-text)) !important;
}
[data-theme="<id>"] .clue-card:hover,
[data-theme="<id>"] .inventory-card:hover {
  border-color: rgb(var(--theme-primary)) !important;
}
/* 卡片顶部装饰线（主色→强调色渐变） */
[data-theme="<id>"] .clue-card::before,
[data-theme="<id>"] .inventory-card::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;   /* 或 3px */
  background: linear-gradient(90deg, rgb(var(--theme-primary)), rgb(var(--theme-accent))) !important;
}
```

#### 5.6 聊天气泡装饰图标

每条消息气泡左上/右上角渲染一个 16×16 的主题徽标。

```css
[data-theme="<id>"] .chat-bubble {
  position: relative;
  overflow: visible !important;
}
/* 他人消息 — 左侧 */
[data-theme="<id>"] .chat-bubble-other::after {
  content: "";
  position: absolute;
  top: -8px; left: -8px;
  width: 16px; height: 16px;
  background-image: url("data:image/svg+xml,...");
  background-size: contain;
  background-repeat: no-repeat;
  filter: drop-shadow(0 0 4px rgba(R,G,B, 0.65));
  z-index: 10;
}
/* 自己的消息 — 右侧 */
[data-theme="<id>"] .chat-bubble-own::after {
  content: "";
  position: absolute;
  top: -8px; right: -8px;
  width: 16px; height: 16px;
  background-image: url("data:image/svg+xml,...");
  /* 可用不同颜色区分自己/他人 */
  filter: drop-shadow(0 0 4px rgba(R,G,B, 0.65));
  z-index: 10;
}
```

已有徽标参考：封蜡印（parchment）/ Elder Sign 五芒星（cthulhu）/ 鸟居（shrine）/ 雨滴（rainglass）/ 星晶碎片（aether）。

#### 5.7 主题边框（.theme-border）

面板、模态框、卡片容器的边框装饰：

```css
[data-theme="<id>"] .theme-border {
  box-shadow: inset 0 1px 0 rgba(R,G,B, 0.06),
              0 0 14px rgba(R,G,B, 0.20),
              0 8px 24px rgba(0,0,0, 0.40);
}
```

#### 5.8 大厅筛选标签

```css
[data-theme="<id>"] .filter-indicator {
  background: #primary-color;
  box-shadow: 0 0 10px rgba(R,G,B, 0.55), 0 0 22px rgba(R,G,B, 0.22);
}
[data-theme="<id>"] .filter-tab-active {
  color: #primary-color;
  text-shadow: 0 0 8px rgba(R,G,B, 0.45);
}
```

---

### Tier 2 — 登录页定制（有设计稿时实现）

#### 5.9 隐藏默认 Dice5 图标

```css
[data-theme="<id>"] .default-login-icon { display: none; }
```

#### 5.10 登录卡外框装饰

```css
[data-theme="<id>"] .login-card {
  border-color: rgba(R,G,B, 0.45) !important;
  box-shadow: 0 0 28px rgba(R,G,B, 0.22),
              0 32px 80px rgba(0,0,0, 0.7),
              inset 0 1px 0 rgba(255,240,200, 0.06) !important;
  position: relative;
}
/* 顶部金线 */
[data-theme="<id>"] .login-card::before {
  content: "";
  position: absolute;
  top: 0; left: 32px; right: 32px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(R,G,B, 0.85), transparent);
  pointer-events: none;
}
/* 四角铆钉（可选） */
[data-theme="<id>"] .login-card::after {
  content: "";
  position: absolute;
  inset: 8px;
  pointer-events: none;
  background-image:
    /* tl */ linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    /* tr */ linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    /* bl */ linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    /* br */ linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6)),
    linear-gradient(rgba(R,G,B, 0.6), rgba(R,G,B, 0.6));
  background-repeat: no-repeat;
  background-size: 6px 1px, 1px 6px, 6px 1px, 1px 6px,
                   6px 1px, 1px 6px, 6px 1px, 1px 6px;
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom;
}
```

#### 5.11 LoginHero 组件（.tsx）

LoginHero 有两种布局模式，根据设计意图选择：

---

**模式 A：徽章行内模式（cthulhu）**

Hero 插入卡片 flex 流中，替换 Dice5 位置。需要 5.9 节的 `.default-login-icon { display: none }`。

```tsx
export function <Id>LoginHero() {
  return (
    <div className="<id>-login-hero" aria-hidden="true">
      {/* 左侧渐隐规则线 */}
      <span className="<id>-hero-rule <id>-hero-rule-left" />
      {/* 中央徽标 */}
      <span className="<id>-hero-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.4" width="32" height="32">
          {/* 主题专属 SVG 路径 */}
        </svg>
        <span className="<id>-hero-badge-ring" />
      </span>
      {/* 右侧渐隐规则线 */}
      <span className="<id>-hero-rule <id>-hero-rule-right" />
    </div>
  );
}
```

CSS：

```css
/* 默认隐藏，主题激活时显示（flex 行内） */
.<id>-login-hero { display: none; }
[data-theme="<id>"] .<id>-login-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  color: rgb(var(--theme-primary));
}
[data-theme="<id>"] .<id>-hero-rule { flex: 1; height: 1px; }
[data-theme="<id>"] .<id>-hero-rule-left {
  background: linear-gradient(90deg, transparent, rgba(R,G,B, 0.6));
}
[data-theme="<id>"] .<id>-hero-rule-right {
  background: linear-gradient(90deg, rgba(R,G,B, 0.6), transparent);
}
[data-theme="<id>"] .<id>-hero-badge {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  width: 60px; height: 60px;
  border-radius: 50%;
  border: 1px solid rgba(R,G,B, 0.55);
  background: radial-gradient(circle, rgba(R,G,B, 0.14), transparent 70%);
  box-shadow: 0 0 18px rgba(R,G,B, 0.45), inset 0 0 12px rgba(R,G,B, 0.22);
  color: rgb(var(--theme-primary));
}
[data-theme="<id>"] .<id>-hero-badge-ring {
  position: absolute; inset: 5px;
  border-radius: 50%;
  border: 1px dashed rgba(R,G,B, 0.4);
  pointer-events: none;
}
```

---

**模式 B：绝对定位悬挂横幅模式（shrine）**

Hero 用 `position: absolute` 悬挂在卡片顶边外侧，视觉上"穿出"卡片。
**不需要** 隐藏 `.default-login-icon`，而是给 `.login-card` 加 `padding-top` 腾出空间。
支持亮色/暗色两套 SVG 图案（通过 CSS `display:none` 切换）。

```tsx
export function <Id>LoginHero() {
  return (
    <div className="<id>-login-hero" aria-hidden="true">
      {/* 亮色图案 — 暗色模式下隐藏 */}
      <svg className="<id>-hero-day" viewBox="0 0 480 74" ...>
        {/* 亮色 SVG 内容 */}
      </svg>
      {/* 暗色图案 — 亮色模式下隐藏 */}
      <svg className="<id>-hero-night" viewBox="0 0 480 96" ...>
        {/* 暗色 SVG 内容，可包含动画元素 */}
        <g className="<id>-hero-fire">...</g>
      </svg>
    </div>
  );
}
```

CSS：

```css
/* 默认隐藏，主题激活时变为绝对定位横幅 */
.<id>-login-hero { display: none; }
[data-theme="<id>"] .<id>-login-hero {
  display: block;
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 80px;       /* 按 SVG 实际高度调整 */
  pointer-events: none;
  z-index: 1;
}

/* 给登录卡腾出顶部空间（代替隐藏 Dice5） */
[data-theme="<id>"] .login-card {
  padding-top: 3.75rem;   /* 亮色模式 */
}
[data-theme="<id>"][data-mode="dark"] .login-card {
  padding-top: 5.25rem;   /* 暗色模式可能更高 */
}

/* 亮色图案：向上偏移使其"悬挂"超出卡片顶边 */
[data-theme="<id>"] .<id>-hero-day {
  position: absolute;
  top: -30px; left: -16px; right: -16px;
  filter: drop-shadow(0 3px 4px rgba(0,0,0, 0.28));
}
/* 暗色模式下隐藏亮色图案 */
[data-theme="<id>"][data-mode="dark"] .<id>-hero-day { display: none; }

/* 暗色图案：默认隐藏，暗色模式下显示 */
[data-theme="<id>"] .<id>-hero-night { display: none; }
[data-theme="<id>"][data-mode="dark"] .<id>-hero-night {
  display: block;
  position: absolute;
  top: -24px; left: -10px; right: -10px;
  filter: drop-shadow(0 4px 6px rgba(0,0,0, 0.5));
}

/* 可选动画（如火焰/灯光闪烁） */
.<id>-hero-fire {
  filter: drop-shadow(0 0 4px rgba(R,G,B, 0.95))
          drop-shadow(0 0 11px rgba(R,G,B, 0.55));
  animation: <id>-flicker 3.4s ease-in-out infinite;
}
@keyframes <id>-flicker {
  0%,100% { opacity: .9 } 38% { opacity: 1 } 54% { opacity: .84 } 72% { opacity: .97 }
}
```

> **选择哪种模式？**
> - 徽章行内（A）：设计重心在于一个独立符号/印章，与文字内容平级排列（如 cthulhu 的长辈印徽）
> - 悬挂横幅（B）：设计有一个跨越卡片顶边的大型装饰带，亮/暗变体图案差异较大（如 shrine 的鸟居/枯木）

注册步骤（见 2.3 节）：在 `types.ts` 加 `decorations: { loginHero: "<id>" }`，在 `ThemeDecor.tsx` 注册组件。

---

### Tier 2 — 磨砂玻璃浮层（rainglass 模式，选用）

适合"磨砂玻璃/毛玻璃"主题概念：

```css
[data-theme="<id>"] .overlay-modal,
[data-theme="<id>"] .overlay-drawer,
[data-theme="<id>"] .theme-border.bg-surface {
  background-color: rgb(var(--theme-surface) / 0.72) !important;
  backdrop-filter: blur(4px) saturate(1.4);
}
[data-theme="<id>"] .bg-header-bg {
  background-color: rgb(var(--theme-header-bg) / 0.72) !important;
  backdrop-filter: blur(4px) saturate(1.4);
}
/* 菜单弹窗：近不透明以保证可读性 */
[data-theme="<id>"] .overlay-pop.theme-border,
[data-theme="<id>"] .overlay-modal.theme-border,
[data-theme="<id>"] .overlay-drawer {
  background-color: rgb(var(--theme-surface) / 0.95) !important;
  backdrop-filter: blur(2px) saturate(1.3);
}
```

---

### Tier 3 — 游戏消息组件深度主题化（shrine 级别，可选）

> 这是目前只有 shrine 完整实现的高级层。实现时参考 shrine/theme.css 中对应节，使用 `--theme-*` 变量替换固定颜色。

按组件分节实现：

#### 5.12 系统提示 pill（`.system-pill`）

分 `[data-kind]` 属性处理四种变体：
- `st`（技能设定）→ success 色
- `error` → danger 色
- `room-event` / `scene-marker` → 中性
- 无 kind（默认）→ 同 room-event

```css
[data-theme="<id>"] .system-pill .system-pill-body { /* 通用样式 */ }
[data-theme="<id>"] .system-pill[data-kind="st"] .system-pill-body { /* success 色 */ }
[data-theme="<id>"] .system-pill[data-kind="error"] .system-pill-body { /* danger 色 */ }
[data-theme="<id>"] .system-pill[data-kind="room-event"] .system-pill-body,
[data-theme="<id>"] .system-pill[data-kind="scene-marker"] .system-pill-body { /* 中性 */ }
/* 隐藏 emoji 占位（主题有图标时） */
[data-theme="<id>"] .system-pill-emoji { display: none; }
```

#### 5.13 帮助卡（`.help-card`）

`.help-card-header` / `.help-card-list` / `.help-card-row dt/dd`

#### 5.14 技能判定请求（`.check-request`）

分两类：普通判定 / 理智检定 / GM 私骰。
属性：`data-check-kind="sanity"` / `data-check-kind="gm-private"` / `data-state="target-pending"` / `data-complete="true"`

关键子元素：
- `.check-request-body` — pill 容器
- `.check-request-kind-icon` — 判定类型图标
- `.check-request-skill` — 技能名
- `.check-request-button` — 投骰按钮
- `.check-request-progress` — 进度显示
- `.check-request-proxy-btn` / `.check-request-proxy-popover` — 代理投骰按钮与弹窗
- `.check-request-ghost-badge` — AI/幽灵标

#### 5.15 骰子气泡（`.chat-bubble-dice`）

属性：`data-roll-kind` / `data-grade` / `data-audience` / `data-psy`

关键子元素：
- `.dice-icon` — 图标圆/方块
- `.dice-value` — 大号数字
- `.dice-formula` — 公式（等宽字体）
- `.dice-skill` — 技能名
- `.dice-target` — 目标值

特殊状态：
- `[data-grade="critical"]` → success 色满铺
- `[data-grade="fumble"]` → danger 色满铺
- `[data-audience="self"]` → 虚线边框（暗骰）
- `[data-psy="true"]` → AI 色图标（心理学暗骰）

#### 5.16 理智检定卡（`.sc-card`）

`.sc-card-header` / `.sc-card-title` / `.sc-card-summary` / `.sc-card-body` / `.sc-card-row dt/dd` / `.sc-warning`

触发条件：`[data-roll-kind="sanity"]`

#### 5.17 道具分发 pill（`.dispatch-pill`）

`data-action` 五种变体：`distribute` / `push` / `share` / `update` / `duplicate`

`.dispatch-pill-icon` 颜色随 action 变化：
- distribute → ai 色
- push → primary 色
- share → success 色
- update → 中性
- duplicate → danger 色（整个 pill）

子类型 chip（`.dispatch-chip`）：
`data-item-type` = `item` / `clue` / `info` / `character`，各用不同 skill 色。

#### 5.18 收据 pill（`.receipt-pill`）

`data-action` = `received` / `updated` / `shared-received`
`.receipt-pill-badge` = `data-badge="new"` / `data-badge="updated"`
`.receipt-pill-cta` — 查看按钮

#### 5.19 代理骰子 chip（`.dice-proxy-chip`）

显示在骰子气泡头部，标识是谁替代的。

#### 5.20 主按钮（`.btn-primary`）

可选：做完全自定义的主题感按钮（如 shrine 的蜜色木纹）。
包含三状态：默认 / `hover:not(:disabled)` / `active:not(:disabled)`。

---

## 六、亮/暗两模式覆盖要点

每个装饰块（背景渐变、sidebar、标签、卡片、气泡、登录）都要写**暗色和亮色两版**。

常见做法：
- **深色调整** — 将固定 hex 值或渐变色调暗，减少透明度
- **SVG 分隔线** — 亮色重绘（`--theme-divider` 换一个颜色更深的版本）
- **登录 hero** — 亮色模式下 badge 边框/背景换亮色对应的 primary

---

## 七、实现顺序建议

1. 确认设计稿中的色值，提取暗色 + 亮色两套 RGB token
2. 写 `[data-theme="<id>"]` 暗色 token 块（约 29 个变量 + 字体 + 圆角 + 装饰变量）
3. 写亮色 `[data-mode="light"]` token 覆盖块
4. Tier 1 组件逐一实现（背景 → sidebar → tab → divider → cards → bubble → theme-border → filter）
5. Tier 2：登录页装饰（有设计稿时）
6. TypeScript：`types.ts` + `globals.css` + 可选 `ThemeDecor.tsx`
7. 在 dev server 上切换主题核验暗/亮两模式
8. Tier 3（可选）：游戏消息组件深度主题化

---

## 八、常见坑

| 坑 | 解法 |
|---|---|
| 颜色值写成 `#hex` 或 `rgb(...)` | 必须是裸三元组 `R G B`，否则 `/ opacity` 语法失效 |
| `.clue-card` 内文字颜色不正确 | 在卡片选择器内局部覆盖 `--theme-text` 等变量 |
| 亮色模式下某些固定 hex 颜色没有更新 | 检查 sidebar、conv-tab、cards 里的固定颜色是否有 `[data-mode="light"]` 覆盖 |
| ThemeProvider 从 DB 读取用户偏好覆盖 localStorage | 调试时直接改 DB：`UPDATE users SET theme_preference='<id>' WHERE id=<uid>` |
| 装饰 SVG 在浅色背景上不可见 | 亮色模式用更深的颜色重新声明 `--theme-divider` |
| `.chat-bubble` overflow 被截断 | 必须加 `overflow: visible !important` |
| LoginHero 显示但 Dice5 也显示 | 确认加了 `.default-login-icon { display: none }` |
| 只有 shrine 主题的消息组件有样式 | 其他主题可不实现 Tier 3，组件走默认样式 |
