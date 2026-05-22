export type Category =
  | 'auth' | 'db' | 'llm' | 'infra' | 'ui' | 'obs'
  | 'payments' | 'email' | 'storage' | 'search' | 'protocol' | 'other';

export type MaintenanceStatus = 'active' | 'archived' | 'unknown';

export interface Service {
  id: string;
  name: string;
  display_name: string;
  vendor_url: string;
  docs_url: string;
  changelog_url: string | null;
  repo_url: string | null;
  mcp_url: string | null;
  cli_docs_url: string | null;
  context7_id: string | null;
  package_ids: Record<string, string>;
  category: Category;
  latest_version: string | null;
  last_checked: string | null;
  models_url: string | null;
  models: Array<{ id: string; context?: number; status?: string }> | null;
  deprecated_notes: string | null;
  notes: string | null;
  /** True for services matched by the configured owned scopes/projects (~/.api-registry/owned.json) — exempt from the install cooldown. */
  author_owned: boolean;
  /** Upstream maintenance state; 'archived' supports the "choose supported projects" recommendation. */
  maintenance_status: MaintenanceStatus;
  /** ISO date the current `latest_version` was published; null when unknown. Drives the cooldown verdict. */
  latest_version_released_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A cached doc-content entry. The markdown file lives at `file_path`
 * (~/.api-registry/docs/<service>/<slug>.md); this row is the index.
 * Staleness is measured on `last_checked`, not `fetched_at`.
 */
export interface DocCacheEntry {
  id: string;
  service_id: string;
  url: string;
  slug: string;
  /** Last full curate (fetch + section-extract + rewrite). */
  fetched_at: string;
  /** Last cheap hash-compare. Staleness threshold is measured against THIS. */
  last_checked: string;
  content_hash: string;
  needs_recuration: boolean;
  file_path: string;
}

export type ScanCandidateStatus = 'pending' | 'approved' | 'rejected' | 'edited';

export interface ScanCandidate {
  id: string;
  name: string;
  source_project: string;
  source_file: string;
  proposed_vendor_url: string | null;
  proposed_docs_url: string | null;
  proposed_repo_url: string | null;
  proposed_context7_id: string | null;
  proposed_package_ids: Record<string, string>;
  proposed_category: Category;
  confidence: number;
  status: ScanCandidateStatus;
  created_at: string;
}

export interface RefreshLogEntry {
  id: number;
  service_id: string;
  old_version: string | null;
  new_version: string | null;
  source: 'npm' | 'pypi' | 'github' | 'context7' | 'manual';
  checked_at: string;
}
