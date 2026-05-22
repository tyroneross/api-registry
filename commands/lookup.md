---
description: Look up authoritative sources for an API/library/tool
argument-hint: <service-name>
---

# /api-registry:lookup $ARGUMENTS

Run:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.ts "$ARGUMENTS"
```

If the result has `found: false`:
- Search the registry for similar names (ask user which they meant, or offer `/api-registry:add <name>`).

If `found: true`:
- Render the entry in this format:

```
**<display_name>** (<category>)
Vendor:     <vendor_url>
Docs:       <docs_url>
Changelog:  <changelog_url>
Repo:       <repo_url>
MCP:        <mcp_url>
CLI docs:   <cli_docs_url>
Context7:   <context7_id>
Latest:     <latest_version>  (last checked: <last_checked>)
Models:     <models count, if any>
Notes:      <notes>
```

If `stale_warning: true`, prepend:
```
⚠️ Entry is <N> days stale (>7d). Run `/api-registry:refresh <name>` to update.
```

The JSON also carries a `cooldown` block (package-install verdict). If
`cooldown.install_blocked` is true, render a CAUTION block:
```
⏳ INSTALL COOLDOWN
<cooldown.reason>
This package is exempt-able only if it is author-owned. Wait out the 7-day
window or pin to an older release.
```
If `cooldown.author_owned` is true, note: "Author-owned — exempt from the install cooldown."

If `deprecated_notes` is set, render a DEPRECATION WARNING block:
```
🚨 DEPRECATION / CAUTION
<deprecated_notes>
```

Never fabricate fields. Only show what the JSON contains.
