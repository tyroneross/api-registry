---
description: List registered services grouped by category
argument-hint: [category]
---

# /api-registry:list $ARGUMENTS

Run:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/list.ts $ARGUMENTS
```

Render the grouped result as a table per category. Columns: Name, Category, Latest Version, Last Checked.

If no arg, print category order: auth, db, llm, infra, ui, obs, payments, email, storage, search, protocol, other. Skip empty categories.

Highlight any entry with `last_checked` > 30 days in a "Needs Refresh" subsection at the end.
