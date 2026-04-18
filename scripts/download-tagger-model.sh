#!/usr/bin/env bash
#
# Downloads Qwen2.5-VL-7B-Instruct GGUF weights for local screenshot tagging.
#
# Files land in scripts/.models/ (gitignored). Re-running is a no-op once the
# files exist; pass --force to redownload.
#
# Override the source by setting:
#   TAGGER_MODEL_REPO   (default: ggml-org/Qwen2.5-VL-7B-Instruct-GGUF)
#   TAGGER_MODEL_FILE   (default: Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf)
#   TAGGER_MMPROJ_FILE  (default: mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf)

set -euo pipefail

REPO="${TAGGER_MODEL_REPO:-ggml-org/Qwen2.5-VL-7B-Instruct-GGUF}"
MODEL_FILE="${TAGGER_MODEL_FILE:-Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf}"
MMPROJ_FILE="${TAGGER_MMPROJ_FILE:-mmproj-Qwen2.5-VL-7B-Instruct-f16.gguf}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/.models"
mkdir -p "$MODELS_DIR"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then FORCE=1; fi

download() {
  local file="$1"
  local dest="${MODELS_DIR}/${file}"
  if [[ -f "$dest" && "$FORCE" -eq 0 ]]; then
    echo "✓ already present: $file ($(du -h "$dest" | cut -f1))"
    return
  fi
  local url="https://huggingface.co/${REPO}/resolve/main/${file}"
  echo "↓ downloading ${url}"
  # -L follow redirects, --fail to surface HTTP errors, -C - resume
  curl -L --fail -C - -o "${dest}.part" "$url"
  mv "${dest}.part" "$dest"
  echo "✓ saved $dest ($(du -h "$dest" | cut -f1))"
}

download "$MODEL_FILE"
download "$MMPROJ_FILE"

echo
echo "Model files ready in $MODELS_DIR"
