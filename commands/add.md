---
description: Add a new service to the registry
argument-hint: <service-name>
---

# /api-registry:add $ARGUMENTS

Step 1: Gather fields interactively. Ask the user for each required field:
- `display_name` (default: title-case of the name)
- `vendor_url` (required)
- `docs_url` (required)
- `category` (must be one of: auth, db, llm, infra, ui, obs, payments, email, storage, search, protocol, other)

Optional fields (ask only if user wants to provide): `changelog_url`, `repo_url`, `mcp_url`, `cli_docs_url`, `context7_id`, `package_ids` (as JSON), `models_url`, `deprecated_notes`, `notes`.

Step 2: Assemble a JSON object with the collected fields plus `"name": "$ARGUMENTS"`.

Step 3: Pipe it into the add script:

```bash
echo '<the JSON object>' | tsx ${CLAUDE_PLUGIN_ROOT}/scripts/add.ts
```

If result is `{"ok":false,"reason":"already_exists",...}`, tell the user and show the existing entry.

If `{"ok":true,...}`, confirm: "Added `<name>` to registry."
