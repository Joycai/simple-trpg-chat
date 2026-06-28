# 规则模版系统：模块化重构计划（DnD 5e 驱动）

> 目标：把散落 7 个域、38 处的 `if (coc7th)` 硬编码，收敛为 **规则模块（RuleModule）注册表 + UI 注册表**。
> 验收：下一步的 **DnD 5e（d20）** 作为第三套规则落地时，**只新增 `rules/dnd5e/` 一个目录 + 注册一行**，命令引擎、角色系统核心逻辑、宿主动作门控均无需改动。
> 前置：[`rule-template-system.md`](./rule-template-system.md)（现状）；本计划取代其早期接口草案。

---

## 一、为什么 d20 改变了抽象的下限

5e 不是"再来一套属性表"——它打破了引擎里三个被焊死的隐含假设。这三点决定了接口形态：

| 假设（当前为 COC 写死） | 5e 的现实 | 对接口的强制要求 |
| --- | --- | --- |
| **判定方向**：`roll ≤ target` 越低越好 | `d20 + 调整值 ≥ DC` 越高越好，方向相反 | 规则必须**自己拥有比较方向** |
| **检定 = 单 d100 vs 一个数** | `d20 + 能力调整值(+熟练)` vs **KP 给的 DC**；大成功/大失败看 nat20/nat1 | 规则必须**自己掷骰、自己加调整值**，引擎不能预掷 d100 |
| **技能 = 存在 room_skills 的绝对值** | 技能调整值是**算出来的**（能力调整值 + 熟练加值×是否熟练），DC 由 KP 临场给 | "卡上存什么"语义相反：COC 卡存**阈值**，5e 卡存**调整值**，目标值来自外部 |

第三点最关键：
- COC：`.rc 侦查` → `d100 ≤ 卡上侦查值(阈值)`，卡 = 阈值，无外部 DC。
- 5e：`.rc 运动 15` → `d20 + 运动调整值 ≥ DC15`，卡 = 调整值，DC = KP 给。

> 结论：`gradeCheck(roll, target)`（先掷好再判级）的旧草案**不成立**。核心抽象必须升级为 **`resolveCheck(ctx) → CheckOutcome`——规则接管从掷骰到产出结果的全过程**，`rollDie(100)` 从 `commands.ts` 移进各规则模块。

---

## 二、三个核心模型决策

### 决策 1：检定解析由规则全权拥有

```ts
// src/lib/rules/types.ts
export type VisualGrade = "critical" | "success" | "failure" | "fumble";
//   渲染端(ChatMessage)只认这 4 个视觉态；规则负责把自己的结果映射上来。
//   (未来 PbtA 的 strongHit/weakHit/miss 届时再扩这个封闭词表 + 渲染端，属 Tier2。)

export interface CheckRequest {
  skillName: string;
  /** .rc 尾随数字。COC 语义=覆盖阈值；5e 语义=DC。规则自行解释。 */
  explicitValue?: number;
  /** 5e 优势/劣势等修饰，规则自定；COC 忽略。 */
  modifiers?: Record<string, unknown>;
  sheet: CharacterData | null;
}

export interface CheckOutcome {
  notation: string;          // "1d100" / "1d20+5"
  rolls: number[];           // 原始骰
  total: number;             // 加调整值后的最终值
  target: number;            // 阈值(COC) 或 DC(5e)
  passed: boolean;           // 方向由规则决定
  grade: VisualGrade;        // 映射到渲染端封闭词表
  breakdown?: string;        // "d20(14)+力量(3)+熟练(2)=19 vs DC15" 用于展示
  /** 写入 message.diceDetail 的 JSON，带 ruleId 标签;形状由规则拥有。 */
  detail: Record<string, unknown>;
}
```

- COC `resolveCheck`：`roll=d100`，`target=explicitValue ?? 卡上阈值`，`passed=roll≤target`，nat 01-05→critical / 96-100→fumble。
- 5e `resolveCheck`：`roll=d20`（优势取 2d20 高），`mod=能力调整值+熟练`，`total=roll+mod`，`target=explicitValue(DC)`，`passed=total≥DC`，nat20→critical / nat1→fumble。

**渲染契约**：`diceDetail` JSON 加 `ruleId` 字段；现有 `check.{success,grade}` 结构保留（5e 复用它），所以 `ChatMessage.tsx` 渲染端 v1 **不改**。

### 决策 2：角色卡 = 规则拥有「数据模型 + 衍生计算」，UI 走注册表

角色卡是最重的耦合面（COC 9 属性宫格、5e 6 属性+调整值+熟练表）。纯 server 接口管不到 React 渲染，所以拆两层：

```ts
export interface RuleModule {
  id: string;                       // "basic" | "coc7th" | "dnd5e"
  labelKey: string; hintKey?: string;

  /** 角色卡数据 —— 规则拥有 */
  initCharacter(): CharacterData;
  /** 衍生计算：COC=HP/MP/SAN/DB；5e=能力调整值/熟练加值/技能调整值/豁免 */
  computeDerived(sheet: CharacterData): CharacterData;
  /** .st 名称路由 + 显示名归一 */
  routeStat(name: string): StatRoute;
  canonicalStatName(name: string): string;

  /** 检定解析（决策 1） */
  resolveCheck(req: CheckRequest): Promise<CheckOutcome>;

  /** 能力开关 —— 驱动 UI / 宿主动作 / 命令的通用门控（决策 3） */
  capabilities: RuleCapabilities;

  /** 给 AI agent 的规则说明 + 工具 schema 片段 */
  describeForAI(): { rulesPrompt: string; sheetToolSchema: object };

  /** 导出快照形状 */
  exportSnapshot(sheet: CharacterData): Record<string, unknown>;
}
```

UI 侧用**第二张注册表**把 `ruleId → 角色卡组件`：

```ts
// src/lib/rules/ui-registry.ts (client)
const SHEETS: Record<string, React.ComponentType<SheetProps>> = {
  coc7th: CocSheet,   // 现 AttributesTab 的 isCoc 分支抽出
  basic:  BasicSheet, // 现 !isCoc 分支
  dnd5e:  Dnd5eSheet, // 新增
};
```

> 取舍：放弃"纯描述符 DSL 通用渲染器"。5e 的熟练勾选、技能表、优势/劣势用通用 DSL 表达会变成另一套难维护的 DSL；**每规则一个 React 组件 + 共享原子件（`ResourceCard`/`AttrCard`/`AttrGrid`）** 更诚实、更灵活。逻辑层（resolveCheck/computeDerived）保持纯模块化，UI 层有界灵活。

### 决策 3：用 capabilities 做通用门控，删掉所有 `roomIsCoc7th`

SAN check 和心理学暗骰 5e 没有；它们的耦合在 **TopBar 菜单**（RoomTopBar:280 三选项）和 **server action**（room.ts:649/742 的 `roomIsCoc7th` 守卫）两处。用能力位统一驱动：

```ts
export interface RuleCapabilities {
  hasSanity: boolean;         // SAN 资源 + .sc + requestSanCheckAction
  hasPsychologyRoll: boolean; // 心理学暗骰
  hasManaPoints: boolean;     // MP 资源卡
  checkMenuModes: ("check" | "psychology" | "sancheck")[]; // TopBar 检定下拉
  supportedCommands: string[]; // .sc 等命令门控
  resourceBars: { key: string; labelKey: string; color: string }[]; // HP/SAN/MP…
  attributeKeys: { key: string; labelKey: string }[];               // 9 / 6 项
}
```

- COC：`{hasSanity:true, hasPsychologyRoll:true, hasManaPoints:true, checkMenuModes:["check","psychology","sancheck"], attributeKeys:9项, resourceBars:[HP,SAN,MP]}`
- 5e：`{hasSanity:false, hasPsychologyRoll:false, hasManaPoints:false, checkMenuModes:["check"], attributeKeys:6项, resourceBars:[HP]}`
- TopBar、`requestSanCheckAction`、`psychologyHiddenRollAction`、`AttributesTab` 全部改读 capabilities，`roomIsCoc7th`/`isCoc` 三处重复实现删除。

---

## 三、5e 角色卡数据模型（写进 `dnd5e` 模块）

存在 `roomMembers.characterData` JSON 内（与 COC 同表，靠 `ruleTemplate` 区分），无需改 DB schema：

```ts
// ruleTemplate: "dnd5e"
{
  abilities: { str, dex, con, int, wis, cha },   // 6 项原始值
  level: number,                                  // 总等级 → 熟练加值
  proficientSkills: string[],                     // 熟练的技能
  proficientSaves: string[],                      // 熟练的豁免
  // —— computeDerived 产出 ——
  derived: {
    abilityMods: { str: +2, ... },                // floor((score-10)/2)
    proficiencyBonus: number,                     // 2 + floor((level-1)/4)
    skillMods: Record<string, number>,            // 能力调整值(+熟练)
    saveMods: Record<string, number>,
  },
  hp / hpMax,                                      // HP 复用现有资源模型
}
```

技能表（18 项，各绑一个能力）作为 5e 模块的静态常量（类比 COC 的 `coc-stats.ts`），新建 `src/lib/rules/dnd5e/skills.ts`。

---

## 四、触点迁移映射（7 域 → 接口方法）

| 域 / 触点 | 现状 | 改为 |
| --- | --- | --- |
| A 判定 `commands.ts:561` | `if(coc7th) 大成功/失败` | `rule.resolveCheck()` 内部 |
| B 路由 `commands.ts:402` | `if(coc7th && attribute)` | `rule.routeStat()` |
| C 回退 `commands.ts:522`,`room.ts:605` | COC 查卡 | `resolveCheck` 读 `req.sheet` |
| D 命令门控 `commands.ts:593` | `if(!isCoc7th) scNotCoc7th` | `capabilities.supportedCommands` |
| E 初始化 `character.ts:47` | `initCocCharacterAction` | `rule.initCharacter()` |
| F 衍生 `character-types.ts:134`,`commands.ts:302` | `computeCocDerived` | `rule.computeDerived()` |
| G 资源 `character.ts:314`,`commands.ts:323` | HP/SAN/MP 钳制写死 | `capabilities.resourceBars` + 模块钳制 |
| H 卡 UI `AttributesTab.tsx`,`CharacterPanel.tsx` | `isCoc` 分支 | UI 注册表（`CocSheet`/`Dnd5eSheet`）+ `capabilities` |
| I 聊天态 `RoomClient.tsx:164`,`ResourceStatusTooltip.tsx`,`RoomTopBar.tsx:280` | `cocDerived`/`roomIsCoc7th` | `capabilities` + 模块取值器 |
| J 导出 `export.ts:126`,`export-formatter.ts:38` | COC 快照 | `rule.exportSnapshot()` + `labelKey` |
| K AI `ai_agent.ts:106/325/570/766` | enum + prompt 写死 | `rule.describeForAI()` + 注册表枚举 |
| L Schema `schema.ts:39/42` | 常量数组 | 由注册表 `listRules()` 生成校验 |
| 宿主动作 `room.ts:640/730` | `roomIsCoc7th` 守卫 | `capabilities.hasPsychologyRoll / hasSanity` |
| 字段 `diceRules`+`ruleTemplate` | OR 合并 | 收敛为单列 `ruleTemplate`（见 Phase 4） |

---

## 五、分阶段实施（每阶段独立 PR、可回滚）

**Phase 0 — 脚手架，零行为变化**
- 建 `src/lib/rules/{types,registry,ui-registry}.ts`。
- 把现有 COC 逻辑**原样搬迁**进 `rules/coc7th/`（resolveCheck 内复用 `coc-stats`/`computeCocDerived`），`basic/` 同理。
- 单测：对 `coc7th.resolveCheck` 断言边界 01/05/95/96/100，与现有 `commands.test.ts` 对齐。

**Phase 1 — 命令引擎接入**
- `commands.ts` 改 `getRule(room.ruleTemplate).resolveCheck/routeStat`，删 `isCoc7th`，`rollDie(100)` 移入 COC 模块。
- 现有命令测试做字节级回归。

**Phase 2 — 角色系统 + 资源 + 宿主动作**
- `character.ts`/`export.ts` 走 `initCharacter`/`computeDerived`/`exportSnapshot`。
- `room.ts` 两个宿主动作改读 `capabilities`，删 `roomIsCoc7th`。

**Phase 3 — UI 接入**
- `AttributesTab` 的 `isCoc` 分支抽成 `CocSheet`/`BasicSheet` 进 UI 注册表；TopBar/Tooltip/RoomClient 改读 `capabilities`，删 `roomIsCoc7th`。

**Phase 4 — 字段收敛**
- 回填 `ruleTemplate`，停读 `diceRules`（列暂留），`listRules()` 驱动下拉框与 schema 校验。

**Phase 5 — 🎯 DnD 5e 落地（验收）**
- 新增 `src/lib/rules/dnd5e/{index,skills}.ts` + `Dnd5eSheet.tsx` + i18n key + 注册表一行。
- **不改** commands/character/room/ai 核心代码 → 即验收通过。

**Phase 6 — 清理（独立 PR）**：一个发布周期后删 `dice_rules` 列。

---

## 六、明确划出本次之外（Tier 2 / 未来）

写明边界，防止 scope 蔓延：

- 骰池系（WoD Nd10 数成功）、多级结果（PbtA 三段）——`CheckOutcome.grade` 词表与渲染端届时再扩；本次接口为其留位但不实现。
- 5e 的法术位/施法、状态(condition)系统、对抗检定、被动感知、先攻顺序——本次只做 6 属性+调整值+熟练+技能/豁免检定，HP 手填。
- 不进模版的共享件（保持原处）：消息路由/audience、代投、`.rd/.r` 骰子表达式解析、头像、隐私过滤、SSE。

---

## 七、风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `resolveCheck` 抽取引入行为偏差 | Phase 1 用现有命令测试字节级回归；先复制后切换 |
| 5e 卡存"调整值"、COC 存"阈值"，`.rc` 尾随数字语义相反 | 由 `CheckRequest.explicitValue` + 各规则 `resolveCheck` 解释，引擎不假设语义 |
| `diceDetail` 渲染契约 | 加 `ruleId` 标签；5e 复用现有 `check.{success,grade}`，渲染端本次不改 |
| UI 注册表 = "每规则一个组件" | 接受为有界成本；共享原子件复用，逻辑层仍纯模块化 |
| 角色卡 JSON 残留未知 `ruleTemplate` | `getRule` 未知 id 回退 `DEFAULT_RULE_ID`，向后兼容 |
| 删 `dice_rules` 为破坏性变更 | 拆 Phase 6 独立 PR，延后一个发布周期 |
