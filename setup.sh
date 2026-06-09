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
# 2. Database setup
# -----------------------------------------------------------
echo "================================================"
echo "  Step 1 — Database Configuration"
echo "================================================"
echo ""
echo "  [1] SQLite (zero-config, local file)"
echo "  [2] PostgreSQL (external, production-ready)"
echo ""

DB_TYPE="sqlite"
while true; do
  printf "Select database type [1/2] (default: 1): "
  read -r choice
  choice="${choice:-1}"
  case "$choice" in
    1) DB_TYPE="sqlite"; break ;;
    2) DB_TYPE="postgresql"; break ;;
    *) echo "Please enter 1 or 2." ;;
  esac
done

echo ""

if [ "$DB_TYPE" = "postgresql" ]; then
  echo "--- PostgreSQL Configuration ---"
  echo "Connection string format: postgres://user:password@host:5432/dbname"
  echo ""
  printf "PostgreSQL connection URL: "
  read -r PG_URL

  if [ -z "$PG_URL" ]; then
    echo "[!] Empty URL — falling back to SQLite."
    DB_TYPE="sqlite"
  fi
fi

# -----------------------------------------------------------
# 3. Generate .env
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

# --- AUTH_SECRET (always generate) ---
AUTH_SECRET=$(gen_secret)
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" .env
else
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" .env
fi
echo "[✓] AUTH_SECRET generated"

# --- AUTH_URL (always set for production compatibility) ---
if ! grep -q "^AUTH_URL=" .env 2>/dev/null; then
  echo "AUTH_URL=${AUTH_URL:-http://localhost:3000}" >> .env
  echo "[✓] AUTH_URL set"
else
  echo "[✓] AUTH_URL already set"
fi

# --- AI_ENCRYPTION_KEY (optional) ---
echo ""
if ask_yn "Enable AI bot features?" "n"; then
  AI_KEY=$(gen_secret)
  if grep -q "^# AI_ENCRYPTION_KEY=" .env 2>/dev/null; then
    # Uncomment and set value
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^# AI_ENCRYPTION_KEY=.*|AI_ENCRYPTION_KEY=$AI_KEY|" .env
    else
      sed -i "s|^# AI_ENCRYPTION_KEY=.*|AI_ENCRYPTION_KEY=$AI_KEY|" .env
    fi
    echo "[✓] AI_ENCRYPTION_KEY generated"
  elif ! grep -q "^AI_ENCRYPTION_KEY=" .env 2>/dev/null; then
    echo "AI_ENCRYPTION_KEY=$AI_KEY" >> .env
    echo "[✓] AI_ENCRYPTION_KEY generated"
  else
    echo "[✓] AI_ENCRYPTION_KEY already set, keeping existing value"
  fi
else
  echo "[✓] AI features disabled — skipping AI_ENCRYPTION_KEY"
fi

# -----------------------------------------------------------
# 4. Install dependencies
# -----------------------------------------------------------
echo ""
echo "================================================"
echo "  Step 3 — Installing Dependencies"
echo "================================================"
echo ""
pnpm install

# -----------------------------------------------------------
# 5. Create db.config.json & test connection
# -----------------------------------------------------------
echo ""
echo "================================================"
echo "  Step 4 — Database Initialization"
echo "================================================"
echo ""

if [ "$DB_TYPE" = "postgresql" ]; then
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
    echo "[✗] PostgreSQL connection failed — falling back to SQLite"
    DB_TYPE="sqlite"
  fi
fi

if [ "$DB_TYPE" = "sqlite" ]; then
  # Ensure no stale PostgreSQL config
  rm -f db.config.json
  echo "Pushing SQLite schema..."
  pnpm db:push
  echo "[✓] SQLite database ready"
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
