# 主题系统规格说明

## 描述

本系统支持主题切换，覆盖全部页面，目前包括以下模块：
- 登陆页面
- admin管理页面
- room内页面
- 大厅页面

注意，所有子弹窗和控件均被主题覆盖。

## 主题原则

采用现代，简洁的基础原则。并以不同的主题概念，设计对应的主题。包括但不限于以下范围：
- 字体
- 色彩
- 边框
- 阴影
- 图标（采用svg）
- 背景
- 材质
- 边框装饰
- 其他任何视觉元素（动画等）

需要确保风格的同时，兼顾可读性。

## 主题关系

主题一共有3个地方可以设置
1. admin页面设置全局主题
2. 大厅页面设置当前用户主题
3. 房间配置设置该房间主题

遵循以下覆盖关系：
1. 房间主题对所有加入房间的人生效
2. 当前用户主题在大厅生效
3. admin在admin board设置的主题作为网站的默认主题：登陆页面，admin页面，任何新用户（未设置主题）的默认主题。


## 深色 / 浅色模式（Dark / Light Mode）

模式（mode）是与「主题（theme）」**正交**的第二维度：每个主题都同时具备**浅色**与**深色**两套外观。最终样式 = `主题 × 模式`。详见 [深色/浅色规格](theme_dark_light.spec.md)。

### 取值与行为

- `自动`（auto）：跟随用户系统 / 浏览器的 `prefers-color-scheme`；无法识别时回退**浅色**。
- `浅色`（light）：使用主题的浅色版本。
- `深色`（dark）：使用主题的深色版本。

### 设置层级与覆盖（与主题一致）

| 层级 | 存储 | 作用范围 |
| ---- | ---- | ---- |
| 全站 | `system_config['site_theme_mode']`（默认 `auto`） | 登录页、admin、未设置的新用户 |
| 用户 | `users.theme_mode_preference`（可空＝继承全站） | 大厅顶栏，覆盖全站 |
| 房间 | `rooms.theme_mode`（默认 `auto`） | 本房间所有参与者，覆盖用户/全站 |

优先级：`房间 > 用户 > 全站`，解析后再处理 `自动`。房间选 `自动` 即「不强制明暗、让每位参与者跟随各自系统」。

### 实现机制

- `<html>` 同时带 `data-theme="X"` 与 `data-mode="light|dark"`。`data-mode` 始终是**已解析的具体值**——`自动` 由 `src/components/ThemeProvider.tsx` 经 `matchMedia` 解析，并监听系统切换实时更新。
- 防闪烁：`src/app/layout.tsx` 的 `<head>` 内联脚本在首次绘制前解析 `data-mode`（房间页另读 `sessionStorage['room-mode-<id>']`），SSR 对 `自动` 先渲染浅色再由脚本即时翻转。
- 原生控件（滚动条/表单）经 `globals.css` 的 `html[data-mode="dark"] { color-scheme: dark }` 适配。

### CSS 约定（每个 `src/themes/<id>/theme.css`）

- **浅色为基线**：`[data-theme="X"] { … }` 定义浅色 token 与装饰；缺省即浅色。
- **深色为覆盖**：`[data-theme="X"][data-mode="dark"] { … }` 仅覆盖颜色 token 与随模式变化的装饰 var（`--theme-divider` / `--theme-surface-texture` / `--theme-card-shadow` / `--theme-glow` …）；圆角、字体等「主题身份」由基线继承。
- 装饰尽量走 token（如 `rgb(var(--theme-primary) / 0.1)`、`var(--theme-divider)`）以自动适配两种模式；仅硬编码色值的装饰（侧栏渐变、气泡 SVG、霓虹辉光）补 `[data-mode="dark"]` 覆盖。

### 各主题相反变体方向

- **默认**：深色＝石板深蓝灰面、蓝主色提亮、琥珀强调。
- **古旧羊皮卷**：深色＝烛光下陈年深皮卷，棕黑底＋暖羊皮文字，封蜡/花饰转亮墨。
- **远古神社**：深色＝夜祭神社，墨黑和纸＋朱漆鸟居发光＋真鍮金。
- **苍穹幻境**：深色＝夜空苍穹，深靛蓝天＋金线发光＋水晶高光。
- **克苏鲁的呼唤**：浅色＝日间档案/田野笔记，苍白档案纸＋墨色正文，紫/青收敛为深墨色强调（保留零圆角）。
- **霓虹雨夜**：浅色＝阴天日光磨砂玻璃，冷灰玻璃＋青/品红亮底霓虹（保留毛玻璃 blur）。


## 主题列表

目前支持的主题和概念

### 默认

默认的主题，采用现代web的设计质感。

#### 设计概念

以**现代 web / SaaS 产品**为核心意象：明亮中性的浅色界面，蓝色主色 + 琥珀强调，干净留白、较大圆角（`0.75rem`）与克制的层次。刻意保持**扁平、无材质纹理**，仅以柔和投影与聚焦环表达层级与交互，强调清晰与高可读性。它也是网站默认主题（登陆页、admin、未设置主题的新用户）。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 248 250 252 | `#F8FAFC` | 冷灰白 |
| 表面 | `--theme-surface` | 255 255 255 | `#FFFFFF` | 纯白卡面 |
| 次表面 | `--theme-surface-alt` | 241 245 249 | `#F1F5F9` | 浅灰 |
| 边框 | `--theme-border` | 226 232 240 | `#E2E8F0` | 淡灰线 |
| 文字 | `--theme-text` | 15 23 42 | `#0F172A` | 石板近黑 |
| 主色 | `--theme-primary` | 37 99 235 | `#2563EB` | 蓝 |
| 强调 | `--theme-accent` | 245 158 11 | `#F59E0B` | 琥珀 |
| 强调前景 | `--theme-accent-foreground` | 66 36 2 | `#422402` | 琥珀底上的深色文字 |
| 危险 | `--theme-danger` | 239 68 68 | `#EF4444` | 红 |
| 成功 | `--theme-success` | 34 197 94 | `#22C55E` | 绿 |

> 蓝 / 琥珀 / 红 三个语义色相天然区分；`accent-foreground` 用深棕保证琥珀底上的文字对比（修复旧版白字对比不足）。

#### 字体

- 正文：`Inter`（现代无衬线）→ CJK 无衬线回退（PingFang / 雅黑 / Noto Sans CJK）
- 标题：`Space Grotesk`（几何感无衬线，现代质感）
- 等宽：`JetBrains Mono`
- 经 `next/font/google` 自托管（Inter 与 JetBrains Mono 预加载）。

#### 拟物与装饰元素

- **较大圆角**：`--theme-radius: 0.75rem`，柔和现代。
- **扁平无纹理**：不设 `--theme-surface-texture`，背景纯净。
- **柔和层次**：`--theme-card-shadow` 为双层软投影（`0 1px 2px` + `0 4px 14px`），现代卡片悬浮感。
- **聚焦环辉光**：`--theme-glow` 为蓝色聚焦环（`0 0 0 3px rgba(37,99,235,0.18)`），用于选中 / 激活态。
- **侧栏 / 标签**：`.conv-sidebar` 浅灰渐变，`.conv-tab.active` 为蓝色左边框 + 浅蓝渐变底。

#### 实现位置

- `src/themes/default/theme.css`、`src/app/globals.css`（`@theme inline` 令牌映射、`h1–h3` 标题字体规则）、`src/app/fonts.ts`（字体加载）、`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.default.*`）

### 古旧羊皮卷

概念：来源于DND等西方奇幻背景。采用古旧羊皮卷的质感和配色

#### 设计概念

以**西方奇幻泥金手稿 / 古牛皮纸卷**为核心意象：陈年牛皮纸为底，铁胆墨水（iron-gall ink）作正文，皮革装帧为框架。母题为**封蜡印记、泥金手稿花饰（fleuron）、铜绿地图墨、撕边纸张**。整体暖色浅色，碑刻体标题落于衬线正文之上，呈现庄重的手抄卷轴质感。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 244 235 214 | `#F4EBD6` | 陈年牛皮纸 |
| 表面 | `--theme-surface` | 252 246 230 | `#FCF6E6` | 新羊皮 |
| 文字 | `--theme-text` | 58 40 22 | `#3A2816` | 铁胆墨水（暖棕黑） |
| 主色 | `--theme-primary` | 130 64 30 | `#82401E` | 烧赭皮革 |
| 强调 | `--theme-accent` | 60 112 98 | `#3C7062` | 铜绿（制图墨 / 铜锈） |
| 强调前景 | `--theme-accent-foreground` | 252 246 230 | `#FCF6E6` | 铜绿底上的奶白文字 |
| 危险 | `--theme-danger` | 166 42 38 | `#A62A26` | 纹章红 |
| 成功 | `--theme-success` | 94 110 52 | `#5E6E34` | 橄榄 / 鼠尾草绿 |
| 私聊 | `--theme-private-border` | 158 50 42 | `#9E322A` | 封蜡红（密信） |

> 强调色由旧版红色改为**铜绿**，与主色棕、危险红拉开三个独立色相（呼应"操作按钮可区分"经验），同时契合古地图制图墨与铜器锈色。

#### 字体

- 正文：`Crimson Text`（文学衬线）→ `Georgia` → CJK 衬线回退
- 标题：`Cinzel`（罗马碑刻体，泥金手稿气质）
- 等宽：`Courier Prime`（打字机）
- 经 `next/font/google` 自托管。

#### 拟物与装饰元素

- **撕边圆角**：卡片非对称切角（tl 2 / tr 6 / br 3 / bl 5），如手撕纸边。
- **皮革装帧侧栏**：`.conv-sidebar` 为陈旧皮革渐变（`#ece0c2 → #ddc8a0`，右边框 `#bfa07e`）。
- **签名母题 · 泥金花饰分隔**：`.conv-divider` 为居中的 fleuron 花饰（两侧细墨线 + 中央菱形与小圆点，`--theme-divider`）。
- **泥金墨线卡头**：卡片顶部 `::before` 为两端淡出的墨线（似羽毛笔一笔），而非实心条。
- **封蜡印记**：聊天气泡 `::after` 为红色封蜡 SVG（`#9E2B22`）。
- **纸张纹理与暖阴影**：`--theme-surface-texture` 纸纹 + `--theme-card-shadow` 暖棕斜投影；`.theme-border` 为极端非对称撕边圆角 + 墨色内阴影。

#### 实现位置

- `src/themes/parchment/theme.css`、`src/app/globals.css`（`.theme-border`）、`src/components/LobbyClient.tsx`、`src/components/RoomSettings.tsx`、`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.parchment.*`）

### 克苏鲁的呼唤

概念：克苏鲁呼唤的风格，概念为未知的恐惧，和哥特式恐怖

#### 设计概念

以**不可名状的未知恐惧 + 哥特式恐怖**为核心：深渊墨绿近黑为底，**幽灵紫**与**深渊青**两道荧光色在黑暗中呼吸。母题为**长辈印（Elder Sign，五芒守护星）、注视之眼、触手般的诡谲**，配合非欧零圆角与冰冷锐利阴影，营造证物柜 / 仪式现场般的压抑。哥特衬线标题与冷峻无衬线正文形成张力，兼顾深色高对比可读性。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 6 14 16 | `#060E10` | 最深渊 |
| 表面 | `--theme-surface` | 16 28 32 | `#101C20` | |
| 文字 | `--theme-text` | 198 214 216 | `#C6D6D8` | 苍白冷光 |
| 主色 | `--theme-primary` | 168 122 246 | `#A87AF6` | 幽灵紫（邪术） |
| 强调 | `--theme-accent` | 78 214 196 | `#4ED6C4` | 深渊青（荧光） |
| 强调前景 | `--theme-accent-foreground` | 6 14 16 | `#060E10` | 青底上的深色文字 |
| 危险 | `--theme-danger` | 230 56 56 | `#E63838` | 血红 |
| 私聊背景 | `--theme-private-bg` | 24 18 38 | `#181226` | 深紫黑 |

> 浅色的主色（幽灵紫）配深色 `primary-foreground`（`#060E10`）以保证按钮文字对比；强调青同理用深色前景。

#### 字体

- 正文：`Inter`（冷峻无衬线，证物 / 档案可读性）+ CJK 无衬线回退
- 标题：`Cormorant Garamond`（高对比哥特衬线，诡谲不安）
- 等宽：`JetBrains Mono`
- 经 `next/font/google` 自托管。

#### 拟物与装饰元素

- **非欧零圆角**：所有圆角为 0（冰冷、非人、工业）。
- **荧光呼吸辉光**：`--theme-glow` 为幽灵紫光晕，用于选中 / 激活态；`.theme-border` 叠加多层紫色外发光。
- **签名母题 · 注视之眼分隔**：`.conv-divider` 为居中的「眼」（杏仁眼廓 + 瞳孔，两侧淡青墨线，`--theme-divider`），并带青色外发光。
- **邪术渐变卡头**：卡片顶部 `::before` 为青→紫渐变光条 + 青色辉光。
- **长辈印**：聊天气泡 `::after` 由旧版圆圈叉号改为**五芒守护星**（Elder Sign）SVG，青色描边 + 外发光。
- **冷金属质感**：`--theme-surface-texture` 锈斑金属纹 + `--theme-card-shadow` 冰冷锐利硬阴影。

#### 实现位置

- `src/themes/cthulhu/theme.css`、`src/app/globals.css`（`.theme-border`）、`src/components/LobbyClient.tsx`、`src/components/RoomSettings.tsx`、`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.cthulhu.*`）

### 远古神社

概念：日系跑团主题，概念为神社，采用红白的配色（巫女概念），搭配鸟居，古木，绳结，御币等元素。

#### 设计概念

以**巫女（白衣緋袴）与神社**为核心意象，整体为**红白配色的浅色主题**：以「生成り」和纸白为底（白衣 / 障子墙），以「朱色」朱漆为主色（鸟居 / 緋袴），古木仅作结构性框架，搭配真鍮金、常磐绿点缀。配合明朝体（明朝体落于和纸之上），营造素净、庄重、克制的神社氛围，同时保证浅色高对比的可读性。

四个母题贯穿主题：**鸟居（朱漆门）、古木（梁柱）、注連縄（绳结）、紙垂／御币（锯齿白纸）**。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 247 242 233 | `#F7F2E9` | 生成り和纸白 |
| 表面 | `--theme-surface` | 255 252 246 | `#FFFCF6` | 纸白 |
| 次表面 | `--theme-surface-alt` | 240 232 218 | `#F0E8DA` | 浅麦色 |
| 边框 | `--theme-border` | 214 198 176 | `#D6C6B0` | 暖砂线 |
| 文字 | `--theme-text` | 38 30 27 | `#261E1B` | 墨（暖黑） |
| 主色 | `--theme-primary` | 198 48 38 | `#C63026` | 朱（鸟居 / 緋袴） |
| 主色悬停 | `--theme-primary-hover` | 165 36 28 | `#A5241C` | |
| 强调 | `--theme-accent` | 184 142 56 | `#B88E38` | 真鍮金（铃 / 金具） |
| 强调前景 | `--theme-accent-foreground` | 40 30 8 | `#281E08` | 金底上的深色文字 |
| 危险 | `--theme-danger` | 150 26 32 | `#961A20` | 深紅 maroon（与朱色主色拉开） |
| 成功 | `--theme-success` | 56 124 78 | `#387C4E` | 常磐绿 |
| 骰子卡 | `--theme-dice-card-bg` | 250 240 234 | `#FAF0EA` | 御札（淡朱晕染） |

> 红白主题下 `primary`（朱）与 `danger`（红）天然接近，因此 `danger` 特意压暗、偏冷为深紅 maroon，确保「发放（朱）/ 删除（红）」等操作按钮可区分；`accent` 用真鍮金作为第三独立色相，并配 `accent-foreground` 深色保证文字对比度。

#### 字体

- 正文 / 标题：`Shippori Mincho`（日系明朝体，自带拉丁字形）→ `Yu Mincho` → `Noto Serif CJK SC` → `Songti SC` → `serif`
- 等宽：`JetBrains Mono`
- 通过 `next/font/google` 自托管；中文走 CJK 明朝 / 宋体回退。

#### 拟物与装饰元素

- **圆角**：基础 `0.25rem`，卡片非对称切角（tl 2 / tr 4 / br 2 / bl 4），呼应木工榫卯。
- **古木框架**：会话侧栏 `.conv-sidebar` 为浅杉木纹渐变（`#efe4cd → #e4d3b0`，右边框 `#cbb38e`），如白墙间外露的神社梁柱。
- **注連縄 + 紙垂（绳结 + 御币）**：会话分隔线 `.conv-divider` 渲染为一条草绳（straw rope）+ 垂挂锯齿白纸（shide）的 SVG 母题（`--theme-shimenawa`），作为「圣域分隔」，高 18px。
- **鸟居横梁卡头**：线索 / 物品 / 详情卡顶部 `::before` 为「朱红梁 + 金线」双色条（vermilion 70% + gold 30%），形如鸟居笠木。
- **鸟居封印**：聊天气泡 `::after` 为朱色鸟居 SVG 印记（对方气泡左上、己方气泡右上）。
- **和纸卡面**：卡片底色为暖和纸 `#FAF2E2` 叠加极淡纤维纹理；悬停时边框转朱色。
- **朱印辉光**：`--theme-glow` 为朱色印章式光晕，用于选中 / 激活态。
- **阴影**：`--theme-card-shadow` 为浅色主题下的柔和暖木阴影；`.theme-border` 底部为 4px 朱色梁线，悬停叠加朱色光晕。
- **材质**：`--theme-surface-texture` 为极淡的和纸纤维点纹（SVG，平铺 4px）。

#### 实现位置

- 主题变量与组件样式：`src/themes/shrine/theme.css`
- 跨主题装饰（`.theme-border` 朱梁与光晕）：`src/app/globals.css`
- 大厅筛选标签的 shrine 高亮、房间设置主题预览点：`src/components/LobbyClient.tsx`、`src/components/RoomSettings.tsx`
- 元信息与多语言：`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.shrine.*`）

### 霓虹雨夜

概念：赛博都市雨夜，磨砂玻璃面板与霓虹反射。

#### 设计概念

以**赛博都市的深夜暴雨**为核心意象：深蓝夜底近乎纯黑，**雨痕青**（`#38BDF8`）与**霓虹品红**（`#F472B6`）两道霓虹灯光倒映在湿透的路面与玻璃幕墙上。母题为**磨砂玻璃面板（frosted glass / `backdrop-filter: blur`）、雨珠、玻璃窗水痕、都市辉光（city glow）**。整体深色高对比，青色主色 + 品红强调 + 紫色 AI 全息，结合毛玻璃透明感与双色霓虹辉光，营造赛博朋克都市夜雨质感。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 7 11 20 | `#070B14` | 最深雨夜蓝黑 |
| 表面 | `--theme-surface` | 17 26 43 | `#111A2B` | 深蓝玻璃面 |
| 次表面 | `--theme-surface-alt` | 12 20 34 | `#0C1422` | 更深玻璃底 |
| 边框 | `--theme-border` | 42 58 85 | `#2A3A55` | 冷蓝线 |
| 文字 | `--theme-text` | 220 230 245 | `#DCE6F5` | 冷湿光 |
| 消隐文字 | `--theme-text-muted` | 141 163 196 | `#8DA3C4` | |
| 暗淡文字 | `--theme-text-dim` | 86 104 138 | `#56688A` | |
| 主色 | `--theme-primary` | 56 189 248 | `#38BDF8` | 雨痕青（霓虹灯牌） |
| 主色悬停 | `--theme-primary-hover` | 14 165 233 | `#0EA5E9` | |
| 强调 | `--theme-accent` | 244 114 182 | `#F472B6` | 霓虹品红（都市倒影） |
| 强调前景 | `--theme-accent-foreground` | 6 18 31 | `#06121F` | 品红底上的深色文字 |
| 危险 | `--theme-danger` | 248 113 113 | `#F87171` | 警报红 |
| 成功 | `--theme-success` | 52 211 153 | `#34D399` | 翡翠绿 |
| AI | `--theme-ai` | 167 139 250 | `#A78BFA` | 紫色全息（AI 功能强调） |
| 页头背景 | `--theme-header-bg` | 10 16 28 | `#0A101C` | |
| 主色前景 | `--theme-primary-foreground` | 6 18 31 | `#06121F` | 亮青底上的深色文字 |

> 青 / 品红 / 紫三色拉开独立色相，符合赛博霓虹的视觉逻辑；浅色主色（亮青）配深色 `primary-foreground` 保证按钮文字对比；深色 `surface` 叠加 `backdrop-filter: blur` 实现磨砂玻璃效果。

#### 字体

- 正文：`Inter`（现代无衬线，清晰可读）→ CJK 无衬线回退
- 标题：`Space Grotesk`（几何感无衬线，都市感）
- 等宽：`JetBrains Mono`
- 经 `next/font/google` 自托管。

#### 拟物与装饰元素

- **圆角**：`--theme-radius: 0.85rem`，均匀圆角，磨砂玻璃卡片的柔和边缘。
- **磨砂玻璃侧栏**：`.conv-sidebar` 为深蓝半透明渐变（`rgba(13,22,40,0.82) → rgba(8,14,26,0.82)`）叠加 `backdrop-filter: blur(14px)`，右边框为淡青霓虹线。
- **签名母题 · 雨落分隔**：`.conv-divider` 为四条斜落雨线 + 中央水滴轮廓 SVG（青色描边 + 外发光，`--theme-divider`），呼应雨夜水迹。
- **霓虹卡头**：线索 / 物品 / 详情卡顶部 `::before` 为青→品红双色渐变光条 + 青色辉光，如玻璃幕墙上的霓虹倒影。
- **雨珠气泡**：聊天气泡 `::after` 为青色（对方）/ 品红（己方）水滴形 SVG，各带对应颜色外发光。
- **磨砂玻璃卡面**：`.clue-card` / `.inventory-card` 为半透明深蓝底（`rgba(20,31,52,0.55)`）+ `backdrop-filter: blur(12px)`，悬停时青色边框 + 辉光强化。
- **青色辉光**：`--theme-glow` 为双层雨痕青光晕（内层 8px、外层 22px），用于选中 / 激活态。
- **冷暗阴影**：`--theme-card-shadow` 为深色背景专用阴影（顶部 1px 白色内发光 + 深色大投影），配合 `--theme-surface-texture` 极淡斜向雨纹（SVG 对角线，`stroke-opacity: 0.03`）。

#### 实现位置

- `src/themes/rainglass/theme.css`
- 跨主题装饰（`.theme-border` 玻璃边与双层青色辉光）：`src/app/globals.css`
- 大厅筛选标签的 rainglass 青色辉光、房间设置主题预览点：`src/components/LobbyClient.tsx`、`src/components/RoomSettings.tsx`
- 元信息与多语言：`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.rainglass.*`）

### 苍穹幻境

概念：JRPG 晴空奇幻世界，水晶、飞行石、金线指令窗。

#### 设计概念

以**《空之轨迹》/ 最终幻想式的晴空幻想世界**为核心意象：清晨天蓝为底，**贵金属金辉**（`#D9A528`）装点指令窗边框与卡头，水晶切面与飞行石高光为装饰母题。整体为**明亮浅色主题**：天蓝 + 金 + 宝石蓝三色构成 JRPG 命令窗的经典配色，衬线字体（`Crimson Text` / `Marcellus`）落于亮白纸面，呈现优雅奇幻气质。叙事性母题包括**水晶分隔、飞行石星芒气泡、金线指令窗边框、地图纸纹路**。

#### 配色（语义 token → RGB / Hex）

| 角色 | 变量 | RGB | Hex | 说明 |
| ---- | ---- | --- | --- | ---- |
| 背景 | `--theme-bg` | 238 246 253 | `#EEF6FD` | 晴朝天蓝 |
| 表面 | `--theme-surface` | 248 251 255 | `#F8FBFF` | 高空云白 |
| 次表面 | `--theme-surface-alt` | 227 238 251 | `#E3EEFB` | 浅阴影蓝 |
| 边框 | `--theme-border` | 185 212 238 | `#B9D4EE` | 远山地平线 |
| 文字 | `--theme-text` | 26 42 68 | `#1A2A44` | 深蓝墨 |
| 消隐文字 | `--theme-text-muted` | 90 112 143 | `#5A708F` | |
| 暗淡文字 | `--theme-text-dim` | 147 168 196 | `#93A8C4` | |
| 主色 | `--theme-primary` | 43 127 212 | `#2B7FD4` | 苍穹蓝 |
| 主色悬停 | `--theme-primary-hover` | 31 108 187 | `#1F6CBB` | |
| 强调 | `--theme-accent` | 217 165 40 | `#D9A528` | 贵金属金（指令窗边框） |
| 强调悬停 | `--theme-accent-hover` | 194 144 26 | `#C2901A` | |
| 强调前景 | `--theme-accent-foreground` | 26 42 68 | `#1A2A44` | 金底上的深色文字 |
| 危险 | `--theme-danger` | 214 69 63 | `#D6453F` | 警报赤 |
| 成功 | `--theme-success` | 47 158 99 | `#2F9E63` | 翠绿 |
| AI | `--theme-ai` | 17 157 141 | `#119D8D` | 法球青（AI 功能强调） |
| 页头背景 | `--theme-header-bg` | 244 249 255 | `#F4F9FF` | |
| 私聊边框 | `--theme-private-border` | 217 165 40 | `#D9A528` | 金封密信 |
| 私聊背景 | `--theme-private-bg` | 250 245 228 | `#FAF5E4` | 羊皮纸金白 |

> 天蓝 / 金 / 翠绿三色拉开独立色相；`accent`（金）专用于装饰性边框与指令窗线框，与 `primary`（蓝）形成 JRPG 命令窗经典配色；`accent-foreground` 深色保证金底文字对比。

#### 字体

- 正文：`Crimson Text`（文学衬线，JRPG 对话框气质）→ `Georgia` → CJK 衬线回退（`Noto Serif CJK SC` / `Songti SC`）
- 标题：`Marcellus`（优雅罗马体，JRPG 章节标题感）
- 等宽：`JetBrains Mono`
- 经 `next/font/google` 自托管。

#### 拟物与装饰元素

- **水晶切面圆角**：非对称切角（tl 0.6 / tr 0.3 / br 0.6 / bl 0.3），如宝石刻面。
- **晴空侧栏**：`.conv-sidebar` 为天蓝渐变（`#EAF3FD → #D8E8F9`），右边框为 2px 金线（`#C2941E`），如指令窗的金色镶边。
- **金线指令窗标签**：`.conv-tab.active` 为金色左边框 + 金蓝渐变底 + 柔和天蓝投影，呼应 JRPG 命令窗的选项高亮。
- **签名母题 · 浮晶分隔**：`.conv-divider` 为两侧金色横线 + 中央蓝色菱形外框与金色菱芯 SVG（`--theme-divider`），呼应浮空晶石 / 导力石。
- **金→蓝指令窗卡头**：线索 / 物品 / 详情卡顶部 `::before` 为金→蓝渐变 3px 顶线 + 金色辉光，如 JRPG 指令窗的顶部横梁。
- **飞行石星芒气泡**：聊天气泡 `::after` 为竖向纺锤形星芒 SVG——对方气泡为蓝填充 + 金描边，己方气泡为金填充 + 蓝描边，各带对应颜色外发光。
- **金丝地图纸纹**：`--theme-surface-texture` 为极淡蓝色交叉线纹（`stroke-opacity: 0.025`），如奇幻地图细格纸。
- **金蓝双色辉光**：`--theme-glow` 为金色主光晕 + 天蓝辅助光，用于选中 / 激活态；`--theme-card-shadow` 为顶部金色内发光（1px）+ 天蓝柔和投影，营造漂浮感。
- **金线指令窗卡面**：`.clue-card` / `.inventory-card` 为纯白底 + 金色内描边（`inset 0 0 0 1px rgba(217,165,40,0.18)`）+ 浅蓝投影，悬停时金色外描边加深 + 投影扩大。

#### 实现位置

- `src/themes/aether/theme.css`
- 跨主题装饰（`.theme-border` 金色双内描边与浮空投影）：`src/app/globals.css`
- 大厅筛选标签的 aether 金色辉光、房间设置主题预览点：`src/components/LobbyClient.tsx`、`src/components/RoomSettings.tsx`
- 元信息与多语言：`src/themes/types.ts`、`messages/{zh,en}.json`（`theme.aether.*`）