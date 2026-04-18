#!/usr/bin/env bash
#
# Starts a local llama.cpp server hosting Qwen2.5-VL-3B for screenshot tagging.
# Used by `npm run auto-tag:local` and the GitHub Actions workflow.
#
# Requires Docker. Pulls the official llama.cpp server image and mounts the
# model files downloaded by scripts/download-tagger-model.sh.
#
# Usage:
#   scripts/start-local-tagger.sh           # foreground
#   scripts/start-local-tagger.sh --detach  # background; stop with stop-local-tagger.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/.models"

MODEL_FILE="${TAGGER_MODEL_FILE:-Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf}"
MMPROJ_FILE="${TAGGER_MMPROJ_FILE:-mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf}"
IMAGE="${LLAMA_SERVER_IMAGE:-ghcr.io/ggml-org/llama.cpp:server}"
PORT="${LOCAL_TAGGER_PORT:-8080}"
# Prompt now embeds the full 173-tag taxonomy (~7k tokens) + one image
# (~1.5k tokens) + room for reply. 16k keeps everything in context.
CTX_SIZE="${LLAMA_CTX_SIZE:-16384}"
THREADS="${LLAMA_THREADS:-4}"
CONTAINER_NAME="screenshot-tagger"

if [[ ! -f "${MODELS_DIR}/${MODEL_FILE}" || ! -f "${MODELS_DIR}/${MMPROJ_FILE}" ]]; then
  echo "Model files missing. Run scripts/download-tagger-model.sh first." >&2
  exit 1
fi

DETACH=0
if [[ "${1:-}" == "--detach" ]]; then DETACH=1; fi

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

echo "→ starting llama.cpp server on port ${PORT} (model: ${MODEL_FILE})"
docker run "${DOCKER_FLAGS[@]}" "$IMAGE" "${SERVER_ARGS[@]}"

if [[ "$DETACH" -eq 1 ]]; then
  echo "→ waiting for server to become ready..."
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "✓ server ready at http://127.0.0.1:${PORT}"
      exit 0
    fi
    sleep 2
  done
  echo "✗ server did not become ready within 120s" >&2
  docker logs "$CONTAINER_NAME" >&2 || true
  exit 1
fi
