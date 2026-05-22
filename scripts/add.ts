#!/usr/bin/env tsx
import { openDatabase, insertService, defaultDbPath, getServiceByName } from '../src/db.ts';
import type { Service, Category } from '../src/types.ts';

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const VALID_CATEGORIES: Category[] = ['auth','db','llm','infra','ui','obs','payments','email','storage','search','protocol','other'];

const input = JSON.parse(await readStdin()) as Partial<Service>;
if (!input.name || !input.display_name || !input.vendor_url || !input.docs_url || !input.category) {
  console.error('Required fields: name, display_name, vendor_url, docs_url, category');
  process.exit(2);
}
if (!VALID_CATEGORIES.includes(input.category as Category)) {
  console.error(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  process.exit(2);
}

const db = openDatabase(defaultDbPath());
const existing = getServiceByName(db, input.name);
if (existing) {
  console.log(JSON.stringify({ ok: false, reason: 'already_exists', existing }));
  process.exit(0);
}

const id = insertService(db, {
  name: input.name,
  display_name: input.display_name,
  vendor_url: input.vendor_url,
  docs_url: input.docs_url,
  changelog_url: input.changelog_url ?? null,
  repo_url: input.repo_url ?? null,
  mcp_url: input.mcp_url ?? null,
  cli_docs_url: input.cli_docs_url ?? null,
  context7_id: input.context7_id ?? null,
  package_ids: input.package_ids ?? {},
  category: input.category as Category,
  latest_version: input.latest_version ?? null,
  last_checked: input.last_checked ?? null,
  models_url: input.models_url ?? null,
  models: input.models ?? null,
  deprecated_notes: input.deprecated_notes ?? null,
  notes: input.notes ?? null,
});
console.log(JSON.stringify({ ok: true, id, name: input.name }));
