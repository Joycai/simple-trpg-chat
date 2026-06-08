#!/usr/bin/env bash
# Start PostgreSQL container for Simple TRPG Chat development
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting PostgreSQL container..."
podman compose -f "$SCRIPT_DIR/compose.yml" up -d

echo ""
echo "Waiting for PostgreSQL to be ready..."
until podman exec trpg-postgres pg_isready -U trpg -d simple_trpg_chat 2>/dev/null; do
  sleep 1
done

echo ""
echo "================================================"
echo "  PostgreSQL is ready!"
echo ""
echo "  Connection string:"
echo "  postgres://trpg:trpg_dev_pwd@localhost:5432/simple_trpg_chat"
echo ""
echo "  Stop with:"
echo "  bash docker/start-pg.sh --stop"
echo "================================================"
