/**
 * Ring 2-adapter: DataFileReader mot GitHub Contents API (privat repo, fine-grained PAT).
 * Flyttad från core — invariant I2 förbjuder fetch i Ring 1.
 */
import { SubjectLoadError, type DataFileReader } from '@planner/core';

export function githubReader(owner: string, repo: string, token: string, fetchImpl: typeof fetch = fetch): DataFileReader {
  const api = (path: string) => `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json' };
  return {
    async readText(path) {
      const res = await fetchImpl(api(path), { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new SubjectLoadError(`GitHub ${res.status} för ${path}.`);
      return res.text();
    },
    async list(dirPath) {
      const res = await fetchImpl(api(dirPath), { headers: { ...headers, Accept: 'application/vnd.github+json' } });
      if (res.status === 404) return [];
      if (!res.ok) throw new SubjectLoadError(`GitHub ${res.status} för ${dirPath}.`);
      const items = (await res.json()) as Array<{ name: string; type: string }>;
      return items.filter((i) => i.type === 'file').map((i) => i.name);
    },
  };
}
