# api-registry

Local registry of authoritative API/library/tool source URLs, queried before any API is configured or debugged. Stops Claude Code from emitting config based on stale training data.

## Install

```bash
cd /path/to/api-registry
npm install
tsx scripts/init.ts
```

Register as a Claude Code plugin (add to your user-level `~/.claude/config.json` or install via marketplace).

### Owned-project setup (optional)

To exempt your own projects/scopes from the package-install cooldown, copy the
template and edit it before running `init`:

```bash
mkdir -p ~/.api-registry
cp data/owned.example.json ~/.api-registry/owned.json
# edit ~/.api-registry/owned.json — list your npm scopes and project names
```

`~/.api-registry/owned.json` lives in your home directory and is never
committed. `init` reads it and marks the matching services `author_owned` in
the registry DB.

## Commands

- `/api-registry:init` — bootstrap DB + seed 20 services
- `/api-registry:scan [--path <dir>]` — discover services used in projects under a directory (defaults to the current working directory)
- `/api-registry:add <name>` — add a single service
- `/api-registry:lookup <name>` — show registered sources
- `/api-registry:docs <name> [query]` — route doc question through Context7/WebFetch
- `/api-registry:refresh [<name> | --all | --stale]` — re-check latest versions
- `/api-registry:list [category]` — browse registry

## How it's used

When you say *"configure better-auth"* or *"what groq models are available"*, the **api-registry** skill fires, looks up the service, and routes your question to the authoritative docs instead of training data.

Build-loop and debugger plugins consult it via the `build-loop-bridge` contract.

## Data location

`~/.api-registry/`
- `registry.db` — SQLite source of truth
- `registry.yaml` — human-readable mirror
- `logs/refresh.log` — version drift log

## Dev

```bash
npm test             # unit + integration
npm run typecheck
```
