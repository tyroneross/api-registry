/**
 * Doc-content cache layer.
 *
 * Cached docs are markdown files at ~/.api-registry/docs/<service>/<slug>.md,
 * each with YAML frontmatter (source_url, service, fetched_at, last_checked,
 * content_hash). The files are the payload; the SQLite `doc_cache` table is
 * the index. Files are greppable and git-ignored.
 *
 * Staleness is measured on `last_checked` (the last cheap hash-compare),
 * NOT on `fetched_at` (the last full curate). Threshold default: 7 days,
 * deliberately aligned with build-loop's package-install cooldown.
 *
 * Curation (fetch + section-extract + rewrite) is done by the in-session
 * Claude. This module does file IO + cheap hash comparison only — no LLM
 * call, no background daemon.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const STALE_THRESHOLD_DAYS = 7;

export interface CachedDocFrontmatter {
  source_url: string;
  service: string;
  slug: string;
  fetched_at: string;
  last_checked: string;
  content_hash: string;
}

export interface CachedDoc {
  frontmatter: CachedDocFrontmatter;
  body: string;
  file_path: string;
}

/** Root of the markdown doc cache. */
export function docsRoot(): string {
  return `${process.env.HOME}/.api-registry/docs`;
}

/** Absolute path of a cached doc file for a given service + slug. */
export function docFilePath(service: string, slug: string): string {
  return join(docsRoot(), service, `${slug}.md`);
}

/** SHA-256 of doc content — the cheap change-detection primitive. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function serializeFrontmatter(fm: CachedDocFrontmatter): string {
  return [
    '---',
    `source_url: ${fm.source_url}`,
    `service: ${fm.service}`,
    `slug: ${fm.slug}`,
    `fetched_at: ${fm.fetched_at}`,
    `last_checked: ${fm.last_checked}`,
    `content_hash: ${fm.content_hash}`,
    '---',
  ].join('\n');
}

function parseFrontmatter(raw: string): { frontmatter: CachedDocFrontmatter; body: string } | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!fm.source_url || !fm.service || !fm.slug) return null;
  // writeCachedDoc formats the file as `...---\n\n<body>\n`: a blank-line
  // separator after the frontmatter and one trailing newline. The closing
  // `---\n?` in the regex consumes one newline, leaving `\n<body>\n` here.
  // Strip exactly that leading + trailing newline so the body round-trips
  // byte-identical and the stored content_hash stays valid.
  let body = m[2] ?? '';
  if (body.startsWith('\n')) body = body.slice(1);
  if (body.endsWith('\n')) body = body.slice(0, -1);
  return {
    frontmatter: {
      source_url: fm.source_url,
      service: fm.service,
      slug: fm.slug,
      fetched_at: fm.fetched_at ?? '',
      last_checked: fm.last_checked ?? '',
      content_hash: fm.content_hash ?? '',
    },
    body,
  };
}

/** Read a cached doc from disk. Returns null when the file is absent or malformed. */
export function readCachedDoc(service: string, slug: string): CachedDoc | null {
  const path = docFilePath(service, slug);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) return null;
  return { frontmatter: parsed.frontmatter, body: parsed.body, file_path: path };
}

/**
 * Write a curated doc to disk with frontmatter. `content_hash` is computed
 * from the body. Returns the written CachedDoc (including the resolved path).
 */
export function writeCachedDoc(args: {
  service: string;
  slug: string;
  source_url: string;
  body: string;
  fetched_at?: string;
  last_checked?: string;
}): CachedDoc {
  const now = new Date().toISOString();
  const fm: CachedDocFrontmatter = {
    source_url: args.source_url,
    service: args.service,
    slug: args.slug,
    fetched_at: args.fetched_at ?? now,
    last_checked: args.last_checked ?? now,
    content_hash: hashContent(args.body),
  };
  const path = docFilePath(args.service, args.slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${serializeFrontmatter(fm)}\n\n${args.body}\n`, 'utf8');
  return { frontmatter: fm, body: args.body, file_path: path };
}

/** Age in days since an ISO timestamp; Infinity when the stamp is missing/invalid. */
export function ageDays(isoTimestamp: string | null | undefined): number {
  if (!isoTimestamp) return Infinity;
  const t = new Date(isoTimestamp).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/** True when a cached doc's `last_checked` is older than the threshold. */
export function isStale(lastChecked: string | null | undefined, thresholdDays = STALE_THRESHOLD_DAYS): boolean {
  return ageDays(lastChecked) > thresholdDays;
}

export interface StaleDoc {
  service: string;
  slug: string;
  file_path: string;
  last_checked: string;
  age_days: number;
}

/**
 * List cached docs whose `last_checked` exceeds the threshold. Accepts the
 * index rows from the `doc_cache` table (db.listDocCache); a pure function so
 * it can be tested without a live DB.
 */
export function listStale<T extends { slug: string; last_checked: string; file_path: string }>(
  entries: T[],
  serviceNameById: (e: T) => string,
  thresholdDays = STALE_THRESHOLD_DAYS,
): StaleDoc[] {
  return entries
    .filter(e => isStale(e.last_checked, thresholdDays))
    .map(e => ({
      service: serviceNameById(e),
      slug: e.slug,
      file_path: e.file_path,
      last_checked: e.last_checked,
      age_days: Math.round(ageDays(e.last_checked) * 10) / 10,
    }));
}

/**
 * Cheap change-detection: fetch the live doc URL and compare its hash to a
 * stored hash. Returns:
 *   - { reachable: false }                   — network failure; caller keeps the cache
 *   - { reachable: true, changed: false }    — unchanged; caller bumps last_checked
 *   - { reachable: true, changed: true, ... } — changed; caller must re-curate
 */
export async function hashCompare(
  url: string,
  storedHash: string,
): Promise<{ reachable: boolean; changed?: boolean; newHash?: string; body?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'api-registry/0.2' },
    });
    if (!res.ok) return { reachable: false };
    const body = await res.text();
    const newHash = hashContent(body);
    return { reachable: true, changed: newHash !== storedHash, newHash, body };
  } catch {
    return { reachable: false };
  }
}
