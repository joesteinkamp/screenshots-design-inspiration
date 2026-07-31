#!/usr/bin/env bash
#
# Starts a local llama.cpp server hosting Qwen2.5-VL for screenshot tagging.
# Used by `npm run auto-tag:local` and the auto-tag GitHub Actions workflow.
#
# Defaults to the 3B weights; set TAGGER_MODEL_SIZE=7b for better tags at
# roughly 2.5x the time per screenshot. See scripts/lib/tagger-model.sh.
#
# Two runtimes, picked automatically (override with TAGGER_RUNTIME):
#
#   native  a `llama-server` binary on PATH (`brew install llama.cpp`).
#           Preferred on macOS: Docker on a Mac runs in a Linux VM with no
#           access to the GPU, so a containerised tagger is CPU-only. Native
#           gets Metal and is several times faster on Apple Silicon.
#   docker  the official llama.cpp server image, with the weights bind-mounted.
#           What CI uses — a Linux runner is CPU-only either way.
#
# Usage:
#   scripts/start-local-tagger.sh           # foreground
#   scripts/start-local-tagger.sh --detach  # background; stop with stop-local-tagger.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/.models"
PID_FILE="${SCRIPT_DIR}/.tagger.pid"
LOG_FILE="${SCRIPT_DIR}/.tagger.log"

# shellcheck source=lib/tagger-model.sh
source "${SCRIPT_DIR}/lib/tagger-model.sh"

MODEL_FILE="$TAGGER_MODEL_FILE"
MMPROJ_FILE="$TAGGER_MMPROJ_FILE"
IMAGE="${LLAMA_SERVER_IMAGE:-ghcr.io/ggml-org/llama.cpp:server}"
PORT="${LOCAL_TAGGER_PORT:-8080}"
# Prompt now embeds the full 173-tag taxonomy (~7k tokens) + one image
# (~1.5k tokens) + room for reply. 16k keeps everything in context.
CTX_SIZE="${LLAMA_CTX_SIZE:-16384}"
# Default to every core the box has. The hardcoded 4 this used to carry left
# most of a developer laptop idle; set LLAMA_THREADS to pin it.
THREADS="${LLAMA_THREADS:-$( (nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null) || echo 4 )}"
# Offload everything to the GPU where there is one. Ignored on CPU-only builds.
GPU_LAYERS="${LLAMA_GPU_LAYERS:-99}"
CONTAINER_NAME="screenshot-tagger"

if [[ ! -f "${MODELS_DIR}/${MODEL_FILE}" || ! -f "${MODELS_DIR}/${MMPROJ_FILE}" ]]; then
  echo "Model files for size '${TAGGER_MODEL_SIZE}' missing (${MODEL_FILE})." >&2
  echo "Run: TAGGER_MODEL_SIZE=${TAGGER_MODEL_SIZE} scripts/download-tagger-model.sh" >&2
  exit 1
fi

DETACH=0
if [[ "${1:-}" == "--detach" ]]; then DETACH=1; fi

# --- pick a runtime ---------------------------------------------------------

docker_ready() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

RUNTIME="${TAGGER_RUNTIME:-auto}"
case "$RUNTIME" in
  auto)
    if command -v llama-server >/dev/null 2>&1; then
      RUNTIME=native
    elif docker_ready; then
      RUNTIME=docker
    else
      cat >&2 <<'EOF'
✗ No way to run the tagger — needs either a native llama-server or a running
  Docker daemon.

  Fastest on Apple Silicon (uses the GPU via Metal; Docker on macOS cannot):
      brew install llama.cpp

  Or start a container runtime you already have installed:
      open -a "Rancher Desktop"      # or: open -a Docker
  then wait for it to report ready and re-run this script.
EOF
      exit 1
    fi
    ;;
  native)
    if ! command -v llama-server >/dev/null 2>&1; then
      echo "✗ TAGGER_RUNTIME=native but no llama-server on PATH. Try: brew install llama.cpp" >&2
      exit 1
    fi
    ;;
  docker)
    if ! docker_ready; then
      echo "✗ TAGGER_RUNTIME=docker but no Docker daemon is responding." >&2
      echo "  Start one with: open -a \"Rancher Desktop\"   (or: open -a Docker)" >&2
      exit 1
    fi
    ;;
  *)
    echo "Unknown TAGGER_RUNTIME '${RUNTIME}' (expected 'auto', 'native' or 'docker')." >&2
    exit 1
    ;;
esac

# --- wait for readiness -----------------------------------------------------

wait_for_ready() {
  echo "→ waiting for server to become ready..."
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "✓ server ready at http://127.0.0.1:${PORT} (runtime: ${RUNTIME})"
      return 0
    fi
    sleep 2
  done
  echo "✗ server did not become ready within 120s" >&2
  if [[ "$RUNTIME" == "docker" ]]; then
    docker logs "$CONTAINER_NAME" >&2 || true
  else
    tail -40 "$LOG_FILE" >&2 || true
  fi
  return 1
}

# --- native -----------------------------------------------------------------

if [[ "$RUNTIME" == "native" ]]; then
  # Clear out a previous native server still holding the port.
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"

  NATIVE_ARGS=(
    -m "${MODELS_DIR}/${MODEL_FILE}"
    --mmproj "${MODELS_DIR}/${MMPROJ_FILE}"
    --host 127.0.0.1
    --port "$PORT"
    -c "$CTX_SIZE"
    -t "$THREADS"
    -ngl "$GPU_LAYERS"
    --no-webui
  )

  echo "→ starting native llama-server on port ${PORT} (model: ${MODEL_FILE}, threads: ${THREADS}, gpu-layers: ${GPU_LAYERS})"
  if [[ "$DETACH" -eq 1 ]]; then
    nohup llama-server "${NATIVE_ARGS[@]}" >"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "  logs: ${LOG_FILE}"
    wait_for_ready
    exit $?
  fi
  exec llama-server "${NATIVE_ARGS[@]}"
fi

# --- docker -----------------------------------------------------------------

# Clean up any prior container with the same name
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

DOCKER_FLAGS=(
  --rm
  --name "$CONTAINER_NAME"
  -p "${PORT}:8080"
  -v "${MODELS_DIR}:/models:ro"
)
if [[ "$DETACH" -eq 1 ]]; then DOCKER_FLAGS+=(-d); fi

SERVER_ARGS=(
  -m "/models/${MODEL_FILE}"
  --mmproj "/models/${MMPROJ_FILE}"
  --host 0.0.0.0
  --port 8080
  -c "$CTX_SIZE"
  -t "$THREADS"
  --no-webui
)

echo "→ starting llama.cpp server in Docker on port ${PORT} (model: ${MODEL_FILE}, threads: ${THREADS})"
docker run "${DOCKER_FLAGS[@]}" "$IMAGE" "${SERVER_ARGS[@]}"

if [[ "$DETACH" -eq 1 ]]; then
  wait_for_ready
fi
