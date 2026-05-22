import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  openDatabase,
  insertService,
  getServiceByName,
  insertDocCacheEntry,
  getDocCacheEntry,
  listDocCache,
  updateDocCacheChecked,
} from '../src/db.ts';

const sampleService = {
  name: 'better-auth',
  display_name: 'Better Auth',
  vendor_url: 'https://better-auth.com',
  docs_url: 'https://better-auth.com/docs',
  changelog_url: null,
  repo_url: 'https://github.com/better-auth/better-auth',
  mcp_url: null,
  cli_docs_url: null,
  context7_id: null,
  package_ids: { npm: 'better-auth' },
  category: 'auth' as const,
  latest_version: null,
  last_checked: null,
  models_url: null,
  models: null,
  deprecated_notes: null,
  notes: null,
  author_owned: false,
  maintenance_status: 'unknown' as const,
  latest_version_released_at: null,
};

test('openDatabase creates schema on fresh db', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const db = openDatabase(join(dir, 'test.db'));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name: string}>;
  const names = tables.map(t => t.name).sort();
  assert.deepEqual(names, ['doc_cache', 'refresh_log', 'scan_candidates', 'schema_version', 'services']);
  db.close();
  rmSync(dir, { recursive: true });
});

test('fresh db is at schema_version 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const db = openDatabase(join(dir, 'test.db'));
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number };
  assert.equal(row.version, 2);
  db.close();
  rmSync(dir, { recursive: true });
});

test('services table has the 3 v2 columns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const db = openDatabase(join(dir, 'test.db'));
  const cols = (db.prepare('PRAGMA table_info(services)').all() as Array<{ name: string }>).map(c => c.name);
  assert.ok(cols.includes('author_owned'));
  assert.ok(cols.includes('maintenance_status'));
  assert.ok(cols.includes('latest_version_released_at'));
  db.close();
  rmSync(dir, { recursive: true });
});

test('insert + getServiceByName round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const db = openDatabase(join(dir, 'test.db'));
  insertService(db, sampleService);
  const svc = getServiceByName(db, 'better-auth');
  assert.equal(svc?.display_name, 'Better Auth');
  assert.deepEqual(svc?.package_ids, { npm: 'better-auth' });
  assert.equal(svc?.author_owned, false); // boolean, not 0
  assert.equal(svc?.maintenance_status, 'unknown');
  db.close();
  rmSync(dir, { recursive: true });
});

test('v1 -> v2 migration preserves rows and adds columns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const dbPath = join(dir, 'v1.db');

  // Hand-build a v1-shaped database: services table WITHOUT the 3 v2 columns.
  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    CREATE TABLE services (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      vendor_url TEXT NOT NULL, docs_url TEXT NOT NULL, changelog_url TEXT,
      repo_url TEXT, mcp_url TEXT, cli_docs_url TEXT, context7_id TEXT,
      package_ids TEXT NOT NULL DEFAULT '{}', category TEXT NOT NULL,
      latest_version TEXT, last_checked TEXT, models_url TEXT, models TEXT,
      deprecated_notes TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  raw.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
  raw.prepare(`
    INSERT INTO services (id, name, display_name, vendor_url, docs_url, category)
    VALUES ('legacy-1', 'legacy-svc', 'Legacy', 'https://x.com', 'https://x.com/docs', 'db')
  `).run();
  raw.close();

  // Reopen via openDatabase -> triggers migrateToV2.
  const db = openDatabase(dbPath);
  const version = (db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number }).version;
  assert.equal(version, 2, 'schema_version bumped to 2');

  const svc = getServiceByName(db, 'legacy-svc');
  assert.ok(svc, 'legacy row preserved');
  assert.equal(svc?.display_name, 'Legacy');
  assert.equal(svc?.author_owned, false, 'new column defaults to false');
  assert.equal(svc?.maintenance_status, 'unknown', 'new column defaults to unknown');
  assert.equal(svc?.latest_version_released_at, null, 'new column defaults to null');

  // Migration is idempotent — reopening again must not throw.
  db.close();
  const db2 = openDatabase(dbPath);
  assert.ok(getServiceByName(db2, 'legacy-svc'), 'row survives re-open');
  db2.close();
  rmSync(dir, { recursive: true });
});

test('doc_cache insert + get round-trip with bool coercion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-'));
  const db = openDatabase(join(dir, 'test.db'));
  const sid = insertService(db, sampleService);
  insertDocCacheEntry(db, {
    service_id: sid,
    url: 'https://better-auth.com/docs/config',
    slug: 'config',
    fetched_at: '2026-05-22T00:00:00Z',
    last_checked: '2026-05-22T00:00:00Z',
    content_hash: 'abc123',
    needs_recuration: false,
    file_path: '/tmp/docs/better-auth/config.md',
  });
  const entry = getDocCacheEntry(db, sid, 'config');
  assert.ok(entry);
  assert.equal(entry?.slug, 'config');
  assert.equal(entry?.needs_recuration, false); // boolean, not 0
  assert.equal(entry?.content_hash, 'abc123');

  updateDocCacheChecked(db, entry!.id, '2026-05-23T00:00:00Z', 'def456', true);
  const updated = getDocCacheEntry(db, sid, 'config');
  assert.equal(updated?.content_hash, 'def456');
  assert.equal(updated?.needs_recuration, true);
  assert.equal(updated?.last_checked, '2026-05-23T00:00:00Z');

  assert.equal(listDocCache(db).length, 1);
  db.close();
  rmSync(dir, { recursive: true });
});
