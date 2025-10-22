#!/usr/bin/env bash
set -euo pipefail

# Always execute sibling script from repository root regardless of invocation path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DEMO="${SCRIPT_DIR}/api/bin/demo.sh"

if [[ ! -x "${API_DEMO}" ]]; then
  echo "Expected script \\"${API_DEMO}\\" to be executable." >&2
  exit 1
fi

cd "${SCRIPT_DIR}"
exec "${API_DEMO}" "$@"
