import Database, { type Database as DB } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Service, ScanCandidate, RefreshLogEntry, DocCacheEntry } from './types.ts';

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  vendor_url TEXT NOT NULL,
  docs_url TEXT NOT NULL,
  changelog_url TEXT,
  repo_url TEXT,
  mcp_url TEXT,
  cli_docs_url TEXT,
  context7_id TEXT,
  package_ids TEXT NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN (
    'auth','db','llm','infra','ui','obs','payments','email','storage','search','protocol','other'
  )),
  latest_version TEXT,
  last_checked TEXT,
  models_url TEXT,
  models TEXT,
  deprecated_notes TEXT,
  notes TEXT,
  author_owned INTEGER NOT NULL DEFAULT 0,
  maintenance_status TEXT NOT NULL DEFAULT 'unknown' CHECK (maintenance_status IN ('active','archived','unknown')),
  latest_version_released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_last_checked ON services(last_checked);

CREATE TABLE IF NOT EXISTS scan_candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_project TEXT NOT NULL,
  source_file TEXT NOT NULL,
  proposed_vendor_url TEXT,
  proposed_docs_url TEXT,
  proposed_repo_url TEXT,
  proposed_context7_id TEXT,
  proposed_package_ids TEXT NOT NULL DEFAULT '{}',
  proposed_category TEXT NOT NULL DEFAULT 'other',
  confidence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','edited')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON scan_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_name ON scan_candidates(name);

CREATE TABLE IF NOT EXISTS refresh_log (
  id INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  old_version TEXT,
  new_version TEXT,
  source TEXT NOT NULL CHECK (source IN ('npm','pypi','github','context7','manual')),
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refresh_service ON refresh_log(service_id);

CREATE TABLE IF NOT EXISTS doc_cache (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  slug TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  last_checked TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  needs_recuration INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  UNIQUE (service_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_doc_cache_service ON doc_cache(service_id);
CREATE INDEX IF NOT EXISTS idx_doc_cache_last_checked ON doc_cache(last_checked);
`;

/**
 * Forward, non-destructive v1 -> v2 migration. Idempotent: each ALTER is
 * guarded so a re-run is a no-op. New `services` columns get their DEFAULTs
 * on existing rows; no data is dropped. `doc_cache` is created by db.exec(SCHEMA).
 */
function migrateToV2(db: DB): void {
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const current = row?.version ?? 0;
  if (current >= 2) return;

  const v2Columns = [
    "ALTER TABLE services ADD COLUMN author_owned INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE services ADD COLUMN maintenance_status TEXT NOT NULL DEFAULT 'unknown'",
    "ALTER TABLE services ADD COLUMN latest_version_released_at TEXT",
  ];
  for (const stmt of v2Columns) {
    try {
      db.exec(stmt);
    } catch (err) {
      // "duplicate column name" => column already present; safe to ignore.
      if (!String(err).includes('duplicate column name')) throw err;
    }
  }
  db.prepare('UPDATE schema_version SET version = 2').run();
}

export function openDatabase(path: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  migrateToV2(db);
  return db;
}

export function defaultDbPath(): string {
  return `${process.env.HOME}/.api-registry/registry.db`;
}

/**
 * Input shape for `insertService`. The three v2 fields are OPTIONAL here and
 * default at write time — existing callers (scan/init/add) need not be touched,
 * and the seed layer can opt in to `author_owned`/`maintenance_status` per row.
 * The read shape (`Service`) keeps them required: `rowToService` always
 * populates them from column DEFAULTs.
 */
type ServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'
  | 'author_owned' | 'maintenance_status' | 'latest_version_released_at'> & {
  author_owned?: boolean;
  maintenance_status?: Service['maintenance_status'];
  latest_version_released_at?: string | null;
};

export function insertService(db: DB, input: ServiceInput): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO services (
      id, name, display_name, vendor_url, docs_url, changelog_url, repo_url,
      mcp_url, cli_docs_url, context7_id, package_ids, category, latest_version,
      last_checked, models_url, models, deprecated_notes, notes,
      author_owned, maintenance_status, latest_version_released_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, input.name, input.display_name, input.vendor_url, input.docs_url,
    input.changelog_url, input.repo_url, input.mcp_url, input.cli_docs_url,
    input.context7_id, JSON.stringify(input.package_ids), input.category,
    input.latest_version, input.last_checked, input.models_url,
    input.models ? JSON.stringify(input.models) : null,
    input.deprecated_notes, input.notes,
    input.author_owned ? 1 : 0, input.maintenance_status ?? 'unknown',
    input.latest_version_released_at ?? null,
  );
  return id;
}

function rowToService(row: any): Service {
  return {
    ...row,
    package_ids: row.package_ids ? JSON.parse(row.package_ids) : {},
    models: row.models ? JSON.parse(row.models) : null,
    author_owned: !!row.author_owned,
  };
}

export function getServiceByName(db: DB, name: string): Service | null {
  const row = db.prepare('SELECT * FROM services WHERE name = ?').get(name);
  return row ? rowToService(row) : null;
}

export function listServices(db: DB, category?: string): Service[] {
  const rows = category
    ? db.prepare('SELECT * FROM services WHERE category = ? ORDER BY name').all(category)
    : db.prepare('SELECT * FROM services ORDER BY category, name').all();
  return (rows as any[]).map(rowToService);
}

export function updateServiceVersion(db: DB, id: string, version: string, source: RefreshLogEntry['source']): void {
  const prev = db.prepare('SELECT latest_version FROM services WHERE id = ?').get(id) as { latest_version: string | null } | undefined;
  db.prepare(`
    UPDATE services SET latest_version = ?, last_checked = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(version, id);
  db.prepare(`
    INSERT INTO refresh_log (service_id, old_version, new_version, source) VALUES (?,?,?,?)
  `).run(id, prev?.latest_version ?? null, version, source);
}

/** Set the publish date of the current `latest_version` (drives the cooldown verdict). */
export function updateServiceReleaseDate(db: DB, id: string, releasedAt: string | null): void {
  db.prepare(`
    UPDATE services SET latest_version_released_at = ?, updated_at = datetime('now') WHERE id = ?
  `).run(releasedAt, id);
}

export function insertCandidate(db: DB, c: Omit<ScanCandidate, 'id' | 'created_at' | 'status'> & { status?: ScanCandidate['status'] }): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO scan_candidates (
      id, name, source_project, source_file, proposed_vendor_url, proposed_docs_url,
      proposed_repo_url, proposed_context7_id, proposed_package_ids, proposed_category,
      confidence, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, c.name, c.source_project, c.source_file, c.proposed_vendor_url, c.proposed_docs_url,
    c.proposed_repo_url, c.proposed_context7_id, JSON.stringify(c.proposed_package_ids),
    c.proposed_category, c.confidence, c.status ?? 'pending',
  );
  return id;
}

export function pendingCandidates(db: DB): ScanCandidate[] {
  const rows = db.prepare("SELECT * FROM scan_candidates WHERE status = 'pending' ORDER BY confidence DESC, name").all();
  return (rows as any[]).map(r => ({ ...r, proposed_package_ids: JSON.parse(r.proposed_package_ids) }));
}

export function setCandidateStatus(db: DB, id: string, status: ScanCandidate['status']): void {
  db.prepare('UPDATE scan_candidates SET status = ? WHERE id = ?').run(status, id);
}

// --- doc_cache CRUD --------------------------------------------------------

function rowToDocCache(row: any): DocCacheEntry {
  return { ...row, needs_recuration: !!row.needs_recuration };
}

export function insertDocCacheEntry(db: DB, entry: Omit<DocCacheEntry, 'id'>): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO doc_cache (
      id, service_id, url, slug, fetched_at, last_checked, content_hash,
      needs_recuration, file_path
    ) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(service_id, slug) DO UPDATE SET
      url = excluded.url,
      fetched_at = excluded.fetched_at,
      last_checked = excluded.last_checked,
      content_hash = excluded.content_hash,
      needs_recuration = excluded.needs_recuration,
      file_path = excluded.file_path
  `).run(
    id, entry.service_id, entry.url, entry.slug, entry.fetched_at,
    entry.last_checked, entry.content_hash, entry.needs_recuration ? 1 : 0,
    entry.file_path,
  );
  return id;
}

export function getDocCacheEntry(db: DB, serviceId: string, slug: string): DocCacheEntry | null {
  const row = db.prepare('SELECT * FROM doc_cache WHERE service_id = ? AND slug = ?').get(serviceId, slug);
  return row ? rowToDocCache(row) : null;
}

export function listDocCache(db: DB): DocCacheEntry[] {
  const rows = db.prepare('SELECT * FROM doc_cache ORDER BY last_checked').all();
  return (rows as any[]).map(rowToDocCache);
}

export function updateDocCacheChecked(
  db: DB,
  id: string,
  lastChecked: string,
  contentHash: string,
  needsRecuration: boolean,
): void {
  db.prepare(`
    UPDATE doc_cache SET last_checked = ?, content_hash = ?, needs_recuration = ? WHERE id = ?
  `).run(lastChecked, contentHash, needsRecuration ? 1 : 0, id);
}
