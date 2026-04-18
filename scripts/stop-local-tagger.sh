#!/usr/bin/env bash
set -euo pipefail
docker rm -f screenshot-tagger >/dev/null 2>&1 && echo "✓ stopped" || echo "(not running)"
