#!/usr/bin/env bash
set -euo pipefail

echo "================================================"
echo "  Simple TRPG Chat — Project Setup (pnpm)"
echo "================================================"
echo ""

# 1. Ensure pnpm is available
if ! command -v pnpm &> /dev/null; then
  echo "[!] pnpm not found. Installing via corepack..."
  corepack enable && corepack prepare pnpm@latest --activate
fi

# 2. Environment variables
if [ ! -f .env ]; then
  echo "[1/3] Creating .env from .env.example..."
  cp .env.example .env

  if command -v openssl &> /dev/null; then
    SECRET=$(openssl rand -hex 32)
    echo "[✓] Generated AUTH_SECRET"
  else
    SECRET="dev-secret-change-me-$(date +%s)"
    echo "[!] openssl not found, using placeholder AUTH_SECRET"
  fi

  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^AUTH_SECRET=$|AUTH_SECRET=$SECRET|" .env
  else
    sed -i "s|^AUTH_SECRET=$|AUTH_SECRET=$SECRET|" .env
  fi
else
  echo "[1/3] .env already exists — skipping"
fi

# 3. Install dependencies
echo "[2/3] Installing dependencies..."
pnpm install

# 4. Push database schema
echo "[3/3] Pushing database schema..."
pnpm db:push

echo ""
echo "================================================"
echo "  Setup complete! Start dev server:"
echo "  pnpm dev"
echo "================================================"
