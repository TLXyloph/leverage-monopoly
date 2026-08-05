#!/usr/bin/env bash
# Dumps the generated ruleset to markdown files, for facilitating without the server up.
#
# The files are DERIVED, never authored: every number in them comes from the same
# `config/economy.ts` the engine imports, so a retuned venture or a moved unlock era
# changes them without anyone editing prose. That is the whole reason they are generated
# rather than written — a hand-maintained copy of the rules drifts from the implemented
# ones, and the drift is invisible until it decides a hand at the table.
#
# Usage:  ./offline-ruleset.sh [api-base] [output-dir]

set -euo pipefail

API="${1:-http://localhost:5177}"
OUT="${2:-$(dirname "$0")/ruleset}"

mkdir -p "$OUT"

topics=$(curl -fsS "$API/api/rules" | sed 's/.*\[//; s/\].*//; s/"//g; s/,/ /g')

for topic in $topics; do
  curl -fsS "$API/api/rules/$topic" -o "$OUT/$topic.md"
  printf '  %s\n' "$OUT/$topic.md"
done

printf '\nRegenerate these whenever the economy is retuned.\n'
