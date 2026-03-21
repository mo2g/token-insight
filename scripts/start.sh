#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PORT="${TOKEN_INSIGHT_PORT:-8787}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the existing backend process first."
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
  exit 1
fi

bun --cwd "$FRONTEND_DIR" build
cargo run --manifest-path "$BACKEND_DIR/Cargo.toml" -- serve --port "$PORT" --static-dir "$FRONTEND_DIR/dist"
