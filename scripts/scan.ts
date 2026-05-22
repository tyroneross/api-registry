#!/usr/bin/env tsx
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Category, ScanCandidate } from '../src/types.ts';
import { openDatabase, insertCandidate, defaultDbPath } from '../src/db.ts';
import { fetchNpmMetadata, fetchPypiMetadata } from '../src/http.ts';

const ENV_PREFIX_MAP: Record<string, { name: string; category: Category }> = {
  GROQ: { name: 'groq', category: 'llm' },
  OPENAI: { name: 'openai', category: 'llm' },
  ANTHROPIC: { name: 'anthropic', category: 'llm' },
  CEREBRAS: { name: 'cerebras', category: 'llm' },
  STRIPE: { name: 'stripe', category: 'payments' },
  SUPABASE: { name: 'supabase', category: 'db' },
  NEON: { name: 'neon', category: 'db' },
  SENTRY: { name: 'sentry', category: 'obs' },
  POSTHOG: { name: 'posthog', category: 'obs' },
  RESEND: { name: 'resend', category: 'email' },
  CLERK: { name: 'clerk', category: 'auth' },
  AUTH0: { name: 'auth0', category: 'auth' },
  VERCEL: { name: 'vercel', category: 'infra' },
  RAILWAY: { name: 'railway', category: 'infra' },
  CLOUDFLARE: { name: 'cloudflare', category: 'infra' },
  R2: { name: 'cloudflare', category: 'infra' },
};

export interface ScanOptions { skipNetwork?: boolean; }

type Candidate = Omit<ScanCandidate, 'id' | 'created_at' | 'status'>;

function guessNpmCategory(pkg: string, description = ''): Category {
  const s = `${pkg} ${description}`.toLowerCase();
  if (/auth|session|oauth|jwt/.test(s)) return 'auth';
  if (/sql|postgres|mysql|mongo|redis|prisma|drizzle|orm|database/.test(s)) return 'db';
  if (/llm|gpt|claude|openai|anthropic|groq/.test(s)) return 'llm';
  if (/logging|tracing|sentry|posthog|metric|observab/.test(s)) return 'obs';
  if (/stripe|payment|billing/.test(s)) return 'payments';
  if (/email|resend|sendgrid|mailgun/.test(s)) return 'email';
  if (/storage|s3|r2|blob/.test(s)) return 'storage';
  if (/ui|react|tailwind|component|css/.test(s)) return 'ui';
  return 'other';
}

function walk(dir: string, depth = 0, acc: string[] = []): string[] {
  if (depth > 3) return acc;
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git') continue;
    if (e.startsWith('.') && e !== '.env.example' && e !== '.mcp.json') continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, depth + 1, acc);
    else acc.push(p);
  }
  return acc;
}

async function parsePackageJson(path: string, project: string, skipNetwork: boolean): Promise<Candidate[]> {
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> };
  const deps = pkg.dependencies ?? {};
  const out: Candidate[] = [];
  for (const name of Object.keys(deps)) {
    let meta: Awaited<ReturnType<typeof fetchNpmMetadata>> = null;
    if (!skipNetwork) meta = await fetchNpmMetadata(name);
    const repoUrl = meta?.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null;
    out.push({
      name,
      source_project: project,
      source_file: path,
      proposed_vendor_url: meta?.homepage ?? null,
      proposed_docs_url: meta?.homepage ?? null,
      proposed_repo_url: repoUrl,
      proposed_context7_id: null,
      proposed_package_ids: { npm: name },
      proposed_category: guessNpmCategory(name, meta?.description ?? ''),
      confidence: meta ? 80 : 50,
    });
  }
  return out;
}

async function parseRequirementsTxt(path: string, project: string, skipNetwork: boolean): Promise<Candidate[]> {
  const lines = readFileSync(path, 'utf8').split('\n');
  const out: Candidate[] = [];
  for (const raw of lines) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const name = line.split(/[<>=!~]/)[0]!.trim();
    if (!name) continue;
    let meta: Awaited<ReturnType<typeof fetchPypiMetadata>> = null;
    if (!skipNetwork) meta = await fetchPypiMetadata(name);
    out.push({
      name,
      source_project: project,
      source_file: path,
      proposed_vendor_url: meta?.home_page ?? null,
      proposed_docs_url: meta?.project_urls?.Documentation ?? meta?.project_urls?.Homepage ?? meta?.home_page ?? null,
      proposed_repo_url: meta?.project_urls?.Source ?? meta?.project_urls?.Repository ?? null,
      proposed_context7_id: null,
      proposed_package_ids: { pypi: name },
      proposed_category: guessNpmCategory(name, meta?.summary ?? ''),
      confidence: meta ? 80 : 50,
    });
  }
  return out;
}

function parseMcpJson(path: string, project: string): Candidate[] {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: Record<string, { url?: string; command?: string }> };
    const out: Candidate[] = [];
    for (const [name, server] of Object.entries(data.mcpServers ?? {})) {
      out.push({
        name,
        source_project: project,
        source_file: path,
        proposed_vendor_url: server.url ? new URL(server.url).origin : null,
        proposed_docs_url: null,
        proposed_repo_url: null,
        proposed_context7_id: null,
        proposed_package_ids: {},
        proposed_category: 'protocol',
        confidence: 60,
      });
    }
    return out;
  } catch { return []; }
}

function parseEnvExample(path: string, project: string): Candidate[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=/);
    if (!m) continue;
    const key = m[1]!;
    for (const prefix of Object.keys(ENV_PREFIX_MAP)) {
      if (key === prefix || key.startsWith(prefix + '_')) {
        const { name, category } = ENV_PREFIX_MAP[prefix]!;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({
          name,
          source_project: project,
          source_file: path,
          proposed_vendor_url: null,
          proposed_docs_url: null,
          proposed_repo_url: null,
          proposed_context7_id: null,
          proposed_package_ids: {},
          proposed_category: category,
          confidence: 70,
        });
        break;
      }
    }
  }
  return out;
}

export async function scanProjects(roots: string[], opts: ScanOptions = {}): Promise<Candidate[]> {
  const skipNetwork = !!opts.skipNetwork;
  const all: Candidate[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const projects = readdirSync(root).filter(e => {
      try { return statSync(join(root, e)).isDirectory(); } catch { return false; }
    });
    for (const proj of projects) {
      const projPath = join(root, proj);
      const files = walk(projPath);
      for (const f of files) {
        if (f.endsWith('/package.json')) all.push(...await parsePackageJson(f, projPath, skipNetwork));
        else if (f.endsWith('/requirements.txt')) all.push(...await parseRequirementsTxt(f, projPath, skipNetwork));
        else if (f.endsWith('/.mcp.json')) all.push(...parseMcpJson(f, projPath));
        else if (f.endsWith('/.env.example')) all.push(...parseEnvExample(f, projPath));
      }
    }
  }
  return all;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  // Scan root: first CLI arg, else the current working directory.
  const root = process.argv[2] ?? process.cwd();
  const candidates = await scanProjects([root], { skipNetwork: process.env.SKIP_NETWORK === '1' });
  const db = openDatabase(defaultDbPath());
  const seen = new Set<string>();
  let inserted = 0;
  for (const c of candidates) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    insertCandidate(db, c);
    inserted++;
  }
  console.log(JSON.stringify({ ok: true, inserted, total_discovered: candidates.length }));
}
