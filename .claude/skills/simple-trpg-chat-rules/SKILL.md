---
name: simple-trpg-chat-rules
description: >
  Complete reference for the pluggable rule-template module system in simple-trpg-chat
  (RuleModule interface + capability-driven UI + registry). USE THIS SKILL whenever the
  user asks to add a new TRPG ruleset (DnD 5e / d20 / PbtA / 骰池 / WoD / FATE …), modify
  rule-template behavior, debug rule-gated commands (.rc / .sc / .st / .r), reason about
  why a check resolved a certain way, change how rule capabilities drive UI (TopBar
  check menu / character-sheet bars / attribute grid / avatar hover card / member list /
  host check dialog), or extend AI-agent rule integration. Also trigger when the user
  says "规则模板" / "规则模块" / "rule template" / "RuleModule" / "capabilities" /
  "resolveCheck" / "getRuleForRoom", or names a rule id like coc7th / basic / dnd5e /
  triangle / shouhun / 狩魂者 in an implementation context. Even if the user just says
  "加一套规则" without specifying which system, consult this skill — the registry/
  capability pattern is the same for every ruleset.
---

# Simple TRPG Chat — 规则模板模块系统

> 设计文档在 `docs/arch/rule-template-system.md`(重构前现状)和 `docs/arch/rule-template-refactor.md`(方案)。本文件描述**当前**实现,与代码同步维护。

## 0. 设计意图

规则系统是**插件化**的:每套规则是一个独立模块,自注册到全局表。引擎/UI/AI 代码不应出现 `if (ruleId === "xxx")` 分支——行为差异全部通过 `RuleModule` 接口方法或 `RuleCapabilities` 纯数据表达。

验收标准:**新增一套规则 = 新增 `rules/<id>/` 模块 + 注册一行 + i18n + `RULE_TEMPLATES` 追加一项**。命令引擎、AI、只读状态面板、TopBar、大厅都不需要改。

现有 5 套:`basic`(通用 d100)、`coc7th`、`dnd5e`(d20)、`triangle`(Triangle Agency, 6d4 数 3)、`shouhun`(狩魂者, d20+加骰/时髦骰)。

**当前状态(PR #176 之后):公共代码(`src/lib/rules/` 之外)已无任何 `ruleTemplate === "<id>"` 硬编码分支——包括曾经最重的 `CharacterPanel.tsx`(24 处已全部收敛)。** §5 记录了这次是怎么做到的。数据模型下沉(各规则 sheet 类型/默认值/derive 迁入 `rules/<id>/sheet.ts`)也已在 `refactor/rule-sheet-types` 完成。审计与修复过程见 `docs/arch/rule-template-coupling-audit.md`。

---

## 1. 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/lib/rules/types.ts` | 全部接口契约:`RuleModule` / `RuleCapabilities` / `CheckRequest` / `CheckResult` / `ModifierTerm` / `CharacterStatus` / `StatRoute` / `ResourcePatch` / `VisualGrade` / `AiRuleHints` |
| `src/lib/rules/registry.ts` | `getRule` / `getRuleForRoom` / `listRules` / `listRuleIds` / `DEFAULT_RULE_ID`;模块注册位置 |
| `src/lib/rules/index.ts` | barrel —— 所有外部代码从 `@/lib/rules` 导入,**不要**深链到子路径 |
| `src/lib/rules/status-view.ts` | `readStatusEntries()` / `primaryVital()`:把 `readStatus()` 摊平成可渲染条目。头像悬浮窗和成员列表共用,**React-free**(server action 也 import 它) |
| `src/lib/rules/patch-utils.ts` | `clampInt` / `clampAttributes`:`applySheetPatch` 消毒 LLM 输入的共享实现 |
| `src/lib/rules/{basic,coc7th,dnd5e,triangle,shouhun}/index.ts` | 5 个规则模块 |
| `src/lib/rules/{coc7th,dnd5e,triangle,shouhun}/stats.ts` | 各规则的 `.st` 名称→属性/资源解析器(`resolveCocStat` 等)。**PR #176 从 `src/lib/{coc,d20,ta,sh}-stats.ts` 迁到规则目录内**,使每套规则物理自包含;只被自己的 `index.ts` import |
| `src/lib/rules/{coc7th,dnd5e,triangle,shouhun}/sheet.ts` | 各规则的角色卡数据模型:属性/资源接口 + 默认值 + `compute*Derived`。**`refactor/rule-sheet-types` 从 `character-types.ts` 迁来**,自包含(不 import `character-types`);经 barrel 再导出。见 §5 |
| `src/lib/character-types.ts` | **只剩通用骨架**:`CharacterData` / `CustomAttribute` / `ResourceBar`;对各规则 sheet 接口只 `import type`(无运行时耦合) |
| `src/components/shared/host-label.tsx` | `useHostLabel()` / `useHostLabelResolver()` / `usePlayerLabel()` / `useRuleLabelResolver()` —— 解析 `hostLabelKey` / `playerLabelKey` / 规则 `labelKey` 的唯一入口(大厅房间徽标经 `useRuleLabelResolver` 渲染,不再硬编码 coc7th) |
| `src/components/room/character/CharacterPanel.tsx` | 可编辑角色卡面板。**PR #176 后完全能力位驱动、零 rule-id 分支**:属性宫格走 `read/writeAttributes`,资源上限/当前值/衍生页脚走 `draftStatusFor()`(见 §5) |
| `src/components/room/character/resource-visuals.ts` | `RESOURCE_ICON` / `DERIVED_ICON`:client-only 的 key→图标/颜色映射。未命中的 key 用主色兜底,所以新规则**不必**改这里 |
| `src/components/room/character/CharacterRuleGate.tsx` | 房间规则与成员角色卡不匹配时的重建引导(主持人切规则会触发) |
| `src/components/room/chat/QuickCheckPanel.tsx` | 玩家快速检定面板(输入框 ◎ / Alt+Q)。完全由 `capabilities.quickCheckPanel` 驱动、经 `rule.buildCheckCommand` 产出命令,零 rule-id 分支——新规则不用改它 |
| `src/lib/__tests__/rules.test.ts` | 209 个用例。新规则上线必须补等量边界覆盖 |
| `src/db/schema.ts` | `RULE_TEMPLATES` 常量数组(**必须**与注册表同步)+ `rooms.rule_template` 列 |

`diceRules` 列已在 PR #125 删除。规则配置只有 `rule_template` 一个数据源,不要重新引入双字段。

---

## 2. `RuleModule` 接口

共 **24 个成员**(5 个元数据 + 15 个必填方法 + 4 个可选方法)。`coc7th/index.ts` 和 `shouhun/index.ts` 是最完整的两个范例——前者字段最全,后者用到了最多可选钩子。

### 元数据

| 字段 | 类型 | 作用 |
| --- | --- | --- |
| `id` | `string` | 持久化到 `rooms.rule_template`。**稳定,不可改** |
| `labelKey` | `string` | 规则显示名的 i18n key。同一个 key 要在 `createRoom` / `roomSettings` / `export` 三个 namespace 里都有文案(`rules.test.ts` 的 `labelKey` 块会验 `export`) |
| `hintKey?` | `string` | 创建房间下拉框的提示文案 key |
| `rcUsageKey?` | `string` | `parseRcArgs` 返 null 时的用法错误 key(默认 `rcUsageError`;dnd5e=`d20RcUsage`;shouhun=`shRcUsage`;triangle=`taRcNotSupported`,用于"本规则不支持 .rc") |
| `capabilities` | `RuleCapabilities` | 见 §3 |

### 必填方法

| 方法 | 作用 |
| --- | --- |
| `initCharacter()` | 新成员加入时的初始角色卡 |
| `computeDerived(sheet)` | 属性改动后重算衍生值,并保留 player-set 当前值(钳到新上限)。basic 是 identity |
| `readStatus(sheet)` | 把本规则的数据袋(`cocDerived`/`d20Sheet`/`taSheet`/`shSheet`)摊平成 `CharacterStatus`,键与 capabilities 对齐。无结构化角色卡的规则返 `{resources:{}}` |
| `readAttributes(sheet)` / `writeAttributes(sheet, values)` | 属性宫格通用 `Record<string,number>` ↔ 各规则属性袋(按 `attributeKeys` 白名单)。让**可编辑**角色卡面板不再按名字读写 `cocAttributes`/`d20Attributes`。basic 返 `{}` / 原样。PR #176 新增 |
| `applySheetPatch(sheet, patch)` | 合并 **AI bot 的 `set_character_card` 参数**。白名单 + 钳位,用 `patch-utils` 的助手。接受的键 = `describeForAI().sheetToolSchemaFields` 声明的键——**声明和消费必须成对**,否则模型照 schema 调用而写入被静默丢弃(这正是 triangle/狩魂者 曾经踩的坑) |
| `routeStat(name)` | `.st <name> <val>` 路由:`{kind:"skill"\|"attribute"\|"resource", canonical, key?}` |
| `canonicalStatName(name)` | 显示名归一(`san → 理智值`)。无别名的返回原值 |
| `lookupFallback(name, sheet)` | `.rc <name>` 在 `room_skills` 未命中时的回退。dnd5e/basic 返 null |
| `resolveCheck(req)` | **核心**:掷什么骰、加什么调整、比较方向、大成功/失败判定全归规则。`rollDie()` 必须在此内部调用 |
| `parseRcArgs(args)` | 本规则的 `.rc` 语法解析。返 null = 用法错误 |
| `applyStatWrite(sheet, route, value)` | `.st` 落到 attribute/resource 时的唯一 dispatch 点。引擎不认识任何规则专属键 |
| `applyResourcePatch(sheet, patch)` | 批量资源当前值(HP/SAN/MP/mana + d20 可编辑 hpMax)的落库入口。`ResourcePatch` 是各规则资源字段的并集,规则只取自己认识的键并钳位。`updateResourcesAction` 与角色卡保存共用;取代了原来 `updateResourcesAction` 里的 dnd5e/shouhun/coc 三分支。basic/triangle 无标准资源返原样(triangle 计数器仍走 `applyStatWrite`)。PR #176 新增 |
| `exportSnapshot(sheet)` | 导出快照 + AI 的 `my_character` 工具共用的"这张卡值得汇报什么" |
| `describeForAI()` | `{rulesPrompt, sheetToolSchemaFields}`:bot 系统提示片段 + `set_character_card` 的 schema 片段 |

### 可选方法

| 方法 | 谁在用 |
| --- | --- |
| `parseQuickCheckArgs?(args)` | 把 `.r <args>` 认领成简写检定。在通用表达式解析**之前**被调用;返 null 则回落为普通掷骰。狩魂者 用它实现 `.r+x±y [DC]` |
| `naturalGrade?(roll, faces, count)` | 普通掷骰(`.rd`/`.r`,非检定)的文化/机制解读,供 AI bot 反应。COC 认 1d100 的 01–05/96–100,basic 给 CoC 文化提示(1/100),其余省略(返 null)。取代 `ai_agent.ts` 里原本的 `id === "coc7th"/"basic"` 分支。PR #176 新增 |
| `buildCheckCommand?(input)` | **快速检定面板**(输入框左侧 ◎)把面板状态变成"玩家本可手打的命令"+ 投掷按钮预览(`{command, preview}`)。与 `capabilities.quickCheckPanel` **成对声明**(`rules.test.ts` 有配对断言);返 null = 该组合无法表达(狩魂者 无名+暗骰),面板禁用按钮。必须纯函数、client-safe。v0.19 新增 |
| `resolvePlainRoll?(args)` | 把 `.rd/.r/.rh <args>` 认领成**规则专属纯投掷**(COC 的 `.rd100b2` 奖惩骰投——额外 d10 替换十位)。在数字前缀改写与通用表达式解析**之前**、且**含 `.rh` 暗投**地被调用;规则自己掷骰,返回 `{notation, display, total, detail}`(引擎补 `command` 与代投标记);返 null 落回普通掷骰。v0.19 新增 |

另:`parseRcArgs` / `parseQuickCheckArgs` 的返回值多了可选 `ruleData?: Record<string, unknown>` 槽——规则专属的语法附加物(COC 的奖励/惩罚骰数)经引擎**原样透传**到 `CheckRequest.ruleData`,`resolveCheck` 自取自清洗。引擎不认识其中任何字段。

### `CheckRequest` → `CheckResult`

引擎负责查值和预算调整值表达式,规则负责掷骰和判定。

```ts
interface CheckRequest {
  skillName: string;        // 已归一的显示名
  target: number;           // 阈值(COC)或 DC(d20);语义由规则自释
  explicitTarget?: number;  // 玩家显式打的 `.rc <n> <X>`;引擎查出来的不算
  storedValue?: number;     // room_skills 行 或 lookupFallback 的结果
  modifierValue?: number;   // 引擎已求值的调整值(含内嵌骰)
  modifierDisplay?: string; // 人类可读渲染,如 "+1+1d6([3])=+4"
  modifierTerms?: ModifierTerm[];  // 逐项逐骰结果 —— 狩魂者 靠它渲染 `2d4[3,4] + 1d6[2]`
  sheet: CharacterData | null;     // 引擎总是加载
}

interface CheckResult {
  skillName: string;
  notation: string;   // "1d100" / "1d20+5"
  rolls: number[];
  total: number;      // 最终比较值(COC=raw roll;d20=roll+mod)
  target: number;
  passed: boolean;    // 方向由规则决定,引擎不假设
  grade: VisualGrade; // 闭合词表:"critical"|"success"|"failure"|"fumble"
  detail: Record<string, unknown>;  // diceDetail JSON;**不要**含 `command` 字段(引擎后加)
}
```

**关键 quirk**:COC 的 `passed` 严格等于 `roll <= target`,**不**因 nat crit 改变。`grade` 可能升到 `critical` 而 `passed` 仍为 false(target<5 的边角)。`rules.test.ts` 锁定了此行为,迁移时不要"修正"。

---

## 3. `RuleCapabilities` —— 规则能影响的全部范围

这张表就是"一套规则能改变什么"的完整答案。每个字段都有真实消费方;没有死字段。

| 字段 | 类型 | 影响到哪儿 |
| --- | --- | --- |
| `hostLabelKey` | `string` **必填** | 房间内一切提到主持人的地方(聊天徽章、成员列表、可见性标签、物品来源、时间线、房间信息、大厅房间卡)。文案在 `messages.hostLabels`,经 `host-label.tsx` 解析 |
| `playerLabelKey` | `string` **必填** | 成员列表角色标签、主持人检定对话框、物品分发弹窗、大厅人数。文案在 `messages.playerLabels` |
| `hasSanity` | `boolean` | SAN 资源条 + `.sc` 命令 + `requestSanCheckAction` 守卫 |
| `hasPsychologyRoll` | `boolean` | `psychologyHiddenRollAction` 守卫 + TopBar 心理学暗骰菜单项 |
| `hasManaPoints` | `boolean` | MP 资源条渲染 |
| `checkMenuModes` | `("check"\|"psychology"\|"sancheck")[]` | TopBar 检定项;>1 渲染下拉,=1 单按钮,空数组整个隐藏(triangle) |
| `supportedCommands` | `string[]` | `commands.ts` 的命令门控(`.sc` 就读这个) |
| `resourceBars` | `{key,labelKey,style?}[]` | 角色卡预置资源条。`style:"counter"` 渲染为无上限计数器(Triangle 嘉奖/处分),默认 `"bar"` 为 当前/上限 |
| `attributeKeys` | `{key,labelKey}[]` | 角色卡属性宫格(basic=0, coc7th=9, dnd5e=8, triangle=9, shouhun=3);同时是 `clampAttributes` 的白名单来源 |
| `derivedStats?` | `{key,labelKey}[]` | 属性宫格后的只读衍生卡(shouhun=术法强度)。值由 `readStatus().derived` 现算 |
| `statusAttributeKeys?` | `{key,labelKey}[]` | 属性里适合塞进头像悬浮窗的少数几个(coc7th=幸运, dnd5e=AC, shouhun=3 项)。key 必须在 `attributeKeys` 里,labelKey 可另选更短的 |
| `statusCustomLimit?` | `number` | 紧凑状态面板最多显示几个玩家自定义属性(basic=2,因为它没有任何预置资源);省略=全部 |
| `defaultRollExpression` | `string` | 空参数 `.r`/`.rd` 的默认骰(coc7th/basic=1d100, dnd5e/shouhun=1d20, triangle=6d4) |
| `requiresStoredTarget` | `boolean` | `.rc` 查不到值时是否报 STAT_NOT_SET(coc7th/basic=true, 其余=false) |
| `hasRoleLevel` | `boolean` | 角色卡是否显示 role/level 字段(仅 dnd5e) |
| `resourceMaxEditable?` | `boolean` | 角色卡资源条上限是否可手动编辑(HP 无自动派生的规则=dnd5e)。派生上限的规则(coc7th/shouhun)不设,上限随属性动。PR #176 新增 |
| `resourceCurrentsViaAction?` | `boolean` | 保存资源当前值时走 `updateResourcesAction`(可改他人,coc7th/shouhun)还是并进本人整卡保存(dnd5e HP 内联、triangle 计数器)。`CharacterPanel.handleSaveAll` 据此选路径,取代原本的 rule-id 分支。PR #176 新增 |
| `quickRolls` | `string[]` | 聊天输入框上方的快捷命令 chips |
| `highlightDieFace?` | `number` | 写入 `diceDetail.highlightFace`,渲染器逐骰标亮该面(triangle=3) |
| `checkRequestOptions?` | 见下 | **主持人发起检定的整个交互流程** |
| `quickCheckPanel?` | 见下 | **玩家侧快速检定面板**(输入框左侧 ◎ 入口);缺省 = 不渲染入口(triangle) |

### `checkRequestOptions` —— 唯一能改写主持人流程的能力

```ts
checkRequestOptions?: {
  dcField: boolean;                              // 主持人对话框显示可选 DC 输入(留空=规则默认)
  styleDiceField?: { min: number; max: number }; // 时髦骰步进器
  skillNameOptional: boolean;                    // 检定名可留空(服务端回落到通用标签)
  responderBonusDice?: { max: number };          // 响应方先填加骰数
}
```

声明后:主持人对话框把 diceType 选择器换成上述字段;请求 detail 携带 `{dc, styleDice}`;响应方被提示填加骰数,服务端据此合成该规则的 `.rc name+x±y DC` 命令。目前只有 shouhun 用。消费方:`actions/room.ts`、`RoomOverlays.tsx`、`HostCheckDialog.tsx`。

### `quickCheckPanel` —— 玩家快速检定面板(v0.19 新增)

```ts
quickCheckPanel?: {
  skills: boolean;                              // 列出玩家自己的 room_skills 行
  attributes: boolean;                          // 列出 attributeKeys(值走 readAttributes;仅当 .rc 能按名解析属性时才开)
  resourceKeys?: string[];                      // 可检定的资源当前值(coc = ["san"])
  nameField: "select" | "optionalText";         // 检定名来源:列表选择 / 可留空的自由文本(狩魂者)
  dcField?: boolean;                            // DC 输入框(d20 / 狩魂者)
  modifierField?: boolean;                      // 平加值步进器;选中存储技能会以其存值播种(d20 roll20 流)
  bonusPenaltyDice?: { max: number };           // COC 奖励/惩罚骰分段控件(-max..+max)
  advantageField?: boolean;                     // d20 优势/劣势三态(5e 不叠加,永远不是计数器)
  bonusDiceField?: { max: number };             // 狩魂者 加骰步进器
  styleDiceField?: { min: number; max: number };// 狩魂者 时髦骰步进器
  hiddenToggle: boolean;                        // 暗骰开关(命令换成 .rch 变体)
}
```

面板(`QuickCheckPanel.tsx`,由 `ChatInput.tsx` 的 ◎ 按钮挂载,Alt+Q)**从不掷骰**:每次打开新拉数据(`getMySkillsAction` + `getCharacterDataAction`,经规则自己的 `readAttributes`/`readStatus` 摊平),把面板状态交给规则的 **`buildCheckCommand(input)`** 换取 `{command, preview}`,然后把 command 当作玩家手打的聊天输入原样提交——服务端检定流仍是唯一裁决者。列表项的命令名统一经 `canonicalStatName(key)` 归一(如 `san → 理智值`),存储值**不进命令**(服务端回查最新值),只用于预览。选中项的 MRU 顺序存 localStorage(`strpg:quick-check-recent:<roomId>`)。

**声明 `quickCheckPanel` 而不实现 `buildCheckCommand`(或反之)= 面板静默失效**——与 `sheetToolSchemaFields` 同款陷阱,`rules.test.ts` 的配对断言会红。

配套引擎设施(规则无关,已就绪,新规则**不用**动):`.rch` / `.rah` 是 `.rc` / `.ra` 的暗检定孪生(结果仅投掷者可见,visibility="self"),`commands.ts` 与 `roll-command.ts` 的前缀表已含;声明了 `rc` 的规则应把 `rch`/`rah` 一并放进 `supportedCommands`,并在 `helpEntryIds` 里加 `rch` 条目(配对测试会验)。

### 两条硬约束

1. **capabilities 是纯数据,禁止放 React 类型/组件引用**——规则模块要在 server 端可加载。UI 侧的图标/颜色是 client-only 静态 map(`resource-visuals.ts`、`RoomTopBar.tsx` 的 `CHECK_MODE_UI`),按 capability 的 string key 查,未命中有兜底。
2. **`hostLabelKey` / `playerLabelKey` 必填**,且 `rules.test.ts` 断言 `listRuleIds()` 与其 `EXPECTED` 映射的键集合完全相等——漏填直接红。这是刻意的。

---

## 4. 添加新规则的清单

**不要照抄本文档里的代码片段去写模块**——请直接读一个真实模块。选哪个:

| 你的规则形态 | 抄谁 |
| --- | --- |
| 有完整属性→衍生链、资源上限自动算 | `coc7th/index.ts` |
| 属性 free-set、玩家自己打调整值、d20 vs DC | `dnd5e/index.ts` |
| 无 `.rc`、资源是累加计数器 | `triangle/index.ts` |
| 需要 `.r` 简写 / 主持人对话框定制 / 逐骰渲染 | `shouhun/index.ts` |

### Step 1 — 模块文件

`src/lib/rules/<id>/index.ts`,实现 §2 的 23 个成员。TypeScript 会逼你填齐必填项;**最容易漏的是 `parseRcArgs`、`applyStatWrite`、`applySheetPatch`、`readAttributes`/`writeAttributes`、`applyResourcePatch`** 这几个不在"元数据"直觉里的方法。**支持 `.rc` 的规则还要决定快速检定面板长什么样**:声明 `capabilities.quickCheckPanel` + 实现 `buildCheckCommand`(两者成对,见 §3),并把 `rch`/`rah` 放进 `supportedCommands`、`rch` 放进 `helpEntryIds`;不支持 `.rc` 的规则(如 triangle)两者都不声明,入口按钮自动消失。**调整既有规则的检定语法时同理——别忘了同步它的 `quickCheckPanel`/`buildCheckCommand`,否则面板会继续生成旧语法命令。**规则自己的角色卡数据模型(属性/资源接口 + 默认值 + `compute*Derived`)放 `src/lib/rules/<id>/sheet.ts`(抄 `coc7th/sheet.ts`;自包含,不 import `character-types`),再在 barrel `rules/index.ts` 加一行 `export ... from "./<id>/sheet"`,并给 `CharacterData` 加一个 `import type` + 可选字段。若规则有 `.st` 别名/属性/资源路由,再建 `src/lib/rules/<id>/stats.ts` 写解析器(抄 `coc7th/stats.ts`),只被本模块 import。

### Step 2 — 注册

`src/lib/rules/registry.ts` 加一行 `register(yourRule)`。重复 id 会在模块加载时抛错。

### Step 3 — schema 常量同步

`src/db/schema.ts` 的 `RULE_TEMPLATES` 追加你的 id。**不同步 = server action 的 whitelist 把它当非法值打回 `"Invalid ruleTemplate"`,下拉框里选了也存不进去**。

### Step 4 — i18n

三个 namespace 都要:

- `createRoom`:`<labelKey>` / `<labelKey>Desc` / `<labelKey>Hint`
- `roomSettings`:`<labelKey>` / `<labelKey>Desc`
- `export`:`<labelKey>`(导出的 markdown 用它标注房间规则;`rules.test.ts` 会验)

外加属性/资源用到的新 `messages.character` labelKey。zh 和 en 两份都要。

### Step 5 — 主持人/玩家称呼

两者机制完全对称,各自三处:

1. **文案**——`messages/{zh,en}.json` 的 `hostLabels` / `playerLabels` 里挑现有 key,或新增。
   现有主持人:`kp`(KP)、`dm`(DM)、`manager`(经理)、`gm`(主持人/GM)。
   现有玩家:`player`(玩家)、`investigator`(调查员)、`adventurer`(冒险者)、`agent`(特工)、`soulHunter`(狩魂者)。
   泛用规则直接复用 `gm` / `player`,不要为了"看起来独特"造新 key。
2. **capability**——`capabilities.hostLabelKey` / `playerLabelKey` 指过去。
3. **测试**——`rules.test.ts` 的 `hostLabelKey` / `playerLabelKey` 两个 describe 块的 `EXPECTED` 映射各加一行。

UI 侧不用改。

### Step 6 — 单元测试

参考现有模块的覆盖密度,至少补:
- `resolveCheck` 的边界(临界值、大成功/大失败面、无调整值)
- `routeStat` 对每个属性别名 + 资源的路由
- `lookupFallback` 命中/未命中
- `initCharacter` 的字段结构
- `applySheetPatch` 的白名单与钳位(参考 §2 里 triangle/shouhun 的用例)
- 注册表能查到你的 id

### Step 7 — 数据库迁移

无。`rooms.rule_template` 是 text,接受任意字符串。`pnpm db:push` 只在改 schema 结构时才需要。

### 不需要改的地方(验证抽象成立)

`commands.ts`(命令引擎)、`actions/room.ts`(主持人动作 + 检定请求)、`actions/export.ts`、`actions/bot.ts`、`actions/character.ts`(`updateResourcesAction` 走 `applyResourcePatch`)、`ai_agent.ts`(系统提示 + sheet 工具 + `naturalGrade`)、**`CharacterPanel.tsx`(可编辑角色卡,PR #176 后完全能力位驱动)**、`RoomTopBar.tsx`、`AttributesTab.tsx`、`ResourceStatusTooltip.tsx`、`ConversationPanel.tsx`、`ChatInput.tsx`、**`QuickCheckPanel.tsx`(快速检定面板,能力位 + `buildCheckCommand` 驱动)**、`HostCheckDialog.tsx`、`RoomInfoPanel.tsx`、`RuleTemplateSelect.tsx`、`LobbyClient.tsx`(下拉 + 房间徽标)、`resource-visuals.ts`。

**只要模块把 22 个成员实现全、capabilities 填对,以上文件一律零改动**——这是本次(PR #176)把 CharacterPanel 的 24 处分支全部收敛后达成的验收状态。如果你发现必须改上面某个文件才能让新规则工作,先回头检查模块定义:大概率是某个 capability 没填、`readStatus`/`readAttributes` 没摊平对、或某个新方法(`writeAttributes`/`applyResourcePatch`)没实现。**确实**表达不了再扩 `RuleCapabilities`(纯数据),而不是加 id 分支。

---

## 5. 解耦现状(PR #176 后)——曾经的分支怎么没的

历史:重构前有 4 个文件、约 30 处 `ruleTemplate === "<id>"` 分支(最重的是 CharacterPanel 24 处)。**PR #176 已把公共代码里的 rule-id 分支全部收敛为 0**——下表是每个旧分支点现在靠什么表达,是"新规则为什么不用改这些文件"的具体答案。

| 旧分支点 | 现在靠什么 |
| --- | --- |
| `CharacterPanel` 属性宫格读写(`buildAttributeValues` / `attributeValuesAsXxx`) | `rule.readAttributes(sheet)` / `writeAttributes(sheet, record)` —— 通用 `Record<string,number>` ↔ 各规则属性袋 |
| `CharacterPanel` 资源上限 / 当前值 / 衍生页脚(`computeCocDerived`/`computeShDerived` 直调) | 面板本地 `draftStatusFor()` = `writeAttributes → computeDerived → readStatus`,一次产出 `{resources:{current,max}, derived}`;`spiritSense` 也经 `shouhun.readStatus().derived` 暴露 |
| `CharacterPanel` `handleSaveAll` 四分支 | `writeAttributes` 建袋 + `capabilities.hasRoleLevel`(role/level)+ `applyResourcePatch`/`applyStatWrite`(资源);落库路径由 `capabilities.resourceCurrentsViaAction` 决定(coc/狩魂→`updateResourcesAction` 可改他人;d20/triangle→并进本人整卡) |
| `CharacterPanel` `handleExport` 四分支 | `capabilities.{resourceBars,derivedStats,attributeKeys}` + `readStatus().attributeGrades` 全驱动 |
| `CharacterPanel` `resourceMaxEditable` / init 守卫 | `capabilities.resourceMaxEditable`;init 守卫用 `DEFAULT_RULE_ID` 常量比较 |
| `LobbyClient` coc7th 骷髅徽标 | `useRuleLabelResolver()`(host-label.tsx)对任意非默认规则渲染其 `labelKey` |
| `ai_agent.ts` 1d100 裸骰吉凶 | `rule.naturalGrade(roll, faces, count)` |
| `commands.ts` `readCurrentSanity` | `capabilities.hasSanity` + `readStatus(sheet).resources.san` |
| `character.ts` `updateResourcesAction` 三分支 | `rule.applyResourcePatch(sheet, patch)` 单行委派 |
| `lib/{coc,d20,ta,sh}-stats.ts` 散落公共 lib | 迁进 `rules/<id>/stats.ts`,每套规则物理自包含 |

### 数据模型下沉(已完成,`refactor/rule-sheet-types`)

各规则的属性/资源接口、默认值与 `compute*Derived` **已迁进各 `rules/<id>/sheet.ts`**(`coc7th/sheet.ts` = `CocAttributes`/`CocDerived`/`COC_DEFAULT_ATTRIBUTES`/`COC_MAX_SANITY`/`computeCocDerived`;`dnd5e`/`triangle`/`shouhun` 同理)。`character-types.ts` 现只剩通用骨架(`CharacterData`/`CustomAttribute`/`ResourceBar`),对各规则接口只做 **`import type`**(编译期擦除→无运行时依赖、无循环:sheet 文件是叶子,不 import `character-types`)。sheet 符号经 `@/lib/rules` barrel 再导出;外部代码从 barrel 拿(如 `import { computeCocDerived, type CocAttributes } from "@/lib/rules"`),规则模块自己从 `./sheet` 拿。

采用**保类型安全**方案:`CharacterData` 仍带各规则可选强类型字段(`cocAttributes?: CocAttributes`…),所以 `.cocDerived.hp` 式取值处零改动;加新规则仍要在 `character-types.ts` 加一行 `import type` + 一个可选字段,但只是"引类型"不是"塞逻辑"。想连这行都去掉(改 `ruleData?: Record<string,unknown>` 泛型槽)会牺牲取值处类型安全、动大量消费点,收益低,不做。至此审计的 8 处残余耦合全部收敛。

### 仍"刻意不迁"的

- 几个 `<select>` 的 carve-out —— 见 `src/components/shared/ThemedSelect.tsx` 注释。
- `saveCharacterDataAction` 已走 `rule.computeDerived`;但注意各规则 `computeDerived` 对 `san_current` 等当前值的保留/钳位时机不同,改动 `computeDerived` 会影响 export 快照里的边角值,有测试锁定。

### #176 引入的一处可见行为变更

COC / d20 的**导出 .txt** 属性标签从大写 key(`STR: 70`)改为翻译名(`力量: 70`),与 triangle/狩魂者 统一(`handleExport` 现用 `t(labelKey)`)。要恢复旧形式,给 `attributeKeys` 加导出专用 label 或新增 `exportLabel` 能力位。

---

## 6. 常见错误

1. **在引擎/UI 里写 `if (rule.id === "xxx")`** —— 先扩 `RuleCapabilities`(纯数据)再用 capability 驱动。§5 是例外清单,不是许可证。
2. **声明了 `sheetToolSchemaFields` 却没在 `applySheetPatch` 里消费** —— 模型会照 schema 正确调用,写入被静默丢弃,**没有任何报错**。triangle 和狩魂者 都踩过。`rules.test.ts` 现在有一条循环用例守住这个契约。
3. **`RuleCapabilities` 里塞 React 组件/图标** —— 规则模块要在 server 端可用。
4. **`rollDie` 留在 `commands.ts` 预掷** —— 预掷使比较方向无法被规则改写,d20 直接挂掉。必须在 `resolveCheck` 内部调用。
5. **新规则加了但下拉框里看不到** —— 检查 `schema.ts` 的 `RULE_TEMPLATES`。
6. **导出的房间信息标着别的规则名** —— 检查 `messages.export` 里有没有你的 `labelKey`。
7. **假设 `room.diceRules`** —— 该列已删,`getRuleForRoom` 签名是 `{ ruleTemplate?: string | null }`。
8. **"修正" `coc7th.resolveCheck` 的 grade 判定** —— grade=critical / passed=false 的边角是设计意图,测试锁定了。
9. **以为 `labelKey` 在 `messages.rooms` 命名空间** —— **没有 `rooms` 命名空间**。规则 `labelKey`(`ruleTemplateCoc7th`…)在 `createRoom` / `roomSettings` / `export` 三处。用 `useTranslations("rooms")` 解析会在渲染时抛 next-intl `MISSING_MESSAGE`(非静默兜底)。`useRuleLabelResolver` 读 `createRoom`;`rules.test.ts` 现有两条用例分别守 `export` 与 `createRoom` 命名空间。

---

## 7. 进一步阅读

- `src/lib/rules/coc7th/index.ts` — 字段最全的模块
- `src/lib/rules/shouhun/index.ts` — 用到最多可选钩子(`parseQuickCheckArgs`、`checkRequestOptions`、`derivedStats`、`attributeGrades`)
- `src/lib/__tests__/rules.test.ts` — 209 个用例,新规则请覆盖等量边界
- `docs/arch/rule-template-coupling-audit.md` — **PR #176 的耦合审计 + 修复计划 + 剩余 P1**(最新)
- `docs/arch/rule-template-system.md` / `docs/arch/rule-template-refactor.md` — 重构前分析与方案(历史)
