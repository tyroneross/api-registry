# CLAUDE.md — api-registry plugin

## Invariants
- SQLite is source of truth. YAML is a mirror only.
- Never fabricate `vendor_url`, `docs_url`, or `context7_id`. If unknown, leave null.
- Never answer API/library questions from training data when a registered entry exists.
- Commands are markdown that invoke scripts via `tsx`. Scripts must always emit JSON (or clear error messages).
- Doc *content* is cached locally as markdown under `~/.api-registry/docs/<service>/<slug>.md` with a 7-day freshness contract. The SQLite `doc_cache` table is the index; the markdown files are the payload. Curation (fetch + section-extract) is done by the **in-session Claude**, never an external LLM call and never a background daemon. The staleness detector flags only — it never curates.

## Extension rules
- Add a new field to `Service` or `DocCacheEntry`? → migrate schema (forward, non-destructive) + update seed + update YAML serializer + update all renderers + update tests.
- Add a new command? → must update `.claude-plugin/plugin.json` in the same commit.
- Add a new parser? → must include fixture + test.
- Schema migrations bump `schema_version` and run additive `ALTER`/`CREATE` only — never drop a column or table.

## Do not
- Encrypt entries. This is public info.
- Add sync/cloud features.
- Run an LLM call or background daemon to curate docs. The in-session Claude is the curator.
