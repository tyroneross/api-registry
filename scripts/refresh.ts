#!/usr/bin/env tsx
import { appendFileSync, mkdirSync } from 'node:fs';
import {
  openDatabase, listServices, updateServiceVersion, updateServiceReleaseDate,
  getServiceByName, defaultDbPath,
} from '../src/db.ts';
import {
  fetchNpmLatestWithDate, fetchPypiLatestWithDate, fetchGitHubLatestReleaseWithDate,
} from '../src/http.ts';
import { cooldownVerdict, COOLDOWN_DAYS } from '../src/cooldown.ts';
import { STALE_THRESHOLD_DAYS } from '../src/cache.ts';
import type { Service } from '../src/types.ts';

const LOG_DIR = `${process.env.HOME}/.api-registry/logs`;
mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = `${LOG_DIR}/refresh.log`;

const arg = process.argv[2];
const db = openDatabase(defaultDbPath());

function selectTargets(): Service[] {
  if (!arg || arg === '--all') return listServices(db);
  if (arg === '--stale') {
    return listServices(db).filter(s => {
      if (!s.last_checked) return true;
      const age = (Date.now() - new Date(s.last_checked).getTime()) / (1000 * 60 * 60 * 24);
      return age > STALE_THRESHOLD_DAYS;
    });
  }
  const svc = getServiceByName(db, arg);
  return svc ? [svc] : [];
}

interface RefreshResult {
  name: string;
  old: string | null;
  new: string | null;
  source: string;
  released_at: string | null;
  cooldown: ReturnType<typeof cooldownVerdict>;
}

async function refreshOne(svc: Service): Promise<RefreshResult> {
  let newVersion: string | null = null;
  let releasedAt: string | null = null;
  let source: 'npm' | 'pypi' | 'github' | 'manual' = 'manual';

  if (svc.package_ids.npm) {
    const r = await fetchNpmLatestWithDate(svc.package_ids.npm);
    newVersion = r.version; releasedAt = r.released_at; source = 'npm';
  } else if (svc.package_ids.pypi) {
    const r = await fetchPypiLatestWithDate(svc.package_ids.pypi);
    newVersion = r.version; releasedAt = r.released_at; source = 'pypi';
  } else if (svc.repo_url?.includes('github.com')) {
    const m = svc.repo_url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (m) {
      const r = await fetchGitHubLatestReleaseWithDate(m[1]!, m[2]!);
      newVersion = r.version; releasedAt = r.released_at; source = 'github';
    }
  }

  if (newVersion && newVersion !== svc.latest_version) {
    updateServiceVersion(db, svc.id, newVersion, source);
    appendFileSync(LOG_PATH, `${new Date().toISOString()} ${svc.name} ${svc.latest_version ?? 'none'} -> ${newVersion} (${source})\n`);
  }
  if (releasedAt) updateServiceReleaseDate(db, svc.id, releasedAt);

  // Cooldown verdict reflects the freshly captured release date.
  const verdict = cooldownVerdict({
    author_owned: svc.author_owned,
    latest_version: newVersion ?? svc.latest_version,
    latest_version_released_at: releasedAt ?? svc.latest_version_released_at,
  });

  return {
    name: svc.name,
    old: svc.latest_version,
    new: newVersion,
    source,
    released_at: releasedAt ?? svc.latest_version_released_at,
    cooldown: verdict,
  };
}

const targets = selectTargets();
const results: RefreshResult[] = [];
for (const t of targets) {
  results.push(await refreshOne(t));
}

const drift = results.filter(r => r.old !== r.new && r.new !== null);
const blocked = results.filter(r => r.cooldown.install_blocked);
console.log(JSON.stringify({
  ok: true,
  checked: results.length,
  drift: drift.length,
  cooldown_blocked: blocked.length,
  cooldown_days: COOLDOWN_DAYS,
  results,
}, null, 2));
