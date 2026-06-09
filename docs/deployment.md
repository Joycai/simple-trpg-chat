# Simple TRPG Chat — 部署指南

**Version**: 0.1.0 | **Last Updated**: 2026-05-31

---

## 环境要求

| 环境 | 版本要求 |
|------|---------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| 操作系统 | macOS / Linux / Windows |

## 快速部署

### 1. 克隆仓库

```bash
git clone <repository-url>
cd simple-trpg-chat
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

项目根目录有一个 `.env` 文件，内容如下：

```env
AUTH_SECRET=<your-random-secret>
```

`AUTH_SECRET` 用于加密登录 session。生产环境部署时请替换为随机生成的字符串：

```bash
# 生成强随机 AUTH_SECRET
openssl rand -base64 32
```

### 4. 初始化数据库

```bash
# 推送 schema 到 SQLite
npm run db:push

# 创建初始管理员账号
npm run db:seed
```

这将创建：
- 数据库文件 `sqlite.db`
- 初始管理员账号：`admin` / `admin123`

### 5. 构建并启动

```bash
# 生产构建
npm run build

# 启动生产服务器
npm start
```

访问 `http://localhost:3000` 即可使用。

---

## 本地开发

```bash
# 启动开发服务器（热更新）
npm run dev

# 或使用 Drizzle Studio 查看数据库
npm run db:studio
```

---

## Docker 部署

### 方案一：使用 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:push
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
COPY --from=build /app/package*.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/sqlite.db ./sqlite.db
# 构建时种子数据可能为空，生产环境需首次启动时 seed
COPY --from=build /app/src/db ./src/db
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node_modules/.bin/next", "start"]
```

#### 构建镜像

```bash
docker build -t simple-trpg-chat .
```

#### 运行容器

```bash
# 使用文件映射持久化数据库
docker run -d \
  --name simple-trpg-chat \
  -p 3000:3000 \
  -e AUTH_SECRET="<your-secret>" \
  -v $(pwd)/data:/app \
  simple-trpg-chat
```

### 方案二：使用 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: "3.9"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - AUTH_SECRET=${AUTH_SECRET}
      - NODE_ENV=production
    volumes:
      - trpg-data:/app/data
    restart: unless-stopped

volumes:
  trpg-data:
```

#### 启动

```bash
# 生成 AUTH_SECRET 并写入 .env
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env

# 启动
docker compose up -d
```

> ⚠️ 首次启动后，需要进入容器执行 `npm run db:seed` 创建管理员账号：
> ```bash
> docker compose exec app npm run db:seed
> ```

---

## SQLite 备份与迁移

### 备份数据库

```bash
# 生产环境
cp sqlite.db sqlite.db.backup.$(date +%Y%m%d)

# Docker 环境
docker cp simple-trpg-chat:/app/sqlite.db ./backup/
```

### 恢复数据库

```bash
# 停止服务，替换 sqlite.db 文件，重启服务即可
```

### 从 SQLite 迁移到 PostgreSQL

本项目使用 Drizzle ORM 作为数据库抽象层，迁移到 PostgreSQL 只需：

1. 安装 `postgres-js` 驱动
2. 修改 `src/db/index.ts` 中的数据库连接
3. 使用 Drizzle 的迁移工具迁移 schema

```ts
// PostgreSQL 连接示例
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

---

## 环境变量参考

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `AUTH_SECRET` | ✅ | NextAuth.js session 加密密钥 | — |
| `DATABASE_URL` | ❌ | 数据库连接（默认使用 `sqlite.db`） | `sqlite.db` |
| `NODE_ENV` | ❌ | 运行环境 | `production` |

---

## 生产环境注意事项

1. **反向代理**：建议使用 Nginx 或 Caddy 作为反向代理，启用 HTTP/2 以优化 SSE 连接
2. **数据库持久化**：SQLite 文件（`sqlite.db`）包含所有数据，务必定期备份
3. **多实例部署**：本项目默认使用内存 EventEmitter 做 SSE 广播。如需多实例部署，需改用 Redis 等外部发布/订阅系统替换 `src/lib/events.ts` 中的 EventEmitter
4. **日志**：生产环境建议配置日志轮转，监控服务状态

### 反向代理下的 Auth.js 配置

使用反向代理时（Nginx/Caddy），必须在 `.env` 中将 `AUTH_URL` 设置为外部可访问的域名，否则登录后会跳转到 `localhost:3000`：

```env
# ❌ 错误：反向代理后用户会被跳转到 localhost
AUTH_URL=http://localhost:3000

# ✅ 正确：设为外部域名
AUTH_URL=https://trpg.yourdomain.com
```

如果仅用于本地测试，也可在 `.env` 中删除 `AUTH_URL`，框架会自动从请求头中提取 host（需已配置 `trustHost`）。

### Caddy 反向代理配置示例

```caddy
trpg.yourdomain.com {
    reverse_proxy 127.0.0.1:3000 {
        # SSE 需要禁用缓冲
        header_up -Accept-Encoding
    }
}
```

### Nginx 反向代理配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name trpg.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE 需要禁用缓冲
        proxy_buffering off;
        proxy_cache off;
    }
}
```
