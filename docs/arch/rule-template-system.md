# 规则模版系统：现状分析报告

> 分析对象：房间的"规则模版"功能（hoster 可为房间选择一套规则，房间内部分配置随之变动）。
> 设计初衷：**可插拔、模块化**。
> 当前已实现：**通用 d100（basic）** 与 **COC 7th（coc7th）** 两套。
> 结论先行：功能正确，但实现是**以布尔开关模拟的二选一硬编码**，尚未达成模块化/可插拔目标。

---

## 一、系统现状：两个字段，而非一个"模版"

规则配置实际拆成了两个独立的数据库字段（[`src/db/schema.ts:99`](../../src/db/schema.ts)）：

| 字段 | 默认值 | 取值 | 控制什么 |
| --- | --- | --- | --- |
| `diceRules`（骰子规则） | `'basic'` | `basic` / `coc7th` | 检定的成功/失败/大成功/大失败判定 |
| `ruleTemplate`（规则模版） | `'basic'` | `basic` / `coc7th` | 角色卡的属性结构初始化 |

两个字段编码的是**同一个枚举**，判定时用 `OR` 合并：

```ts
// src/lib/commands.ts:72
function isCoc7th(room): boolean {
  return room.ruleTemplate === "coc7th" || room.diceRules === "coc7th";
}
```

Hoster 在房间设置中看到两个下拉框（[`RoomSettings.tsx:196`](../../src/components/room/RoomSettings.tsx)），选项均为硬编码的 `<option value="basic">` / `<option value="coc7th">`。

---

## 二、两套规则的差异点

| # | 维度 | 通用 d100（basic） | COC 7th（coc7th） | 代码位置 |
| --- | --- | --- | --- | --- |
| 1 | **角色卡结构** | 自由结构，不预置属性 | 自动初始化 9 项属性 + 衍生值（HP/MP/SAN/DB…）经 `computeCocDerived()` | [`character.ts:47`](../../src/app/actions/character.ts) |
| 2 | **检定判定** | `roll ≤ target` 成功，否则失败（二元） | 额外叠加 `01–05 大成功🟢` / `96–100 大失败🔴` | [`commands.ts:561`](../../src/lib/commands.ts) |
| 3 | **`.st` 设定路由** | 一律写入 `room_skills` 表 | 属性名→角色卡属性，资源名→资源当前值，清理遗留 skill 行 | [`commands.ts:402`](../../src/lib/commands.ts) |
| 4 | **`.rc` 查找回退** | 只查 `room_skills` | 查不到技能时回退到角色卡属性/资源 | [`commands.ts:522`](../../src/lib/commands.ts) |
| 5 | **`.sc` 理智检定** | 不可用，返回 `scNotCoc7th` | 可用，扣除理智并写回角色卡 | [`commands.ts:593`](../../src/lib/commands.ts) |
| 6 | **名称规范化** | 不显著 | `san → 理智值`、`str → 力量` 等别名归一 | [`coc-stats.ts:59`](../../src/lib/coc-stats.ts) |

---

## 三、模块化评估：❌ 当前为 Hardcoding

| 反模块化信号 | 证据 |
| --- | --- |
| **魔法字符串遍布全代码** | 字面量 `"coc7th"` 出现 **38 次，散落在 13 个文件**中 |
| **判定逻辑重复实现 3 次** | `isCoc7th()`（[`commands.ts:72`](../../src/lib/commands.ts)）、`roomIsCoc7th()`（[`room.ts:630`](../../src/app/actions/room.ts)）、`RoomClient.tsx:203` 内联——无单一事实来源 |
| **UI 选项硬编码** | `<option value="coc7th">` 在 RoomSettings、LobbyClient 等多处分别手写 |
| **无抽象层** | 没有 `RuleTemplate` 接口/策略对象/注册表；所有差异靠 `if (coc7th) {…} else {…}` 内联分支表达 |
| **字段语义重叠** | `diceRules` 与 `ruleTemplate` 编码同一枚举，用 OR 合并，职责模糊 |
| **扩展成本高** | 新增第三套规则（如 DnD5e）需改约 13 个文件、在每个分支点新增条件——与"可插拔"相反 |

**结论**：当前实现能工作、行为正确，但只对"恰好两套规则"成立。规则知识没有收敛到内聚模块，而是泄漏到了命令引擎、角色系统、Server Actions、UI 组件等各层。要兑现"可插拔"的设计意图，需引入注册表 + 策略接口（见 [`rule-template-refactor.md`](./rule-template-refactor.md)）。
