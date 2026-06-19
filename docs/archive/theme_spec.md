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


## 主题列表

目前支持的主题和概念

### 默认

默认的主题，采用现代web的设计质感。

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