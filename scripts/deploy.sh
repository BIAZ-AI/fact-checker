#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [-m "commit message"] [--remote]

Without --remote, the script deploys locally using docker compose. When --remote is
specified (default), deployment occurs on news.biaz.hurated.com.

Options:
  -m, --message   Commit message to use before pushing changes
  --remote        Force remote deployment (default behavior)
  -h, --help      Show this help message
EOF
}

REMOTE_HOST="news.biaz.hurated.com"
REMOTE_DIR="/mnt/fact-checker"
REMOTE="true"
COMMIT_MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      COMMIT_MESSAGE="$2"
      shift 2
      ;;
    --remote)
      REMOTE="true"
      shift
      ;;
    --local)
      REMOTE="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -n "$COMMIT_MESSAGE" ]]; then
  echo "Staging and committing with message: $COMMIT_MESSAGE"
  git add -A
  if git diff --cached --quiet; then
    echo "No changes to commit."
  else
    git commit -m "$COMMIT_MESSAGE"
  fi
fi

git push

deploy_local() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for local deployment." >&2
    exit 1
  fi

  echo "Running local docker compose deployment..."
  docker compose build
  docker compose up -d
  docker compose ps
}

deploy_remote() {
  if [[ ! -f .env ]]; then
    echo ".env file is required for remote deployment." >&2
    exit 1
  fi

  echo "Copying .env to remote host..."
  scp .env "${REMOTE_HOST}:${REMOTE_DIR}/.env"

  echo "Executing remote deployment..."
  ssh "${REMOTE_HOST}" "cd ${REMOTE_DIR} && git pull && docker compose build && docker compose up -d && docker compose ps"
}

if [[ "$REMOTE" == "true" ]]; then
  deploy_remote
else
  deploy_local
fi
