# AGENTS.md — api-registry

Universal AI agent guidance for Claude Code, Codex, Cursor, Copilot, Gemini CLI, and any other AI coding agent working in this repository.

---

## What This Project Is

`api-registry` is a local registry of authoritative API/library/tool source URLs, queried as a pre-coding freshness gate before any API is configured, debugged, or referenced. It stops coding agents from emitting config based on stale training data by providing a verified lookup path: registered service → authoritative docs URL + latest version + deprecation status.

- **npm package:** `@tyroneross/api-registry`
- **Runtime:** Node.js + TypeScript; scripts run via `tsx`
- **Storage:** `~/.api-registry/registry.db` (SQLite, source of truth) + `registry.yaml` (mirror)
- **License:** Apache-2.0

---

## Workflow: Lookup Before Config

**Fire `/api-registry:lookup <name>` before emitting any configuration, import, or version pin for a registered service.** If the service is registered, route the doc question through `/api-registry:docs` rather than answering from training data.

| Situation | Action |
|-----------|--------|
| About to configure, install, or pin a library | `lookup <name>` first |
| User asks a question about a specific API | `docs <name> <query>` — local cache primary, Context7 fallback |
| `lookup` returns `found: false` | Offer `/api-registry:add <name>` |
| Entry has `stale_warning: true` | Run `refresh <name>` before using the version info |
| Entry has `deprecated_notes` | Surface the deprecation warning before proceeding |

The skill is host-neutral — it fires in any host that reads the `SKILL.md` (Claude Code, Codex, Cursor, etc.). This file documents the underlying CLI path for hosts that run scripts directly.

---

## Commands & CLI Equivalents

`${CLAUDE_PLUGIN_ROOT}` resolves to the plugin install directory. All scripts are invoked via the `tsx` runner (devDependency `^4.19.0`).

| Command | Purpose | CLI invocation |
|---------|---------|----------------|
| `init` | Bootstrap DB + seed 20 well-known services | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/init.ts` |
| `scan [--path <dir>]` | Auto-discover services used in local projects (defaults to cwd) | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/scan.ts [--path <dir>]` then `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/candidates.ts list` |
| `add <name>` | Add a single service interactively | `echo '<json>' \| tsx ${CLAUDE_PLUGIN_ROOT}/scripts/add.ts` |
| `lookup <name>` | Show registered sources for a service | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/lookup.ts "<name>"` |
| `docs <name> [query]` | Answer a doc question from local cache; Context7 as fallback | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/docs.ts "<name>" "<query>"` |
| `refresh [<name> \| --all \| --stale]` | Re-check latest versions (default: `--stale`) | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/refresh.ts [args]` then `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/export-yaml.ts` |
| `list [category]` | Browse registry grouped by category | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/list.ts [category]` |
| `staleness` | Detect cached docs past the 7-day freshness window (detect only, no re-fetch) | `tsx ${CLAUDE_PLUGIN_ROOT}/scripts/staleness.ts [--marker]` |

**Notes on multi-step commands:**
- `scan` is two steps: `scan.ts` discovers candidates, then `candidates.ts list` surfaces the review queue. The command walks the user through approve/edit/reject for each candidate — never auto-approves.
- `refresh` ends with `export-yaml.ts` to keep the YAML mirror in sync with SQLite.
- `staleness --marker` refreshes `~/.api-registry/staleness.json`, which the SessionStart hook reads for its session-open nudge.

---

## Key Constraints

- **SQLite is source of truth.** YAML is a read-only mirror. Never write to YAML directly.
- **Never fabricate `vendor_url`, `docs_url`, or `context7_id`.** Leave null if unknown.
- **Curation is in-session.** The host agent fetches and extracts doc sections — no external LLM calls, no background daemon.
- **`staleness` is detect-only.** It flags stale cached docs; it never re-fetches or re-curates anything.
- **No MCP server.** The plugin ships skills, commands, and hooks only. The `.mcp.json` in `tests/fixtures/` is a test fixture for the `scan` parser, not a live server registration.
- **Doc cache lives at `~/.api-registry/docs/<service>/<slug>.md`** — greppable, git-ignored, 7-day freshness contract.

---

## Storage Layout

```
~/.api-registry/
├── registry.db          # SQLite — source of truth
├── registry.yaml        # Human-readable mirror (refreshed by export-yaml.ts)
├── docs/                # Curated doc cache: <service>/<slug>.md
├── staleness.json       # SessionStart hook marker
└── logs/
    └── refresh.log      # Version drift log
```
