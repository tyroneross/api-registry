import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOwnedConfig, isAuthorOwned, type OwnedConfig } from '../src/owned.ts';

// Synthetic owned data — never the author's real projects.
const synthetic: OwnedConfig = {
  scopes: ['@acme/*'],
  projects: ['widget-engine', 'sprocket-cli'],
};

test('loadOwnedConfig returns null when the file is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-'));
  try {
    assert.equal(loadOwnedConfig(join(dir, 'missing.json')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOwnedConfig parses a well-formed file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-'));
  try {
    const p = join(dir, 'owned.json');
    writeFileSync(p, JSON.stringify(synthetic), 'utf8');
    const cfg = loadOwnedConfig(p);
    assert.deepEqual(cfg, synthetic);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOwnedConfig returns null on malformed JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-'));
  try {
    const p = join(dir, 'owned.json');
    writeFileSync(p, '{ not json', 'utf8');
    assert.equal(loadOwnedConfig(p), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadOwnedConfig tolerates missing/wrong-typed fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-'));
  try {
    const p = join(dir, 'owned.json');
    writeFileSync(p, JSON.stringify({ scopes: 'nope' }), 'utf8');
    assert.deepEqual(loadOwnedConfig(p), { scopes: [], projects: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isAuthorOwned is false when config is null', () => {
  assert.equal(isAuthorOwned({ name: 'widget-engine' }, null), false);
});

test('isAuthorOwned matches a service by project name', () => {
  assert.equal(isAuthorOwned({ name: 'widget-engine' }, synthetic), true);
  assert.equal(isAuthorOwned({ name: 'some-other-lib' }, synthetic), false);
});

test('isAuthorOwned matches a service by npm scope glob', () => {
  assert.equal(
    isAuthorOwned({ name: 'unrelated', package_ids: { npm: '@acme/toolkit' } }, synthetic),
    true,
  );
  assert.equal(
    isAuthorOwned({ name: 'unrelated', package_ids: { npm: '@other/toolkit' } }, synthetic),
    false,
  );
});

test('isAuthorOwned is false for a generic service with no match', () => {
  assert.equal(
    isAuthorOwned({ name: 'anthropic', package_ids: { npm: '@anthropic-ai/sdk' } }, synthetic),
    false,
  );
});
