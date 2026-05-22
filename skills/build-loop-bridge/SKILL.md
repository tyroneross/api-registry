---
name: build-loop-bridge
description: Contract for external plugins (build-loop, debugger, research) to consult api-registry during API setup or debug. Reads ~/.api-registry/registry.db; exits silently if absent.
---

# build-loop-bridge — Contract

This skill is invoked by **other plugins** (build-loop, debugger, research) that want authoritative-source checks without hard-coupling to api-registry internals.

## Contract

Consumers should:

1. Check filesystem: `~/.api-registry/registry.db` exists?
2. If **not**: log `api-registry not installed — skipping source verification` and continue their flow. Do NOT fail.
3. If **yes**: invoke one of:
   - `/api-registry:lookup <name>` — read entry
   - `/api-registry:docs <name> <query>` — get routed answer
   - `/api-registry:refresh <name>` — re-check version before config

## Recommended trigger points

- **Before** writing any API config (`.env`, client init, auth setup).
- **When** an API call fails with 401/403/404 and stale docs are suspected.
- **After** dependency upgrade (refresh the upgraded packages).

## Stability promise

These three commands are the stable external API:
- `lookup` — input: name; output: JSON service record
- `docs` — input: name + query; output: answered text with citation
- `refresh` — input: name/--all/--stale; output: drift summary JSON

Internals (scripts, DB schema, YAML layout) may change without notice.
