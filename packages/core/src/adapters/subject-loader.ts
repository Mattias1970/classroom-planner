/**
 * loadSubjectLibrary (sprint 24-om) — läser classroom-planner-data-strukturen.
 * Filsystemsagnostisk: tar en FileReader-port så samma kod fungerar mot
 * GitHub API (Ring 2-adapter), lokala filer eller test-fakes.
 */
import {
  applyOverrides,
  validateFlipDoc,
  validateLessonRecord,
  type FieldOverride,
  type FlipDoc,
  type LessonRecord,
  type SubjectFile,
  type SubjectLibrary,
} from '../records/lesson-record.js';

export interface DataFileReader {
  /** Returnerar filens text, eller null om den inte finns. */
  readText(path: string): Promise<string | null>;
  /** Listar filnamn (ej sökvägar) i en katalog; [] om katalogen saknas. */
  list(dirPath: string): Promise<string[]>;
}

export class SubjectLoadError extends Error {}

function parseJson<T>(text: string, path: string): T {
  try { return JSON.parse(text) as T; }
  catch { throw new SubjectLoadError(`${path}: ogiltig JSON.`); }
}

export async function loadSubjectLibrary(reader: DataFileReader, slug: string): Promise<SubjectLibrary> {
  const base = `subjects/${slug}`;
  const subjectText = await reader.readText(`${base}/subject.json`);
  if (!subjectText) throw new SubjectLoadError(`${base}/subject.json saknas.`);
  const subject = parseJson<SubjectFile>(subjectText, `${base}/subject.json`);

  const overridesText = await reader.readText(`${base}/overrides.json`);
  const overrides = overridesText ? parseJson<FieldOverride[]>(overridesText, `${base}/overrides.json`) : [];

  const perDelkapitelText = await reader.readText(`${base}/begrepp/per-delkapitel.json`);
  const definitionerText = await reader.readText(`${base}/begrepp/definitioner.json`);
  const begrepp = {
    perDelkapitel: perDelkapitelText ? parseJson<Record<string, string[]>>(perDelkapitelText, 'per-delkapitel.json') : {},
    definitioner: definitionerText ? parseJson<Record<string, string>>(definitionerText, 'definitioner.json') : {},
  };

  const kapitel = new Map<number, { lektioner: LessonRecord[]; flip: Map<number, FlipDoc> }>();
  for (const kapNr of Object.keys(subject.kapitelMeta).map(Number).sort((a, b) => a - b)) {
    const dir = `${base}/kapitel/${kapNr}/lektioner`;
    const files = await reader.list(dir);
    const lessonFiles = files.filter((f) => /^\d+\.json$/.test(f))
      .sort((a, b) => parseInt(a) - parseInt(b));
    const lektioner: LessonRecord[] = [];
    const flip = new Map<number, FlipDoc>();
    for (const f of lessonFiles) {
      const text = await reader.readText(`${dir}/${f}`);
      if (!text) continue;
      const record = validateLessonRecord(parseJson(text, f), f);
      lektioner.push(applyOverrides(kapNr, record, overrides));
      const flipText = await reader.readText(`${dir}/${record.id}.flip.json`);
      if (flipText) flip.set(record.id, validateFlipDoc(parseJson(flipText, `${record.id}.flip.json`), `${record.id}.flip.json`));
    }
    kapitel.set(kapNr, { lektioner, flip });
  }

  return { slug, subject, kapitel, begrepp, overrides };
}

/** Ring 2: läsare mot GitHub Contents API (privat repo via fine-grained PAT). */
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

/** Test-/demo-läsare över ett vanligt objekt { path: innehåll }. */
export function memoryReader(files: Record<string, string>): DataFileReader {
  return {
    async readText(path) { return files[path] ?? null; },
    async list(dirPath) {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length));
    },
  };
}
