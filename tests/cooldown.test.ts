import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cooldownVerdict, COOLDOWN_DAYS } from '../src/cooldown.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

test('COOLDOWN_DAYS is 7 (aligned with build-loop install cooldown + doc staleness)', () => {
  assert.equal(COOLDOWN_DAYS, 7);
});

test('fresh third-party release (<7d) is install_blocked', () => {
  const v = cooldownVerdict({
    author_owned: false,
    latest_version: '2.1.0',
    latest_version_released_at: daysAgo(2),
  });
  assert.equal(v.install_blocked, true);
  assert.match(v.reason!, /2\.1\.0 released 2 days ago/);
  assert.match(v.reason!, /<7d cooldown/);
  assert.equal(v.author_owned, false);
});

test('old third-party release (>7d) is NOT blocked', () => {
  const v = cooldownVerdict({
    author_owned: false,
    latest_version: '2.1.0',
    latest_version_released_at: daysAgo(30),
  });
  assert.equal(v.install_blocked, false);
  assert.equal(v.reason, null);
});

test('author-owned package is exempt even with a fresh release', () => {
  const v = cooldownVerdict({
    author_owned: true,
    latest_version: '0.3.0',
    latest_version_released_at: daysAgo(1),
  });
  assert.equal(v.install_blocked, false);
  assert.equal(v.reason, null);
  assert.equal(v.author_owned, true);
});

test('unknown release date fails open (not blocked)', () => {
  const v = cooldownVerdict({
    author_owned: false,
    latest_version: '1.0.0',
    latest_version_released_at: null,
  });
  assert.equal(v.install_blocked, false);
  assert.equal(v.release_age_days, null);
});

test('release exactly at the 7-day boundary is not blocked', () => {
  const v = cooldownVerdict({
    author_owned: false,
    latest_version: '1.0.0',
    latest_version_released_at: daysAgo(7.1),
  });
  assert.equal(v.install_blocked, false);
});

test('singular vs plural day count in the reason string', () => {
  const oneDay = cooldownVerdict({
    author_owned: false, latest_version: 'v1', latest_version_released_at: daysAgo(1.2),
  });
  assert.match(oneDay.reason!, /1 day ago/);
  assert.doesNotMatch(oneDay.reason!, /1 days ago/);
});
