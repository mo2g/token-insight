#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ASSETS_DIR="$ROOT_DIR/docs/assets"
PORT="${TOKEN_INSIGHT_SCREENSHOT_PORT:-8877}"
SKIN="${TOKEN_INSIGHT_SCREENSHOT_SKIN:-midnight}"
DATA_DIR="${TOKEN_INSIGHT_DATA_DIR:-/tmp/token-insight-screenshot-data}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""
SERVER_LOG="/tmp/token-insight-screenshot-server.log"
PLAYWRIGHT_NPM_CACHE="${TOKEN_INSIGHT_PLAYWRIGHT_NPM_CACHE:-/tmp/.npm-cache}"
PLAYWRIGHT_BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/pw-browsers}"
PLAYWRIGHT_READY=0

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

wait_for_server() {
  local attempts=90
  local i
  for ((i = 1; i <= attempts; i += 1)); do
    if curl -fsS "$BASE_URL" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      return 1
    fi
    sleep 1
  done
  return 1
}

capture_layout() {
  local layout="$1"
  local output="$2"
  local url="${BASE_URL}/?layout=${layout}&skin=${SKIN}"
  ensure_playwright_browser
  NPM_CONFIG_CACHE="$PLAYWRIGHT_NPM_CACHE" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_DIR" \
    npx --yes playwright screenshot \
    --browser=chromium \
    --viewport-size=1760,1200 \
    --wait-for-selector ".dashboard-grid" \
    --wait-for-timeout=4000 \
    "$url" \
    "$output"
}

ensure_playwright_browser() {
  if [[ "$PLAYWRIGHT_READY" -eq 1 ]]; then
    return 0
  fi
  if has_playwright_browser; then
    PLAYWRIGHT_READY=1
    return 0
  fi
  NPM_CONFIG_CACHE="$PLAYWRIGHT_NPM_CACHE" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_DIR" \
    npx --yes playwright install chromium >/dev/null
  PLAYWRIGHT_READY=1
}

has_playwright_browser() {
  find "$PLAYWRIGHT_BROWSERS_DIR" -name "chrome-headless-shell" -type f | grep -q .
}

trap cleanup EXIT INT TERM

mkdir -p "$ASSETS_DIR"
mkdir -p "$DATA_DIR"

echo "Building frontend..."
bun --cwd "$FRONTEND_DIR" build >/dev/null

echo "Starting backend server on port ${PORT}..."
TOKEN_INSIGHT_DATA_DIR="$DATA_DIR" cargo run --manifest-path "$BACKEND_DIR/Cargo.toml" -- serve --port "$PORT" --static-dir "$FRONTEND_DIR/dist" >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"

if ! wait_for_server; then
  echo "Server did not become ready. Check $SERVER_LOG" >&2
  exit 1
fi

echo "Capturing layout screenshots with skin=${SKIN}..."
capture_layout "console" "$ASSETS_DIR/dashboard-layout-console.png"
capture_layout "dock" "$ASSETS_DIR/dashboard-layout-dock.png"
capture_layout "radar" "$ASSETS_DIR/dashboard-layout-radar.png"

echo "Generated:"
echo "  $ASSETS_DIR/dashboard-layout-console.png"
echo "  $ASSETS_DIR/dashboard-layout-dock.png"
echo "  $ASSETS_DIR/dashboard-layout-radar.png"
