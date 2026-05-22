#!/usr/bin/env tsx
import { openDatabase, getServiceByName, defaultDbPath } from '../src/db.ts';
import { cooldownVerdict } from '../src/cooldown.ts';
import { STALE_THRESHOLD_DAYS } from '../src/cache.ts';

const name = process.argv[2];
if (!name) {
  console.error('usage: tsx scripts/lookup.ts <service-name>');
  process.exit(2);
}

const db = openDatabase(defaultDbPath());
const svc = getServiceByName(db, name);
if (!svc) {
  console.log(JSON.stringify({ found: false, name }));
  process.exit(0);
}

const stale = svc.last_checked
  ? (Date.now() - new Date(svc.last_checked).getTime()) / (1000 * 60 * 60 * 24)
  : null;

const cooldown = cooldownVerdict(svc);

console.log(JSON.stringify({
  found: true,
  service: svc,
  staleness_days: stale,
  stale_warning: stale !== null && stale > STALE_THRESHOLD_DAYS,
  cooldown,
}, null, 2));
