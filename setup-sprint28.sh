#!/usr/bin/env bash
# classroom-planner — setup-sprint28.sh
#
# Sprint 28: Resultatingest — Socrative/Magma/Forms CSV → evidens
# - CSV-parser + generisk resultatimport med statuströsklar
# - Källspecifika wrappers med defaultdimensioner (begrepp/procedur)
# - Idempotenta id:n: samma fil kan importeras om utan dubbletter
#
# Kör i projektroten:  bash setup-sprint28.sh  &&  npm test
# MODULARITET: endast nya filer + guardade index-uppdateringar av
# superteach-modulens egna index.ts. Inget annat rörs.

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

if [ ! -f "packages/core/src/features/superteach/service.ts" ]; then
  echo "❌  Sprint 26 krävs först (setup-sprint26.sh)."
  exit 1
fi
log "packages/core/src/features/superteach/ingest.ts..."
cat > packages/core/src/features/superteach/ingest.ts << 'S28_INGEST'
/**
 * Sprint 28 — Resultatingest (Ring 1, ren logik).
 * Konverterar CSV-exporter från Socrative, Magma och Google Forms
 * till SuperTeachEvidence. Inga nätverksanrop — läraren laddar ner
 * CSV-filen själv och importerar den.
 *
 * Importerar endast från ./types.js — fristående modul.
 */
import type {
  EvidenceSource,
  EvidenceStatus,
  SuperTeachEvidence,
} from './types.js';

export interface IngestOptions {
  source: EvidenceSource;
  subject: string;
  /** Vilken förmågedimension resultatet mäter, t.ex. 'begrepp' eller 'procedur'. */
  dimension: string;
  /** ISO 8601. Default: nu. */
  collectedAt?: string;
  /** Koppling till lektion (valfritt). */
  lessonVersionId?: string;
  assignmentId?: string;
  /** Andel rätt som räknas som 'secure' (default 0.75) resp. 'developing' (default 0.4). */
  secureThreshold?: number;
  developingThreshold?: number;
}

export interface IngestResult {
  evidence: SuperTeachEvidence[];
  skippedRows: number;
}

export class IngestError extends Error {}

/** Minimal CSV-parser: hanterar citattecken, komma/semikolon, CRLF. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  const push = () => { row.push(field); field = ''; };
  const pushRow = () => { push(); if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) push();
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

function statusFromRatio(
  ratio: number,
  secure: number,
  developing: number,
): EvidenceStatus {
  if (!Number.isFinite(ratio)) return 'not-assessed';
  if (ratio >= secure) return 'secure';
  if (ratio >= developing) return 'developing';
  return 'gap';
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

const NAME_HEADERS = ['student name', 'namn', 'elev', 'name', 'student'];
const SCORE_HEADERS = ['score (%)', 'score %', 'procent', 'resultat (%)', 'score', 'poäng', 'points', 'total score'];
const MAX_HEADERS = ['max', 'maxpoäng', 'max points', 'total', 'av'];

/**
 * Generisk resultat-CSV → evidens. Kräver en namnkolumn och antingen en
 * procentkolumn eller poäng+max. Elevnamn blir studentKey oförändrat —
 * använd samma nycklar som i klasslistan.
 */
export function ingestScoreCsv(csv: string, opts: IngestOptions): IngestResult {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new IngestError('CSV-filen saknar datarader.');
  const header = rows[0].map(normalizeHeader);
  const idx = (cands: string[]) => header.findIndex((h) => cands.some((c) => h === c || h.startsWith(c)));
  const nameIdx = idx(NAME_HEADERS);
  const scoreIdx = idx(SCORE_HEADERS);
  const maxIdx = idx(MAX_HEADERS);
  if (nameIdx === -1) throw new IngestError(`Hittar ingen namnkolumn. Rubriker: ${rows[0].join(', ')}`);
  if (scoreIdx === -1) throw new IngestError(`Hittar ingen resultatkolumn. Rubriker: ${rows[0].join(', ')}`);

  const secure = opts.secureThreshold ?? 0.75;
  const developing = opts.developingThreshold ?? 0.4;
  const collectedAt = opts.collectedAt ?? new Date().toISOString();
  const isPercentHeader = /%|procent/.test(header[scoreIdx]);

  const evidence: SuperTeachEvidence[] = [];
  let skippedRows = 0;
  for (const row of rows.slice(1)) {
    const student = (row[nameIdx] ?? '').trim();
    const rawScore = parseFloat((row[scoreIdx] ?? '').replace('%', '').replace(',', '.'));
    if (!student || !Number.isFinite(rawScore)) { skippedRows++; continue; }
    let ratio: number;
    if (isPercentHeader || rawScore > 1 && maxIdx === -1 && rawScore <= 100) {
      ratio = rawScore > 1 ? rawScore / 100 : rawScore;
    } else if (maxIdx !== -1) {
      const max = parseFloat((row[maxIdx] ?? '').replace(',', '.'));
      if (!Number.isFinite(max) || max <= 0) { skippedRows++; continue; }
      ratio = rawScore / max;
    } else {
      ratio = rawScore > 1 ? rawScore / 100 : rawScore;
    }
    const status = statusFromRatio(ratio, secure, developing);
    evidence.push({
      id: `ingest-${opts.source}-${collectedAt}-${student}`.replace(/\s+/g, '_'),
      studentKey: student,
      subject: opts.subject,
      source: opts.source,
      assignmentId: opts.assignmentId,
      lessonVersionId: opts.lessonVersionId,
      dimensions: [{
        dimension: opts.dimension,
        status,
        confidence: 'medium',
        evidenceText: `Automatisk import (${opts.source}): ${Math.round(ratio * 100)}% rätt.`,
      }],
      aiAssisted: false,
      teacherReviewed: false, // importerad, ej granskad — men ej AI, så den räknas
      collectedAt,
    });
  }
  return { evidence, skippedRows };
}

// ── Källspecifika wrappers med rimliga defaultdimensioner ─────
export function ingestSocrativeCsv(
  csv: string,
  opts: Omit<IngestOptions, 'source' | 'dimension'> & { kind: 'homework' | 'exit-ticket'; dimension?: string },
): IngestResult {
  return ingestScoreCsv(csv, {
    ...opts,
    source: opts.kind === 'homework' ? 'socrative-homework' : 'socrative-exit-ticket',
    dimension: opts.dimension ?? 'begrepp',
  });
}

export function ingestMagmaCsv(
  csv: string,
  opts: Omit<IngestOptions, 'source' | 'dimension'> & { dimension?: string },
): IngestResult {
  return ingestScoreCsv(csv, { ...opts, source: 'magma', dimension: opts.dimension ?? 'procedur' });
}

export function ingestGoogleFormsCsv(
  csv: string,
  opts: Omit<IngestOptions, 'source' | 'dimension'> & { dimension?: string },
): IngestResult {
  return ingestScoreCsv(csv, { ...opts, source: 'google-forms', dimension: opts.dimension ?? 'begrepp' });
}
S28_INGEST
ok "packages/core/src/features/superteach/ingest.ts"
log "packages/core/test/superteach/ingest.test.ts..."
cat > packages/core/test/superteach/ingest.test.ts << 'S28_TEST'
import { describe, expect, it } from 'vitest';
import {
  IngestError,
  ingestGoogleFormsCsv,
  ingestMagmaCsv,
  ingestScoreCsv,
  ingestSocrativeCsv,
  parseCsv,
} from '../../src/features/superteach/ingest.js';

const AT = '2026-07-19T10:00:00Z';

describe('parseCsv', () => {
  it('hanterar citattecken, semikolon och CRLF', () => {
    expect(parseCsv('a;b\r\n"x;1";2\r\n')).toEqual([['a', 'b'], ['x;1', '2']]);
    expect(parseCsv('a,b\n"sa""id",2')).toEqual([['a', 'b'], ['sa"id', '2']]);
  });
});

describe('ingestScoreCsv', () => {
  it('mappar procent till status enligt trösklar', () => {
    const csv = 'Student Name,Score (%)\nAnna,90\nBjörn,55\nCem,20\nDitt,\n';
    const { evidence, skippedRows } = ingestScoreCsv(csv, {
      source: 'google-forms', subject: 'matematik', dimension: 'begrepp', collectedAt: AT,
    });
    expect(skippedRows).toBe(1);
    expect(evidence.map((e) => e.dimensions[0].status)).toEqual(['secure', 'developing', 'gap']);
    expect(evidence[0].studentKey).toBe('Anna');
    expect(evidence[0].aiAssisted).toBe(false);
  });

  it('räknar poäng/max när procent saknas', () => {
    const csv = 'Namn;Poäng;Max\nAnna;8;10\nBjörn;3;10\n';
    const { evidence } = ingestScoreCsv(csv, {
      source: 'magma', subject: 'matematik', dimension: 'procedur', collectedAt: AT,
    });
    expect(evidence[0].dimensions[0].status).toBe('secure');
    expect(evidence[1].dimensions[0].status).toBe('gap');
  });

  it('ger begripligt fel utan namn-/resultatkolumn', () => {
    expect(() => ingestScoreCsv('X,Y\n1,2\n', {
      source: 'manual', subject: 'ma', dimension: 'begrepp',
    })).toThrow(IngestError);
  });

  it('idempotenta id:n — samma fil två gånger dubblerar inte i servicen', () => {
    const csv = 'Namn,Score (%)\nAnna,90\n';
    const a = ingestScoreCsv(csv, { source: 'google-forms', subject: 'ma', dimension: 'begrepp', collectedAt: AT });
    const b = ingestScoreCsv(csv, { source: 'google-forms', subject: 'ma', dimension: 'begrepp', collectedAt: AT });
    expect(a.evidence[0].id).toBe(b.evidence[0].id);
  });
});

describe('källspecifika wrappers', () => {
  const csv = 'Namn,Score (%)\nAnna,80\n';
  it('sätter rätt källa och defaultdimension', () => {
    expect(ingestSocrativeCsv(csv, { subject: 'ma', kind: 'exit-ticket', collectedAt: AT }).evidence[0].source)
      .toBe('socrative-exit-ticket');
    expect(ingestMagmaCsv(csv, { subject: 'ma', collectedAt: AT }).evidence[0].dimensions[0].dimension)
      .toBe('procedur');
    expect(ingestGoogleFormsCsv(csv, { subject: 'ma', collectedAt: AT }).evidence[0].source)
      .toBe('google-forms');
  });
});
S28_TEST
ok "packages/core/test/superteach/ingest.test.ts"
grep -q "ingest.js" packages/core/src/features/superteach/index.ts || \
  printf "export * from './ingest.js';\n" >> packages/core/src/features/superteach/index.ts
ok "Sprint 28 klar"
