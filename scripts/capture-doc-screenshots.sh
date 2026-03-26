#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ASSETS_DIR="$ROOT_DIR/docs/assets"
HOST_HOME="${HOME}"
PORT="${TOKEN_INSIGHT_SCREENSHOT_PORT:-8877}"
SKIN="${TOKEN_INSIGHT_SCREENSHOT_SKIN:-midnight}"
DATA_ROOT="${TOKEN_INSIGHT_DATA_DIR:-/tmp/token-insight-screenshot-data}"
APP_DATA_DIR="$DATA_ROOT/app-data"
MOCK_HOME_DIR="$DATA_ROOT/mock-home"
FIXTURE_ROOT="${TOKEN_INSIGHT_SCREENSHOT_FIXTURE_ROOT:-$ROOT_DIR/backend/tests/fixtures}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""
SERVER_LOG="/tmp/token-insight-screenshot-server.log"
PLAYWRIGHT_NPM_CACHE="${TOKEN_INSIGHT_PLAYWRIGHT_NPM_CACHE:-/tmp/.npm-cache}"
PLAYWRIGHT_BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-/tmp/pw-browsers}"
PLAYWRIGHT_READY=0
SCREENSHOT_BROWSER="${TOKEN_INSIGHT_SCREENSHOT_BROWSER:-chromium}"
SCREENSHOT_CHANNEL="${TOKEN_INSIGHT_SCREENSHOT_CHANNEL:-}"
SCREENSHOT_MODE="${TOKEN_INSIGHT_SCREENSHOT_MODE:-auto}"
SCREENSHOT_APP="${TOKEN_INSIGHT_SCREENSHOT_APP:-}"
GUI_WAIT_SECONDS="${TOKEN_INSIGHT_SCREENSHOT_GUI_WAIT_SECONDS:-6}"
GUI_WINDOW_X="${TOKEN_INSIGHT_SCREENSHOT_WINDOW_X:-120}"
GUI_WINDOW_Y="${TOKEN_INSIGHT_SCREENSHOT_WINDOW_Y:-88}"
GUI_VIEWPORT_WIDTH="${TOKEN_INSIGHT_SCREENSHOT_WIDTH:-1760}"
GUI_VIEWPORT_HEIGHT="${TOKEN_INSIGHT_SCREENSHOT_HEIGHT:-1200}"
GUI_TOP_INSET="${TOKEN_INSIGHT_SCREENSHOT_TOP_INSET:-32}"
GUI_OUTER_HEIGHT="$((GUI_VIEWPORT_HEIGHT + GUI_TOP_INSET))"
GUI_PROFILE_DIR="$DATA_ROOT/gui-browser-profile"
LOG_DIR="$DATA_ROOT/logs"

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  local gui_app
  gui_app="$(resolve_gui_app 2>/dev/null || true)"
  if [[ -n "$gui_app" ]]; then
    close_gui_browser "$gui_app" >/dev/null 2>&1 || true
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
  case "$SCREENSHOT_MODE" in
    headless)
      capture_layout_headless "$layout" "$output"
      ;;
    gui)
      capture_layout_gui "$layout" "$output"
      ;;
    auto)
      if capture_layout_headless "$layout" "$output"; then
        return 0
      fi
      echo "Headless capture failed for ${layout}. Falling back to GUI capture..." >&2
      capture_layout_gui "$layout" "$output"
      ;;
    *)
      echo "Unsupported TOKEN_INSIGHT_SCREENSHOT_MODE: $SCREENSHOT_MODE" >&2
      return 1
      ;;
  esac
}

capture_layout_headless() {
  local layout="$1"
  local output="$2"
  local url="${BASE_URL}/?layout=${layout}&skin=${SKIN}"
  local log_file="$LOG_DIR/headless-${layout}.log"
  ensure_playwright_browser
  local -a cmd=(
    npx
    --yes
    playwright
    screenshot
    "--browser=${SCREENSHOT_BROWSER}"
    --viewport-size=1760,1200
    --wait-for-selector
    ".dashboard-grid"
    --wait-for-timeout=4000
  )
  if [[ -n "$SCREENSHOT_CHANNEL" ]]; then
    cmd+=("--channel=${SCREENSHOT_CHANNEL}")
  fi
  cmd+=("$url" "$output")
  if NPM_CONFIG_CACHE="$PLAYWRIGHT_NPM_CACHE" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_DIR" "${cmd[@]}" >"$log_file" 2>&1; then
    return 0
  fi
  echo "Headless log (${layout}): $log_file" >&2
  tail -n 40 "$log_file" >&2 || true
  return 1
}

capture_layout_gui() {
  local layout="$1"
  local output="$2"
  local url="${BASE_URL}/?layout=${layout}&skin=${SKIN}"
  local app
  app="$(resolve_gui_app)"
  local log_file="$LOG_DIR/gui-${layout}.log"

  rm -rf "$GUI_PROFILE_DIR"
  mkdir -p "$GUI_PROFILE_DIR"
  close_gui_browser "$app" >"$log_file" 2>&1 || true

  open -na "$app" --args \
    --app="$url" \
    "--user-data-dir=$GUI_PROFILE_DIR" \
    "--window-position=${GUI_WINDOW_X},${GUI_WINDOW_Y}" \
    "--window-size=${GUI_VIEWPORT_WIDTH},${GUI_OUTER_HEIGHT}" \
    --no-first-run \
    --disable-sync \
    --disable-extensions \
    --disable-default-apps \
    --disable-features=Translate,GlobalMediaControls \
    >>"$log_file" 2>&1

  focus_gui_browser "$app" >>"$log_file" 2>&1 || true
  sleep "$GUI_WAIT_SECONDS"

  screencapture \
    -x \
    -R "${GUI_WINDOW_X},$((GUI_WINDOW_Y + GUI_TOP_INSET)),${GUI_VIEWPORT_WIDTH},${GUI_VIEWPORT_HEIGHT}" \
    "$output" >>"$log_file" 2>&1

  if [[ ! -s "$output" ]]; then
    echo "GUI capture did not produce an image for ${layout}. See $log_file" >&2
    return 1
  fi

  close_gui_browser "$app" >>"$log_file" 2>&1 || true
}

resolve_gui_app() {
  if [[ -n "$SCREENSHOT_APP" ]]; then
    if [[ -d "/Applications/${SCREENSHOT_APP}.app" ]]; then
      echo "$SCREENSHOT_APP"
      return 0
    fi
    echo "Requested GUI browser not found: $SCREENSHOT_APP" >&2
    return 1
  fi

  local app
  for app in "Google Chrome" "Microsoft Edge"; do
    if [[ -d "/Applications/${app}.app" ]]; then
      echo "$app"
      return 0
    fi
  done

  echo "No supported GUI browser found in /Applications" >&2
  return 1
}

focus_gui_browser() {
  local app="$1"
  osascript \
    -e "tell application \"$app\"" \
    -e "activate" \
    -e "try" \
    -e "set bounds of front window to {${GUI_WINDOW_X}, ${GUI_WINDOW_Y}, $((GUI_WINDOW_X + GUI_VIEWPORT_WIDTH)), $((GUI_WINDOW_Y + GUI_OUTER_HEIGHT))}" \
    -e "end try" \
    -e "end tell"
}

close_gui_browser() {
  local app="$1"
  osascript -e "tell application \"$app\" to quit"
}

ensure_playwright_browser() {
  if [[ "$PLAYWRIGHT_READY" -eq 1 ]]; then
    return 0
  fi
  NPM_CONFIG_CACHE="$PLAYWRIGHT_NPM_CACHE" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_DIR" \
    npx --yes playwright install "$SCREENSHOT_BROWSER" >/dev/null
  PLAYWRIGHT_READY=1
}

copy_fixture() {
  local fixture_rel="$1"
  local destination="$2"
  local source="$FIXTURE_ROOT/$fixture_rel"
  if [[ ! -f "$source" ]]; then
    echo "Missing fixture: $source" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$destination")"
  cp "$source" "$destination"
}

prepare_mock_sources() {
  rm -rf "$APP_DATA_DIR" "$MOCK_HOME_DIR"
  mkdir -p "$APP_DATA_DIR" "$MOCK_HOME_DIR"

  copy_fixture "claude/sample.jsonl" "$MOCK_HOME_DIR/.claude/projects/sample.jsonl"
  copy_fixture "codex/sample.jsonl" "$MOCK_HOME_DIR/.codex/sessions/sample.jsonl"
  copy_fixture "codex/sample.jsonl" "$MOCK_HOME_DIR/.codex/archived_sessions/sample.jsonl"
  copy_fixture "codex-headless/sample.jsonl" "$MOCK_HOME_DIR/.config/tokscale/headless/codex/sample.jsonl"
  copy_fixture "gemini/sample.json" "$MOCK_HOME_DIR/.gemini/chats/sample.json"
  copy_fixture "screenshot/cursor-week.csv" "$MOCK_HOME_DIR/.config/tokscale/cursor-cache/usage.csv"
  copy_fixture "opencode/sample.json" "$MOCK_HOME_DIR/.local/share/opencode/storage/message/sample.json"
  copy_fixture "openclaw/sample.json" "$MOCK_HOME_DIR/.openclaw/agents/sample.json"
  copy_fixture "amp/sample.json" "$MOCK_HOME_DIR/.local/share/amp/threads/sample.json"
  copy_fixture "droid/sample.json" "$MOCK_HOME_DIR/.factory/sessions/sample.json"
  copy_fixture "pi/sample.json" "$MOCK_HOME_DIR/.pi/agent/sessions/sample.json"
  copy_fixture "kimi/sample.json" "$MOCK_HOME_DIR/.kimi/sessions/sample.json"
  copy_fixture "qwen/sample.json" "$MOCK_HOME_DIR/.qwen/projects/sample.json"
  copy_fixture "roo-code/sample.json" "$MOCK_HOME_DIR/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks/sample.json"
  copy_fixture "kilo/sample.json" "$MOCK_HOME_DIR/.config/Code/User/globalStorage/kilocode.kilo-code/tasks/sample.json"
  copy_fixture "mux/sample.json" "$MOCK_HOME_DIR/.mux/sessions/sample.json"
  copy_fixture "synthetic/sample.json" "$MOCK_HOME_DIR/.local/share/synthetic/sample.json"
}

trap cleanup EXIT INT TERM

mkdir -p "$ASSETS_DIR"
mkdir -p "$DATA_ROOT"
mkdir -p "$LOG_DIR"
prepare_mock_sources

echo "Building frontend..."
bun --cwd "$FRONTEND_DIR" build >/dev/null

echo "Starting backend server on port ${PORT}..."
HOME="$MOCK_HOME_DIR" \
RUSTUP_HOME="${RUSTUP_HOME:-$HOST_HOME/.rustup}" \
CARGO_HOME="${CARGO_HOME:-$HOST_HOME/.cargo}" \
TOKEN_INSIGHT_DATA_DIR="$APP_DATA_DIR" \
cargo run --manifest-path "$BACKEND_DIR/Cargo.toml" -- serve --port "$PORT" --static-dir "$FRONTEND_DIR/dist" >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"

if ! wait_for_server; then
  echo "Server did not become ready. Check $SERVER_LOG" >&2
  exit 1
fi

echo "Capturing layout screenshots with skin=${SKIN}..."
capture_layout "console" "$ASSETS_DIR/dashboard-layout-console.png"
capture_layout "dock" "$ASSETS_DIR/dashboard-layout-dock.png"
capture_layout "radar" "$ASSETS_DIR/dashboard-layout-radar.png"
cp "$ASSETS_DIR/dashboard-layout-console.png" "$ASSETS_DIR/token-insight-preview.png"

echo "Generated:"
echo "  $ASSETS_DIR/dashboard-layout-console.png"
echo "  $ASSETS_DIR/dashboard-layout-dock.png"
echo "  $ASSETS_DIR/dashboard-layout-radar.png"
echo "  $ASSETS_DIR/token-insight-preview.png"
