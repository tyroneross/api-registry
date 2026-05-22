/**
 * Author-owned designation loader.
 *
 * The set of "owned" projects/scopes is user-specific data and MUST NOT live
 * in shipped code. It is read at registry-bootstrap time from a runtime file
 * in the user's home directory (`~/.api-registry/owned.json`), never from the
 * repo. When the file is absent, no service is marked author_owned.
 *
 * `init` loads `data/seed.json`, then applies this designation to set the
 * `author_owned` flag in `registry.db`. The cooldown logic keeps reading
 * `author_owned` from the DB — consuming apps are unaffected.
 *
 * Pure functions where possible so the matching logic is unit-testable
 * without touching the filesystem.
 */
import { readFileSync, existsSync } from 'node:fs';

export interface OwnedConfig {
  /** Glob patterns matched against a service's npm package id, e.g. "@myscope/*". */
  scopes: string[];
  /** Service `name` values that are author-owned. */
  projects: string[];
}

/** Absolute path of the runtime owned-designation file. Never inside the repo. */
export function ownedConfigPath(): string {
  return `${process.env.HOME}/.api-registry/owned.json`;
}

/**
 * Read and validate the owned-designation file. Returns null when the file is
 * absent or malformed — callers treat that as "no service is author-owned".
 */
export function loadOwnedConfig(path: string = ownedConfigPath()): OwnedConfig | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const scopes = Array.isArray(obj.scopes) ? obj.scopes.filter((s): s is string => typeof s === 'string') : [];
  const projects = Array.isArray(obj.projects) ? obj.projects.filter((p): p is string => typeof p === 'string') : [];
  return { scopes, projects };
}

/** Translate a single glob pattern (only `*` is special) into a RegExp. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Decide whether a service is author-owned under a given config.
 *
 * A service matches when EITHER its `name` is in `config.projects` OR any of
 * its npm/pypi package ids matches a `config.scopes` glob.
 */
export function isAuthorOwned(
  svc: { name: string; package_ids?: Record<string, string> },
  config: OwnedConfig | null,
): boolean {
  if (!config) return false;
  if (config.projects.includes(svc.name)) return true;
  const packageIds = Object.values(svc.package_ids ?? {});
  if (packageIds.length === 0) return false;
  const matchers = config.scopes.map(globToRegExp);
  return packageIds.some(id => matchers.some(re => re.test(id)));
}
