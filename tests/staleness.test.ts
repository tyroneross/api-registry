import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, insertService, insertDocCacheEntry } from '../src/db.ts';
import { writeCachedDoc } from '../src/cache.ts';

const repoRoot = new URL('..', import.meta.url).pathname;
const stalenessScript = join(repoRoot, 'scripts', 'staleness.ts');

function seedService(home: string) {
  const db = openDatabase(join(home, '.api-registry', 'registry.db'));
  const sid = insertService(db, {
    name: 'mcp-spec', display_name: 'MCP Specification',
    vendor_url: 'https://modelcontextprotocol.io', docs_url: 'https://modelcontextprotocol.io/specification',
    changelog_url: null, repo_url: null, mcp_url: null, cli_docs_url: null, context7_id: null,
    package_ids: {}, category: 'protocol', latest_version: null, last_checked: null,
    models_url: null, models: null, deprecated_notes: null, notes: null,
  });
  return { db, sid };
}

test('staleness detects a doc whose last_checked is 8 days old', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-stale-'));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const { db, sid } = seedService(home);
    const doc = writeCachedDoc({
      service: 'mcp-spec', slug: 'tool-input-schema',
      source_url: 'https://modelcontextprotocol.io/specification',
      body: '# inputSchema\n\ncontent',
      last_checked: new Date(Date.now() - 8 * 86400_000).toISOString(),
    });
    insertDocCacheEntry(db, {
      service_id: sid, url: doc.frontmatter.source_url, slug: 'tool-input-schema',
      fetched_at: doc.frontmatter.fetched_at, last_checked: doc.frontmatter.last_checked,
      content_hash: doc.frontmatter.content_hash, needs_recuration: false, file_path: doc.file_path,
    });
    db.close();

    const out = execFileSync('npx', ['tsx', stalenessScript], {
      env: { ...process.env, HOME: home }, encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.threshold_days, 7);
    assert.equal(parsed.stale_count, 1);
    assert.equal(parsed.stale[0].service, 'mcp-spec');
    assert.equal(parsed.stale[0].slug, 'tool-input-schema');
    assert.ok(parsed.stale[0].age_days >= 7);
  } finally {
    process.env.HOME = origHome;
    rmSync(home, { recursive: true });
  }
});

test('a fresh doc is not reported stale', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-stale-'));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const { db, sid } = seedService(home);
    const doc = writeCachedDoc({
      service: 'mcp-spec', slug: 'fresh',
      source_url: 'https://modelcontextprotocol.io/specification',
      body: '# fresh\n\ncontent',
    });
    insertDocCacheEntry(db, {
      service_id: sid, url: doc.frontmatter.source_url, slug: 'fresh',
      fetched_at: doc.frontmatter.fetched_at, last_checked: doc.frontmatter.last_checked,
      content_hash: doc.frontmatter.content_hash, needs_recuration: false, file_path: doc.file_path,
    });
    db.close();

    const out = execFileSync('npx', ['tsx', stalenessScript], {
      env: { ...process.env, HOME: home }, encoding: 'utf8',
    });
    assert.equal(JSON.parse(out).stale_count, 0);
  } finally {
    process.env.HOME = origHome;
    rmSync(home, { recursive: true });
  }
});

test('--marker writes staleness.json', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-stale-'));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const { db, sid } = seedService(home);
    const doc = writeCachedDoc({
      service: 'mcp-spec', slug: 'old',
      source_url: 'https://modelcontextprotocol.io/specification',
      body: '# old\n\ncontent',
      last_checked: new Date(Date.now() - 20 * 86400_000).toISOString(),
    });
    insertDocCacheEntry(db, {
      service_id: sid, url: doc.frontmatter.source_url, slug: 'old',
      fetched_at: doc.frontmatter.fetched_at, last_checked: doc.frontmatter.last_checked,
      content_hash: doc.frontmatter.content_hash, needs_recuration: false, file_path: doc.file_path,
    });
    db.close();

    execFileSync('npx', ['tsx', stalenessScript, '--marker'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8',
    });
    const markerPath = join(home, '.api-registry', 'staleness.json');
    assert.ok(existsSync(markerPath), 'marker file written');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    assert.equal(marker.stale_count, 1);
    assert.equal(marker.threshold_days, 7);
  } finally {
    process.env.HOME = origHome;
    rmSync(home, { recursive: true });
  }
});
