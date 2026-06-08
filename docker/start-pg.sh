#!/usr/bin/env bash
# Start PostgreSQL container for Simple TRPG Chat development
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Find podman
PODMAN="podman"
if ! command -v podman &> /dev/null; then
  if [ -x "/opt/podman/bin/podman" ]; then
    PODMAN="/opt/podman/bin/podman"
  else
    echo "[✗] Podman not found. Please install Podman or make sure it is in your PATH."
    exit 1
  fi
fi

CONTAINER_NAME="trpg-postgres"
DB_USER="trpg"
DB_PASSWORD="trpg_dev_pwd"
DB_NAME="simple_trpg_chat"
DB_PORT="5432"

# Check if podman-compose/docker-compose provider is available
has_compose_provider() {
  "$PODMAN" compose version &>/dev/null
}

status() {
  "$PODMAN" inspect --format '{{.State.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not-found"
}

stop_container() {
  echo "Stopping PostgreSQL container..."
  if has_compose_provider; then
    "$PODMAN" compose -f "$SCRIPT_DIR/compose.yml" down
  else
    local state
    state=$(status)
    if [ "$state" = "running" ]; then
      "$PODMAN" stop "$CONTAINER_NAME"
      echo "[✓] Container stopped."
    fi
    if [ "$state" != "not-found" ]; then
      "$PODMAN" rm "$CONTAINER_NAME"
      echo "[✓] Container removed."
    else
      echo "[✓] Container does not exist."
    fi
  fi
}

start_container() {
  local state
  state=$(status)

  if [ "$state" = "running" ]; then
    echo "[✓] Container '$CONTAINER_NAME' is already running."
  elif [ "$state" = "exited" ] || [ "$state" = "stopped" ]; then
    echo "[i] Starting existing container '$CONTAINER_NAME'..."
    "$PODMAN" start "$CONTAINER_NAME"
    echo "[✓] Container started."
  elif [ "$state" = "not-found" ]; then
    if has_compose_provider; then
      echo "Starting PostgreSQL container via podman compose..."
      "$PODMAN" compose -f "$SCRIPT_DIR/compose.yml" up -d
    else
      echo "Compose provider not found. Falling back to raw podman run..."
      "$PODMAN" run --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        -p "$DB_PORT:5432" \
        -v pgdata:/var/lib/postgresql/data \
        -d docker.io/library/postgres:16-alpine
      echo "[✓] Container created and started."
    fi
  else
    echo "[!] Container is in state '$state'. Attempting to restart..."
    "$PODMAN" restart "$CONTAINER_NAME"
  fi

  echo ""
  echo "Waiting for PostgreSQL to be ready..."
  local retries=15
  until "$PODMAN" exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
      echo "[✗] PostgreSQL failed to initialize in time."
      exit 1
    fi
    sleep 1
  done

  echo ""
  echo "================================================"
  echo "  PostgreSQL is ready!"
  echo ""
  echo "  Connection string:"
  echo "  postgres://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME"
  echo ""
  echo "  Stop with:"
  echo "  bash docker/start-pg.sh --stop"
  echo "================================================"
}

# Check argument
ACTION="start"
if [ $# -gt 0 ]; then
  case "$1" in
    --stop|stop)
      ACTION="stop"
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--stop]"
      exit 1
      ;;
  esac
fi

if [ "$ACTION" = "stop" ]; then
  stop_container
else
  start_container
fi
