#!/usr/bin/env tsx
import { openDatabase, pendingCandidates, setCandidateStatus, insertService, defaultDbPath } from '../src/db.ts';
import type { ScanCandidate } from '../src/types.ts';

const action = process.argv[2];
const db = openDatabase(defaultDbPath());

if (action === 'list') {
  const cands = pendingCandidates(db);
  console.log(JSON.stringify({ count: cands.length, candidates: cands }, null, 2));
  process.exit(0);
}

if (action === 'approve' || action === 'reject' || action === 'edit') {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  const input = JSON.parse(data) as { id: string; overrides?: Partial<ScanCandidate> & { display_name?: string } };
  if (action === 'reject') {
    setCandidateStatus(db, input.id, 'rejected');
    console.log(JSON.stringify({ ok: true, id: input.id, status: 'rejected' }));
    process.exit(0);
  }
  const cand = pendingCandidates(db).find(c => c.id === input.id);
  if (!cand) {
    console.log(JSON.stringify({ ok: false, reason: 'not_found' }));
    process.exit(0);
  }
  const merged = { ...cand, ...(input.overrides ?? {}) } as ScanCandidate & { display_name?: string };
  if (!merged.proposed_vendor_url || !merged.proposed_docs_url) {
    console.log(JSON.stringify({ ok: false, reason: 'missing_required_urls' }));
    process.exit(0);
  }
  const id = insertService(db, {
    name: merged.name,
    display_name: merged.display_name ?? merged.name,
    vendor_url: merged.proposed_vendor_url!,
    docs_url: merged.proposed_docs_url!,
    changelog_url: null,
    repo_url: merged.proposed_repo_url,
    mcp_url: null,
    cli_docs_url: null,
    context7_id: merged.proposed_context7_id,
    package_ids: merged.proposed_package_ids,
    category: merged.proposed_category,
    latest_version: null,
    last_checked: null,
    models_url: null,
    models: null,
    deprecated_notes: null,
    notes: `imported from scan: ${cand.source_file}`,
  });
  setCandidateStatus(db, input.id, action === 'edit' ? 'edited' : 'approved');
  console.log(JSON.stringify({ ok: true, service_id: id, candidate_status: action }));
  process.exit(0);
}

console.error('usage: tsx scripts/candidates.ts [list|approve|reject|edit]');
process.exit(2);
