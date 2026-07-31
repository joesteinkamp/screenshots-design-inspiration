# shellcheck shell=bash
#
# Resolves which Qwen2.5-VL GGUF pair the tagger should use. Sourced by
# download-tagger-model.sh and start-local-tagger.sh so both always agree —
# downloading one size and serving another is an easy mistake to make.
#
#   TAGGER_MODEL_SIZE=3b   (default) ~3.3 GB. Roughly 1 min/screenshot on a
#                          4-core CI runner; the size CI is budgeted around.
#   TAGGER_MODEL_SIZE=7b             ~6.0 GB. Better tags, ~2.5x slower. Worth
#                          it locally, far too slow for a CPU-only runner.
#
# An explicit TAGGER_MODEL_REPO / TAGGER_MODEL_FILE / TAGGER_MMPROJ_FILE still
# wins, so pinning a quant we don't enumerate here doesn't need a code change.

TAGGER_MODEL_SIZE="${TAGGER_MODEL_SIZE:-3b}"

case "$(printf '%s' "$TAGGER_MODEL_SIZE" | tr '[:upper:]' '[:lower:]')" in
  3b) _tagger_size_tag="3B" ;;
  7b) _tagger_size_tag="7B" ;;
  *)
    echo "Unknown TAGGER_MODEL_SIZE '${TAGGER_MODEL_SIZE}' (expected '3b' or '7b')." >&2
    exit 1
    ;;
esac

TAGGER_MODEL_REPO="${TAGGER_MODEL_REPO:-ggml-org/Qwen2.5-VL-${_tagger_size_tag}-Instruct-GGUF}"
TAGGER_MODEL_FILE="${TAGGER_MODEL_FILE:-Qwen2.5-VL-${_tagger_size_tag}-Instruct-Q4_K_M.gguf}"
TAGGER_MMPROJ_FILE="${TAGGER_MMPROJ_FILE:-mmproj-Qwen2.5-VL-${_tagger_size_tag}-Instruct-f16.gguf}"

unset _tagger_size_tag
