#!/usr/bin/env bash
#
# Downloads Qwen2.5-VL-Instruct GGUF weights for local screenshot tagging.
#
# Files land in scripts/.models/ (gitignored). Re-running is a no-op once the
# files exist; pass --force to redownload. The 3B and 7B filenames differ, so
# both sizes can sit side by side and you can switch with TAGGER_MODEL_SIZE
# without redownloading.
#
# Pick a size with TAGGER_MODEL_SIZE=3b|7b (default 3b), or override the exact
# artifacts with TAGGER_MODEL_REPO / TAGGER_MODEL_FILE / TAGGER_MMPROJ_FILE.
# See scripts/lib/tagger-model.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/tagger-model.sh
source "${SCRIPT_DIR}/lib/tagger-model.sh"

REPO="$TAGGER_MODEL_REPO"
MODEL_FILE="$TAGGER_MODEL_FILE"
MMPROJ_FILE="$TAGGER_MMPROJ_FILE"

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

echo "→ model size: ${TAGGER_MODEL_SIZE} (${REPO})"
download "$MODEL_FILE"
download "$MMPROJ_FILE"

echo
echo "Model files ready in $MODELS_DIR"
