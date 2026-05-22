---
description: Answer a question about a service from the local doc cache (Context7 only as fallback)
argument-hint: <service-name> [query text]
---

# /api-registry:docs $ARGUMENTS

Parse $ARGUMENTS: first token = service name, rest = query (may be empty).

Step 1 — resolve the route:

```bash
tsx ${CLAUDE_PLUGIN_ROOT}/scripts/docs.ts "<service-name>" "<query>"
```

The script emits a JSON `route`. Act on it:

### route: `not_registered`
- Tell the user: "`<name>` is not in the registry. Add via `/api-registry:add <name>`."
- Do NOT answer from training data. Stop.

### route: `answer_from_cache`
- A fresh cached doc exists (`last_checked` < 7 days). **No network.**
- Read the file at `file_path`, grep/extract the section relevant to the query, and answer from it.
- Footer:
  ```
  ---
  Source: <docs_url> (cached <fetched_at>, verified <last_checked>)
  ```

### route: `verify_then_answer`
- A cached doc exists but is stale (`last_checked` > 7 days).
- Do a cheap change-check: `WebFetch` `source_url` and compare. (Programmatically, `src/cache.ts` `hashCompare` does GET + SHA-256 vs the stored `content_hash`.)
  - **Unchanged** → answer from the cached file; bump `last_checked` by calling `updateDocCacheChecked` (use `tsx` against `src/db.ts`, or note it for `/api-registry:refresh`).
  - **Changed** → `WebFetch` the full doc, curate the section relevant to the query, then rewrite the cache file via `writeCachedDoc` (this updates `fetched_at`, `last_checked`, `content_hash`). Answer from the fresh content.
- Footer cites `Source: <docs_url> (re-verified <today>)`.

### route: `fetch_and_cache`
- No cached doc yet. `WebFetch` the registered `docs_url` with the query as the prompt.
- **Curate**: extract only the section relevant to the query (you are the curator — no external LLM call).
- Write the curated markdown to the cache: call `writeCachedDoc({ service, slug, source_url: docs_url, body })` and record the index row via `insertDocCacheEntry`. The script's JSON gives you `service`, `slug`, and `file_path`.
- Answer from the curated content. Footer cites `Source: <docs_url> (cached <today>)`.

### route: `context7_fallback`
- Only reached when the service has no registered `docs_url`.
- If `context7_id` is set AND Context7 MCP is available, call `mcp__plugin_context7_context7__query-docs` with `libraryName: <context7_id>`.
- Cite `Source: Context7 <context7_id>`.

**RULES:**
- The local cache is the primary path. Context7 is fallback only — reached when no `docs_url` is registered.
- Curation (fetch + section-extract) is done by **you, the in-session Claude**. Never an external LLM call. Never a background daemon.
- Never answer from training data when a registered source exists.
- If a `WebFetch` and Context7 both fail: `⚠️ Sources unreachable. Consult <docs_url> directly; do not infer from memory.`
- Doc cache files live at `~/.api-registry/docs/<service>/<slug>.md` — greppable, git-ignored.
