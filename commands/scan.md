---
description: Auto-discover services from local projects and review candidates
argument-hint: [--path <dir>]
---

# /api-registry:scan $ARGUMENTS

Step 1: Run the scan script.

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/scan.ts $ARGUMENTS
```

Step 2: List pending candidates:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/candidates.ts list
```

Step 3: Walk the user through the queue. For each candidate, show:

```
[N/total] <name>  (confidence: <score>)
  source:    <source_file>
  vendor:    <proposed_vendor_url or ⨯>
  docs:      <proposed_docs_url or ⨯>
  repo:      <proposed_repo_url or ⨯>
  category:  <proposed_category>
  packages:  <proposed_package_ids>
```

Then ask: `(a)pprove  (e)dit  (s)kip  (r)eject  (q)uit`

- **approve**: pipe `{"id":"<uuid>"}` to `candidates.ts approve`. Script refuses if vendor_url or docs_url is missing.
- **edit**: ask user for field overrides, then pipe `{"id":"<uuid>","overrides":{...}}` to `candidates.ts edit`.
- **reject**: pipe `{"id":"<uuid>"}` to `candidates.ts reject`.
- **skip**: leave status as `pending`.
- **quit**: stop. Progress is saved.

Do NOT auto-approve anything. Every candidate requires explicit user input.

After the queue is empty or user quits, summarize counts: approved / rejected / skipped.
