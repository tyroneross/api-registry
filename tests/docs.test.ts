import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, insertService, insertDocCacheEntry } from '../src/db.ts';
import { writeCachedDoc } from '../src/cache.ts';

const repoRoot = new URL('..', import.meta.url).pathname;
const docsScript = join(repoRoot, 'scripts', 'docs.ts');

function run(home: string, args: string[]) {
  const out = execFileSync('npx', ['tsx', docsScript, ...args], {
    env: { ...process.env, HOME: home }, encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('docs router: not_registered for an unknown service', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  try {
    openDatabase(join(home, '.api-registry', 'registry.db')).close();
    const r = run(home, ['totally-unknown', 'anything']);
    assert.equal(r.route, 'not_registered');
  } finally {
    rmSync(home, { recursive: true });
  }
});

test('docs router: fetch_and_cache when service registered but no cached doc', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  try {
    const db = openDatabase(join(home, '.api-registry', 'registry.db'));
    insertService(db, {
      name: 'mcp-spec', display_name: 'MCP Specification',
      vendor_url: 'https://modelcontextprotocol.io', docs_url: 'https://modelcontextprotocol.io/specification',
      changelog_url: null, repo_url: null, mcp_url: null, cli_docs_url: null, context7_id: null,
      package_ids: {}, category: 'protocol', latest_version: null, last_checked: null,
      models_url: null, models: null, deprecated_notes: null, notes: null,
    });
    db.close();
    const r = run(home, ['mcp-spec', 'tool inputSchema']);
    assert.equal(r.route, 'fetch_and_cache');
    assert.equal(r.slug, 'tool-inputschema');
    assert.equal(r.docs_url, 'https://modelcontextprotocol.io/specification');
  } finally {
    rmSync(home, { recursive: true });
  }
});

test('docs router: answer_from_cache for a fresh cached doc, no network', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const db = openDatabase(join(home, '.api-registry', 'registry.db'));
    const sid = insertService(db, {
      name: 'mcp-spec', display_name: 'MCP Specification',
      vendor_url: 'https://modelcontextprotocol.io', docs_url: 'https://modelcontextprotocol.io/specification',
      changelog_url: null, repo_url: null, mcp_url: null, cli_docs_url: null, context7_id: null,
      package_ids: {}, category: 'protocol', latest_version: null, last_checked: null,
      models_url: null, models: null, deprecated_notes: null, notes: null,
    });
    const doc = writeCachedDoc({
      service: 'mcp-spec', slug: 'tool-inputschema',
      source_url: 'https://modelcontextprotocol.io/specification',
      body: '# Tool inputSchema\n\nJSON Schema for tool args.',
    });
    insertDocCacheEntry(db, {
      service_id: sid, url: doc.frontmatter.source_url, slug: 'tool-inputschema',
      fetched_at: doc.frontmatter.fetched_at, last_checked: doc.frontmatter.last_checked,
      content_hash: doc.frontmatter.content_hash, needs_recuration: false, file_path: doc.file_path,
    });
    db.close();
    const r = run(home, ['mcp-spec', 'tool inputSchema']);
    assert.equal(r.route, 'answer_from_cache');
    assert.ok(r.fetched_at);
    assert.equal(r.content_hash, doc.frontmatter.content_hash);
  } finally {
    process.env.HOME = origHome;
    rmSync(home, { recursive: true });
  }
});

test('docs router: verify_then_answer for a stale cached doc', () => {
  const home = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  const origHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const db = openDatabase(join(home, '.api-registry', 'registry.db'));
    const sid = insertService(db, {
      name: 'mcp-spec', display_name: 'MCP Specification',
      vendor_url: 'https://modelcontextprotocol.io', docs_url: 'https://modelcontextprotocol.io/specification',
      changelog_url: null, repo_url: null, mcp_url: null, cli_docs_url: null, context7_id: null,
      package_ids: {}, category: 'protocol', latest_version: null, last_checked: null,
      models_url: null, models: null, deprecated_notes: null, notes: null,
    });
    const doc = writeCachedDoc({
      service: 'mcp-spec', slug: 'overview',
      source_url: 'https://modelcontextprotocol.io/specification',
      body: '# Overview\n\ncontent',
      last_checked: new Date(Date.now() - 12 * 86400_000).toISOString(),
    });
    insertDocCacheEntry(db, {
      service_id: sid, url: doc.frontmatter.source_url, slug: 'overview',
      fetched_at: doc.frontmatter.fetched_at, last_checked: doc.frontmatter.last_checked,
      content_hash: doc.frontmatter.content_hash, needs_recuration: false, file_path: doc.file_path,
    });
    db.close();
    const r = run(home, ['mcp-spec', '']);
    assert.equal(r.route, 'verify_then_answer');
    assert.ok(r.age_days >= 11);
    assert.equal(r.source_url, 'https://modelcontextprotocol.io/specification');
  } finally {
    process.env.HOME = origHome;
    rmSync(home, { recursive: true });
  }
});
