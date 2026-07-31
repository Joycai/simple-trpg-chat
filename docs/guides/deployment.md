# Simple TRPG Chat — 部署指南

**Version**: 0.17.0 | **Last Updated**: 2026-07-31

---

## 环境要求

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | >= 20.x | 运行环境 |
| **pnpm** | >= 10.x | 包管理器（推荐 `corepack enable pnpm`） |
| **PostgreSQL** | >= 15.x | 数据库（本地开发可用 Docker/Podman 起服务） |
| **操作系统** | macOS / Linux / Windows | — |

---

## 快速一键部署

项目提供了一键交互式配置脚本，在首次部署或本地运行时，推荐优先使用脚本。

### 1. 克隆仓库与准备
```bash
git clone <repository-url>
cd simple-trpg-chat
```

### 2. 运行初始化脚本
- **macOS / Linux**:
  ```bash
  chmod +x setup.sh
  ./setup.sh
  ```
- **Windows** (PowerShell):
  ```powershell
  Set-ExecutionPolicy Bypass -Scope Process
  ./setup.ps1
  ```

**该脚本将自动完成以下操作：**
1. 检查 Node.js 和 pnpm 环境。
2. 自动根据模板生成 `.env` 配置文件，并填充高强度随机的 `AUTH_SECRET` 密钥（用于 Session 加密）。
3. 提示是否开启 AI Bot 功能。如果开启，会自动生成加密 API Key 所用的 `AI_ENCRYPTION_KEY`。
4. 安装项目全部依赖 (`pnpm install`)。
5. 提示输入 PostgreSQL 的连接字符串并进行连接测试，测试通过后写入 `db.config.json`。
6. 向 PostgreSQL 推送最新的数据库 Schema。
7. 询问是否创建初始管理员账号 (`admin` / `admin123`)。

### 3. 构建并启动服务
配置完成后，只需两步即可将项目构建并启动于生产环境：
```bash
# 1. 编译生产优化包
pnpm run build

# 2. 启动 Next.js 生产服务器
pnpm start
```
默认服务将运行在 `http://localhost:3000`。

---

## 手动配置指引 (备用)

如果不使用 `setup` 一键脚本，也可以手动配置环境。

### 1. 配置环境变量 `.env`
复制根目录下 `.env.example` 为 `.env`。必须包含：
```env
AUTH_SECRET="<使用 openssl rand -base64 32 生成的强随机密匙>"
AUTH_URL="http://localhost:3000"

# 如果需要开启 AI 机器人功能：
AI_ENCRYPTION_KEY="<使用 openssl rand -hex 32 生成的加密密匙>"
```

### 2. 创建数据库配置文件 `db.config.json`
在项目根目录创建 `db.config.json`，格式如下：
```json
{
  "type": "postgresql",
  "url": "postgres://user:password@host:5432/simple_trpg_chat"
}
```

### 3. 安装依赖与迁移数据库
```bash
# 安装依赖
pnpm install

# 推送 Schema 结构到 PostgreSQL
pnpm db:push:pg

# 创建初始管理员账号种子数据
pnpm db:seed
```

---

## 本地开发调试

### 1. 使用 Podman/Docker 启动本地数据库
项目在 `docker` 目录提供了一个针对 PostgreSQL 的快速容器脚本：
```bash
# 启动本地 PostgreSQL 容器 (使用 Alpine-16 镜像)
bash docker/start-pg.sh

# 停止容器
bash docker/start-pg.sh --stop
```
启动成功后，将输出默认连接串：`postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat`。

### 2. 启动 Next.js 热重载开发服务器
```bash
pnpm dev
```

---

## 环境变量参考

| 变量 | 是否必填 | 说明 |
|------|:------:|------|
| `AUTH_SECRET` | ✅ | Auth.js session 和 JWT 加密密钥 |
| `AUTH_URL` | ✅ | 部署服务的外部访问根路径（反向代理必须填写正确，否则会导致重定向到 localhost） |
| `AI_ENCRYPTION_KEY` | ❌ | 用于加密存储在数据库中 AI 提供商 API Key 的密钥。未配置则无法使用 AI 模块 |
| `DATABASE_URL` | ❌ | Drizzle-kit CLI 迁移时使用的 fallback 数据库连接串（优先读取 `db.config.json`） |
| `CHAT_IMAGE_DIR` | ❌ | 聊天图片缓存目录（默认 `<cwd>/cache/chat-images`，可清理） |
| `ROOM_BACKGROUND_DIR` | ❌ | 房间背景图目录（默认 `<cwd>/cache/room-backgrounds`）。⚠️ 背景图为主持人备团素材，**不是**可随意清理的缓存，请勿与聊天图片一并清空 |

---

## 生产环境运维注意事项

### 1. SSE 实时事件的反向代理配置
项目内部的消息流、Bot 思考提示和在线统计使用 **Server-Sent Events (SSE)** 实现。当部署在 Nginx、Caddy 等反向代理之后时，**必须禁用响应缓冲（Response Buffering）**，否则客户端无法实时接收推送。

#### Nginx 配置示例：
```nginx
server {
    listen 443 ssl http2;
    server_name trpg.example.com;

    # ⚠️ 必须：房间背景图上传最大 5MB（Nginx 默认 1MB 会直接 413 拒绝）。
    # 留 1MB 余量给 multipart 报文开销。
    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        # ⚠️ 必须：禁用代理缓冲区以支持 SSE 实时长连接
        proxy_buffering off;
        proxy_cache off;
    }
}
```

#### Caddy 配置示例：
```caddy
trpg.example.com {
    reverse_proxy 127.0.0.1:3000 {
        # 禁用压缩和缓冲以确保 SSE 事件流即时刷新
        header_up -Accept-Encoding
    }
}
```

> Caddy v2 默认**不限制**请求体大小，背景图上传（≤5MB）开箱即用。
> 若你的站点显式配置过 `request_body { max_size ... }`，请确保其不低于 `6MB`。

### 2. 数据库备份
PostgreSQL 数据存放在数据库服务中。生产环境应配置定时任务，使用工具定期执行热备份：
```bash
pg_dump -U <username> -d simple_trpg_chat -F c -b -v -f /backups/trpg_db_$(date +%Y%m%d_%H%M%S).backup
```

### 3. 多实例集群部署限制
目前项目中的 SSE 实时消息通知采用进程内 `EventEmitter`（位于 `src/lib/events.ts`）进行跨连接分发。
- **单实例部署**：开箱即用，支持多客户端即时通信。
- **多实例集群部署（如 K8s 副本、多主机负载均衡）**：需要将 `src/lib/events.ts` 改为使用外部集中式发布/订阅服务（例如 Redis Pub/Sub），否则在不同机器实例上的用户将无法互通消息。
