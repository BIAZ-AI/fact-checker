#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/ports.sh [host|local]

Print Docker container port mappings. Defaults to remote host news.biaz.hurated.com.

Options:
  local          Inspect ports on the local machine
  -h, --help     Show this help message
EOF
}

REMOTE_HOST="news.biaz.hurated.com"
if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    local)
      REMOTE_HOST="local"
      ;;
    *)
      REMOTE_HOST="$1"
      ;;
  esac
fi

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
