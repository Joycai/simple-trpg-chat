#!/usr/bin/env bash
set -euo pipefail

echo "================================================"
echo "  Simple TRPG Chat — Project Setup (pnpm)"
echo "================================================"
echo ""

# -----------------------------------------------------------
# Helper: prompt user for Y/n
# -----------------------------------------------------------
ask_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local answer
  if [ "$default" = "y" ]; then
    printf "%s [Y/n]: " "$prompt"
  else
    printf "%s [y/N]: " "$prompt"
  fi
  read -r answer
  answer="${answer:-$default}"
  case "$answer" in
    [Yy]*) return 0 ;;
    *)     return 1 ;;
  esac
}

# -----------------------------------------------------------
# Helper: generate a hex secret
# -----------------------------------------------------------
gen_secret() {
  if command -v openssl &> /dev/null; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

# -----------------------------------------------------------
# Helper: set or replace a key in .env
# Handles commented lines (^# KEY=), active lines (^KEY=),
# and missing lines (appends).
# -----------------------------------------------------------
set_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^# ${key}=" .env 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^# ${key}=.*|${key}=${value}|" .env
    else
      sed -i "s|^# ${key}=.*|${key}=${value}|" .env
    fi
  elif grep -q "^${key}=" .env 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    else
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    fi
  else
    echo "${key}=${value}" >> .env
  fi
}

# -----------------------------------------------------------
# 1. Check prerequisites
# -----------------------------------------------------------
echo "--- Checking environment ---"

if ! command -v pnpm &> /dev/null; then
  echo "[!] pnpm not found. Installing via corepack..."
  corepack enable && corepack prepare pnpm@latest --activate
  echo "[✓] pnpm installed"
else
  echo "[✓] pnpm $(pnpm --version)"
fi

if ! command -v node &> /dev/null; then
  echo "[✗] Node.js is required but not found. Please install Node.js >= 18."
  exit 1
fi
echo "[✓] Node $(node --version)"

echo ""

# -----------------------------------------------------------
# 2. Collect PG_URL (only if DB not already configured)
# -----------------------------------------------------------
echo "================================================"
echo "  Step 1 — Database Configuration"
echo "================================================"
echo ""

PG_URL=""
DB_SKIP=false

if [ -f db.config.json ]; then
  EXISTING_TYPE=$(grep -o '"type": *"[^"]*"' db.config.json 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  echo "[✓] 检测到已有数据库配置 (类型: ${EXISTING_TYPE:-unknown})："
  echo "    $(cat db.config.json)"
  echo ""
  if ask_yn "是否重新配置数据库？" "n"; then
    echo "[→] 将重新配置数据库"
  else
    echo "[✓] 保留现有数据库配置"
    DB_SKIP=true
  fi
  echo ""
fi

if [ "$DB_SKIP" = false ]; then
  echo "--- PostgreSQL Configuration ---"
  echo "Connection string format: postgres://user:password@host:5432/dbname"
  echo ""
  echo "  Tip: Use Docker to run PostgreSQL locally:"
  echo "  docker run -d --name trpg-pg -e POSTGRES_USER=trpg -e POSTGRES_PASSWORD=trpg_dev_pwd -e POSTGRES_DB=simple_trpg_chat -p 5432:5432 postgres:16"
  echo ""
  printf "PostgreSQL connection URL: "
  read -r PG_URL

  if [ -z "$PG_URL" ]; then
    echo "[✗] PostgreSQL connection URL is required."
    exit 1
  fi
fi

# -----------------------------------------------------------
# 3. Generate .env  (always runs, DB_SKIP or not)
# -----------------------------------------------------------
echo ""
echo "================================================"
echo "  Step 2 — Environment Variables"
echo "================================================"
echo ""

if [ ! -f .env ]; then
  echo "[✓] Creating .env from .env.example..."
  cp .env.example .env
else
  echo "[✓] .env already exists"
fi

# --- AUTH_SECRET (always regenerate) ---
AUTH_SECRET=$(gen_secret)
set_env_var "AUTH_SECRET" "$AUTH_SECRET"
echo "[✓] AUTH_SECRET generated"

# --- AUTH_URL ---
if ! grep -q "^AUTH_URL=" .env 2>/dev/null; then
  echo "AUTH_URL=${AUTH_URL:-http://localhost:3000}" >> .env
  echo "[✓] AUTH_URL set"
else
  echo "[✓] AUTH_URL already set"
fi

# --- AI_ENCRYPTION_KEY & AI_ENCRYPTION_SALT (optional) ---
echo ""
if ask_yn "Enable AI bot features?" "n"; then
  AI_KEY=$(gen_secret)
  AI_SALT=$(gen_secret)
  set_env_var "AI_ENCRYPTION_KEY" "$AI_KEY"
  set_env_var "AI_ENCRYPTION_SALT" "$AI_SALT"
  echo "[✓] AI_ENCRYPTION_KEY & AI_ENCRYPTION_SALT generated"
else
  echo "[✓] AI features disabled — skipping AI encryption keys"
fi

# -----------------------------------------------------------
# 4. Install dependencies  (always runs)
# -----------------------------------------------------------
echo ""
echo "================================================"
echo "  Step 3 — Installing Dependencies"
echo "================================================"
echo ""
pnpm install

# -----------------------------------------------------------
# 5. Test DB connection & push schema (only if not skipping)
# -----------------------------------------------------------
if [ "$DB_SKIP" = false ]; then
  echo ""
  echo "================================================"
  echo "  Step 4 — Database Initialization"
  echo "================================================"
  echo ""

  echo "Testing PostgreSQL connection..."
  if node -e "
    async function test() {
      const postgres = require('postgres');
      const sql = postgres('$PG_URL', { max: 1, connect_timeout: 10, idle_timeout: 5 });
      await sql\`SELECT 1\`;
      await sql.end({ timeout: 3 });
      console.log('OK');
    }
    test().catch(e => { console.error(e.message); process.exit(1); });
  " 2>/dev/null; then
    echo "[✓] PostgreSQL connection successful"
    cat > db.config.json << JSONEOF
{
  "type": "postgresql",
  "url": "$PG_URL"
}
JSONEOF
    echo "[✓] db.config.json created"
    echo ""
    echo "Pushing PostgreSQL schema..."
    DATABASE_URL="$PG_URL" pnpm db:push:pg
    echo "[✓] PostgreSQL schema pushed"
    echo ""
  else
    echo "[✗] PostgreSQL connection failed"
    exit 1
  fi
fi

# -----------------------------------------------------------
# 6. Seed database (optional)
# -----------------------------------------------------------
echo ""
if ask_yn "Seed database with default admin user (admin / admin123)?" "n"; then
  pnpm db:seed
  echo "[✓] Database seeded"
else
  echo "[✓] Skipping seed"
fi

# -----------------------------------------------------------
# Done
# -----------------------------------------------------------
echo ""
echo "================================================"
echo "  Setup complete!"
echo ""
echo "  Start the dev server:   pnpm dev"
echo "  Or build for production: pnpm build && pnpm start"
echo "================================================"
