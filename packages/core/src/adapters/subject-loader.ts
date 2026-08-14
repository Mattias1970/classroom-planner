/**
 * loadSubjectLibrary (sprint 24-om) — läser classroom-planner-data-strukturen.
 * Filsystemsagnostisk: tar en FileReader-port så samma kod fungerar mot
 * GitHub API (Ring 2-adapter), lokala filer eller test-fakes.
 */
import {
  applyOverrides,
  type BookFile,
  validateFlipDoc,
  validateLessonRecord,
  type FieldOverride,
  type FlipDoc,
  type LessonRecord,
  type BookLink,
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

  // Bokindelning: med bookId bor innehållet (kapitel, lektioner, begrepp)
  // i books/<bookId>/ — planeringen äger bara klasser/schema/läsår/overrides.
  let book: BookFile | undefined;
  let contentBase = base;
  let kapitelMeta = subject.kapitelMeta;
  if (subject.bookId) {
    contentBase = `books/${subject.bookId}`;
    const bookText = await reader.readText(`${contentBase}/book.json`);
    if (!bookText) throw new SubjectLoadError(`${contentBase}/book.json saknas (bookId: ${subject.bookId}).`);
    book = parseJson<BookFile>(bookText, `${contentBase}/book.json`);
    kapitelMeta = book.kapitelMeta;
    subject.kapitelMeta = kapitelMeta; // motorn ser alltid kapitelMeta via subject
  }

  const perDelkapitelText = await reader.readText(`${contentBase}/begrepp/per-delkapitel.json`);
  const definitionerText = await reader.readText(`${contentBase}/begrepp/definitioner.json`);
  const begrepp = {
    perDelkapitel: perDelkapitelText ? parseJson<Record<string, string[]>>(perDelkapitelText, 'per-delkapitel.json') : {},
    definitioner: definitionerText ? parseJson<Record<string, string>>(definitionerText, 'definitioner.json') : {},
  };

  // Bokens resurslänkar (t.ex. Binogi-filmer), valfri fil bredvid book.json.
  const lankarText = await reader.readText(`${contentBase}/lankar.json`);
  const lankar = lankarText
    ? parseJson<Record<string, BookLink[]>>(lankarText, `${contentBase}/lankar.json`)
    : {};

  const kapitel = new Map<number, { lektioner: LessonRecord[]; flip: Map<number, FlipDoc> }>();
  for (const kapNr of Object.keys(kapitelMeta).map(Number).sort((a, b) => a - b)) {
    const dir = `${contentBase}/kapitel/${kapNr}/lektioner`;
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
      // Krav: länkar som lektionsfil — sidecar <id>.lankar.json vinner över
      // aggregatet lankar.json; dedupe på url.
      const lankarSidecar = await reader.readText(`${dir}/${record.id}.lankar.json`);
      if (lankarSidecar) {
        const egna = parseJson<BookLink[]>(lankarSidecar, `${record.id}.lankar.json`);
        const key = `${kapNr}-${record.id}`;
        const urls = new Set(egna.map((l) => l.url));
        lankar[key] = [...egna, ...(lankar[key] ?? []).filter((l) => !urls.has(l.url))];
      }
    }
    kapitel.set(kapNr, { lektioner, flip });
  }

  return { slug, subject, book, kapitel, begrepp, lankar, overrides };
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
