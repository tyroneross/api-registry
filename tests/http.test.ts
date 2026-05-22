import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchNpmLatest, fetchPypiLatest, fetchGitHubLatestRelease } from '../src/http.ts';

const skip = process.env.SKIP_NETWORK === '1';

test('fetchNpmLatest returns version for known package', { skip }, async () => {
  const v = await fetchNpmLatest('better-sqlite3');
  assert.match(v!, /^\d+\.\d+\.\d+/);
});

test('fetchPypiLatest returns version for known package', { skip }, async () => {
  const v = await fetchPypiLatest('requests');
  assert.match(v!, /^\d+\.\d+/);
});

test('fetchNpmLatest returns null for nonexistent package', { skip }, async () => {
  const v = await fetchNpmLatest('this-package-does-not-exist-12345-xyz');
  assert.equal(v, null);
});

test('fetchGitHubLatestRelease returns tag for known repo', { skip }, async () => {
  const v = await fetchGitHubLatestRelease('better-auth', 'better-auth');
  assert.ok(v && v.length > 0);
});
