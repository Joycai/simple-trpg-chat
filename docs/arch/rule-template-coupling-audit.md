# 规则模版：耦合度审计与修复计划（2026-07-22）

> 定位：本文是 [`rule-template-refactor.md`](./rule-template-refactor.md) 落地（PR #126 收敛双字段，dnd5e / triangle / 狩魂者 相继落地）之后的**跟踪审计**。
> 目的：盘点当前 5 套规则模版及其自定义面，量化「规则知识仍泄漏进公共代码」的残余耦合，并给出**按严重程度排序的修复计划**。
> 一句话结论：核心抽象（`RuleModule` 接口 + 自注册 `registry` + 数据驱动 `capabilities`）已建成且命令/AI/状态主流程基本零分支；**但角色面板 UI、共享数据模型、少数 server action 仍硬编码每套规则**——重构的 Phase 3（UI 接入）只完成了一半。

---

## 一、规则模版清单（5 套）

全部位于 `src/lib/rules/<name>/index.ts`，通过 `src/lib/rules/registry.ts` 自注册；调用方一律 `getRule(room.ruleTemplate)` 取模块，`null`/未知 id 回退 `basic`。

| id | 名称 | 骰系 | 定位 |
| --- | --- | --- | --- |
| `basic` | 通用 d100 | 1d100 ≤ 目标 | 兜底基线：能力位几乎全关，方法多为恒等/null，`.st` 一律写 `room_skills` |
| `coc7th` | 克苏鲁的呼唤 7 版 | 1d100，1–5 大成功 / 96–100 大失败 | 9 属性 + 衍生值 + 理智 + MP，功能最全 |
| `dnd5e` | DnD 5e (d20) | 1d20 + 调整值 ≥ DC | v1 精简：8 项自由属性、无自动推导、角色/等级、HP |
| `triangle` | Triangle Agency | 6d4 数「3」 | 无 `.rc` 检定；9 项资历 + 嘉奖/处分无上限计数器 |
| `shouhun` | 狩魂者 | 1d20 + x·d4(加骰) + y·d6(时髦骰) | 3 属性(1–9, E~SSS+)、全衍生资源、成功等级、宿主检定表单 |

---

## 二、每套模版涵盖的「自定义部分」

`RuleModule`（`src/lib/rules/types.ts`）定义的自定义面分两类：**纯数据 `capabilities`**（驱动 UI/宿主动作/AI 门控，不写代码分支）与**行为方法**（各规则完全自持骰子与角色卡逻辑）。

### 2.1 capabilities（纯数据门控）

| 字段 | 含义 | 各规则取值差异（示例） |
| --- | --- | --- |
| `hostLabelKey` / `playerLabelKey` | 主持人 / 玩家称谓 i18n key | KP·调查员 / DM·冒险者 / 经理·特工 / GM·狩魂者 |
| `hasSanity` / `hasPsychologyRoll` / `hasManaPoints` | 理智 / 心理学暗骰 / MP 开关 | 仅 COC 全开 |
| `checkMenuModes` | TopBar 检定下拉项 | COC `[check,psychology,sancheck]`；triangle `[]`（隐藏按钮） |
| `supportedCommands` | 命令白名单 | COC 含 `sc`；triangle 无 `rc/ra` |
| `resourceBars` | 资源条（`bar`/`counter` 两态） | COC HP/SAN/MP；triangle 嘉奖/处分(counter) |
| `attributeKeys` | 属性网格 | COC 9 / d20 8 / triangle 9 / 狩魂 3 |
| `derivedStats` | 只读衍生卡 | 狩魂者 术法强度 |
| `statusAttributeKeys` / `statusCustomLimit` | 悬浮卡精简展示 | COC 仅幸运；d20 仅 AC；basic 前 2 个自定义 |
| `defaultRollExpression` | `.rd`/`.r` 缺省表达式 | d100 / d20 / 6d4 |
| `requiresStoredTarget` | `.rc` 是否强制已存目标值 | COC/basic true；d20/triangle/狩魂 false |
| `hasRoleLevel` | 角色/等级字段 | 仅 d20 |
| `quickRolls` | 输入框上方快捷 chips | 各规则自带 |
| `highlightDieFace` | 高亮骰面 | triangle = 3 |
| `checkRequestOptions` | 宿主检定表单特化（DC + 时髦骰 + 加骰） | 仅 狩魂者 |

### 2.2 行为方法（规则自持）

- **角色卡**：`initCharacter` / `computeDerived` / `readStatus` / `applySheetPatch`（校验并合并 AI 的不可信写入）
- **`.st` 路由**：`routeStat`（技能/属性/资源）/ `canonicalStatName`（别名归一，如 `san → 理智值`）/ `lookupFallback`
- **检定**：`resolveCheck`（自己掷、比、评级，方向自定）/ `parseRcArgs` / `parseQuickCheckArgs`（狩魂者 `.r+x±y`）
- **`.st` 写入**：`applyStatWrite`（属性/资源落库 + 钳制）
- **导出 / AI**：`exportSnapshot` / `describeForAI`（注入系统提示词 + `update_character_sheet` 工具 schema 片段）

> 自洽约束：`applySheetPatch` 接受的字段必须正好等于 `describeForAI().sheetToolSchemaFields` 声明给 LLM 的字段——「声明」与「落库」是同一契约的两半，同模块内闭合（历史上分离曾导致 `taQualities`/`shAttributes` 被静默丢弃）。

---

## 三、耦合度评分

### 3.1 已解耦（做得好，加规则零改动）

约 **15 个文件、41 处** 通过 `getRule()/capabilities/listRules()` 委派，**无 rule-id 分支**：命令引擎 `commands.ts` 主体、`ai_agent.ts` 主流程、`status-view.ts`、`AttributesTab.tsx`（能力驱动渲染）、`host-label.tsx`、`RuleTemplateSelect.tsx`、`export.ts`、`ResourceStatusTooltip.tsx` 等。这部分兑现了「可插拔」。

### 3.2 残余泄漏（rule-id 硬编码进公共代码，违反可插拔原则）

| # | 位置 | 硬编码分支 | 问题 | 严重度 |
| --- | --- | :---: | --- | :---: |
| 1 | `components/room/character/CharacterPanel.tsx` | **24** | 面板把每套规则的属性读取 / 资源初始化 / 衍生计算 / 保存 / 导出全部内联 `if(rt==="coc7th")…else if("dnd5e")…`，直接调 `computeCocDerived`/`computeShDerived` 并用 `attributeValuesAsXxx` 手工转换——绕过了模块已有的 `readStatus`/`applyStatWrite`/`exportSnapshot`。重构 Phase 3 的 UI 解耦在此**未完成** | 🔴 P0 |
| 2 | `lib/character-types.ts` | 类型级 | 公共数据模型写死每套规则字段（`cocAttributes`/`d20Attributes`/`d20Sheet`/`taQualities`/`taSheet`/`shAttributes`/`shSheet`）+ per-rule 常量与 derive 函数（`COC_DEFAULT_ATTRIBUTES`/`computeCocDerived`/`computeShDerived`/`clampShAttr`/`shGradeLabel`）。加规则必须改公共文件 | 🔴 P1 |
| 3 | `lib/{coc,d20,ta,sh}-stats.ts` | 位置耦合 | 每套规则的 stat 解析器散落公共 `lib/`，仅被各自模块 import，却未归入 `rules/<name>/` 目录，物理不内聚 | 🟡 P2 |
| 4 | `app/actions/character.ts` | 2 | `updateResources` 手写 `if(dnd5e)…else if(shouhun)…else(coc)` 资源钳制，应委派规则方法 | 🟡 P2 |
| 5 | `lib/ai_agent.ts` | 2 | 掷骰大成功/大失败评级 `if(id==="coc7th")…else if("basic")`（注释已标注待补 `rule.naturalGrade` 钩子）；工具 schema 描述串硬编码规则 id 列表 | 🟡 P2 |
| 6 | `lib/commands.ts` | 1 | `readCurrentSanity` 写死 `coc7th`，应改读 `capabilities.hasSanity` + 规则取值器 | 🟢 P3 |
| 7 | `components/lobby/LobbyClient.tsx` | 1 | 房间卡片写死 `coc7th` 徽标（`RuleTemplateSelect` 已有 `RULE_BADGES` 映射可复用） | 🟢 P3 |
| 8 | `db/schema.ts` | 常量数组 | `RULE_TEMPLATES = ['basic','coc7th',…]` 手工维护，`registry.ts` 注释也承认需手动同步——两处真理源 | 🟢 P3 |

> 说明：#2 中「规则字段共存于同一 `CharacterData` JSON」部分是重构刻意的取舍（同表靠 `ruleTemplate` 区分，见 refactor 文档决策 2），真正的欠债是 **derive 函数 / 默认值 / 属性接口未下沉到各规则目录**，以及 UI 层直接 import 它们。

---

## 四、修复计划（按严重程度排序）

### P0 — `CharacterPanel.tsx` 解耦（最高，约占全部分支 70%）

**目标**：删除全部 ~24 处 rule-id 分支，改由 `capabilities` + 模块方法驱动。

- 属性初值：`buildAttributeValues` / `attributeValuesAsXxx` 一族 → 用 `capabilities.attributeKeys` 通用读写一个 `Record<string, number>`，落库时由模块把通用 record 映射回自己的属性袋（新增 `RuleModule.attributesToSheet(record)` / `sheetToAttributes(sheet)` 或复用 `applyStatWrite`）。
- 资源当前值/上限：`computeCocDerived`/`computeShDerived` 的直接调用 → 走 `rule.readStatus(sheet)`（已返回 current/max）。
- 保存：`handleSaveAll` 的四分支 → 统一 payload，由 server action 侧调用 `rule.computeDerived` + `applyStatWrite`。
- 导出：`handleExport` 的四分支 → 复用 `rule.exportSnapshot` + `capabilities` 标签。
- `resourceMaxEditable`（d20 专属）→ 提升为能力位 `capabilities.resourceMaxEditable?: boolean`。

**风险**：高（UI 状态多、无法在本会话跑起前端）。**策略**：小步切换，每步 `tsc --noEmit` + 相关单测；保留 `.txt` 导出格式字节兼容。建议**最后**做，先让下面的模块方法/能力位就位。

### P1 — `character-types.ts` 数据模型下沉

- 把各规则的属性接口、默认值、`compute*Derived`、`clamp*`、`grade*` **迁入 `rules/<name>/`**（如 `rules/coc7th/sheet.ts`）。
- `character-types.ts` 只保留通用 `CharacterData` 骨架（`name/age/bio/customAttributes/ruleTemplate` + 一个规则数据槽）。
- 所有 UI/action 停止直接 import per-rule derive，改走模块方法。
- **风险**：中高（类型改动波及面广）。依赖：需先在接口上补齐 `readStatus`/`computeDerived` 覆盖 UI 所需字段（多数已具备）。

### P2 — stat 文件归位 + 消费端分支清理

- `lib/{coc,d20,ta,sh}-stats.ts` → 移入各自 `rules/<name>/stats.ts`，仅模块内 import。
- 新增 `RuleModule.naturalGrade(roll, faces): string | null`：COC 认 1d100 的 01–05/96–100，basic 给「CoC 文化」提示，其余返回 null → 消灭 `ai_agent.ts` 评级分支。
- `ai_agent.ts` 工具 schema 的规则说明串 → 由 `listRules().map(r => r.describeForAI())` 生成。
- `character.ts` `updateResources` → 统一走 `rule.applyStatWrite`（资源路由）或新增 `rule.applyResourcePatch`。
- **风险**：低–中，改动局部、可单测。

### P3 — 低耦合收尾

- `commands.ts` `readCurrentSanity` → `capabilities.hasSanity` 门控 + `rule.readStatus(sheet).resources.san`。
- `LobbyClient.tsx` 徽标 → 复用 `RULE_BADGES`（或提升为 `capabilities.badge`）。
- `db/schema.ts` `RULE_TEMPLATES` → 由 `listRuleIds()` 派生，或加构建期断言防漂移（注意 Drizzle 为构建期，避免运行期循环依赖）。
- **风险**：低。

---

## 五、推荐执行顺序与验收

严重程度排序（上文）用于**优先级判断**；实际**执行顺序**建议自底向上，先铺接口/能力位，再动最重的 UI：

1. **P2 基础钩子先行**：`naturalGrade`、stat 文件归位、`ai_agent`/`character.ts` 委派。（低风险、立即可测）
2. **P3 收尾**：commands/lobby/schema。
3. **P1 数据模型下沉**：为 P0 铺好模块方法。
4. **P0 CharacterPanel**：最后重写，delta 最大、风险最高。

**验收标准（对齐 refactor 文档的验收口径）**：审计后除 `registry.ts` / `rules/<name>/` 外，公共代码对 `ruleTemplate === "<id>"` 的字面分支应降为 **0**（`getRule()` 委派与 `capabilities` 读取不算）。

**每步验证**：`npx tsc --noEmit` + `pnpm test`（现基线：类型 0 错，测试 394/395 通过；余 1 为 `encryption.test.ts` 的环境依赖失败，与规则无关）。前端交互项在本地 `pnpm dev` 手测。

---

## 六、修复进度（分支 `refactor/rule-template-decoupling`）

> 更新时间：2026-07-22。以下按提交记录反映实际落地情况。所有已落地项均通过 `tsc --noEmit` + `pnpm test` + `pnpm lint`（基线：类型 0 错，测试全绿，仅 `encryption.test.ts` 一项环境依赖失败与本次无关）。

### ✅ 已完成

**P2 / P3 —— 消费端泄漏（commit `6945022`）**

- `RuleModule.naturalGrade(roll, faces, count)`：把 `ai_agent.ts` 的掷骰大成功/大失败评级从 `id === "coc7th"/"basic"` 分支移入 coc7th / basic 模块；引擎改为 `rule.naturalGrade?.(...)`。
- `RuleModule.applyResourcePatch(sheet, patch)` + `ResourcePatch` 类型：把 `updateResourcesAction` 的 dnd5e / shouhun / coc 资源钳制三分支移入各模块；action 改为单行委派。
- `commands.ts` `readCurrentSanity`：改读 `capabilities.hasSanity` + `readStatus().resources.san`，删除 `coc7th` 硬编码。
- `LobbyClient` 房间卡片徽标：新增 `useRuleLabelResolver`，对任意非 basic 规则用其 `labelKey` 渲染，替换 `coc7th` 骷髅硬编码。
- `db/schema.ts` `RULE_TEMPLATES`：保留字面量（schema 层保持零依赖），改以 `rules.test.ts` 的**漂移守卫测试**防止与注册表脱节。
- 新增 `naturalGrade` / `applyResourcePatch` 全规则单测。

**P0 —— CharacterPanel 完全解耦（commits `ac05b83` / `3f8aa19`）**

- `RuleModule.readAttributes(sheet)` / `writeAttributes(sheet, values)`：属性宫格通用 `Record` ↔ 各规则属性袋的读写（按 `attributeKeys` 白名单），全规则单测。
- `buildAttributeValues`：4 路 if-chain 收敛为一次 `readAttributes()` 委派。
- **资源上限 / 当前值 / 衍生页脚**：统一由 `draftStatusFor()`（`writeAttributes → computeDerived → readStatus`）产出，删除面板内 `computeCocDerived`/`computeShDerived` 的 per-rule 直接调用；`spiritSense` 经 shouhun `readStatus.derived` 暴露。
- **`handleSaveAll`**：`writeAttributes` 建属性袋 + `hasRoleLevel` 处理角色/等级 + `applyResourcePatch`/`applyStatWrite` 落资源；currents 落库路径由新增能力位 `resourceCurrentsViaAction`（coc/狩魂 走 `updateResourcesAction` 可改他人，d20/triangle 直存自身 sheet）驱动，取代 rule-id 分支。
- **`handleExport`**：完全由 `capabilities.{resourceBars,derivedStats,attributeKeys}` + `readStatus().attributeGrades` 驱动，新规则零改动即可导出。
- 新增能力位 `resourceMaxEditable`（d20）/ `resourceCurrentsViaAction`（coc/狩魂）；删除死代码 `attributeValuesAsXxx` 与 `computeXxxDerived` import；init 守卫改用 `DEFAULT_RULE_ID`。
- 新增 `readAttributes`/`writeAttributes`/`applyResourcePatch`/`naturalGrade` 与能力位断言的单测（本次共 +12 测试用例）。

**至此公共代码（`src/lib/rules/` 之外）的 `ruleTemplate === "<id>"` 硬编码分支：CharacterPanel 由 24 → 0，全仓 → 0。** 剩余的字面量比较仅为 `=== DEFAULT_RULE_ID`（常量，属已解耦形态）。

> ⚠️ 行为变更（一处，可见）：COC / d20 的**导出文本**属性标签由 `KEY.toUpperCase()`（如 `STR: 70`）改为翻译名 `t(labelKey)`（如 `力量: 70`），与 triangle / 狩魂者 统一。若产品需要保留旧的大写 key 形式，可在各规则 `attributeKeys` 增设导出专用 label 或加一个 `exportLabel` 能力位。

### ✅ P1 数据模型下沉（已完成，`refactor/rule-sheet-types` 分支）

各规则的属性/资源接口、默认值与 `compute*Derived` 已迁入各 `rules/<id>/sheet.ts`（`coc7th/sheet.ts` 含 `CocAttributes`/`CocDerived`/`COC_DEFAULT_ATTRIBUTES`/`COC_MAX_SANITY`/`computeCocDerived`；d20/triangle/shouhun 同理）。`character-types.ts` 现只剩通用骨架（`CharacterData`/`CustomAttribute`/`ResourceBar`），对各规则接口只做 `import type`（编译期擦除，无运行时依赖、无循环）。各 sheet 符号经 `@/lib/rules` barrel 再导出供外部消费。`lib/{coc,d20,ta,sh}-stats.ts` 已在 PR #176 归位到 `rules/<id>/stats.ts`。

采用的是**保类型安全**的方案：`CharacterData` 仍带各规则的可选强类型字段（`cocAttributes?: CocAttributes` 等），因此所有 `.cocDerived.hp` 式取值处零改动；加新规则时 `character-types.ts` 仍需加一行 `import type` + 一个可选字段，但已从"承载全部 per-rule 逻辑"退化为"只引类型"。若日后要连这一行也去掉（改成 `ruleData?: Record<string,unknown>` 泛型槽），会牺牲取值处的类型安全、需改大量消费点，收益不高，暂不做。

至此审计列出的 8 处残余耦合全部收敛。

### 建议的验证（合并前）

代码层已全绿（`tsc` 0 错、`lint` 0 问题、`pnpm test` 除 `encryption.test.ts` 环境依赖项外全通过）。但角色面板为交互组件，合并前建议 `pnpm dev` 手测四条路径：**COC / d20 / Triangle / 狩魂者** 各自的（1）属性编辑 → 资源条分母随动，（2）保存后刷新值正确，（3）宿主为他人调整 HP/理智，（4）导出 .txt 内容无误。
