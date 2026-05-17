#!/usr/bin/env bash
# ABOUTME: Starts the local Q1K3 HTTP server from the Q1K3DIT project.
# ABOUTME: Wraps the Python tooling so the game can fetch build assets over HTTP.
set -euo pipefail

PORT="${PORT:-8000}"
Q1K3_DIR="${Q1K3_DIR:-/Users/jsh/dev/repos/q1k3}"

uv run python tools/q1k3dit.py --q1k3-dir "$Q1K3_DIR" serve --port "$PORT"
