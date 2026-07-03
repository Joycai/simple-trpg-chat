# Simple TRPG Chat — 分步部署指南（Windows / Linux）

本指南面向**首次部署**的用户，按平台拆分、逐步说明如何在 **Windows** 与 **Linux** 上把 Simple TRPG Chat 跑起来。

- 想要**最快跑通**：直接看 [路线 A — 一键脚本](#路线-a--一键脚本部署推荐)。
- 想**了解每一步细节**或脚本无法运行：看 [路线 B — 手动分步](#路线-b--手动分步部署)。
- 生产环境（域名 + HTTPS + 守护进程）：看 [第 6 步](#第-6-步启动服务) 和 [生产环境部署](#生产环境部署pm2--caddy)，进阶配置见根目录 [`Deployment.md`](../../Deployment.md)。

> 术语：**主持人/KP** 与 **玩家** 是应用内角色；**管理员(admin)** 通过 `/admin` 后台管理站点。本指南部署的是整套服务端。

---

## 0. 环境要求

| 组件 | 版本 | 说明 |
|------|------|------|
| **Node.js** | **≥ 20** | 运行时 |
| **pnpm** | **≥ 10** | 包管理器（推荐用 `corepack` 启用，见下） |
| **PostgreSQL** | **16**（≥ 15 亦可） | 数据库；本地可用 Docker / Podman 一键起 |
| **Git** | 任意 | 拉取源码 |
| 操作系统 | Windows 10/11 · Linux（Ubuntu/Debian 等） | — |

项目通过 `packageManager: pnpm@10.0.0` 锁定 pnpm 版本，**强烈建议用 corepack 而不是全局安装 pnpm**，以避免版本不一致。

---

## 1. 安装前置环境

### 🐧 Linux（Ubuntu / Debian）

```bash
# 1) Node.js 20 LTS（NodeSource 源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2) 用 corepack 启用 pnpm（Node 自带 corepack）
sudo corepack enable
corepack prepare pnpm@10 --activate

# 3) 校验
node -v      # 应 >= v20
pnpm -v      # 应 >= 10
```

> 其他发行版：用各自包管理器装 Node ≥ 20 与 git 即可，pnpm 一律用 `corepack enable` 启用。

### 🪟 Windows 10 / 11（PowerShell）

1. **Node.js**：到 <https://nodejs.org> 下载 **LTS（≥ 20）** 安装包，一路默认安装。
2. **Git**：安装 [Git for Windows](https://git-scm.com/download/win)。
3. 打开 **PowerShell**（无需管理员），启用 pnpm：
   ```powershell
   corepack enable
   corepack prepare pnpm@10 --activate
   ```
   > 若 `corepack` 报权限错误，用**管理员身份**打开 PowerShell 再执行，或退而使用 `npm install -g pnpm@10`。
4. 校验：
   ```powershell
   node -v      # 应 >= v20
   pnpm -v      # 应 >= 10
   ```

---

## 2. 获取源码

### 🐧 Linux
```bash
git clone <仓库地址> simple-trpg-chat
cd simple-trpg-chat
```

### 🪟 Windows（PowerShell）
```powershell
git clone <仓库地址> simple-trpg-chat
cd simple-trpg-chat
```

---

## 3. 准备 PostgreSQL 数据库

应用需要一个可连接的 PostgreSQL 实例。三选一，任选其一即可，最后你需要拿到一条**连接串**：

```
postgres://用户名:密码@主机:5432/数据库名
```

### 方式 A — 容器一键启动（推荐，Docker 或 Podman）

项目在 `docker/compose.yml` 提供了现成的 PostgreSQL 16 服务，默认凭据：
用户 `trpg` / 密码 `trpg_dev_pwd` / 库 `simple_trpg_chat` / 端口 `5432`。

**🐧 Linux**
```bash
# Docker
docker compose -f docker/compose.yml up -d
# 或 Podman
podman compose -f docker/compose.yml up -d

# 项目还提供了封装脚本（自动等待就绪，使用 Podman）：
bash docker/start-pg.sh          # 启动
bash docker/start-pg.sh --stop   # 停止
```

**🪟 Windows（PowerShell，需已安装 Docker Desktop 或 Podman Desktop）**
```powershell
# Docker Desktop
docker compose -f docker/compose.yml up -d

# 或 Podman（若 podman 不在 PATH，用绝对路径 + & 调用）
& "$env:LOCALAPPDATA\Programs\Podman\podman.exe" compose -f docker/compose.yml up -d
```

启动后连接串为：
```
postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat
```

### 方式 B — 本机原生安装 PostgreSQL

- **Linux**：`sudo apt-get install -y postgresql`，然后用 `sudo -u postgres psql` 创建库和用户。
- **Windows**：下载 [PostgreSQL 官方安装包](https://www.postgresql.org/download/windows/)，安装时记住超级用户密码，用自带的 **pgAdmin** 或 `psql` 建库。

创建数据库（示例）：
```sql
CREATE USER trpg WITH PASSWORD 'trpg_dev_pwd';
CREATE DATABASE simple_trpg_chat OWNER trpg;
```

### 方式 C — 使用云数据库

直接使用云厂商（如 Supabase、Neon、RDS 等）提供的连接串，跳过本地安装。注意云库通常要求 `sslmode=require`，把它加到连接串末尾即可。

> ✅ 完成本步后，请确认你手上有一条**能连通**的 PostgreSQL 连接串，下一步会用到。

---

## 路线 A — 一键脚本部署（推荐）

脚本会自动：检查 Node/pnpm → 询问数据库连接串 → 生成 `.env`（随机 `AUTH_SECRET`，可选 AI 密钥）→ `pnpm install` → 测试连库并写入 `db.config.json` → 推送数据库表结构 → 可选创建初始管理员。

### 🐧 Linux
```bash
chmod +x setup.sh
./setup.sh
```

### 🪟 Windows
- **双击** 根目录的 `setup.bat`（内部会以 Bypass 策略调起 `setup.ps1`）；
- 或在 PowerShell 中执行：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
  ```

### 脚本交互会问你

1. **是否重新配置数据库**（若已存在 `db.config.json`）。
2. **PostgreSQL 连接串** —— 填第 3 步拿到的那条。
3. **是否启用 AI 机器人功能** —— 选 `y` 会自动生成 `AI_ENCRYPTION_KEY` 与 `AI_ENCRYPTION_SALT`；不用 AI 就选 `n`。
4. **是否创建初始管理员账号** —— 选 `y` 会创建 `admin / admin123`。

脚本结束后，跳到 [第 6 步：启动服务](#第-6-步启动服务)。

---

## 路线 B — 手动分步部署

不使用脚本时，按下面 5 步手动完成。命令在 Linux 与 Windows PowerShell 下几乎一致，差异处已分别标注。

### 第 1 步：安装依赖
```bash
pnpm install
```

### 第 2 步：创建环境变量文件 `.env`

从模板复制：

**🐧 Linux**
```bash
cp .env.example .env
```
**🪟 Windows（PowerShell）**
```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`，至少填好这两项：

```env
# 必填：会话/JWT 加密密钥
AUTH_SECRET="<强随机串>"
# 必填（生产环境尤为重要）：对外访问根地址
AUTH_URL="http://localhost:3000"

# 可选：仅启用 AI 机器人时需要
# AI_ENCRYPTION_KEY="<强随机串>"
# AI_ENCRYPTION_SALT="<强随机串>"   # 生产环境启用 AI 时必填
```

生成随机密钥：

**🐧 Linux**
```bash
openssl rand -hex 32
```
**🪟 Windows（无 openssl 时用 Node）**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 第 3 步：创建数据库配置 `db.config.json`

在项目根目录创建 `db.config.json`（可参考 `db.config.example.json`）：
```json
{
  "type": "postgresql",
  "url": "postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat"
}
```
> `db.config.json` 是应用与 drizzle-kit 读取数据库连接的**首选来源**；命令行迁移也支持用 `DATABASE_URL` 环境变量覆盖。

### 第 4 步：推送数据库表结构

**🐧 Linux**
```bash
DATABASE_URL="postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat" pnpm db:push:pg
```
**🪟 Windows（PowerShell）**
```powershell
$env:DATABASE_URL="postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat"
pnpm db:push:pg
Remove-Item Env:\DATABASE_URL
```
> 也可以直接 `pnpm db:push:pg`，它会回落读取 `db.config.json`。

### 第 5 步：创建初始管理员（种子数据，可选）
```bash
pnpm db:seed
```
将创建管理员账号 **`admin` / `admin123`**。

---

## 第 6 步：启动服务

### 开发模式（带热重载，适合本地调试）
```bash
pnpm dev
```
访问 <http://localhost:3000>。

### 生产模式
```bash
pnpm build     # 编译生产包
pnpm start     # 启动生产服务器（默认 3000 端口）
```

> 生产模式下务必把 `.env` 里的 `AUTH_URL` 设为**真实对外地址**（如 `https://trpg.example.com`），否则登录会被重定向到 `localhost` 而失败。

---

## 第 7 步：首次登录

1. 浏览器打开站点地址。
2. 用初始管理员登录：**`admin` / `admin123`**。
3. 进入 `/admin` 后台，**立即修改初始密码或另建管理员账号**，并按需在 `/admin/config`、`/admin/ai` 配置站点标题、主题、AI 提供商等。

---

## 生产环境部署（PM2 + Caddy）

面向公网、需域名与 HTTPS 时，推荐用进程守护 + 反向代理。**仅 Linux 服务器场景**，完整示例见根目录 [`Deployment.md`](../../Deployment.md)。要点：

### ⚠️ 单实例限制
实时消息（SSE）依赖进程内 `EventEmitter`（`src/lib/events.ts`）分发，**不能横向多进程/多实例**，否则不同进程的用户收不到彼此消息。PM2 请以 **1 个 Node 实例**运行，仅用于守护与优雅重启；多机部署需自行改造为 Redis Pub/Sub 等外部消息总线。

### ⚠️ 反向代理必须关闭 SSE 缓冲
Nginx：
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;   # 关键：禁用缓冲，保证 SSE 实时推送
    proxy_cache off;
}
```
Caddy：
```caddy
trpg.example.com {
    reverse_proxy 127.0.0.1:3000 {
        header_up -Accept-Encoding   # 关键：禁用压缩/缓冲
    }
}
```

### 数据库备份
```bash
pg_dump -U trpg -d simple_trpg_chat -F c -b -v -f /backups/trpg_$(date +%Y%m%d_%H%M%S).backup
```

---

## 环境变量参考

| 变量 | 必填 | 说明 |
|------|:---:|------|
| `AUTH_SECRET` | ✅ | 会话 / JWT 加密密钥 |
| `AUTH_URL` | ✅（生产） | 对外访问根地址；反向代理后必须填对，否则重定向到 localhost |
| `AI_ENCRYPTION_KEY` | ❌ | AI 提供商 API Key 的 AES-256-GCM 加密密钥；开发环境缺省回落 `dev-secret-key` |
| `AI_ENCRYPTION_SALT` | ❌（生产启用 AI 时 ✅） | AI 密钥派生盐值，增强生产安全性 |
| `DATABASE_URL` | ❌ | drizzle-kit 迁移时的连接串，优先级高于 `db.config.json` |

---

## 常见问题与排查

**一键体检工具**：任何时候都可以运行诊断，检查环境变量 / 数据库配置 / 连接，并可选一键推送表结构：
```bash
pnpm db:doctor
```

| 症状 | 排查 |
|------|------|
| `pnpm: command not found` / 版本过低 | 用 `corepack enable && corepack prepare pnpm@10 --activate` 重新启用 |
| 数据库连接失败 | 确认 PostgreSQL 已启动（容器：`docker ps`）、连接串的用户名/密码/端口/库名正确、云库是否需 `?sslmode=require` |
| 登录后被踢回 `localhost` | 生产环境 `.env` 的 `AUTH_URL` 未设为真实域名 |
| 页面能开但消息不实时刷新 | 反向代理未关闭缓冲（`proxy_buffering off` / Caddy `header_up -Accept-Encoding`） |
| Windows 下 `setup.ps1` 无法执行 | 用 `powershell -ExecutionPolicy Bypass -File .\setup.ps1`，或先 `Set-ExecutionPolicy Bypass -Scope Process` |
| AI 功能报加密相关错误 | 检查 `.env` 是否配置了 `AI_ENCRYPTION_KEY`（生产还需 `AI_ENCRYPTION_SALT`） |
| 表结构与代码不一致 | 运行 `pnpm db:push:pg`（或 `pnpm db:doctor` 选择推送）同步最新 schema |

---

## 相关文档

- [部署指南（参考版）](deployment.md) — 更精简的部署参考。
- [生产部署 PM2 + Caddy](../../Deployment.md) — 生产环境完整流程。
- [用户手册](user-guide.md) · [管理员指南](admin-guide.md)
- [架构文档](../arch/) — 数据库、实时消息、AI、后台等系统说明。
