const UA = 'api-registry/0.2';

async function safeFetch(url: string, opts: RequestInit = {}): Promise<Response | null> {
  try {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

export async function fetchNpmLatest(pkg: string): Promise<string | null> {
  const res = await safeFetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!res) return null;
  const data = await res.json() as { 'dist-tags'?: { latest?: string } };
  return data['dist-tags']?.latest ?? null;
}

export async function fetchPypiLatest(pkg: string): Promise<string | null> {
  const res = await safeFetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`);
  if (!res) return null;
  const data = await res.json() as { info?: { version?: string } };
  return data.info?.version ?? null;
}

export async function fetchGitHubLatestRelease(owner: string, repo: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await safeFetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
  if (!res) return null;
  const data = await res.json() as { tag_name?: string };
  return data.tag_name ?? null;
}

export async function fetchNpmMetadata(pkg: string): Promise<{ homepage?: string; repository?: { url?: string }; description?: string } | null> {
  const res = await safeFetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!res) return null;
  const data = await res.json() as { homepage?: string; repository?: { url?: string }; description?: string };
  return { homepage: data.homepage, repository: data.repository, description: data.description };
}

export async function fetchPypiMetadata(pkg: string): Promise<{ home_page?: string; project_urls?: Record<string, string>; summary?: string } | null> {
  const res = await safeFetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`);
  if (!res) return null;
  const data = await res.json() as { info?: { home_page?: string; project_urls?: Record<string, string>; summary?: string } };
  return data.info ?? null;
}

/**
 * Latest version + the ISO date it was published. The release date drives the
 * package-install cooldown verdict. Returns null fields on any failure.
 */
export interface VersionWithDate {
  version: string | null;
  released_at: string | null;
}

/** npm: `time[<latest>]` from the registry metadata is the publish timestamp. */
export async function fetchNpmLatestWithDate(pkg: string): Promise<VersionWithDate> {
  const res = await safeFetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  if (!res) return { version: null, released_at: null };
  const data = await res.json() as {
    'dist-tags'?: { latest?: string };
    time?: Record<string, string>;
  };
  const version = data['dist-tags']?.latest ?? null;
  const released_at = version && data.time?.[version] ? data.time[version]! : null;
  return { version, released_at };
}

/** pypi: `releases[<version>][0].upload_time_iso_8601` is the publish timestamp. */
export async function fetchPypiLatestWithDate(pkg: string): Promise<VersionWithDate> {
  const res = await safeFetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`);
  if (!res) return { version: null, released_at: null };
  const data = await res.json() as {
    info?: { version?: string };
    releases?: Record<string, Array<{ upload_time_iso_8601?: string; upload_time?: string }>>;
  };
  const version = data.info?.version ?? null;
  let released_at: string | null = null;
  if (version && data.releases?.[version]?.length) {
    const files = data.releases[version]!;
    released_at = files[0]?.upload_time_iso_8601 ?? files[0]?.upload_time ?? null;
  }
  return { version, released_at };
}

/** github: `published_at` from the latest release. */
export async function fetchGitHubLatestReleaseWithDate(owner: string, repo: string): Promise<VersionWithDate> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await safeFetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers });
  if (!res) return { version: null, released_at: null };
  const data = await res.json() as { tag_name?: string; published_at?: string };
  return { version: data.tag_name ?? null, released_at: data.published_at ?? null };
}
