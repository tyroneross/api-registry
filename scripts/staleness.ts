#!/usr/bin/env tsx
/**
 * Staleness detector — DETECT ONLY. Lists cached docs whose `last_checked`
 * exceeds the 7-day threshold. It never curates and never fetches; it flags.
 *
 * Modes:
 *   (default)  print the stale list as JSON to stdout
 *   --marker   write ~/.api-registry/staleness.json (consumed by the
 *              SessionStart hook to emit a one-line additionalContext)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase, listDocCache, listServices, defaultDbPath } from '../src/db.ts';
import { listStale, STALE_THRESHOLD_DAYS } from '../src/cache.ts';

const marker = process.argv.includes('--marker');

const db = openDatabase(defaultDbPath());
const services = listServices(db);
const idToName = new Map(services.map(s => [s.id, s.name]));

const docs = listDocCache(db);
const stale = listStale(docs, e => idToName.get((e as any).service_id) ?? 'unknown', STALE_THRESHOLD_DAYS);

const payload = {
  generated_at: new Date().toISOString(),
  threshold_days: STALE_THRESHOLD_DAYS,
  stale_count: stale.length,
  stale,
};

if (marker) {
  const markerPath = `${process.env.HOME}/.api-registry/staleness.json`;
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, marker_path: markerPath, stale_count: stale.length }));
} else {
  console.log(JSON.stringify(payload, null, 2));
}
