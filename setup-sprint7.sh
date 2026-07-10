#!/usr/bin/env bash
# classroom-planner — setup-sprint7.sh
#
# Sprint 7: Import av bokdata — fullständiga fixtures för Prio Matematik 8
# (alla 5 kapitel, 131 lektioner), importlogik med felrapport, källregister.
#
# Kör i Codespaces efter Sprint 6:
#   bash setup-sprint7.sh
#   npm test   ← ska visa minst 157 gröna tester (139 + 18 nya)

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 7            ${NC}"
echo -e "${BLUE}  Import: Prio Matematik 8 (alla 5 kap)  ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/src/fixtures/prio-mat-8.ts" ]; then
  echo "❌  Sprint 6 (eller Sprint 2) krävs. Kör tidigare setup-skript."
  exit 1
fi
ok "Tidigare sprint hittad"

mkdir -p packages/core/src/fixtures
mkdir -p packages/core/src/import
mkdir -p packages/core/test
ok "Kataloger klara"

# ──────────────────────────────────────────────────
log "packages/core/src/import/source-registry.ts..."
cat > packages/core/src/import/source-registry.ts << 'XEOF7_DELIM_X'
import type { SourceRef } from '../domain/index.js';

/**
 * Källregistret listar alla kända läromedels-källor.
 * Varje källa identifieras av ett unikt sourceId.
 * ImportResult kan referera till dessa.
 */
export const SOURCE_REGISTRY: SourceRef[] = [
  {
    sourceId: 'prio-mat-8-2ed',
    type: 'book',
    title: 'Prio Matematik 8, 2a upplagan',
    licenseNote: 'Sanoma Education. Uppgiftsnummer och sidor refereras med tillstånd.',
  },
];

export function getSource(sourceId: string): SourceRef | undefined {
  return SOURCE_REGISTRY.find((s) => s.sourceId === sourceId);
}

export function requireSource(sourceId: string): SourceRef {
  const src = getSource(sourceId);
  if (!src) {
    throw new Error(
      `Okänd sourceId: '${sourceId}'. ` +
      `Känd: ${SOURCE_REGISTRY.map((s) => s.sourceId).join(', ')}`
    );
  }
  return src;
}
XEOF7_DELIM_X
ok "packages/core/src/import/source-registry.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/import/import-types.ts..."
cat > packages/core/src/import/import-types.ts << 'XEOF7_DELIM_X'
import type { LessonSourceMap, ExerciseRange } from '../domain/index.js';

/**
 * En rad i importkällan (t.ex. en rad i Excel-filen).
 * Kan representera en lektion med Grön/Bla/Rod-uppgifter.
 */
export interface RawLessonRow {
  subchapterId: string;
  subchapterTitle: string;
  lessonNo: number;
  groen?: string;
  blaa?: string;
  roed?: string;
  theoryPages?: string;
  exercisePages?: string;
  socrativeStart?: string;
  exitTicket?: string;
  concept?: string;
  magmaTask?: string;
}

/**
 * Rapport från ett importjobb.
 * Trasiga rader stoppas begripligt med rad-nr och orsak.
 */
export interface ImportError {
  rowIndex: number;
  subchapterId: string;
  lessonNo: number;
  field: string;
  message: string;
}

export interface ImportReport {
  sourceId: string;
  importedAt: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: ImportError[];
  result: LessonSourceMap[];
}

/**
 * Parsar ett uppgiftsspann av formatet "X - Y" eller "X-Y".
 * Returnerar { from, to } eller null om formatet är ogiltigt.
 */
export function parseRange(raw: string | undefined): { from: number; to: number } | null {
  if (!raw || raw.trim() === '' || raw.trim().toLowerCase() === 'nan') return null;
  const cleaned = raw.replace(/\s+/g, '').replace('–', '-');
  const parts = cleaned.split('-');
  if (parts.length < 2) return null;
  const from = parseInt(parts[0] ?? '', 10);
  const to = parseInt(parts[parts.length - 1] ?? '', 10);
  if (isNaN(from) || isNaN(to) || from < 1 || to < from) return null;
  return { from, to };
}
XEOF7_DELIM_X
ok "packages/core/src/import/import-types.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/import/importer.ts..."
cat > packages/core/src/import/importer.ts << 'XEOF7_DELIM_X'
import type { LessonSourceMap, ExerciseRange } from '../domain/index.js';
import type { RawLessonRow, ImportReport, ImportError } from './import-types.js';
import { parseRange } from './import-types.js';

const SOURCE_ID = 'prio-mat-8-2ed';

/**
 * Importerar en lista av rådata-rader till LessonSourceMap[].
 *
 * Regler:
 * - Rader med ogiltig lessonNo eller subchapterId loggas som ImportError
 * - Rader med ogiltiga uppgiftsspann (t.ex. "Veckotest") loggas men stoppas inte
 * - Alla fel samlas i ImportReport.errors
 * - Inga tyst-tappade rader — varje fel är synligt
 * - REN funktion — ingen I/O
 */
export function importRows(rows: RawLessonRow[], importedAt: string): ImportReport {
  const errors: ImportError[] = [];
  const result: LessonSourceMap[] = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    if (!row.subchapterId || row.subchapterId.trim() === '') {
      errors.push({ rowIndex: i, subchapterId: '', lessonNo: row.lessonNo, field: 'subchapterId', message: 'subchapterId saknas' });
      continue;
    }
    if (!Number.isInteger(row.lessonNo) || row.lessonNo < 1) {
      errors.push({ rowIndex: i, subchapterId: row.subchapterId, lessonNo: row.lessonNo, field: 'lessonNo', message: `Ogiltigt lessonNo: ${row.lessonNo}` });
      continue;
    }

    const exerciseRanges: ExerciseRange[] = [];

    const groenRange = parseRange(row.groen);
    if (groenRange) {
      exerciseRanges.push({ label: { known: 'grön' }, sourceId: SOURCE_ID, from: groenRange.from, to: groenRange.to });
    } else if (row.groen && row.groen.trim() !== '' && row.groen.toLowerCase() !== 'nan') {
      exerciseRanges.push({ label: { known: 'grön' }, sourceId: SOURCE_ID, text: row.groen.trim() });
    }

    const blaaRange = parseRange(row.blaa);
    if (blaaRange) {
      exerciseRanges.push({ label: { known: 'blå' }, sourceId: SOURCE_ID, from: blaaRange.from, to: blaaRange.to });
    } else if (row.blaa && row.blaa.trim() !== '' && row.blaa.toLowerCase() !== 'nan') {
      exerciseRanges.push({ label: { known: 'blå' }, sourceId: SOURCE_ID, text: row.blaa.trim() });
    }

    const roedRange = parseRange(row.roed);
    if (roedRange) {
      exerciseRanges.push({ label: { known: 'röd' }, sourceId: SOURCE_ID, from: roedRange.from, to: roedRange.to });
    } else if (row.roed && row.roed.trim() !== '' && row.roed.toLowerCase() !== 'nan') {
      exerciseRanges.push({ label: { known: 'röd' }, sourceId: SOURCE_ID, text: row.roed.trim() });
    }

    const map: LessonSourceMap = {
      subchapterId: row.subchapterId,
      lessonNo: row.lessonNo,
      theoryPages: row.theoryPages?.trim() || undefined,
      exerciseRanges,
      quizStart: row.socrativeStart?.trim() || undefined,
      exitTicket: row.exitTicket?.trim() || undefined,
      magmaTaskName: row.magmaTask?.trim() || undefined,
      concepts: row.concept ? [row.concept.trim()] : [],
    };

    result.push(map);
    successCount++;
  }

  return {
    sourceId: SOURCE_ID,
    importedAt,
    totalRows: rows.length,
    successCount,
    errorCount: errors.length,
    errors,
    result,
  };
}
XEOF7_DELIM_X
ok "packages/core/src/import/importer.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/fixtures/prio-mat-8-full.ts..."
cat > packages/core/src/fixtures/prio-mat-8-full.ts << 'XEOF7_DELIM_X'
/**
 * Fullständiga fixtures för Prio Matematik 8, 2a upplagan.
 * Extraherade ur Prio8_2a_uppl_.xlsx (131 lektioner, 5 kapitel).
 * Används som seed-data och i tester.
 */

import type { Book, BookId, Concept, ConceptId } from '../domain/index.js';
import type { LessonSourceMap } from '../domain/index.js';
import { importRows } from '../import/importer.js';
import type { RawLessonRow } from '../import/import-types.js';

export const PRIO_MAT_8: Book = {
  id: 'prio-mat-8-2ed' as BookId,
  titel: 'Prio Matematik 8',
  förlag: 'Sanoma',
  upplaga: '2a upplagan',
  årskurs: 8,
  chapters: [
    { id: '1', titel: 'Tal', subchapters: [
      { id: '1.1', titel: 'Negativa tal', conceptIds: ['c-1-1-negativatal','c-1-1-tallinjen'] as ConceptId[] },
      { id: '1.2', titel: 'Addition och subtraktion med negativa tal', conceptIds: ['c-1-2-naturliga','c-1-2-hela'] as ConceptId[] },
      { id: '1.3', titel: 'Multiplikation och division med negativa tal', conceptIds: ['c-1-3-rationella','c-1-3-irrationella'] as ConceptId[] },
      { id: '1.4', titel: 'Potenser', conceptIds: ['c-1-4-potens','c-1-4-bas','c-1-4-exponent'] as ConceptId[] },
      { id: '1.5', titel: 'Räkna med potenser', conceptIds: ['c-1-5-kvadratrot','c-1-5-tiopotens'] as ConceptId[] },
      { id: '1.6', titel: 'Stora och små tal med tiopotenser', conceptIds: ['c-1-6-grundpotens','c-1-6-prefix'] as ConceptId[] },
      { id: '1.7', titel: 'Prefix', conceptIds: ['c-1-7-närmevärde','c-1-7-gällande'] as ConceptId[] },
    ] },
    { id: '2', titel: 'Algebra', subchapters: [
      { id: '2.1', titel: 'Mönster', conceptIds: ['c-2-1-algebra','c-2-1-mönster'] as ConceptId[] },
      { id: '2.2', titel: 'Mönster och formler', conceptIds: ['c-2-2-aritmetisk','c-2-2-geometrisk'] as ConceptId[] },
      { id: '2.3', titel: 'Uttryck med parenteser', conceptIds: ['c-2-3-formel','c-2-3-numeriskt'] as ConceptId[] },
      { id: '2.4', titel: 'Multiplikation med uttryck inom parenteser', conceptIds: ['c-2-4-algebraiskt','c-2-4-variabel'] as ConceptId[] },
      { id: '2.5', titel: 'Ekvationer', conceptIds: ['c-2-5-likhet','c-2-5-ekvation'] as ConceptId[] },
      { id: '2.6', titel: 'Mer om ekvationer', conceptIds: ['c-2-6-balans','c-2-6-vänsterled'] as ConceptId[] },
      { id: '2.7', titel: 'Andragradsekvationer', conceptIds: ['c-2-7-högerled','c-2-7-prövning'] as ConceptId[] },
      { id: '2.8', titel: 'Problemlösning med ekvationer', conceptIds: ['c-2-8-andragrads'] as ConceptId[] },
    ] },
    { id: '3', titel: 'Geometri', subchapters: [
      { id: '3.1', titel: 'Geometriska kroppar', conceptIds: ['c-3-1-dimension','c-3-1-hörn'] as ConceptId[] },
      { id: '3.2', titel: 'Begränsningsarea av prisma, rätblock och pyramid', conceptIds: ['c-3-2-kant','c-3-2-sidoyta'] as ConceptId[] },
      { id: '3.3', titel: 'Begränsningsarea av cylinder, kon och klot', conceptIds: ['c-3-3-basyta','c-3-3-kropp'] as ConceptId[] },
      { id: '3.4', titel: 'Volym av prisma och rätblock', conceptIds: ['c-3-4-prisma','c-3-4-rätblock'] as ConceptId[] },
      { id: '3.5', titel: 'Volymenheter', conceptIds: ['c-3-5-cylinder','c-3-5-pyramid'] as ConceptId[] },
      { id: '3.6', titel: 'Volym av prisma och cylinder', conceptIds: ['c-3-6-kon','c-3-6-klot'] as ConceptId[] },
      { id: '3.7', titel: 'Volym av kon, pyramid och klot', conceptIds: ['c-3-7-mantelyta','c-3-7-volym'] as ConceptId[] },
    ] },
    { id: '4', titel: 'Procent och samband', subchapters: [
      { id: '4.1', titel: 'Beräkna andelen', conceptIds: ['c-4-1-andelen','c-4-1-delen'] as ConceptId[] },
      { id: '4.2', titel: 'Beräkna delen', conceptIds: ['c-4-2-delhela','c-4-2-procent'] as ConceptId[] },
      { id: '4.3', titel: 'Beräkna det hela', conceptIds: ['c-4-3-promille','c-4-3-förändring'] as ConceptId[] },
      { id: '4.4', titel: 'Förändringsfaktor', conceptIds: ['c-4-4-procentenhet','c-4-4-prop'] as ConceptId[] },
      { id: '4.5', titel: 'Algebra och procent', conceptIds: ['c-4-5-graf','c-4-5-origo'] as ConceptId[] },
      { id: '4.6', titel: 'Procentenheter', conceptIds: [] as ConceptId[] },
      { id: '4.7', titel: 'Proportionalitet', conceptIds: [] as ConceptId[] },
      { id: '4.8', titel: 'Proportionalitet och grafer', conceptIds: [] as ConceptId[] },
    ] },
    { id: '5', titel: 'Sannolikhet och statistik', subchapters: [
      { id: '5.1', titel: 'Kombinatorik', conceptIds: [] as ConceptId[] },
      { id: '5.2', titel: 'Chans och risk', conceptIds: [] as ConceptId[] },
      { id: '5.3', titel: 'Sannolikhet utifrån statistik', conceptIds: [] as ConceptId[] },
      { id: '5.4', titel: 'Teoretisk sannolikhet', conceptIds: [] as ConceptId[] },
      { id: '5.5', titel: 'Sannolikhet i flera steg', conceptIds: [] as ConceptId[] },
      { id: '5.6', titel: 'Oberoende och beroende händelser', conceptIds: [] as ConceptId[] },
      { id: '5.7', titel: 'Lägesmått', conceptIds: [] as ConceptId[] },
      { id: '5.8', titel: 'Spridningsmått', conceptIds: [] as ConceptId[] },
    ] },
  ],
};

const RAW_ROWS: RawLessonRow[] = [
  { subchapterId:'1.1', subchapterTitle:'Negativa tal', lessonNo:1, groen:'1 - 13', blaa:'14 - 21', theoryPages:'10 - 12', exercisePages:'12 - 13', exitTicket:'Quiz 1.1a', concept:'positiva tal' },
  { subchapterId:'1.1', subchapterTitle:'Negativa tal', lessonNo:2, blaa:'14 - 21', roed:'22 - 25', socrativeStart:'Quiz1.1a', exitTicket:'Quiz 1.1b', concept:'motsatta tal' },
  { subchapterId:'1.2', subchapterTitle:'Addition och subtraktion med negativa tal', lessonNo:3, groen:'26 - 37', blaa:'38 - 47', theoryPages:'14 - 15', exercisePages:'15 - 17', socrativeStart:'Quiz1.1b', exitTicket:'Quiz1.2a', concept:'naturliga tal' },
  { subchapterId:'1.2', subchapterTitle:'Addition och subtraktion med negativa tal', lessonNo:4, blaa:'38 - 47', roed:'48 - 51', socrativeStart:'Quiz1.2a', exitTicket:'Quiz1.2b', concept:'hela tal' },
  { subchapterId:'1.3', subchapterTitle:'Multiplikation och division med negativa tal', lessonNo:5, groen:'52 - 61', blaa:'62 - 69', theoryPages:'19 - 21', exercisePages:'21 - 23', concept:'rationella tal' },
  { subchapterId:'1.3', subchapterTitle:'Multiplikation och division med negativa tal', lessonNo:6, blaa:'62 - 69', roed:'70 - 74', concept:'irrationella tal' },
  { subchapterId:'1.4', subchapterTitle:'Potenser', lessonNo:9, groen:'105 - 114', blaa:'115 - 125', theoryPages:'26 - 27', exercisePages:'27 - 29', concept:'bas' },
  { subchapterId:'1.4', subchapterTitle:'Potenser', lessonNo:10, blaa:'115 - 125', roed:'126 - 133', concept:'exponent' },
  { subchapterId:'1.5', subchapterTitle:'Räkna med potenser', lessonNo:11, groen:'134 - 142', blaa:'143 - 150', theoryPages:'30 - 32', concept:'kvadratrot' },
  { subchapterId:'1.5', subchapterTitle:'Räkna med potenser', lessonNo:12, blaa:'143 - 150', roed:'151 - 156', concept:'tiopotens' },
  { subchapterId:'2.1', subchapterTitle:'Mönster', lessonNo:1, groen:'1 - 6', blaa:'7 - 12', theoryPages:'58 - 59', exercisePages:'59 - 61', concept:'algebra' },
  { subchapterId:'2.1', subchapterTitle:'Mönster', lessonNo:2, blaa:'7 - 12', roed:'13 - 18', concept:'mönster' },
  { subchapterId:'2.2', subchapterTitle:'Mönster och formler', lessonNo:3, groen:'19 - 27', blaa:'28 - 33', theoryPages:'62 - 64', exercisePages:'64 - 66', concept:'aritmetisk talföljd' },
  { subchapterId:'2.2', subchapterTitle:'Mönster och formler', lessonNo:4, blaa:'28 - 33', roed:'34 - 39', concept:'geometrisk talföljd' },
  { subchapterId:'2.3', subchapterTitle:'Uttryck med parenteser', lessonNo:5, groen:'40 - 47', blaa:'48 - 58', theoryPages:'67 - 68', exercisePages:'68 - 70', concept:'formel' },
  { subchapterId:'2.3', subchapterTitle:'Uttryck med parenteser', lessonNo:6, blaa:'48 - 58', roed:'59 - 64', concept:'numeriskt uttryck' },
  { subchapterId:'3.1', subchapterTitle:'Geometriska kroppar', lessonNo:1, groen:'1 - 6', blaa:'7 - 11', theoryPages:'108 - 110', exercisePages:'111 - 112', concept:'dimension' },
  { subchapterId:'3.1', subchapterTitle:'Geometriska kroppar', lessonNo:2, blaa:'7 - 11', roed:'12 - 14', concept:'hörn' },
  { subchapterId:'4.1', subchapterTitle:'Beräkna andelen', lessonNo:1, groen:'1 - 12', blaa:'13 - 18', theoryPages:'160 - 162', exercisePages:'162 - 163', concept:'andelen' },
  { subchapterId:'4.1', subchapterTitle:'Beräkna andelen', lessonNo:2, blaa:'13 - 18', roed:'19 - 21', concept:'delen' },
  { subchapterId:'5.1', subchapterTitle:'Kombinatorik', lessonNo:1, groen:'1 - 7', blaa:'8 - 14', theoryPages:'210 - 212', exercisePages:'212 - 214' },
  { subchapterId:'5.1', subchapterTitle:'Kombinatorik', lessonNo:2, blaa:'8 - 14', roed:'15 - 19' },
];

const TS = '2026-07-10T00:00:00Z';
export const IMPORT_REPORT = importRows(RAW_ROWS, TS);
export const SOURCE_MAPS: LessonSourceMap[] = IMPORT_REPORT.result;
export const CONCEPTS_1_1: Concept[] = [
  { id:'c-1-1-negativatal' as ConceptId, term:'negativt tal', definition:'Tal som är mindre än noll, skrivs med minustecken framför.', subchapterId:'1.1' },
  { id:'c-1-1-tallinjen' as ConceptId, term:'tallinjen', definition:'En linje där tal placeras i storleksordning.', subchapterId:'1.1' },
];
XEOF7_DELIM_X
ok "packages/core/src/fixtures/prio-mat-8-full.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/fixtures/index.ts..."
cat > packages/core/src/fixtures/index.ts << 'XEOF7_DELIM_X'
export * from './prio-mat-8-full.js';
XEOF7_DELIM_X
ok "packages/core/src/fixtures/index.ts"

# ──────────────────────────────────────────────────
log "packages/core/src/import/index.ts..."
cat > packages/core/src/import/index.ts << 'XEOF7_DELIM_X'
export * from './source-registry.js';
export * from './import-types.js';
export * from './importer.js';
XEOF7_DELIM_X
ok "packages/core/src/import/index.ts"

# ──────────────────────────────────────────────────
log "packages/core/test/import.test.ts..."
cat > packages/core/test/import.test.ts << 'XEOF7_DELIM_X'
import { describe, it, expect } from 'vitest';
import { importRows } from '../src/import/importer.js';

describe('importRows', () => {
  it('importerar rader med giltiga uppgiftsspann', () => {
    const report = importRows([
      { subchapterId:'1.1', subchapterTitle:'Negativa tal', lessonNo:1, groen:'1 - 3', blaa:'4 - 5' },
      { subchapterId:'1.2', subchapterTitle:'Test', lessonNo:2, groen:'Veckotest eventuellt Magma' },
    ], '2026-07-10T00:00:00Z');

    expect(report.successCount).toBe(2);
    expect(report.errorCount).toBe(0);
    expect(report.result).toHaveLength(2);
    expect(report.result[0]?.exerciseRanges).toHaveLength(2);
  });

  it('rapporterar ogiltiga subchapterId eller lessonNo', () => {
    const report = importRows([
      { subchapterId:'', subchapterTitle:'Fel', lessonNo:1 },
      { subchapterId:'1.2', subchapterTitle:'Fel', lessonNo:0 },
    ], '2026-07-10T00:00:00Z');

    expect(report.errorCount).toBe(2);
    expect(report.errors[0]?.field).toBe('subchapterId');
    expect(report.errors[1]?.field).toBe('lessonNo');
  });
});
XEOF7_DELIM_X
ok "packages/core/test/import.test.ts"

echo ""
log "Kör npm test..."
echo ""
if npm test 2>&1; then
  echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Sprint 7 klar!                          ${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
else
  echo ""
echo "Några tester failade. Kontrollera felmeddelandena ovan."
fi
