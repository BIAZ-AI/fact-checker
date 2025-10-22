#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${1:-news.biaz.hurated.com}"
FORMAT='{{.ID}} {{.Names}} {{.Ports}}'

if [[ "$REMOTE_HOST" == "local" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not available locally." >&2
    exit 1
  fi
  docker ps --format "$FORMAT"
else
  ssh "$REMOTE_HOST" "docker ps --format '$FORMAT'"
fi
