# Deployment Guide — PM2 + Node.js + Caddy

This guide covers deploying **Simple TRPG Chat** in production using **PM2** as the process manager, **Node.js** as the runtime, and **Caddy** as the reverse proxy with automatic TLS.

## Architecture

```
Internet → Caddy (TLS + reverse proxy) → PM2 (cluster mode: 1 instance*) → Node.js (next start)
```

> * 由于实时消息（SSE）是基于进程内 `EventEmitter` 分发的，多进程部署会导致不同实例间无法直接共享消息事件。因此，目前 PM2 的 Node 实例上限为 **1 个**。PM2 在这里主要负责进程守护、优雅重启、日志管理。

## Prerequisites

- A server (VPS or bare metal) running Linux (Ubuntu/Debian recommended)
- Node.js 20+ installed
- Domain name pointed to your server
- Git access to the repository

---

## 1. Install Dependencies

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Clone the repo
git clone <your-repo-url> /opt/simple-trpg-chat
cd /opt/simple-trpg-chat

# Install app dependencies
npm install
```

---

## 2. Configure Environment Variables

```bash
cp .env .env.local
```

Generate and set secrets:

```bash
openssl rand -base64 32   # → paste as AUTH_SECRET
openssl rand -hex 32      # → paste as AI_ENCRYPTION_KEY
```

Edit `.env.local` with your secrets.

---

## 3. Push Database Schema & Build

```bash
# Initialize PostgreSQL database
npm run db:push

# Build the Next.js app
npm run build
```

---

## 4. Configure PM2

Create `ecosystem.config.cjs` in the project root:

```js
module.exports = {
  apps: [
    {
      name: "trpg-chat",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/opt/simple-trpg-chat",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Graceful shutdown — give Next.js time to drain connections
      kill_timeout: 5000,
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/trpg-chat/error.log",
      out_file: "/var/log/trpg-chat/out.log",
      merge_logs: true,
      // Auto-restart if memory exceeds 500MB
      max_memory_restart: "500M",
    },
  ],
};
```

Create the log directory:

```bash
sudo mkdir -p /var/log/trpg-chat
sudo chown -R $USER:$USER /var/log/trpg-chat
```

Start the app:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Set PM2 to auto-start on server reboot:

```bash
pm2 startup systemd -u $USER --hp /home/$USER
# 执行上面命令输出的那行指令
```

---

## 5. Configure Caddy

Create `/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    encode zstd gzip
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

---

## 6. PM2 Useful Commands

```bash
pm2 status                  # 查看所有进程状态
pm2 logs trpg-chat          # 实时查看日志
pm2 logs trpg-chat --lines 100  # 查看最近 100 行日志
pm2 monit                   # 监控面板（CPU、内存）
pm2 restart trpg-chat       # 重启
pm2 reload trpg-chat        # 优雅重启（零停机）
pm2 stop trpg-chat          # 停止
pm2 delete trpg-chat        # 删除进程
pm2 startup                 # 查看/配置开机自启
```

---

## 7. Updating

```bash
cd /opt/simple-trpg-chat
git pull
npm ci
npm run build
pm2 reload trpg-chat         # 优雅重启，仅切实例，无停机
```

---

## 8. Database Backup

```bash
# Add to crontab: daily PostgreSQL database backup at 4:00 AM
0 4 * * * pg_dump -U username database_name | gzip > /opt/simple-trpg-chat/backups/db-$(date +\%Y\%m\%d).sql.gz && find /opt/simple-trpg-chat/backups -name "*.sql.gz" -mtime +30 -delete
```

---

## Architecture Highlights

| 组件 | 选型理由 |
|------|----------|
| **PM2** | 进程守护 + 优雅重启 + 日志轮转 + 启动自启。比 systemd 更懂 Node.js 生态 |
| **cluster: 1** | 单进程限制：由于进程内 EventEmitter 限制，1 个实例是上限。如需分布式部署需配合 Redis/PubSub 适配器。 |
| **Caddy** | 自动 TLS（Let's Encrypt），配置简单，一条 `reverse_proxy` 搞定 |
| **fork mode** | 不能用 cluster mode（多进程），所以用 fork 模式以防跨进程消息丢失。 |

## 补充：多核/多机架构

如果未来需要扩容，流程是：

```
1. 进程内 EventEmitter → Redis Pub/Sub 消息适配器
2. 本地文件 → S3/MinIO
3. Session 内存 → Redis
4. PM2 instance 开多核
5. 或多台机器 + Load Balancer
```

到那一步之前，当前这套 PM2 + Caddy 架构完全够用。

---

## Health Check

```bash
# Verify app
curl -I http://localhost:3000
# Should return 200 or 302

# Verify Caddy + TLS
curl -I https://your-domain.com
# Should return 200 or 302 with proper TLS

# Verify PM2
pm2 status
# Should show "online" with status "online"
```
