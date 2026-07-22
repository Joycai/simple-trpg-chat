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

§5 记录了目前**尚未**做到零分支的位置——它们是真实的、有原因的例外,不是待清理的遗留。

---

## 1. 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/lib/rules/types.ts` | 全部接口契约:`RuleModule` / `RuleCapabilities` / `CheckRequest` / `CheckResult` / `ModifierTerm` / `CharacterStatus` / `StatRoute` / `VisualGrade` / `AiRuleHints` |
| `src/lib/rules/registry.ts` | `getRule` / `getRuleForRoom` / `listRules` / `listRuleIds` / `DEFAULT_RULE_ID`;模块注册位置 |
| `src/lib/rules/index.ts` | barrel —— 所有外部代码从 `@/lib/rules` 导入,**不要**深链到子路径 |
| `src/lib/rules/status-view.ts` | `readStatusEntries()` / `primaryVital()`:把 `readStatus()` 摊平成可渲染条目。头像悬浮窗和成员列表共用,**React-free**(server action 也 import 它) |
| `src/lib/rules/patch-utils.ts` | `clampInt` / `clampAttributes`:`applySheetPatch` 消毒 LLM 输入的共享实现 |
| `src/lib/rules/{basic,coc7th,dnd5e,triangle,shouhun}/index.ts` | 5 个规则模块 |
| `src/components/shared/host-label.tsx` | `useHostLabel()` / `useHostLabelResolver()` / `usePlayerLabel()` —— 解析 `hostLabelKey` / `playerLabelKey` 的唯一入口 |
| `src/components/room/character/resource-visuals.ts` | `RESOURCE_ICON` / `DERIVED_ICON`:client-only 的 key→图标/颜色映射。未命中的 key 用主色兜底,所以新规则**不必**改这里 |
| `src/components/room/character/CharacterRuleGate.tsx` | 房间规则与成员角色卡不匹配时的重建引导(主持人切规则会触发) |
| `src/lib/__tests__/rules.test.ts` | 193 个用例。新规则上线必须补等量边界覆盖 |
| `src/db/schema.ts` | `RULE_TEMPLATES` 常量数组(**必须**与注册表同步)+ `rooms.rule_template` 列 |

`diceRules` 列已在 PR #125 删除。规则配置只有 `rule_template` 一个数据源,不要重新引入双字段。

---

## 2. `RuleModule` 接口

共 **17 个成员**(5 个元数据 + 12 个方法/可选方法)。`coc7th/index.ts` 和 `shouhun/index.ts` 是最完整的两个范例——前者字段最全,后者用到了最多可选钩子。

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
| `applySheetPatch(sheet, patch)` | 合并 **AI bot 的 `set_character_card` 参数**。白名单 + 钳位,用 `patch-utils` 的助手。接受的键 = `describeForAI().sheetToolSchemaFields` 声明的键——**声明和消费必须成对**,否则模型照 schema 调用而写入被静默丢弃(这正是 triangle/狩魂者 曾经踩的坑) |
| `routeStat(name)` | `.st <name> <val>` 路由:`{kind:"skill"\|"attribute"\|"resource", canonical, key?}` |
| `canonicalStatName(name)` | 显示名归一(`san → 理智值`)。无别名的返回原值 |
| `lookupFallback(name, sheet)` | `.rc <name>` 在 `room_skills` 未命中时的回退。dnd5e/basic 返 null |
| `resolveCheck(req)` | **核心**:掷什么骰、加什么调整、比较方向、大成功/失败判定全归规则。`rollDie()` 必须在此内部调用 |
| `parseRcArgs(args)` | 本规则的 `.rc` 语法解析。返 null = 用法错误 |
| `applyStatWrite(sheet, route, value)` | `.st` 落到 attribute/resource 时的唯一 dispatch 点。引擎不认识任何规则专属键 |
| `exportSnapshot(sheet)` | 导出快照 + AI 的 `my_character` 工具共用的"这张卡值得汇报什么" |
| `describeForAI()` | `{rulesPrompt, sheetToolSchemaFields}`:bot 系统提示片段 + `set_character_card` 的 schema 片段 |

### 可选方法

| 方法 | 谁在用 |
| --- | --- |
| `parseQuickCheckArgs?(args)` | 把 `.r <args>` 认领成简写检定。在通用表达式解析**之前**被调用;返 null 则回落为普通掷骰。狩魂者 用它实现 `.r+x±y [DC]` |

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
| `quickRolls` | `string[]` | 聊天输入框上方的快捷命令 chips |
| `highlightDieFace?` | `number` | 写入 `diceDetail.highlightFace`,渲染器逐骰标亮该面(triangle=3) |
| `checkRequestOptions?` | 见下 | **主持人发起检定的整个交互流程** |

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

`src/lib/rules/<id>/index.ts`,实现 §2 的 17 个成员。TypeScript 会逼你填齐必填项;**最容易漏的是 `parseRcArgs`、`applyStatWrite`、`applySheetPatch`** 这三个不在"元数据"直觉里的方法。

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

`commands.ts`(命令引擎)、`actions/room.ts`(主持人动作 + 检定请求)、`actions/export.ts`、`actions/bot.ts`、`ai_agent.ts`(系统提示 + sheet 工具)、`RoomTopBar.tsx`、`AttributesTab.tsx`、`ResourceStatusTooltip.tsx`、`ConversationPanel.tsx`、`ChatInput.tsx`、`HostCheckDialog.tsx`、`RoomInfoPanel.tsx`、`RuleTemplateSelect.tsx`、`LobbyClient.tsx` 的下拉、`resource-visuals.ts`。

如果你发现必须改上面某个文件才能让新规则工作,先回头检查模块定义——大概率是某个 capability 没填或 `readStatus` 没摊平对。**确实**表达不了再扩 `RuleCapabilities`(纯数据),而不是加 id 分支。

---

## 5. 已知的 rule-id 分支(4 个文件,30 处)

这些是当前真实存在的例外。前两个有明确原因,后两个是**待补的抽象缺口**——碰到相关工作时顺手推进,不要当成既定风格模仿。

| 位置 | 现状 | 性质 |
| --- | --- | --- |
| `components/room/character/CharacterPanel.tsx`(24 处:L120/147-158/169-178/235-244/288-318/346-372/615/715-727) | `useEffect` 初始化、`cocDerived`/`shDerived` 现算、`currentResources` 初值、`handleSaveAll`、`handleExport`、`resourceMaxEditable`、`buildAttributeValues` 各按 ruleTemplate 分支 | **刻意保留**。每套规则的属性包/资源字段结构不同(`cocAttributes+cocDerived` / `d20Attributes+d20Sheet` / `taQualities+taSheet` / `shAttributes+shSheet`),可编辑面板要把它们摊平成通用 Record 再存回。只读面板已经统一走 `readStatus()`;可编辑面板要统一需要一个"写"侧的对称抽象(类似 `applyStatWrite` 但面向整卡),目前还没做。新规则在这几处各加一个分支 |
| `components/lobby/LobbyClient.tsx:314` | `ruleTemplate === "coc7th"` 时显示 Skull 徽章 | **刻意保留**。规则专属装饰图标,capabilities 不适合放 UI 装饰元数据。要做的话按 `resource-visuals.ts` 的模式建一个 client-only 的 id→图标 map |
| `lib/ai_agent.ts:642` | `rollRule.id === "coc7th"/"basic"` 决定 1d100 裸骰的大成功/大失败评语 | **待补钩子**。代码注释已写明未来接口是 `rule.naturalGrade(roll, faces)`。目前只有 COC 系有"裸骰吉凶"概念,所以还没抽 |
| `lib/commands.ts:788` `readCurrentSanity` | `data?.ruleTemplate === "coc7th"` 才读 `cocDerived.san_current` | **可收敛**。只被 `.sc` 调用,而 `.sc` 已被 `supportedCommands` 门控到 COC,所以不会错;但形式上应改成读 `readStatus(sheet).resources.san` |
| `app/actions/character.ts:427/439` | `updateResourcesAction` 按 dnd5e/shouhun/其余 分支写资源当前值 | **可收敛**,与 CharacterPanel 是同一个"写侧抽象缺失"问题 |

同一文件里 `saveCharacterDataAction` / `updateCocAttributesAction` 仍用 inline `computeCocDerived` 而非 `rule.computeDerived`:两者的 `san_current` 保留时机不同,合并会改 export 快照中 `.san` 的边角值。

剩余几个 `<select>` 也是"刻意不迁"——见 `src/components/shared/ThemedSelect.tsx` 的 carve-out 注释。

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

---

## 7. 进一步阅读

- `src/lib/rules/coc7th/index.ts` — 字段最全的模块
- `src/lib/rules/shouhun/index.ts` — 用到最多可选钩子(`parseQuickCheckArgs`、`checkRequestOptions`、`derivedStats`、`attributeGrades`)
- `src/lib/__tests__/rules.test.ts` — 193 个用例,新规则请覆盖等量边界
- `docs/arch/rule-template-system.md` / `docs/arch/rule-template-refactor.md` — 重构前分析与方案
