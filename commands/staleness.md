---
description: List cached docs that are past the 7-day freshness window (detect only)
argument-hint: (no arguments)
---

# /api-registry:staleness

Run:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/staleness.ts
```

This is **detect-only** — it lists stale cached docs, it never re-fetches or
re-curates anything.

Render the result:

- If `stale_count` is 0: "All cached docs are within the 7-day freshness window."
- Otherwise, for each entry in `stale[]`:
  ```
  <service>/<slug>  — last checked <age_days>d ago
  ```
  Then: "Run `/api-registry:refresh --stale` to re-verify, or `/api-registry:docs <service> <query>` to re-curate a specific doc."

To also refresh the SessionStart marker file (`~/.api-registry/staleness.json`):

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/staleness.ts --marker
```

The marker is what the SessionStart hook reads to emit its one-line nudge at
the start of a new session.
