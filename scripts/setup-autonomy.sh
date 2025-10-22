#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/setup-autonomy.sh [--zone-name NAME] [--output-env FILE]

Bootstraps or redeploys the Autonomy zone for the fact-checker app.

Options:
  --zone-name NAME    Override zone name (default: factcheck)
  --output-env FILE   Path to env file to update AUTONOMY_AGENT_URL (default: .env if present)
  -h, --help          Show this help message
EOF
}

ZONE_NAME="factcheck"
OUTPUT_ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zone-name)
      ZONE_NAME="$2"
      shift 2
      ;;
    --output-env)
      OUTPUT_ENV="$2"
      shift 2
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

if ! command -v autonomy >/dev/null 2>&1; then
  echo "The 'autonomy' CLI is required but was not found in PATH." >&2
  echo "Install it via: curl -sSfL autonomy.computer/install | bash" >&2
  exit 1
fi

ZONE_DIR="autonomy-root"
if [[ ! -d "$ZONE_DIR" ]]; then
  echo "Initializing Autonomy template in $ZONE_DIR..."
  autonomy zone init hello "$ZONE_DIR"
fi

pushd "$ZONE_DIR" >/dev/null

if [[ -f autonomy.yaml ]]; then
  tmpfile="$(mktemp)"
  awk -v zone="$ZONE_NAME" 'BEGIN{s=0}{
    if ($1 == "name:") {print "name: " zone; next}
    print
  }' autonomy.yaml >"$tmpfile"
  mv "$tmpfile" autonomy.yaml
fi

echo "Deploying zone $ZONE_NAME..."
DEPLOY_OUTPUT="$(autonomy zone deploy 2>&1)"
echo "$DEPLOY_OUTPUT"

ZONE_URL=$(grep -Eo "https://[[:alnum:]-]+\.cluster\.autonomy\.computer" <<< "$DEPLOY_OUTPUT" | head -n1 || true)

popd >/dev/null

if [[ -n "$ZONE_URL" ]]; then
  echo "Discovered Autonomy agent URL: $ZONE_URL"
  TARGET_ENV=""
  if [[ -n "$OUTPUT_ENV" ]]; then
    TARGET_ENV="$OUTPUT_ENV"
  elif [[ -f .env ]]; then
    TARGET_ENV=".env"
  fi

  if [[ -n "$TARGET_ENV" ]]; then
    if [[ ! -f "$TARGET_ENV" ]]; then
      echo "Creating $TARGET_ENV"
      touch "$TARGET_ENV"
    fi

    tmpenv="$(mktemp)"
    found=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^AUTONOMY_AGENT_URL= ]]; then
        echo "AUTONOMY_AGENT_URL=$ZONE_URL" >>"$tmpenv"
        found=1
      else
        echo "$line" >>"$tmpenv"
      fi
    done < "$TARGET_ENV"

    if [[ "$found" -eq 0 ]]; then
      echo "AUTONOMY_AGENT_URL=$ZONE_URL" >>"$tmpenv"
    fi

    mv "$tmpenv" "$TARGET_ENV"
    echo "Updated $TARGET_ENV with AUTONOMY_AGENT_URL=$ZONE_URL"
  else
    echo "No env file updated. Pass --output-env to write the URL automatically."
  fi
else
  echo "Warning: Could not detect Autonomy agent URL from deploy output." >&2
fi
