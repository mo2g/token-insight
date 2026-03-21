#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cargo run --manifest-path "$ROOT_DIR/backend/Cargo.toml" -- social-image "$@"
