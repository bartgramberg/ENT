#!/usr/bin/env bash
#
# Start de lokale dev-server. Gebruik dit i.p.v. een kale `netlify dev`.
#
# Waarom --offline:
# `netlify dev` stuurt de Anthropic-calls standaard door Netlify's AI Gateway
# (ai-gateway.netlify.app). Die is vanaf sommige netwerken onbetrouwbaar: hij
# antwoordt een paar keer en blackholet daarna nieuwe verbindingen, wat de
# functie na ~2 beurten laat vastlopen op een connect-timeout van 10s → HTTP 503.
# Gemeten: mét gateway 2/6 geslaagd, zonder 8/8. `--offline` schakelt de
# gateway-injectie uit, waarna chat.mjs rechtstreeks api.anthropic.com gebruikt.
#
# Dit raakt alleen lokaal draaien. Productie draait binnen Netlify's eigen
# netwerk, bereikt de gateway daar wél, en blijft ongewijzigd.
#
# --offline betekent ook: geen env-vars uit de projectinstellingen. Die halen we
# hieronder zelf op en geven we mee via het procesgeheugen — bewust niet naar
# .env geschreven, want deze map synct met Dropbox.

set -euo pipefail
cd "$(dirname "$0")/.."

haal() {
  local waarde
  waarde="$(netlify env:get "$1" 2>/dev/null | tail -1 | tr -d '\n')"
  # env:get drukt een zin af i.p.v. leegte als de var niet bestaat
  if [ -z "$waarde" ] || [[ "$waarde" == *"No value set"* ]]; then
    echo "✗ $1 niet gevonden in de Netlify-projectinstellingen." >&2
    exit 1
  fi
  printf '%s' "$waarde"
}

export ANTHROPIC_API_KEY="$(haal ANTHROPIC_API_KEY)"
export ENT_ACCESS_PASSWORD="$(haal ENT_ACCESS_PASSWORD)"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"

echo "⬥ Start zonder AI Gateway → api.anthropic.com"
exec netlify dev --offline "$@"
