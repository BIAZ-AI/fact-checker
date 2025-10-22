#!/usr/bin/env bash
set -euo pipefail

scheme="https"
host="${FACT_CHECKER_API_HOST:-api.news.biaz.hurated.com}"
port="${FACT_CHECKER_API_PORT:-}" 
as_json=false

usage() {
  cat <<'EOF'
Usage: api/bin/demo.sh [options]
Reads article text from stdin and POSTs it to /v1/check.

Options:
  --json             Output raw JSON from the API
  --host HOST        Override API host (default: api.news.biaz.hurated.com)
  --port PORT        Override API port (default: none for HTTPS)
  --scheme SCHEME    Override scheme (default: https)
  --local            Shortcut for http://localhost:${API_PORT:-21000}
  -h, --help         Show this help message
EOF
}

if [[ $# -gt 0 ]]; then
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        as_json=true
        shift
        ;;
      --scheme)
        scheme="$2"
        shift 2
        ;;
      --host)
        host="$2"
        shift 2
        ;;
      --port)
        port="$2"
        shift 2
        ;;
      --local)
        scheme="http"
        host="localhost"
        port="${API_PORT:-21000}"
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
fi

input="$(cat)"
if [[ -z "${input}" ]]; then
  echo "No input provided on stdin" >&2
  exit 2
fi

payload=$(jq -Rs --argjson maxFacts "${MAX_FACTS:-50}" 'tojson | {input: ., options: {maxFacts: $maxFacts, returnSources: (env.ENABLE_SOURCE_LIST // "false") | test("^(true|1|yes)$"; "i")}}' <<< "$input")

if [[ -z "$payload" ]]; then
  echo "Failed to construct request payload" >&2
  exit 3
fi

url="${scheme}://${host}"
if [[ -n "$port" ]]; then
  url+=":${port}"
fi
url+="/v1/check"

response=$(curl -sS -X POST "$url" \
  -H "Content-Type: application/json" \
  -d "$payload")

if [[ "$as_json" == "true" ]]; then
  echo "$response"
  exit 0
fi

if command -v jq >/dev/null 2>&1; then
  echo "$response" | jq -r '
    "Facts: \(.facts | length)" +
    (if (.facts | length) == 0 then "\n" else "\n" +
      (.facts | map("- \(.text) | sources: \(.sourcesChecked) | score: \((.score * 100) | round)%") | join("\n")) + "\n"
    end) +
    "\nAggregate score: \((.aggregate.score * 100) | round)%\n"
  '
else
  echo "$response"
fi
