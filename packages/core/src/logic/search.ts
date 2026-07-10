import type { LessonTemplate } from '../domain/index.js';
import { getCurrentVersion } from './versioning.js';

export interface SearchRow {
  templateId: string;
  versionId: string;
  rubrik: string;
  mål: string;
  bookId: string;
  årskurs: number;
  subchapterId: string;
  conceptIds: string[];
}

export interface SearchQuery {
  text?: string;        // matchar rubrik ELLER mål, case-insensitive
  bookId?: string;
  årskurs?: number;
  subchapterId?: string;
  conceptId?: string;
}

/**
 * Projicerar mallens aktuella version till en sökrad.
 * REN funktion.
 */
export function projectToIndex(template: LessonTemplate): SearchRow {
  const version = getCurrentVersion(template);
  const content = version.content;
  return {
    templateId: template.id,
    versionId: version.id,
    rubrik: content.rubrik,
    mål: content.mål,
    bookId: content.bookId ?? '',
    årskurs: content.årskurs,
    subchapterId: content.subchapterId ?? '',
    conceptIds: content.conceptIds.map(String),
  };
}

/**
 * Filtrerar sökrader mot en query.
 * Alla angivna fält är AND-kombinerade.
 * text matchar rubrik ELLER mål (case-insensitive, delsträng).
 * REN funktion.
 */
export function search(rows: SearchRow[], query: SearchQuery): SearchRow[] {
  return rows.filter((row) => {
    if (query.text !== undefined) {
      const needle = query.text.toLowerCase();
      const inRubrik = row.rubrik.toLowerCase().includes(needle);
      const inMål = row.mål.toLowerCase().includes(needle);
      if (!inRubrik && !inMål) return false;
    }
    if (query.bookId !== undefined && row.bookId !== query.bookId) return false;
    if (query.årskurs !== undefined && row.årskurs !== query.årskurs) return false;
    if (query.subchapterId !== undefined && row.subchapterId !== query.subchapterId) return false;
    if (query.conceptId !== undefined && !row.conceptIds.includes(query.conceptId)) return false;
    return true;
  });
}
