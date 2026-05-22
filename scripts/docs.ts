#!/usr/bin/env tsx
/**
 * docs router — resolves WHERE the in-session Claude should get a doc answer.
 *
 * This script does NOT curate. It inspects the cache + registry and emits a
 * JSON `route` telling Claude which of four paths to take. Curation (WebFetch
 * + section-extract + writeCachedDoc) is performed by the in-session Claude
 * per commands/docs.md, never by an LLM call from here.
 *
 * Routes:
 *   answer_from_cache  — fresh cached doc exists; grep the file, no network
 *   verify_then_answer — cached but stale; Claude runs hashCompare
 *   fetch_and_cache    — no cache; Claude WebFetches docs_url, curates, writes
 *   context7_fallback  — no registered source at all
 *   not_registered     — service unknown
 */
import { openDatabase, getServiceByName, getDocCacheEntry, defaultDbPath } from '../src/db.ts';
import { readCachedDoc, isStale, ageDays, STALE_THRESHOLD_DAYS, docFilePath } from '../src/cache.ts';

const name = process.argv[2];
const query = process.argv.slice(3).join(' ');

if (!name) {
  console.error('usage: tsx scripts/docs.ts <service-name> [query]');
  process.exit(2);
}

/** A stable, filesystem-safe slug for a doc query. */
function slugify(q: string): string {
  const base = q.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'overview';
}

const db = openDatabase(defaultDbPath());
const svc = getServiceByName(db, name);

if (!svc) {
  console.log(JSON.stringify({ route: 'not_registered', service: name }));
  process.exit(0);
}

const slug = slugify(query);
const indexRow = getDocCacheEntry(db, svc.id, slug);
const cached = readCachedDoc(svc.name, slug);

const base = {
  service: svc.name,
  display_name: svc.display_name,
  query,
  slug,
  docs_url: svc.docs_url,
  context7_id: svc.context7_id,
  file_path: docFilePath(svc.name, slug),
  stale_threshold_days: STALE_THRESHOLD_DAYS,
};

if (cached && indexRow) {
  const lastChecked = indexRow.last_checked;
  if (!isStale(lastChecked)) {
    console.log(JSON.stringify({
      route: 'answer_from_cache',
      ...base,
      fetched_at: cached.frontmatter.fetched_at,
      last_checked: lastChecked,
      content_hash: indexRow.content_hash,
      doc_cache_id: indexRow.id,
    }, null, 2));
  } else {
    console.log(JSON.stringify({
      route: 'verify_then_answer',
      ...base,
      fetched_at: cached.frontmatter.fetched_at,
      last_checked: lastChecked,
      age_days: Math.round(ageDays(lastChecked) * 10) / 10,
      content_hash: indexRow.content_hash,
      source_url: cached.frontmatter.source_url,
      doc_cache_id: indexRow.id,
    }, null, 2));
  }
} else if (svc.docs_url) {
  console.log(JSON.stringify({ route: 'fetch_and_cache', ...base }, null, 2));
} else if (svc.context7_id) {
  console.log(JSON.stringify({ route: 'context7_fallback', ...base }, null, 2));
} else {
  console.log(JSON.stringify({ route: 'context7_fallback', ...base, note: 'no docs_url or context7_id registered' }, null, 2));
}
