---
name: simple-trpg-chat-rules
description: >
  Complete reference for the pluggable rule-template module system in simple-trpg-chat
  (RuleModule interface + declarative character-sheet schema + capability-driven UI +
  registry). USE THIS SKILL whenever the user asks to add a new TRPG ruleset (DnD 5e /
  d20 / PbtA / 骰池 / WoD / FATE …), modify rule-template behavior, debug rule-gated
  commands (.rc / .sc / .st / .r), reason about why a check resolved a certain way,
  change a character sheet's fields or 完成度 (角色卡 schema / completion), or change how
  rule capabilities drive UI (TopBar check menu / character-sheet bars / attribute grid /
  avatar hover card / member list / host check dialog). Also trigger when the user says
  "规则模板" / "规则模块" / "rule template" / "RuleModule" / "capabilities" /
  "resolveCheck" / "getRuleForRoom" / "角色卡 schema" / "SheetSchema" / "完成度", or names
  a rule id like coc7th / basic / dnd5e / triangle / shouhun / 狩魂者 in an implementation
  context. Even if the user just says "加一套规则" without specifying which system,
  consult this skill — the registry/capability/schema pattern is the same for every
  ruleset.
---

# Simple TRPG Chat — 规则模板模块系统

> 规则系统的设计文档在 `docs/arch/rule-template-system.md`(重构前现状)和 `docs/arch/rule-template-refactor.md`(方案,历史)。角色卡声明式 schema 这轮重构的设计文档在 `.claude/tasks/character-sheet-framework/02-design.md`。本文件描述**当前**实现,与代码同步维护。

## 0. 设计意图

规则系统是**插件化**的:每套规则是一个独立模块,自注册到全局表。引擎/UI/AI 代码不应出现 `if (ruleId === "xxx")` 分支——行为差异全部通过 `RuleModule` 接口方法或 `RuleCapabilities` 纯数据表达。

验收标准:**新增一套规则 = 新增 `rules/<id>/` 模块 + 注册一行 + i18n + `RULE_TEMPLATES` 追加一项**。命令引擎、AI、只读状态面板、TopBar、大厅都不需要改。

现有 5 套:`basic`(通用 d100)、`coc7th`、`dnd5e`(d20)、`triangle`(Triangle Agency, 6d4 数 3)、`shouhun`(狩魂者, d20+加骰/时髦骰)。

**当前状态:公共代码(`src/lib/rules/` 之外)已无任何 `ruleTemplate === "<id>"` 硬编码分支——包括曾经最重的 `CharacterPanel.tsx`(PR #176,24 处已全部收敛)。** 在此之上,`feature/character-sheet-framework` 又把 PR #176 留下的那一整层"每规则角色卡读写方法"(`initCharacter`/`computeDerived`/`readStatus`/`readAttributes`/`writeAttributes`/`applySheetPatch`/`applyStatWrite`/`applyResourcePatch`/`exportSnapshot`…)删掉了,换成一份声明式 `sheet: SheetSchema` + 一个 `derive` 纯函数;角色卡的读、写、钳位、完成度、AI 工具 schema、导出全部由 `src/lib/character/` 的通用函数从这份 schema 派生(§2.5)。§5 记录了两轮重构分别收敛了什么。

---

## 1. 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/lib/rules/types.ts` | 全部接口契约:`RuleModule` / `RuleCapabilities` / `CheckRequest` / `CheckResult` / `ModifierTerm` / `StatRoute` / `VisualGrade` / `AiRuleHints` / `QuickCheckPanelSpec` / `QuickCheckInput` / `CheckMenuMode` |
| `src/lib/rules/sheet-schema.ts` | 角色卡的声明式契约:`SheetSchema`(`AttributeField` / `ResourceField` / `DerivedField` / `StandardSkill`)+ `SheetRule`(`RuleModule` 里角色卡相关的最小子集,测试用小 fixture 满足它就行)。见 §2.5。client-safe、纯数据,唯一的代码是 badge 函数 |
| `src/lib/rules/registry.ts` | `getRule` / `getRuleForRoom` / `listRules` / `listRuleIds` / `DEFAULT_RULE_ID`;模块注册位置 |
| `src/lib/rules/index.ts` | barrel —— 所有外部代码从 `@/lib/rules` 导入,**不要**深链到子路径。也再导出 `sheet-schema` 的类型和各规则 `<id>/sheet.ts` 的符号(`computeCocDerived`、`D20_DEFAULT_ATTRIBUTES`…) |
| `src/lib/rules/status-view.ts` | `readStatusView()` / `readStatusEntries()` / `primaryVital()`:把一张卡经 `resolveSheet` 摊平成可渲染条目。完全由 schema 驱动(`AttributeField.inStatus`、`ResourceField.style`、`DerivedField.display`),不再调用某个规则专属的读方法。头像悬浮窗和成员列表共用,**React-free**(server action 也 import 它) |
| `src/lib/rules/patch-utils.ts` | 只剩 `clampInt`——规则语法解析(quick-check 面板状态、`ruleData` 往返)里夹带的数字消毒。角色卡数值的钳位已经交给 `applySheetEdit`,不再需要旧的 `clampAttributes` |
| `src/lib/rules/{basic,coc7th,dnd5e,triangle,shouhun}/index.ts` | 5 个规则模块 |
| `src/lib/rules/{coc7th,dnd5e,triangle,shouhun}/stats.ts` | 各规则的 `.st` 名称→属性/资源解析器(`resolveCocStat` 等)。物理自包含;只被自己的 `index.ts` import |
| `src/lib/rules/{coc7th,dnd5e,triangle,shouhun}/sheet.ts` | 各规则的属性/资源**类型 + 默认值 + `compute*Derived` 纯函数**(`coc7th/sheet.ts` = `CocAttributes`/`CocDerived`/`COC_DEFAULT_ATTRIBUTES`/`COC_MAX_SANITY`/`computeCocDerived`;`dnd5e`/`triangle` 没有派生值,没有 `compute*Derived`)。`RuleModule.derive` 只是调用它、补默认值。经 barrel 再导出,外部代码从 barrel 拿,规则模块自己从 `./sheet` 拿 |
| `src/lib/character/types.ts` | 只剩通用骨架:`CharacterData`(= `CharacterSheetV2` 的类型别名)、`CustomAttribute`、`CHARACTER_DATA_MAX_BYTES`。**不再有每规则的强类型字段**——角色卡的形状完全由 `SheetSchema` 声明,加新规则不需要碰这个文件 |
| `src/lib/character/sheet-v2.ts` | v2 角色卡本体:`CharacterSheetV2`(`attributes`/`resources` 两个按 schema key 存值的字典 + 资料字段)、`SheetEdit`、`emptySheet(ruleId)`。**只存"玩家/主持人设置过"的值**——缺 key = 未设置,读取按字段的 `default`/`initial` |
| `src/lib/character/sheet-model.ts` | 通用读写核心:`resolveSheet(rule, sheet)`(补默认值、算派生、算资源上下限、给出每个字段 `{value/current, isSet}`)、`applySheetEdit(rule, sheet, edit)`(**唯一写入口**:白名单 + 钳位 + 派生 key 丢弃)、`normalizeSheet`、`sheetDiff`、`statValue`/`statEdit`(`.st`/`.rc` 按 `StatRef` 读写一个字段)、`sanitizeSheetEdit`(action 边界的形状校验) |
| `src/lib/character/completion.ts` | `sheetCompletion(rule, sheet, skillNames, aliases?)` → `Completion`:每个字段的 `FieldState`(`set`/`missing`/`default`/`custom`)+ 必填计数。驱动完成度条、host 总览、角色卡按钮徽标 |
| `src/lib/character/member-completion.ts` | `memberCompletion()` / `memberCompletionSummary()`:一个成员对**房间规则**的完成度——卡不存在或规则不匹配都按空卡算 |
| `src/lib/character/sheet-store.ts` | 唯一的"读一份存储的卡"入口:`parseSheet` / `parseSheetOrNull`。按 `schemaVersion` 走 `normalizeSheet` 或旧卡的 `rule.migrateLegacy`;还处理"卡自带的规则 ≠ 房间规则"的双规则行(房间切规则后,`.st`/AI 仍在写房间规则的 bag) |
| `src/lib/character/legacy.ts` | `LegacySheet`(pre-v2:每规则一个 bag)类型 + `migrateLegacy` 共用的判断:`legacyAttributes`/`legacyAttributesTouched`(整表未动 vs 动过)、`legacyCurrent`(哪些当前值算"设置过")、`legacyBase`(资料 + 自定义属性)、`setResource` |
| `src/lib/character/sheet-export.ts` | `sheetSnapshot(rule, sheet, label?)`:房间导出 JSON/markdown 与 AI `my_character` 工具共用的、规则无关的快照 |
| `src/lib/character/sheet-ai.ts` | `sheetToolSchema(rule)`(AI `set_character_card` 工具的 JSON schema,**从 `sheet` 现算**,不再手写)+ `editFromToolArgs(args)`(→`SheetEdit`;`applySheetEdit` 仍会钳位)。声明和消费天然成对,不会再出现"schema 声明了字段却没人读"的坑 |
| `src/lib/character/skill-list.ts` | 技能页的行:`buildSkillRows`(标准技能 + 自定义技能,标准技能按 `matchStandardSkills` 走别名匹配)、过滤/计数辅助 |
| `src/lib/character/broadcast.ts` | `broadcastCharacterUpdate()`:每次角色卡/技能写入后发 `character_updated`(`{userId, vital, completion, by}`),集中在一处,写路径不用各自拼 payload |
| `src/lib/character/draft.ts` | 面板草稿与他人并发编辑的合并:`overlappingChanges` / `dropPaths`,配合 `useSheetDraft` |
| `src/lib/character/panel-status.ts` | 只剩 `buildCharacterExportText()`——面板"导出"文本,由 schema + `resolveSheet` 现算 |
| `src/components/shared/host-label.tsx` | `useHostLabel()` / `useHostLabelResolver()` / `usePlayerLabel()` / `useRuleLabelResolver()` —— 解析 `hostLabelKey` / `playerLabelKey` / 规则 `labelKey` 的唯一入口(大厅房间徽标经 `useRuleLabelResolver` 渲染,不再硬编码 coc7th) |
| `src/components/room/character/CharacterPanel.tsx` | 可编辑角色卡面板;状态在同目录 `useSheetDraft.ts`(`baseline` + `draft: SheetEdit`,`applySheetEdit` 就地预览,`editCharacterAction` 保存,处理并发编辑冲突)。零 rule-id 分支,直接读 `rule.sheet` 渲染每个字段,不经任何 per-rule 读写方法 |
| `src/components/room/character/HostSheetOverview.tsx` | 主持人角色卡总览:每个成员(含 bot)一行的完成度 + 逐资源 ±1 步进器(直接调 `editCharacterAction` 就地保存,失败回滚),入口在顶栏(仅房主可见) |
| `src/components/room/character/resource-visuals.ts` | `RESOURCE_ICON` / `DERIVED_ICON`:client-only 的 key→图标/颜色映射。未命中的 key 用主色兜底,所以新规则**不必**改这里 |
| `src/components/room/character/CharacterRuleGate.tsx` | 房间规则与成员角色卡不匹配时的重建引导(主持人切规则会触发) |
| `src/components/room/chat/QuickCheckPanel.tsx` | 玩家快速检定面板(输入框 ◎ / Alt+Q)。完全由 `capabilities.quickCheckPanel` 驱动、经 `rule.buildCheckCommand` 产出命令,零 rule-id 分支——新规则不用改它 |
| `src/lib/rules/__tests__/{sheet-schema,legacy-migration,rule-sheets,rules}.test.ts` + `src/lib/character/__tests__/*.test.ts` | 规则与角色卡的完整测试面。`rules.test.ts` 单文件就有 140+ 条 `it()`(不少还用 `describe.each` 按规则展开),新规则上线必须在这些文件里补等量边界覆盖 |
| `src/db/scripts/migrate-character-sheets.ts` + `src/lib/character/backfill.ts` | 一次性把库里的 pre-v2 卡升级成 v2 的回填脚本(`pnpm db:migrate-sheets`,默认 dry-run)。历史迁移工具,**新增一套规则不需要碰它**——它从没产出过任何 pre-v2 数据 |
| `src/db/schema.ts` | `RULE_TEMPLATES` 常量数组(**必须**与注册表同步)+ `rooms.rule_template` 列 |

`diceRules` 列已在 PR #125 删除。规则配置只有 `rule_template` 一个数据源,不要重新引入双字段。

---

## 2. `RuleModule` 接口

共 **19 个成员**(5 个元数据 + 9 个必填方法 + 5 个可选方法)。`coc7th/index.ts` 和 `shouhun/index.ts` 是最完整的两个范例——前者字段最全,后者用到了最多可选钩子。

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
| `sheet` | 声明式角色卡 schema(`SheetSchema`)——属性 / 资源 / 派生值 / 标准技能的完整声明。不是方法,是一份数据。见 §2.5 |
| `derive(attributes)` | 纯函数:补过默认值的属性 → 派生值,包括资源上限/初始值指向的隐藏(`display: "hidden"`)派生。没有派生的规则(basic/dnd5e/triangle)返回 `{}` |
| `migrateLegacy(legacy)` | 把这套规则的 pre-v2 `LegacySheet`(每规则一个 bag,如 `cocAttributes`/`cocDerived`)升级成 v2 `CharacterSheetV2`。只有兼容读取(`sheet-store.ts` 的 `parseSheetOrNull`)和回填脚本调用它;一套全新规则从未产出过 pre-v2 数据,可以直接 `return legacyBase(legacy, id)` |
| `routeStat(name)` | `.st <name> <val>` 路由:`{kind:"skill"\|"attribute"\|"resource", canonical, key?}` |
| `canonicalStatName(name)` | 显示名归一(`san → 理智值`)。无别名的返回原值 |
| `lookupFallback(name, sheet)` | `.rc <name>` 在 `room_skills` 未命中时的回退,经通用的 `statValue(rule, sheet, ref)` 读 schema 字段(属性或资源当前值)。dnd5e/basic/triangle/shouhun 返 null(v1 设计:调整值都由玩家自己打进命令) |
| `resolveCheck(req)` | **核心**:掷什么骰、加什么调整、比较方向、大成功/失败判定全归规则。`rollDie()` 必须在此内部调用 |
| `parseRcArgs(args)` | 本规则的 `.rc` 语法解析。返 null = 用法错误 |
| `describeForAI()` | `{rulesPrompt}`:bot 系统提示片段。**不再有 `sheetToolSchemaFields`**——AI `set_character_card` 的 schema 现在整个从 `sheet` 现算(`sheet-ai.ts` 的 `sheetToolSchema`),规则不用手写,也不会再和消费点脱节 |

### 可选方法

| 方法 | 谁在用 |
| --- | --- |
| `skillAliasCandidates?(name)` | `.rc` 在 `room_skills` 里再多试的别名(COC 侦查/侦察),命中优先于 `lookupFallback` |
| `naturalGrade?(roll, faces, count)` | 普通掷骰(`.rd`/`.r`,非检定)的文化/机制解读,供 AI bot 反应。COC 认 1d100 的 01–05/96–100,basic 给 CoC 文化提示(1/100),其余省略(返 null) |
| `parseQuickCheckArgs?(args)` | 把 `.r <args>` 认领成简写检定。在通用表达式解析**之前**被调用;返 null 则回落为普通掷骰。狩魂者 用它实现 `.r+x±y [DC]` |
| `resolvePlainRoll?(args)` | 把 `.rd/.r/.rh <args>` 认领成**规则专属纯投掷**(COC 的 `.rd100b2` 奖惩骰投——额外 d10 替换十位)。在数字前缀改写与通用表达式解析**之前**、且**含 `.rh` 暗投**地被调用;规则自己掷骰,返回 `{notation, display, total, detail}`(引擎补 `command` 与代投标记);返 null 落回普通掷骰 |
| `buildCheckCommand?(input)` | **快速检定面板**(输入框左侧 ◎)把面板状态变成"玩家本可手打的命令"+ 投掷按钮预览(`{command, preview}`)。与 `capabilities.quickCheckPanel` **成对声明**(`rules.test.ts` 有配对断言);返 null = 该组合无法表达(狩魂者 无名+暗骰),面板禁用按钮。**`capabilities.checkRequestOptions` 也依赖它**:主持人检定请求的响应命令都由它生成,因此对具名、`hidden:false` 的输入不得返回 null。必须纯函数、client-safe |

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

## 2.5 角色卡 schema

`sheet: SheetSchema`(`src/lib/rules/sheet-schema.ts`)是一张角色卡**是什么**的唯一声明。`src/lib/character/` 的通用函数——`resolveSheet`(读)、`applySheetEdit`(写)、`sheetCompletion`(完成度)、`sheetSnapshot`(导出)、`sheetToolSchema`/`editFromToolArgs`(AI 工具)、`readStatusView`(状态卡/悬浮窗)、`buildCharacterExportText`(面板导出文本)——全部只吃这份 schema,规则本身**不写任何读写逻辑**,只声明字段 + 一个 `derive` 纯函数。

### 四种字段

| 种类 | 类型 | 关键字段 |
| --- | --- | --- |
| **attribute**(属性) | `AttributeField` | `key`、`labelKey`、`shortLabelKey?`(紧凑位置,如悬浮卡)、`min`/`max`(写入时钳位区间)、`default`(未设置时参与检定/派生的值)、`required`(完成度是否计入)、`inStatus?`(是否进头像悬浮卡状态条,替代旧的 `statusAttributeKeys`)、`badge?: (value) => string`(狩魂者 E..SSS+ 徽标) |
| **resource**(资源) | `ResourceField` | `key`、`labelKey`、`style: "bar" \| "counter"`(`"counter"` 无上限,如 Triangle 嘉奖/处分)、`max?`:`{ derived: string }`(上限来自 `derive` 的某个 key,如 COC HP)或 `{ editable: { default?, min, max } }`(玩家自己设,如 d20 HP),不写 = 无上限(仅配合 `cap` 兜底)、`min?`(默认 0)、`cap?`(无 `max` 时的硬写入上限,防止 counter 失控)、`initial: "max" \| number \| { derived: string }`(未设置当前值时的取值——COC SAN 的 `initial` 是 `{derived:"sanStart"}` = POW,不是它的上限 99)、`required`(**editable-max 资源"设置"指 max 被设置过**——如 d20 HP;其余资源"设置"指 current 被设置过) |
| **derived**(派生) | `DerivedField` | `key`(对应 `derive()` 返回对象里的 key)、`labelKey`、`display: "sheet" \| "status" \| "both" \| "hidden"`(`"hidden"` = 只作内部用途,如资源的 max/initial 指向的中间值,不渲染在任何地方)、`format?: "number" \| "text"`(COC 伤害加值 `+1D4` 是 text)、`formulaKey?`(公式说明的 i18n key) |
| **standard skill**(标准技能) | `StandardSkill` | `name`(与 `room_skills.skillName` 对应的规范名)、`base: number \| { fromAttribute: string; divisor?: number }`(未设置时的基础值,如 COC 闪避 = DEX/2)、`required`、`group?`(展示分组,需要在 `messages.character.skillGroups.<group>` 里有文案) |

`SheetSchema` 还有 `profile: { roleLevel: boolean }`(d20 的 role/level 字段,替代旧的 `capabilities.hasRoleLevel`)和 `customAttributes: { statusLimit?: number }`(玩家自定义属性;`statusLimit` 是紧凑状态卡最多显示几个,basic=2 因为它没有任何预置资源;省略=不截断)。

### 存储语义:"设置过" = key 存在

`CharacterSheetV2.attributes` / `.resources` 只存**真的被写过**的值,缺 key 就是"未设置",读取时取字段的 `default`(属性)/ `initial`(资源当前值)。这就是完成度能区分"玩家选了 50"和"没人碰过"的原因。**派生值永不落库**——每次读取都用 `rule.derive(attributeValues)` 现算(`resolveSheet` 内部做这件事),改 `derive` 的公式不需要迁移任何存量数据。

### 完成度

`sheetCompletion(rule, sheet, skillNames, aliases?)` 走 `resolveSheet` 的结果,给每个属性/资源/标准技能打一个 `FieldState`:`set`(设置过)、`missing`(必填且未设置)、`default`(可选且未设置)、`custom`(玩家自建、schema 里没声明的技能/自定义属性)。`requiredTotal`/`requiredSet` 只数 `required: true` 的字段,驱动完成度条、顶栏徽标和主持人总览。

### 五套规则的 schema 选择

| 规则 | 必填属性 | 资源 | 派生 | 标准技能 | profile.roleLevel |
| --- | --- | --- | --- | --- | --- |
| `basic` | 无(0 个属性) | 无 | 无 | 无 | false(`customAttributes.statusLimit: 2`) |
| `coc7th` | STR/DEX/CON/INT/POW/EDU/SIZ/APP/幸运,0–999,全部必填 | HP/SAN/MP(bar,上限均派生,均非必填——未设置读作满);SAN 的 `initial` 是派生的 `sanStart`(=POW),上限恒为派生的 `sanMax`(=99,与 POW 无关) | `hpMax`/`mpMax`/`sanMax`/`sanStart`(hidden)+ `mov`/`db`(text)/`build`(sheet 展示) | COC 7 版标准技能表(`skills.ts`),仅"信用评级"必填 |
| `dnd5e` | 力/敏/体/智/感/魅 6 项,0–30;PB、AC 可选,AC `inStatus` | HP(bar,`editable` 上限,default 10,**上限必填**) | 无(v1 free-set 设计) | 无 | **true** |
| `triangle` | 无(9 项资质全部可选) | 嘉奖/处分(counter,无上限,`cap: 9999`) | 无 | 无 | false |
| `shouhun` | 体魄/智慧/心魂 3 项,1–9,`badge: shGradeLabel`(E..SSS+),`inStatus` | HP/灵力(bar,上限均派生) | `hpMax`/`manaMax`(hidden)+ 体魄强度/术法强度(`both`)/灵能力强度/灵识(sheet 展示) | 无 | false |

---

## 3. `RuleCapabilities` —— 规则能影响的全部范围(除角色卡外)

这张表是"一套规则能改变什么"的完整答案,**角色卡本身的布局/字段除外**——那部分完全由 §2.5 的 `sheet` 决定(属性宫格、资源条、派生页脚、悬浮卡状态、host 总览列全部从 `rule.sheet` 经 `resolveSheet`/`readStatusView` 现算),不再有 `attributeKeys`/`resourceBars`/`derivedStats`/`statusAttributeKeys`/`statusCustomLimit`/`resourceMaxEditable`/`resourceCurrentsViaAction`/`hasRoleLevel`/`hasManaPoints` 这些字段。`RuleCapabilities` 剩下的字段都在管检定/命令/称呼:

| 字段 | 类型 | 影响到哪儿 |
| --- | --- | --- |
| `hostLabelKey` | `string` **必填** | 房间内一切提到主持人的地方(聊天徽章、成员列表、可见性标签、物品来源、时间线、房间信息、大厅房间卡)。文案在 `messages.hostLabels`,经 `host-label.tsx` 解析 |
| `playerLabelKey` | `string` **必填** | 成员列表角色标签、主持人检定对话框、物品分发弹窗、大厅人数。文案在 `messages.playerLabels` |
| `hasSanity` | `boolean` | 渲染 SAN 资源条(通过 `sheet.resources` 声明 `key: "san"`)之外,还额外开 `.sc` 命令 + `requestSanCheckAction` 守卫 |
| `hasPsychologyRoll` | `boolean` | 开 `psychologyHiddenRollAction` 守卫 + TopBar 心理学暗骰菜单项 |
| `checkMenuModes` | `("check"\|"psychology"\|"sancheck")[]` | TopBar 检定项;>1 渲染下拉,=1 单按钮,空数组整个隐藏(triangle) |
| `supportedCommands` | `string[]` | 命令门控(`.sc` 就读这个,见 `commands/sanity-check-command.ts`) |
| `helpEntryIds` | `string[]` | `.help` 卡片的行顺序,每个 id 对应 `messages.commands.helpEntries` 里的一个 `{cmd, desc}`。必须和 `supportedCommands` 保持同步(见下"配套引擎设施") |
| `defaultRollExpression` | `string` | 空参数 `.r`/`.rd` 的默认骰(coc7th/basic=1d100, dnd5e/shouhun=1d20, triangle=6d4) |
| `requiresStoredTarget` | `boolean` | `.rc` 查不到值时是否报 STAT_NOT_SET(coc7th/basic=true, 其余=false) |
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

声明后:主持人对话框把 diceType 选择器换成上述字段;请求 detail 携带 `{dc, styleDice}`;响应方被提示填加骰数,服务端调用该规则的 `buildCheckCommand` 生成命令——**声明了本能力位就必须实现 `buildCheckCommand`**,否则每次响应都失败(`rules.test.ts` 有配对用例)。目前只有 shouhun 用。消费方:`actions/checks.ts`、`ai/agent-tool-handlers.ts`(Bot 的 `respond_check`,加骰由工具参数 `bonusDice` 提供)、`RoomOverlays.tsx`、`HostCheckDialog.tsx`。

### `quickCheckPanel` —— 玩家快速检定面板

```ts
quickCheckPanel?: {
  skills: boolean;                              // 列出玩家自己的 room_skills 行
  attributes: boolean;                          // 列出 sheet.attributes(值走 resolveSheet;仅当 .rc 能按名解析属性时才开)
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

面板(`QuickCheckPanel.tsx`,由 `ChatInput.tsx` 的 ◎ 按钮挂载,Alt+Q)**从不掷骰**:每次打开新拉数据(`getMySkillsAction` + `getCharacterDataAction`,经 `resolveSheet` 摊平属性/资源),把面板状态交给规则的 **`buildCheckCommand(input)`** 换取 `{command, preview}`,然后把 command 当作玩家手打的聊天输入原样提交——服务端检定流仍是唯一裁决者。列表项的命令名统一经 `canonicalStatName(key)` 归一(如 `san → 理智值`),存储值**不进命令**(服务端回查最新值),只用于预览。选中项的 MRU 顺序存 localStorage(`strpg:quick-check-recent:<roomId>`)。

**声明 `quickCheckPanel` 而不实现 `buildCheckCommand`(或反之)= 面板静默失效**——`rules.test.ts` 的配对断言会红。

配套引擎设施(规则无关,已就绪,新规则**不用**动):`.rch` / `.rah` 是 `.rc` / `.ra` 的暗检定孪生(结果仅投掷者可见,visibility="self"),`commands/engine.ts` 与 `roll-command.ts` 的前缀表已含;声明了 `rc` 的规则应把 `rch`/`rah` 一并放进 `supportedCommands`,并在 `helpEntryIds` 里加 `rch` 条目(配对测试会验)。

### 两条硬约束

1. **capabilities / schema 都是纯数据,禁止放 React 类型/组件引用**——规则模块要在 server 端可加载。UI 侧的图标/颜色是 client-only 静态 map(`resource-visuals.ts`、`RoomTopBar.tsx` 的 `CHECK_MODE_UI`),按 key 查,未命中有兜底。
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

`src/lib/rules/<id>/index.ts`,实现 §2 的 19 个成员 + §2.5 的 `sheet`。TypeScript 会逼你填齐必填项;**最容易漏的是 `sheet`(尤其是 `resources[].initial`/`max` 和 `standardSkills[].base` 这几个嵌套字段)和 `migrateLegacy`**——一套全新规则从未产出过 pre-v2 数据,可以直接 `return legacyBase(legacy, id)`,不用处理任何旧字段。

**支持 `.rc` 的规则还要决定快速检定面板长什么样**:声明 `capabilities.quickCheckPanel` + 实现 `buildCheckCommand`(两者成对,见 §3),并把 `rch`/`rah` 放进 `supportedCommands`、`rch` 放进 `helpEntryIds`;不支持 `.rc` 的规则(如 triangle)两者都不声明,入口按钮自动消失。**调整既有规则的检定语法时同理——别忘了同步它的 `quickCheckPanel`/`buildCheckCommand`,否则面板会继续生成旧语法命令。**

规则自己的属性/资源**类型 + 默认值 + `compute*Derived`**(有派生值的规则才需要后者)放 `src/lib/rules/<id>/sheet.ts`(抄 `coc7th/sheet.ts`;自包含,不 import 其它规则或 `character/types.ts`),再在 barrel `rules/index.ts` 加一行 `export ... from "./<id>/sheet"` 把符号转发出去——**不用**碰 `src/lib/character/types.ts`,`CharacterData` 现在只是 `CharacterSheetV2` 的别名,加新规则不需要为它加字段或 `import type`。若规则有 `.st` 别名/属性/资源路由,再建 `src/lib/rules/<id>/stats.ts` 写解析器(抄 `coc7th/stats.ts`),只被本模块 import。

### Step 2 — 注册

`src/lib/rules/registry.ts` 加一行 `register(yourRule)`。重复 id 会在模块加载时抛错。

### Step 3 — schema 常量同步

`src/db/schema.ts` 的 `RULE_TEMPLATES` 追加你的 id。**不同步 = server action 的 whitelist 把它当非法值打回 `"Invalid ruleTemplate"`,下拉框里选了也存不进去**。

### Step 4 — i18n

三个 namespace 都要:

- `createRoom`:`<labelKey>` / `<labelKey>Desc` / `<labelKey>Hint`
- `roomSettings`:`<labelKey>` / `<labelKey>Desc`
- `export`:`<labelKey>`(导出的 markdown 用它标注房间规则;`rules.test.ts` 会验)

外加 `sheet` 里用到的每一个 `labelKey`/`shortLabelKey`/`formulaKey`,以及 `standardSkills[].group` 用到的 `messages.character.skillGroups.<group>`——zh、en 两份都要。这一步现在有自检:`sheet-schema.test.ts` 会遍历 schema 引用到的每个 key,漏了哪个直接报哪个 key 缺失,不用自己人肉核对。

### Step 5 — 主持人/玩家称呼

两者机制完全对称,各自三处:

1. **文案**——`messages/{zh,en}.json` 的 `hostLabels` / `playerLabels` 里挑现有 key,或新增。
   现有主持人:`kp`(KP)、`dm`(DM)、`manager`(经理)、`dh`(DH,狩魂者)、`gm`(主持人/GM)。
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
- schema 自检:`sheet-schema.test.ts` 的 `describe.each` 会自动跑到新规则(唯一 key、default 落在 min/max 内、resource max/initial 指向的 derived key 存在……);规则专属的选择(哪些必填、公式细节)在它的 "rule-specific schema choices" 块里补断言,照抄 `rule-sheets.test.ts` 的密度
- 若声明了 `quickCheckPanel`/`buildCheckCommand` 或 `checkRequestOptions`:补配对与命令字符串的用例(照抄 `rules.test.ts` 里其它规则的写法)
- 一套全新规则通常没有 pre-v2 数据,`legacy-migration.test.ts` 可以不补 fixture——只有替换某个已存在的散装实现时才需要
- 注册表能查到你的 id

### Step 7 — 数据库迁移

无。`rooms.rule_template` 是 text,接受任意字符串。`pnpm db:push` 只在改 schema 结构时才需要。`src/db/scripts/migrate-character-sheets.ts` 是 v1→v2 的一次性回填工具,和加新规则无关。

### 不需要改的地方(验证抽象成立)

`commands/engine.ts`(命令引擎)、`actions/checks.ts`(主持人检定请求 + 响应)、`actions/room.ts`(房间设置)、`actions/export.ts`(用 `sheetSnapshot`)、`actions/bot.ts`、`actions/character.ts`(`editCharacterAction` 走 `applySheetEdit`)、`ai/agent.ts` + `ai/agent-tool-handlers.ts`(系统提示、`sheetToolSchema`/`editFromToolArgs`、`naturalGrade`)、**`CharacterPanel.tsx` 及其 `useSheetDraft.ts`(可编辑角色卡,完全从 `rule.sheet` 渲染,`applySheetEdit` 做预览)**、**`HostSheetOverview.tsx`(主持人总览)**、`RoomTopBar.tsx`、`AttributesTab.tsx`、`ResourceStatusTooltip.tsx`、`ConversationPanel.tsx`、`ChatInput.tsx`、**`QuickCheckPanel.tsx`(能力位 + `buildCheckCommand` 驱动)**、`HostCheckDialog.tsx`、`RoomInfoPanel.tsx`、`RuleTemplateSelect.tsx`、`LobbyClient.tsx`(下拉 + 房间徽标)、`resource-visuals.ts`。

**只要模块把 19 个成员实现全、`sheet` schema 填对,以上文件一律零改动**——这是 PR #176(capabilities 收敛)和 `feature/character-sheet-framework`(角色卡声明式 schema)两轮重构叠加后的验收状态。如果你发现必须改上面某个文件才能让新规则工作,先回头检查模块定义:大概率是 `sheet` 里少了个字段(`inStatus`/`display`/`initial`)、`derive` 没算出某个被资源 max 引用的派生 key,或者某个可选方法(`buildCheckCommand`)没实现。**确实**表达不了再扩 `RuleCapabilities` 或 `SheetSchema`(两者都还是纯数据),而不是加 id 分支。

---

## 5. 解耦现状 —— 两轮重构分别收敛了什么

历史:重构前有 4 个文件、约 30 处 `ruleTemplate === "<id>"` 分支(最重的是 CharacterPanel 24 处)。**PR #176 把它们收敛为 0**,换成 `RuleCapabilities` 纯数据 + 一层"每规则角色卡读写方法"(`readStatus`/`readAttributes`/`writeAttributes`/`applySheetPatch`/`applyStatWrite`/`applyResourcePatch`/`exportSnapshot`…)。审计与修复过程见 `docs/arch/rule-template-coupling-audit.md`(历史细节不再复述)。

**`feature/character-sheet-framework` 更进一步,把 PR #176 那一整层读写方法本身也删掉了**:`initCharacter`、`computeDerived`、`readStatus`、`readAttributes`、`writeAttributes`、`applySheetPatch`、`applyStatWrite`、`applyResourcePatch`、`exportSnapshot`,类型 `ResourcePatch`/`CharacterStatus`/`AttributeKeySpec`/`ResourceBarSpec`,以及 `describeForAI().sheetToolSchemaFields`,还有 capabilities 里的 `hasManaPoints`/`resourceBars`/`attributeKeys`/`derivedStats`/`statusAttributeKeys`/`statusCustomLimit`/`resourceMaxEditable`/`resourceCurrentsViaAction`/`hasRoleLevel` 全部消失——换成一份 `sheet: SheetSchema` + 一个 `derive` 纯函数(§2.5),角色卡相关的旧分支点(属性宫格读写、资源上限/当前值/衍生页脚、`CharacterPanel` 的 `handleSaveAll`/`handleExport` 分支)不再需要单独列表,它们对应的旧方法整个不存在了。

仍然成立、和角色卡无关的旧分支点:

| 旧分支点(PR #176 之前) | 现在靠什么 |
| --- | --- |
| `LobbyClient` coc7th 骷髅徽标 | `useRuleLabelResolver()`(host-label.tsx)对任意非默认规则渲染其 `labelKey` |
| `ai/agent.ts` 1d100 裸骰吉凶 | `rule.naturalGrade(roll, faces, count)` |
| `commands/sanity-check-command.ts` `readCurrentSanity` | `capabilities.hasSanity` + `resolveSheet(rule, sheet)` 里 san 资源的 current |
| `lib/{coc,d20,ta,sh}-stats.ts` 散落公共 lib | 迁进 `rules/<id>/stats.ts`,每套规则物理自包含 |

### 仍"刻意不迁"的

- 几个 `<select>` 的 carve-out —— 见 `src/components/shared/ThemedSelect.tsx` 注释。
- 各规则 `derive` 对资源当前值的钳位/起始时机不同(COC 的 SAN 起始=POW 但上限恒为 99、d20 可编辑 max)是设计意图,`legacy-migration.test.ts`/`rule-sheets.test.ts` 锁定了这些边角,改 schema/`derive` 前先看 §2.5 和相关测试。

### 一处已固化的行为(不再是"变更")

COC / d20 的导出 .txt 属性标签是翻译名(`力量: 70`),不是大写 key,与 triangle/狩魂者 一致——导出文本由 `panel-status.ts` 的 `buildCharacterExportText` 生成,用 `t(labelKey)`。想恢复大写 key 形式,需要给 `AttributeField` 加一个导出专用 label。

---

## 6. 常见错误

1. **在引擎/UI 里写 `if (rule.id === "xxx")`** —— 先扩 `RuleCapabilities`(纯数据)或 `SheetSchema` 再用它驱动。§5 是例外清单,不是许可证。
2. **以为要给 AI 工具手写 sheet schema 声明** —— `sheetToolSchema(rule)`/`editFromToolArgs` 已经从 `sheet` 现算,规则不用写,也不会再出现"字段声明了却没消费"的坑(`applySheetEdit` 只认 schema 声明的 key,其余一律丢弃)。
3. **`RuleCapabilities` / `SheetSchema` 里塞 React 组件/图标** —— 规则模块要在 server 端可用。
4. **`rollDie` 留在命令层(`commands/check-roll-command.ts`)预掷** —— 预掷使比较方向无法被规则改写,d20 直接挂掉。必须在 `resolveCheck` 内部调用。
5. **新规则加了但下拉框里看不到** —— 检查 `schema.ts` 的 `RULE_TEMPLATES`。
6. **导出的房间信息标着别的规则名** —— 检查 `messages.export` 里有没有你的 `labelKey`。
7. **假设 `room.diceRules`** —— 该列已删,`getRuleForRoom` 签名是 `{ ruleTemplate?: string | null }`。
8. **"修正" `coc7th.resolveCheck` 的 grade 判定** —— grade=critical / passed=false 的边角是设计意图,测试锁定了。
9. **以为 `labelKey` 在 `messages.rooms` 命名空间** —— **没有 `rooms` 命名空间**。规则 `labelKey`(`ruleTemplateCoc7th`…)在 `createRoom` / `roomSettings` / `export` 三处。用 `useTranslations("rooms")` 解析会在渲染时抛 next-intl `MISSING_MESSAGE`(非静默兜底)。
10. **某个资源的 `max: { derived: "x" }` 或 `initial: { derived: "x" }` 引用了 `derive()` 没返回、或返回了非 number 的 key** —— `sheet-schema.test.ts` 会红,但新增引用而漏改 `derive` 是最容易忘的一步,改 schema 时顺手跑一遍这个测试文件。
11. **绕过 `applySheetEdit`/`editCharacterAction` 直接改 `CharacterData` 对象** —— 会跳过钳位、`normalizeSheet` 和 `sheetDiff`,广播也不会触发。任何写路径都走 `applySheetEdit`(服务端)或 `useSheetDraft` 的 draft(客户端)。
12. **忘记一张卡可能是给另一套规则建的**(房主切了房间规则,成员没重建)——`.st` 会拒绝写入不匹配的卡,AI 会重建一张空卡;任何"读卡"的地方都要把房间规则传给 `parseSheetOrNull(raw, roomRuleId)`,不能只信卡自身存的 `ruleTemplate`。
13. **写完角色卡/技能忘了广播** —— 每条改动路径都要调 `broadcastCharacterUpdate`,否则成员列表和已打开的面板不会实时刷新(没有轮询兜底)。

---

## 7. 进一步阅读

- `src/lib/rules/coc7th/index.ts` — 字段最全的模块(标准技能表 + 全部派生 + 奖惩骰)
- `src/lib/rules/shouhun/index.ts` — 用到最多可选钩子(`parseQuickCheckArgs`、`checkRequestOptions`、`resolveCheck` 里的逐骰渲染)
- `src/lib/rules/sheet-schema.ts` + `src/lib/character/sheet-model.ts` — 角色卡的两份核心契约,改 schema 前先读这两个文件
- `src/lib/rules/__tests__/{sheet-schema,rule-sheets,legacy-migration,rules}.test.ts` + `src/lib/character/__tests__/*.test.ts` — 规则与角色卡的完整测试面,新规则请覆盖等量边界
- `.claude/tasks/character-sheet-framework/02-design.md` — 角色卡声明式 schema 这轮重构的设计文档(§4 schema 定义,§5 各规则 schema 草案)
- `docs/arch/rule-template-coupling-audit.md` — PR #176 的耦合审计(历史)
- `docs/arch/rule-template-system.md` / `docs/arch/rule-template-refactor.md` — 更早的分析与方案(历史)
