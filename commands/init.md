---
description: Initialize the api-registry database and seed 20 well-known services
---

# /api-registry:init

Run:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/init.ts
```

After it completes, offer the user:

> "Registry initialized at `~/.api-registry/registry.db` with 20 seeded services. Run `/api-registry:scan` to auto-discover services used in your local projects, or `/api-registry:list` to browse the current registry."

Do NOT run `/api-registry:scan` automatically. Wait for user confirmation.
