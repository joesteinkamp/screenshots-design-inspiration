#!/usr/bin/env bash
#
# Stops whichever local tagger is running — native llama-server (tracked by
# scripts/.tagger.pid) or the Docker container. Safe to run when neither is up,
# which is why CI calls it with `if: always()`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.tagger.pid"

stopped=0

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    # Give it a moment to release the port before falling back to SIGKILL.
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
    echo "✓ stopped native llama-server (pid ${pid})"
    stopped=1
  fi
  rm -f "$PID_FILE"
fi

if command -v docker >/dev/null 2>&1; then
  if docker rm -f screenshot-tagger >/dev/null 2>&1; then
    echo "✓ stopped Docker tagger"
    stopped=1
  fi
fi

[[ "$stopped" -eq 1 ]] || echo "(not running)"
