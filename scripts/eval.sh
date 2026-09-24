#!/usr/bin/env bash
#
# Draai de API-regressieset (scripts/eval-api.mjs) met de sleutels uit de
# Netlify-projectinstellingen, net als dev.sh: via het procesgeheugen, nooit
# naar .env (deze map synct met Dropbox).
#
#   ./scripts/eval.sh [--fixture naam] [--stem boom,water] [--label naam]
#   ENT_MODEL=claude-opus-5-5 ENT_EFFORT=low ./scripts/eval.sh --label opus55-low

set -euo pipefail
cd "$(dirname "$0")/.."

haal() {
  local waarde
  waarde="$(netlify env:get "$1" 2>/dev/null | tail -1 | tr -d '\n')"
  if [ -z "$waarde" ] || [[ "$waarde" == *"No value set"* ]]; then
    echo "✗ $1 niet gevonden in de Netlify-projectinstellingen." >&2
    exit 1
  fi
  printf '%s' "$waarde"
}

export ANTHROPIC_API_KEY="$(haal ANTHROPIC_API_KEY)"
export ENT_ACCESS_PASSWORD="$(haal ENT_ACCESS_PASSWORD)"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"

exec node scripts/eval-api.mjs "$@"
