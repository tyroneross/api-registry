#!/usr/bin/env bash
# SessionStart hook — flag stale cached docs.
#
# Contract (mirrors build-loop's session-start-architecture.sh):
#   - command-type only (NEVER prompt-type)
#   - fast: refreshes the staleness marker, then emits at most one line of
#     additionalContext; returns in well under a second
#   - silent bail-out when there is nothing to say
#   - DETECT ONLY — never curates, never fetches docs
#
# Behavior:
#   1. Bail if the registry DB does not exist (plugin not initialized).
#   2. Run `staleness.ts --marker` to refresh ~/.api-registry/staleness.json.
#   3. If stale_count > 0, emit a one-line additionalContext nudging the user
#      toward `/api-registry:refresh --stale`.

set -euo pipefail

REGISTRY_DB="$HOME/.api-registry/registry.db"
MARKER="$HOME/.api-registry/staleness.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"
STALENESS_TS="$PLUGIN_ROOT/scripts/staleness.ts"

# Fast bail-out: registry not initialized.
[ -f "$REGISTRY_DB" ] || exit 0
[ -f "$STALENESS_TS" ] || exit 0

# Refresh the marker (detect-only; writes staleness.json). Best-effort.
if command -v tsx >/dev/null 2>&1; then
  tsx "$STALENESS_TS" --marker >/dev/null 2>&1 || exit 0
elif command -v npx >/dev/null 2>&1; then
  npx --no-install tsx "$STALENESS_TS" --marker >/dev/null 2>&1 || exit 0
else
  exit 0
fi

[ -f "$MARKER" ] || exit 0

# Read stale_count; emit additionalContext only when there is something stale.
STALE_COUNT=$(MARKER="$MARKER" python3 - <<'PYEOF' 2>/dev/null || echo 0
import json, os
try:
    with open(os.environ["MARKER"]) as f:
        print(int(json.load(f).get("stale_count", 0)))
except Exception:
    print(0)
PYEOF
)

if [ "${STALE_COUNT:-0}" -gt 0 ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"api-registry: %s cached doc(s) stale (>7d). Run `/api-registry:refresh --stale` to re-verify."}}\n' "$STALE_COUNT"
fi

exit 0
