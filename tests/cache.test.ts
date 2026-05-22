import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashContent,
  ageDays,
  isStale,
  listStale,
  STALE_THRESHOLD_DAYS,
  readCachedDoc,
  writeCachedDoc,
  docFilePath,
} from '../src/cache.ts';

test('STALE_THRESHOLD_DAYS is 7 (aligned with build-loop cooldown)', () => {
  assert.equal(STALE_THRESHOLD_DAYS, 7);
});

test('hashContent is stable and content-sensitive', () => {
  assert.equal(hashContent('abc'), hashContent('abc'));
  assert.notEqual(hashContent('abc'), hashContent('abd'));
});

test('ageDays handles missing and invalid stamps as Infinity', () => {
  assert.equal(ageDays(null), Infinity);
  assert.equal(ageDays(undefined), Infinity);
  assert.equal(ageDays('not-a-date'), Infinity);
  assert.ok(ageDays(new Date().toISOString()) < 0.01);
});

test('isStale fires past the threshold, not before', () => {
  const fresh = new Date(Date.now() - 3 * 86400_000).toISOString();
  const stale = new Date(Date.now() - 9 * 86400_000).toISOString();
  assert.equal(isStale(fresh), false);
  assert.equal(isStale(stale), true);
  // exactly at threshold-ish: 6 days is fresh, 8 days is stale
  assert.equal(isStale(new Date(Date.now() - 6 * 86400_000).toISOString()), false);
  assert.equal(isStale(new Date(Date.now() - 8 * 86400_000).toISOString()), true);
});

test('listStale returns only entries past the threshold', () => {
  const entries = [
    { slug: 'a', last_checked: new Date(Date.now() - 2 * 86400_000).toISOString(), file_path: '/x/a.md' },
    { slug: 'b', last_checked: new Date(Date.now() - 10 * 86400_000).toISOString(), file_path: '/x/b.md' },
    { slug: 'c', last_checked: new Date(Date.now() - 30 * 86400_000).toISOString(), file_path: '/x/c.md' },
  ];
  const stale = listStale(entries, () => 'svc');
  assert.equal(stale.length, 2);
  assert.deepEqual(stale.map(s => s.slug).sort(), ['b', 'c']);
  assert.ok(stale.every(s => s.service === 'svc'));
  assert.ok(stale.find(s => s.slug === 'c')!.age_days >= 29);
});

test('writeCachedDoc then readCachedDoc round-trips frontmatter + body', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  const origHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    const written = writeCachedDoc({
      service: 'mcp-spec',
      slug: 'tool-input-schema',
      source_url: 'https://modelcontextprotocol.io/docs',
      body: '# Tool inputSchema\n\nJSON Schema describing tool args.',
    });
    assert.ok(written.file_path.includes('mcp-spec/tool-input-schema.md'));
    assert.equal(written.file_path, docFilePath('mcp-spec', 'tool-input-schema'));

    const read = readCachedDoc('mcp-spec', 'tool-input-schema');
    assert.ok(read);
    assert.equal(read?.frontmatter.service, 'mcp-spec');
    assert.equal(read?.frontmatter.slug, 'tool-input-schema');
    assert.equal(read?.frontmatter.source_url, 'https://modelcontextprotocol.io/docs');
    assert.ok(read?.frontmatter.fetched_at, 'fetched_at stamp present');
    assert.ok(read?.frontmatter.content_hash, 'content_hash present');
    assert.equal(read?.frontmatter.content_hash, hashContent(read!.body));
    assert.match(read!.body, /Tool inputSchema/);
  } finally {
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});

test('readCachedDoc returns null for absent file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apireg-docs-'));
  const origHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    assert.equal(readCachedDoc('nope', 'missing'), null);
  } finally {
    process.env.HOME = origHome;
    rmSync(dir, { recursive: true });
  }
});
