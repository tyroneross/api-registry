#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { openDatabase, insertService, getServiceByName, defaultDbPath } from '../src/db.ts';
import { loadOwnedConfig, isAuthorOwned, ownedConfigPath } from '../src/owned.ts';
import type { Service, Category } from '../src/types.ts';

const SEED_PATH = new URL('../data/seed.json', import.meta.url).pathname;
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Array<Partial<Service>>;

// Author-owned designation is user-specific runtime data — read from
// ~/.api-registry/owned.json, never from the shipped seed.
const owned = loadOwnedConfig();

const db = openDatabase(defaultDbPath());

let inserted = 0, skipped = 0, ownedMarked = 0;
for (const s of seed) {
  if (!s.name || !s.display_name || !s.vendor_url || !s.docs_url || !s.category) continue;
  if (getServiceByName(db, s.name)) { skipped++; continue; }
  const authorOwned = isAuthorOwned(
    { name: s.name, package_ids: s.package_ids ?? {} },
    owned,
  );
  if (authorOwned) ownedMarked++;
  insertService(db, {
    name: s.name,
    display_name: s.display_name,
    vendor_url: s.vendor_url,
    docs_url: s.docs_url,
    changelog_url: s.changelog_url ?? null,
    repo_url: s.repo_url ?? null,
    mcp_url: s.mcp_url ?? null,
    cli_docs_url: s.cli_docs_url ?? null,
    context7_id: s.context7_id ?? null,
    package_ids: s.package_ids ?? {},
    category: s.category as Category,
    latest_version: null,
    last_checked: null,
    models_url: s.models_url ?? null,
    models: null,
    deprecated_notes: s.deprecated_notes ?? null,
    notes: s.notes ?? null,
    author_owned: authorOwned,
    maintenance_status: s.maintenance_status ?? 'unknown',
    latest_version_released_at: s.latest_version_released_at ?? null,
  });
  inserted++;
}

console.log(JSON.stringify({
  ok: true,
  db_path: defaultDbPath(),
  seed_inserted: inserted,
  seed_skipped: skipped,
  seed_total: seed.length,
  owned_config: owned ? ownedConfigPath() : null,
  owned_marked: ownedMarked,
}, null, 2));
