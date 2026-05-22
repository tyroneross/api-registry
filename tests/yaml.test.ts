import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dumpServices, parseServices } from '../src/yaml.ts';
import type { Service } from '../src/types.ts';

const fixture: Service = {
  id: 'uuid-1', name: 'groq', display_name: 'Groq',
  vendor_url: 'https://groq.com', docs_url: 'https://console.groq.com/docs',
  changelog_url: null, repo_url: null, mcp_url: null, cli_docs_url: null,
  context7_id: null, package_ids: { npm: 'groq-sdk' }, category: 'llm',
  latest_version: '0.8.0', last_checked: '2026-04-22T00:00:00Z',
  models_url: 'https://console.groq.com/docs/models',
  models: [{ id: 'llama-3.3-70b-versatile', status: 'production' }],
  deprecated_notes: null, notes: 'quote: "fast"',
  author_owned: false, maintenance_status: 'unknown', latest_version_released_at: null,
  created_at: '2026-04-22T00:00:00Z', updated_at: '2026-04-22T00:00:00Z',
};

test('dump then parse round-trip', () => {
  const yaml = dumpServices([fixture]);
  const parsed = parseServices(yaml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.name, 'groq');
  assert.deepEqual(parsed[0]!.package_ids, { npm: 'groq-sdk' });
  assert.equal(parsed[0]!.models?.[0]?.id, 'llama-3.3-70b-versatile');
  assert.equal(parsed[0]!.notes, 'quote: "fast"');
});

test('dump handles null + empty object fields', () => {
  const yaml = dumpServices([fixture]);
  assert.match(yaml, /changelog_url: null/);
  assert.match(yaml, /name: groq/);
});
