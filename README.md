# 🎲 Simple TRPG Chat

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45.2-C5F74F?style=flat-square&logo=drizzle)](https://orm.drizzle.team)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org)

**Simple TRPG Chat** 是一个轻量级、开箱即用的网页版桌面角色扮演游戏（TRPG/跑团）在线聊天与辅助工具。专为小规模多人跑团设计（如克苏鲁的呼唤 CoC、D&D 等），集成了实时聊天、骰点面板、暗骰、指令检定、人物技能卡管理、道具分发以及可选的 AI 助手（Bot/NPC）系统。

---

## ✨ 核心特性

- 🌐 **实时双向同步 (SSE)**：基于 Server-Sent Events 实现的极速消息推送，并针对 Next.js 生产环境多 Worker 部署进行了全局单例优化（避免 SSE 跨路由消息丢失）。
- 🎨 **多主题视觉支持**：内置 6 种精美跑团主题风格，支持一键热切换：
  - 🌐 **默认 (Default)**：现代 web / SaaS 质感，蓝色主色配琥珀强调的浅色主题。
  - 🏺 **古旧羊皮卷 (Parchment)**：古旧牛皮纸与铁胆墨水的西方奇幻手稿质感。
  - 🦑 **克苏鲁的呼唤 (Cthulhu)**：因思茅斯雾港的深渊黑绿与不可名状的恐惧。
  - ⛩️ **远古神社 (Shrine)**：巫女红白、朱漆鸟居的和风神社气息。
  - 🌧️ **霓虹雨夜 (Rainglass)**：磨砂玻璃与霓虹倒影的赛博都市夜雨（深色）。
  - 🔮 **苍穹幻境 (Aether)**：蓝天白云、水晶切面的晴空幻想冒险（浅色）。
- 🎲 **多功能骰点器**：
  - 界面化骰点面板，支持 d4 到 d100 的多颗骰子连投。
  - 支持**主持人暗骰 (🔒)**，结果仅主持人和发送人可见。
  - 聊天框内嵌快速投点指令支持。
- 📋 **技能卡与指令检定**：
  - 图形化技能面板，支持技能数值添加、实时修改、删除，数据双向同步。
  - 使用 `.st` 设置技能值，`.rc` 一键触发 d100 检定，并根据规则判断“成功/失败/大成功/大失败”。
- 🎒 **行囊与道具系统**：主持人可创建并向特定玩家分发道具（支持信息、角色、物品三类），玩家之间可分享道具，并有未读状态提醒。
- 🤖 **智能 AI Bot/NPC 伴跑**：
  - 房间主持人可为 Bot 配置独立的 OpenAI 兼容 API 接口与密钥（高强度 AES-256-GCM 加密存储）。
  - AI Bot 拥有完整的 Agent 工具链，可自主进行**骰点**、**查看玩家道具**、**发送发言**。
  - 自动每 30 条消息触发历史上下文自动摘要，节省 Token 并提升 Bot 记忆范围。
- 🇨🇳/🇬🇧 **多语言 (i18n) 支持**：使用 `next-intl` 实现中英双语的无缝切换，默认语言为中文。

---

## 🛠️ 技术栈说明

- **前端框架**：Next.js 16.2.6 (App Router) & React 19
- **样式系统**：Tailwind CSS v4 (配合 `@tailwindcss/postcss`) 带来极速且原生级的主题变量定义
- **数据库 ORM**：Drizzle ORM + `postgres` 驱动，直连 PostgreSQL 16
- **身份验证**：NextAuth v5 (beta) Credentials 凭据认证模式
- **AI 交互**：自定义 Agent 决策环 (Tool-Use)，兼容各大主流大模型 API
- **多语言**：`next-intl` v4

---

## 🚀 快速开始

### 1. 环境依赖
确保本地安装了以下环境：
- **Node.js** >= 20
- **pnpm** >= 10 (或使用 `corepack enable pnpm` 启用)
- **PostgreSQL** 15+ (可通过 Docker 快速拉取运行)

### 2. 一键配置与初始化
项目根目录下准备了自动化引导脚本。请根据你的操作系统运行对应的命令：

- **Linux / macOS**:
  ```bash
  chmod +x setup.sh
  ./setup.sh
  ```

- **Windows**:
  双击运行根目录下的 `setup.bat`，或者在命令行中执行：
  ```cmd
  setup.bat
  ```

脚本将会依次引导你：
1. **数据库配置**：输入 PostgreSQL 连接串（脚本中附带了 Docker 运行 PG 实例的提示命令）。
2. **环境变量生成**：自动从 `.env.example` 复制并随机生成 `AUTH_SECRET` 密钥。
3. **AI 功能设置**：选择是否启用 AI Bot，若启用则会自动生成 `AI_ENCRYPTION_KEY` 加密密钥。
4. **安装依赖**：自动调用 `pnpm install`。
5. **数据库初始化**：测试连接并运行 `pnpm db:push:pg` 推送表结构。
6. **数据填充 (Seed)**：询问是否生成初始管理员账号：
   - 用户名：`admin`
   - 密码：`admin123`

---

## 💻 运行命令

```bash
pnpm dev             # 启动本地开发服务 (http://localhost:3000)
pnpm build           # 打包 Next.js 生产环境应用
pnpm start           # 启动 Next.js 生产服务
pnpm lint            # ESLint 语法检查
pnpm test            # 运行 Vitest 单元测试
pnpm db:push         # 手动推送 Drizzle 数据库 schema
pnpm db:studio       # 打开 Drizzle Studio 可视化数据库管理界面
pnpm db:seed         # 手动向数据库填充初始数据
pnpm db:doctor       # 运行环境与数据库诊断工具，并支持表结构一键更新
```

---

## 💬 聊天指令一览

在聊天输入框中发送以 `.` 开头的消息将触发系统指令：

| 指令格式 | 示例 | 说明 |
| :--- | :--- | :--- |
| `.st <技能名> <数值>` | `.st 侦查 50` | 设置当前房间中自己角色的技能值 (0-100) |
| `.st <技能1><数值1><技能2>...` | `.st 侦查50聆听60` | 批量紧凑设置多个技能值（空格可选） |
| `.rc <技能名>` | `.rc 侦查` | 进行 d100 技能检定，输出检定结果及判定等级（大成功/大失败等由房间规则模板决定） |
| `.sc <成功损失>/<失败损失>` | `.sc 1/1d6` | 理智检定（COC 7th），成功/失败按对应表达式扣减 SAN |
| `.rd<N>` | `.rd100` / `.rd20` | 快速投掷 1 个指定面数的骰子并公布结果 |
| `.r <表达式>` | `.r 3d100k2+2d20` | 通用掷骰表达式（支持多骰、取高 `k`、加减修正） |
| `.rh <表达式>` | `.rh 1d100` | 暗骰：结果仅自己（及主持人）可见 |
| `.help` | `.help` | 获取当前的系统指令帮助说明 |

---

## 📁 项目结构

```text
src/
├── app/                      # Next.js App Router 页面及 API 路由
│   ├── actions/              # Server Actions 目录 (房间、AI、Bot、道具等 CRUD)
│   ├── api/                  # API 路由 (NextAuth 接口, SSE 推送流)
│   ├── rooms/[id]/           # 聊天房间动态路由页面
│   ├── globals.css           # 全局样式及 Tailwind v4 主题变量定义
│   └── layout.tsx            # 根布局 (注入 i18n 与 AppProvider)
├── components/               # React 客户端组件 (聊天、骰点、技能、道具等面板)
├── db/                       # 数据库连接、Drizzle 架构 schema 定义及 Seed 脚本
├── lib/                      # 核心公共逻辑 (AI Agent 环、指令解析、加密、全局 SSE Event 单例)
├── i18n/                     # Next-intl 国际化配置
├── themes/                   # 6 套跑团主题 (每套含 theme.css) 及主题类型定义
└── messages/                 # 中英多语言翻译 JSON 文件
```

---

## 📝 开发者注意事项

### ⚠️ 生产环境 SSE 单例
因为 Next.js 在生产构建运行时会利用多个 Worker 并发处理请求，因此 `src/lib/events.ts` 中的 `EventEmitter` 必须被持久化在 `globalThis` 上以确保不同 Worker 间能够同步消息：

```typescript
// 始终持久化到 globalThis 保证单例跨请求共享
const eventHub = globalThis.__eventHub || new EventEmitter();
globalThis.__eventHub = eventHub;
```
请勿在此处附加 `process.env.NODE_ENV !== 'production'` 等判断条件，否则生产环境下 SSE 消息推送会失效。

---

## 📖 相关文档

- **用户指南**：关于界面操作、各角色权限等更详细的使用方法，请参考 [用户手册](docs/guides/user-guide.md)。
- **管理员指南**：关于系统设置、成员管理等，请参考 [管理员手册](docs/guides/admin-guide.md)。
- **分步部署（Windows / Linux）**：面向首次部署的逐步指南，见 [分步部署指南](docs/guides/deployment-step-by-step.md)。
- **部署指南（参考版）**：更精简的部署参考与 SSE 反向代理要点，见 [部署文档](docs/guides/deployment.md)。
- **架构文档**：数据库、实时消息、AI、角色、后台等系统的深入说明见 [`docs/arch/`](docs/arch/)。

---

## 📄 开源许可证与双重授权 / License & Dual Licensing

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可证，并提供**双重授权（Dual Licensing）**模式：

- **开源与免费（AGPL-3.0）**：本项目对个人、娱乐及非商业用途完全免费开源。在 AGPL-3.0 协议下，您可以自由分发、修改和运行本项目，但**如果您将本项目或修改版部署到服务器上并通过网络提供服务，您必须无条件公开您的衍生版本全部源代码**，且同样使用 AGPL-3.0 许可证进行分发。
- **商业授权限制**：如果您需要在**不公开源代码（闭源）**的情况下对本项目进行商业化运营、二次开发或嵌入商业系统，您**必须**向原作者 `Joycai` 申请获得一份单独的、免除开源义务的**商业许可证（Commercial License）**。未经授权，禁止任何违反 AGPL-3.0 开源义务的闭源商用行为。
- **署名要求**：无论在何种授权模式下，二次开发版本均必须在关于页面或页脚清晰标注原作者 `Joycai` 及原项目 GitHub 链接：`https://github.com/Joycai/simple-trpg-chat`。
- **免责声明**：本项目按“现状”提供，作者不对使用者造成的任何直接或间接法律问题承担责任。

完整的开源协议文本请参见 [LICENSE](LICENSE) 文件。

---

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** and operates under a **Dual Licensing** model:

- **Open Source & Free (AGPL-3.0)**: This project is free and open-source for personal use. You can copy, modify, and distribute it. However, under the terms of the AGPL-3.0, **if you host this software or its modifications on a server to offer network services to users, you must make the entire source code of your modified version publicly available** under the same AGPL-3.0 license.
- **Commercial Use & Closed-Source Restriction**: If you wish to use, modify, or operate this software for commercial purposes **without complying with the AGPL-3.0 open-source obligation (i.e., closed-source)**, you **must** obtain a separate **Commercial License** from the original author `Joycai`.
- **Attribution**: In all licensing models, any derivative works must preserve and clearly display credit to the original author (`Joycai`) and the link to the original GitHub repository.
- **Disclaimer**: This software is provided "as is", and the author assumes no liability for any legal issues or damages arising from its use.

For the full open-source license terms, please refer to the [LICENSE](LICENSE) file.


