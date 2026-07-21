---
name: simple-trpg-chat-rules
description: >
  Complete reference for the pluggable rule-template module system in simple-trpg-chat
  (RuleModule interface + capability-driven UI + registry). USE THIS SKILL whenever the
  user asks to add a new TRPG ruleset (DnD 5e / d20 / PbtA / 骰池 / WoD / FATE …), modify
  rule-template behavior, debug rule-gated commands (.rc / .sc / .st), reason about
  why a check resolved a certain way, change how rule capabilities drive UI (TopBar
  check menu / character-sheet bars / attribute grid / SAN-check gating), or extend
  AI-agent rule integration. Also trigger when the user says "规则模板" / "规则模块" /
  "rule template" / "RuleModule" / "capabilities" / "resolveCheck" / "getRuleForRoom",
  or names a rule id like coc7th / basic / dnd5e in an implementation context. Even
  if the user just says "加一套规则" without specifying which system, consult this
  skill — the registry/capability pattern is the same for every ruleset.
---

# Simple TRPG Chat — 规则模板模块系统

> 本文件是修改/扩展规则系统的唯一权威参考。设计文档在 `docs/arch/rule-template-system.md`(现状分析)和 `docs/arch/rule-template-refactor.md`(重构方案、5e drop-in 配方)。

## 0. 设计意图

规则系统是 **插件化** 的:每套规则(basic d100、COC 7th、未来的 DnD 5e 等)是一个独立模块,自注册到全局表。引擎/UI/AI 代码 **永远不应该** 出现 `if (ruleId === "xxx")` 这种分支——所有规则相关的行为差异都通过 `RuleModule` 接口或 `RuleCapabilities` 数据驱动。

验收标准:**新增一套规则 = 新增一个 `rules/<id>/` 模块 + 注册一行 + i18n + schema 常量数组追加一项**。命令引擎、角色系统、宿主动作、UI 组件均不需要改动。

---

## 1. 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/lib/rules/types.ts` | `RuleModule` / `RuleCapabilities` / `CheckRequest` / `CheckResult` / `VisualGrade` / `StatRoute` / `AiRuleHints` 接口契约 |
| `src/lib/rules/registry.ts` | `getRule(id)` / `getRuleForRoom(room)` / `listRules()` / `listRuleIds()` / `DEFAULT_RULE_ID`;模块注册位置 |
| `src/lib/rules/index.ts` | barrel — 所有外部代码从 `@/lib/rules` 导入 |
| `src/lib/rules/basic/index.ts` | basic d100 模块(do-nothing baseline) |
| `src/lib/rules/coc7th/index.ts` | COC 7th 模块(包装 `coc-stats.ts` + `computeCocDerived`) |
| `src/lib/rules/dnd5e/index.ts` | DnD 5e (d20) 模块(包装 `d20-stats.ts`;free-set 属性,d20 vs DC) |
| `src/lib/rules/triangle/index.ts` | Triangle Agency 模块(6d4 数 3;无 `.rc`;计数器资源;包装 `ta-stats.ts`) |
| `src/components/shared/host-label.tsx` | `useHostLabel()` / `useHostLabelResolver()` — 房间内 UI 解析 `capabilities.hostLabelKey` 的唯一入口 |
| `src/lib/__tests__/rules.test.ts` | 边界测试,新规则上线必须补类似覆盖(含 `hostLabelKey` 映射的全量断言) |
| `src/db/schema.ts` | `RULE_TEMPLATES` 常量数组(必须与注册表同步)+ `rooms.rule_template` 列 |
| `src/db/scripts/backfill-rule-template.ts` | 历史回填脚本(legacy `dice_rules` 列已删,留作模板参考) |

`diceRules` 列已在 PR #125 一并清除——不要重新引入双字段;规则配置只有 `rule_template` 一个数据源。

---

## 2. `RuleModule` 接口字段

每个规则模块必须实现这 10 个字段。COC 模块在 `coc7th/index.ts` 是最完整的范例。

| 字段 | 类型 | 作用 |
| --- | --- | --- |
| `id` | `string` | 持久化到 `rooms.rule_template`,如 `"coc7th"` / `"basic"` / `"dnd5e"`。**稳定**,不可改 |
| `labelKey` | `string` | i18n key,UI 下拉框 / 标签从 `messages/*.json` 查 |
| `hintKey?` | `string` | 下拉框的提示文案 i18n key |
| `rcUsageKey?` | `string` | `parseRcArgs` 返 null 时的用法错误 i18n key(`messages.commands`,默认 `rcUsageError`;dnd5e=`d20RcUsage`;triangle=`taRcNotSupported` 用于"本规则不支持 .rc") |
| `capabilities` | `RuleCapabilities` | 见 §3。**驱动所有 UI/host-action/AI 门控的唯一来源** |
| `initCharacter()` | `→ CharacterData` | 新成员加入时的初始角色卡(COC=9 属性+衍生;basic=`{ruleTemplate:'basic'}`) |
| `readStatus(sheet)` | `→ CharacterStatus` | 把本规则自己的数据袋(`cocDerived`/`d20Sheet`/`taSheet`/`shSheet`…)摊平成 `{resources:{key:{current,max?}}, derived?, attributes?, attributeGrades?}`,键与 capabilities 对齐。所有只读状态面板(头像悬浮窗、成员列表)的唯一数据源,经 `src/lib/rules/status-view.ts` 的 `readStatusEntries()` / `primaryVital()` 摊平后消费;无结构化角色卡的规则返回 `{resources:{}}` |
| `computeDerived(sheet)` | `→ CharacterData` | 属性改动后重算衍生 + 保留 player-set 当前值(HP/SAN/MP 钳到新上限)。basic 实现为 identity |
| `routeStat(name)` | `→ StatRoute` | `.st <name> <val>` 的路由决策:`{kind:"skill"\|"attribute"\|"resource", canonical, key?}`。COC 走 `resolveCocStat`;basic 一律返 `{kind:"skill"}` |
| `canonicalStatName(name)` | `→ string` | 显示名归一(`san → 理智值`)。basic 是 identity |
| `lookupFallback(name, sheet)` | `→ {name, value} \| null` | `.rc <name>` 在 `room_skills` 查不到时的回退(COC 查角色卡属性/资源 current;basic 返 null) |
| `resolveCheck(req)` | `→ CheckResult` | **核心**:规则全权拥有"掷什么骰 + 加什么调整值 + 比较方向 + 大成功/失败判定"。`rollDie()` 必须移进模块,不能由引擎预掷 |
| `exportSnapshot(sheet)` | `→ Record<string, unknown>` | 导出快照里规则相关的字段(COC=hp/hpMax/san/mp/attributes;basic={}) |
| `describeForAI()` | `→ AiRuleHints` | AI bot 的系统提示片段 + 工具 schema 片段 |

### `CheckResult` 关键约束

```ts
{
  skillName: string;         // 已归一的显示名
  notation: string;          // "1d100" / "1d20+5"
  rolls: number[];           // 原始骰
  total: number;             // 最终比较值(COC 是 raw roll;5e 是 roll+mod)
  target: number;            // 阈值(COC)或 DC(5e),由规则自释
  passed: boolean;           // 方向由规则决定,引擎不假设
  grade: VisualGrade;        // 渲染端闭合词表:"critical"|"success"|"failure"|"fumble"
  detail: Record<string, unknown>; // diceDetail JSON,不含 `command` 字段(engine 后加)
}
```

**关键 quirk**:COC `success` 布尔严格等于 `roll <= target`,**不**因 nat crit 改变。`grade` 可能升到 `critical` 而 `passed` 仍为 false(target<5 的边角)。原代码就是这样,**rules.test.ts** 锁定了此行为,迁移时不要"修正"。

---

## 3. `RuleCapabilities` 字段速查

```ts
interface RuleCapabilities {
  hostLabelKey: string;                        // 本规则对主持人的称呼,i18n key 在 messages.hostLabels(coc7th=kp;dnd5e=dm;triangle=manager;shouhun/basic=gm)
  playerLabelKey: string;                      // 本规则对玩家的称呼,i18n key 在 messages.playerLabels(coc7th=investigator;dnd5e=adventurer;triangle=agent;shouhun=soulHunter;basic=player);UI 经 host-label.tsx 的 usePlayerLabel() 读取
  hasSanity: boolean;                          // SAN 资源 + .sc 命令 + requestSanCheckAction 守卫
  hasPsychologyRoll: boolean;                  // psychologyHiddenRollAction 守卫 + TopBar 心理学暗骰菜单项
  hasManaPoints: boolean;                      // MP 资源条渲染
  checkMenuModes: ("check"|"psychology"|"sancheck")[]; // TopBar 检定项;>1 下拉,=1 单按钮,空数组隐藏(triangle)
  supportedCommands: string[];                 // .sc 的命令门控就读这个
  resourceBars: { key, labelKey, style? }[];   // 角色卡预置资源条;style:"counter" 渲染为无上限计数器(默认 "bar" 为 当前/上限 条)
  attributeKeys: { key, labelKey }[];          // 角色卡属性宫格(basic=空;COC=9;5e=8;triangle=9)
  statusAttributeKeys?: { key, labelKey }[];   // 属性里适合塞进头像悬浮窗的少数几个(coc7th=幸运;dnd5e=AC;shouhun=3 项基础属性);key 必须是 attributeKeys 里已有的,labelKey 可另选更短的文案。省略=悬浮窗只显示资源+衍生
  statusCustomLimit?: number;                  // 紧凑状态面板最多显示几个玩家自定义属性(basic=2,因为它没有任何预置资源);省略=全部
  derivedStats?: { key, labelKey }[];          // 角色卡属性宫格后的只读衍生卡(shouhun=术法强度);值由 CharacterPanel 按规则现算传入 AttributesTab 的 derivedValues
  defaultRollExpression: string;               // 空参数 .r/.rd 的默认骰(COC/basic=1d100;5e=1d20;triangle=6d4)
  requiresStoredTarget: boolean;               // .rc 查不到值时是否报 STAT_NOT_SET(COC/basic=true;5e/triangle=false)
  hasRoleLevel: boolean;                       // 角色卡是否显示 role/level 字段(仅 5e)
  quickRolls: string[];                        // 聊天输入框上方的快捷命令 chips(规则驱动,替代旧硬编码 QUICK_COMMANDS)
  highlightDieFace?: number;                   // 掷骰时写入 diceDetail.highlightFace,渲染器逐骰标亮该面(triangle=3)
}
```

`hostLabelKey` 是**必填**字段:所有房间内会提到主持人的界面(聊天徽章、成员列表、可见性标签、物品来源/可见性、时间线、房间信息、大厅房间卡)都通过 `src/components/shared/host-label.tsx` 的 `useHostLabel()` / `useHostLabelResolver()` 解析它,而不是硬编码"KP"。新规则漏填会被 `rules.test.ts` 的 `hostLabelKey` 用例拦下(见 §4 Step 5)。

**Capabilities 是纯数据,禁止放 React 类型/组件引用**——规则模块要在 server 端也可加载。UI 端的图标/颜色映射(如 `RESOURCE_ICON` 在 `AttributesTab.tsx`、`CHECK_MODE_UI` 在 `RoomTopBar.tsx`)是 client-only 的**静态 map**,key 与 capability 的 key 字段对齐。

---

## 4. 添加新规则的完整清单(以 DnD 5e 为例)

### Step 1 — 新建模块文件

`src/lib/rules/dnd5e/index.ts`(参考 `coc7th/index.ts`):

```ts
export const dnd5eRule: RuleModule = {
  id: "dnd5e",
  labelKey: "ruleTemplateDnd5e",
  hintKey: "ruleTemplateDnd5eHint",
  capabilities: {
    hostLabelKey: "dm",                                         // 5e 管主持人叫 DM
    hasSanity: false,
    hasPsychologyRoll: false,
    hasManaPoints: false,
    checkMenuModes: ["check"],
    supportedCommands: ["help","st","rc","ra","rh","rd","r"],   // 无 sc
    resourceBars: [{ key: "hp", labelKey: "hp" }],
    attributeKeys: [
      { key: "str", labelKey: "str" }, { key: "dex", labelKey: "dex" },
      { key: "con", labelKey: "con" }, { key: "int", labelKey: "int" },
      { key: "wis", labelKey: "wis" }, { key: "cha", labelKey: "cha" },
    ],
  },
  initCharacter: () => ({ ruleTemplate: "dnd5e", abilities: {/*…*/}, level: 1, proficientSkills: [], derived: {/*…*/} }),
  computeDerived: (sheet) => {/* 算 abilityMods、proficiencyBonus、skillMods、saveMods */},
  routeStat: (name) => {/* 6 属性别名 → attribute;HP → resource;余者 skill */},
  canonicalStatName: (n) => n,
  lookupFallback: (name, sheet) => {/* 查 sheet.derived.skillMods[name] 等 */},
  resolveCheck: (req) => {
    const roll = rollDie(20);
    const mod = /* 从 sheet 查熟练加值 + 能力调整值 */;
    const total = roll + mod;
    const passed = total >= req.target;                          // ≥ DC 成功(方向相反于 COC)
    const grade = roll === 20 ? "critical" : roll === 1 ? "fumble" : passed ? "success" : "failure";
    return { skillName: req.skillName, notation: `1d20+${mod}`, rolls: [roll], total, target: req.target, passed, grade, detail: {/*…*/} };
  },
  exportSnapshot: (sheet) => ({ hp: sheet.hp, abilities: sheet.abilities, level: sheet.level }),
  describeForAI: () => ({ rulesPrompt: "Room runs DnD 5e: d20+modifier vs DC, nat20/nat1 are crit/fumble.", sheetToolSchemaFields: {/* abilities + level 字段 */} }),
};
```

### Step 2 — 注册

`src/lib/rules/registry.ts`:

```ts
register(basicRule);
register(coc7thRule);
register(dnd5eRule);  // ← 加这一行
```

### Step 3 — schema 常量同步

`src/db/schema.ts` 的 `RULE_TEMPLATES` 数组追加:

```ts
export const RULE_TEMPLATES = ['basic', 'coc7th', 'dnd5e'] as const;
```

> server action 的 `createRoomAction`/`updateRoomSettingsAction` 用这个常量做 whitelist 校验,不同步会被打回 `"Invalid ruleTemplate"`。

### Step 4 — i18n

`messages/zh.json` 和 `messages/en.json` 加 `ruleTemplateDnd5e` / `ruleTemplateDnd5eHint`。若 5e 属性键不复用 COC 现有的(`str/dex/con`),还要加新 labelKey(`wis`/`cha`)。

### Step 5 — 主持人/玩家称呼(`hostLabelKey` / `playerLabelKey`)

每套规则都要声明房间里怎么称呼主持人**和玩家**(两者机制完全对称:capability 必填 key + `messages.hostLabels`/`messages.playerLabels` 文案 + `rules.test.ts` 里各自 describe 块的 `EXPECTED` 映射;玩家称呼现有 key:`player` 玩家、`investigator` 调查员、`adventurer` 冒险者、`agent` 特工、`soulHunter` 狩魂者,泛用规则复用 `player`)。以主持人为例,三处缺一不可:

1. **文案**——`messages/zh.json` 和 `messages/en.json` 的 `hostLabels` 里挑一个已有 key,或加一个新的:

   ```jsonc
   // 现有:{"kp": "KP", "dm": "DM", "manager": "经理/Manager", "gm": "主持人/GM"}
   "hostLabels": { …, "narrator": "叙述者" }   // 只有当现有称呼都不合适时才新增
   ```

   泛用规则直接复用 `gm`(主持人 / GM),不要为了"看起来独特"造新 key。

2. **capability**——模块的 `capabilities.hostLabelKey` 指向该 key(见 §3)。

3. **测试**——`src/lib/__tests__/rules.test.ts` 的 `hostLabelKey` describe 块里,把新规则加进 `EXPECTED` 映射:

   ```ts
   const EXPECTED: Record<string, string> = {
     coc7th: "kp", dnd5e: "dm", triangle: "manager", shouhun: "gm", basic: "gm",
     yourRule: "gm",  // ← 加这一行
   };
   ```

   该用例同时断言 `listRuleIds()` 与 `EXPECTED` 的键集合完全相等,所以漏加会直接红——这正是它存在的意义。另一个用例会校验 key 在 zh/en 两份文案里都有值。

UI 侧不用改:所有提到主持人的房间内组件都已通过 `src/components/shared/host-label.tsx` 的 `useHostLabel()` / `useHostLabelResolver()` 读这个 key。

### Step 6 — 单元测试

参考 `src/lib/__tests__/rules.test.ts` 的 COC 边界测试,补:
- `resolveCheck` 在 nat1 / nat20 / 边界 DC 的 grade
- `routeStat` 对 6 项属性别名 + HP 资源的路由
- `lookupFallback` 命中和未命中场景
- `initCharacter` 的字段结构
- 注册表能查到 `dnd5e`,且 `listRuleIds()` 包含它

### Step 7 — 数据库迁移

无!`rooms.rule_template` 是 text,接受任何字符串。`pnpm db:push` 不需要为新规则跑(只在改 schema 结构时跑)。

### **不需要改的地方**(验证抽象成立)

- `src/lib/commands.ts` —— 命令引擎已 100% 走 `getRule()`
- `src/app/actions/room.ts` —— `psychologyHiddenRollAction` / `requestSanCheckAction` / `getProxyCheckTargetsAction` 走 capabilities
- `src/app/actions/export.ts` —— 走 `rule.exportSnapshot()`
- `src/components/room/RoomTopBar.tsx` —— 检定下拉读 `checkMenuModes`
- `src/components/room/character/AttributesTab.tsx` —— 资源条/属性宫格读 capabilities
- `src/components/room/chat/ResourceStatusTooltip.tsx` —— 头像悬浮窗读 capabilities + `rule.readStatus()`(图标映射在 `character/resource-visuals.ts`,按资源 key 查,查不到用主色兜底)
- `src/components/room/chat/ConversationPanel.tsx` —— 成员列表那条只显示**一个**数值:`primaryVital()`(有 HP 的规则取 HP,否则取第一个声明资源,再否则取第一个自定义属性,都没有就整条不渲染)
- `src/components/room/RoomSettings.tsx` / `LobbyClient.tsx` —— 下拉项来自 `listRules()`
- `src/lib/ai_agent.ts` —— 系统提示走 `rule.describeForAI()`,enum 走 `listRuleIds()`

如果你发现需要改上面任何一个文件来让 5e 工作,说明 5e 模块的某个字段没填对,**回头检查模块定义**而非改这些文件。

---

## 5. 刻意保留的例外(不算缺陷,别"顺手清掉")

| 位置 | 现状 | 为何保留 |
| --- | --- | --- |
| `src/app/actions/character.ts` — `saveCharacterDataAction` / `updateCocAttributesAction` | 仍用 inline `computeCocDerived` 而非 `rule.computeDerived` | 两者的 `san_current` 保留时机不同(`rule.computeDerived` 同步 `.san` 和 `.san_current`;legacy 只保 `.san`)。差异在罕见边界会改 export 快照中 `.san` 的值。等 5e 落地时和它的对应 action 一起重写 |
| `src/components/lobby/LobbyClient.tsx:310` 附近的 COC 徽章 | 仍 hardcode `ruleTemplate === "coc7th"` + Skull 图标 | 规则专属装饰图标,不同规则可能要不同图标(5e=骰子、PbtA=面具…)。capabilities 不适合放 UI 装饰元数据;5e 时按需加 `else if` 分支 |
| `src/components/room/character/CharacterPanel.tsx` — `buildAttributeValues` / `resourceMaxes` / `currentResources` / `handleSaveAll` / `handleExport` | 按 `ruleTemplate` 硬分支(coc7th / dnd5e / triangle) | 每套规则的属性包/资源字段结构不同(`cocAttributes+cocDerived` / `d20Attributes+d20Sheet` / `taQualities+taSheet`),面板需把它们摊平成通用 Record 再存回。新规则在这几处各加一个分支即可 |

剩余几个 `<select>` 也是"刻意不迁"——参考 `src/components/shared/ThemedSelect.tsx` 文档注释的 carve-out 说明。

---

## 6. 常见错误

1. **在引擎里写 `if (rule.id === "coc7th") {…}`** —— 这是 1.0 之前的反模式,新代码不允许。如果某个行为不能用 `capabilities` 表达,先扩 `RuleCapabilities` 接口(纯数据),再用 capability 驱动。
2. **`RuleCapabilities` 里塞 React 组件 / 图标** —— 规则模块要在 server 端可用,不能引 React。客户端的 `RESOURCE_ICON` / `CHECK_MODE_UI` 映射用 capability 的 string key 查。
3. **`rollDie` 留在 `commands.ts`** —— 错。预掷骰使方向无法被规则改写,d20 直接挂掉。`rollDie` 必须在 `resolveCheck` 内部调用。
4. **新规则加了但 select 里看不到** —— 检查 `schema.ts` 的 `RULE_TEMPLATES` 数组(server action 的 whitelist 会丢弃未列出的 id)。
5. **写 `getRuleForRoom(room)` 时假设 `room.diceRules`** —— 该列已删,函数现签名为 `{ ruleTemplate?: string | null }`。
6. **修改 `coc7th.resolveCheck` 的 grade 判定逻辑**(以为是 bug 修复) —— `rules.test.ts` 锁定了 grade=critical / passed=false 的边角行为,1:1 保留是设计意图。

---

## 7. 进一步阅读

- `docs/arch/rule-template-system.md` — 重构前的现状分析(为什么要做这次抽象)
- `docs/arch/rule-template-refactor.md` — 设计方案 + 5 phase 计划 + 风险表
- `src/lib/rules/coc7th/index.ts` — 最完整的模块实现范例,所有字段都填了
- `src/lib/__tests__/rules.test.ts` — 38 个测试,新规则上线前请覆盖等量的边界
