---
description: Refresh latest-version info for registered services
argument-hint: [<name> | --all | --stale]
---

# /api-registry:refresh $ARGUMENTS

Run:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/refresh.ts $ARGUMENTS
```

Default (no arg): `--stale` (>7 days since `last_checked`).

Render a compact summary:
- Total checked
- Count with drift
- Count cooldown-blocked (`cooldown_blocked`)
- Per-service: `<name>: <old> → <new>` (skip unchanged)

If drift count > 0, remind user: "These services shipped new versions since last check. If you're in the middle of a build that uses one, re-read its docs before continuing."

If `cooldown_blocked` > 0, list each blocked service with its `cooldown.reason`:
"⏳ `<name>`: <reason>. Wait out the 7-day window before installing."
Author-owned services are exempt and never appear here.

Also run `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/export-yaml.ts` afterward to refresh the YAML mirror.
