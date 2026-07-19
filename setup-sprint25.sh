#!/usr/bin/env bash
# classroom-planner — setup-sprint25.sh
#
# Sprint 25: SuperTeach domän + aggregeringslogik (Ring 1)
# - Evidenstyper (SuperTeachEvidence, dimensioner, källviktning)
# - Ren logik: viktning, tidsavklingning, sammanställning per elev, trend, luckor
# - AI-evidens utan lärargranskning exkluderas (policy i config)
#
# Kör i projektroten:
#   bash setup-sprint25.sh
#   npm test
#
# MODULARITET: skriptet skapar ENDAST nya filer i egna kataloger.
# Inga befintliga filer ändras — befintliga funktioner påverkas inte.

set -euo pipefail
GREEN="\033[0;32m"; BLUE="\033[0;34m"; NC="\033[0m"
log() { echo -e "${BLUE}▶${NC}  $1"; }
ok()  { echo -e "${GREEN}✅${NC}  $1"; }

echo ""
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo -e "${BLUE}  Classroom Planner — Sprint 25: SuperTeach domän (Ring 1)  ${NC}"
echo -e "${BLUE}══════════════════════════════════════════${NC}"
echo ""

if [ ! -f "packages/core/package.json" ]; then
  echo "❌  Kör skriptet i projektroten (packages/core saknas)."
  exit 1
fi
mkdir -p packages/core/src/features/superteach packages/core/test/superteach
ok "Kataloger klara"

log "packages/core/src/features/superteach/types.ts..."
cat > packages/core/src/features/superteach/types.ts << 'ST25_TYPES'
/**
 * SuperTeach — evidensbaserad kunskapsöversikt per elev.
 *
 * SJÄLVSTÄNDIG MODUL (Ring 1, ren domän):
 * - Inga imports från övriga core-moduler → kan aldrig påverka
 *   befintliga funktioner och påverkas inte av deras ändringar.
 * - Lokala typalias (StudentKey, SubjectName, ...) är strängar,
 *   kompatibla med befintliga LessonRecord-fält utan koppling.
 */

// Lokala alias — medvetet frikopplade från resten av domänen.
export type StudentKey = string;
export type SubjectName = string;
export type CurriculumTag = string;
export type VersionId = string;

export type EvidenceSource =
  | 'google-forms'
  | 'google-classroom-image'
  | 'google-classroom-submission'
  | 'socrative-homework'
  | 'socrative-exit-ticket'
  | 'magma'
  | 'teacher-observation'
  | 'manual';

export type EvidenceStatus = 'secure' | 'developing' | 'gap' | 'not-assessed';
export type Confidence = 'low' | 'medium' | 'high';

export interface EvidenceDimension {
  /** T.ex. 'begrepp', 'procedur', 'problemlösning', 'resonemang', 'kommunikation' */
  dimension: string;
  status: EvidenceStatus;
  confidence: Confidence;
  evidenceText: string;
}

/** Ett evidensobjekt — en observation av en elevs kunnande vid en tidpunkt. */
export interface SuperTeachEvidence {
  id: string;
  studentKey: StudentKey;
  subject: SubjectName;
  source: EvidenceSource;
  assignmentId?: string;
  submissionId?: string;
  lessonVersionId?: VersionId;
  curriculumTags?: CurriculumTag[];
  dimensions: EvidenceDimension[];
  aiAssisted: boolean;
  aiProviderId?: string;
  teacherReviewed: boolean;
  teacherApprovedAt?: string;
  /** ISO 8601 */
  collectedAt: string;
}

// ── Evidensviktning per källa ─────────────────────────────────
export type EvidenceWeight =
  | 'låg'
  | 'låg-medel'
  | 'medel'
  | 'medel-hög'
  | 'hög'
  | 'konfigurerbar';

export interface EvidenceWeightEntry {
  source: EvidenceSource;
  primaryFunction: string;
  weight: EvidenceWeight;
}

export const EVIDENCE_WEIGHTS: EvidenceWeightEntry[] = [
  { source: 'socrative-homework',          primaryFunction: 'Förberedelse, begrepp, minnesåterkallning', weight: 'låg-medel' },
  { source: 'socrative-exit-ticket',       primaryFunction: 'Direkt förståelse efter lektion',           weight: 'medel' },
  { source: 'magma',                       primaryFunction: 'Procedurträning och färdighet',             weight: 'medel' },
  { source: 'google-classroom-submission', primaryFunction: 'Problemlösning, redovisning',               weight: 'medel-hög' },
  { source: 'google-forms',                primaryFunction: 'Strukturerad kunskapskontroll',             weight: 'medel-hög' },
  { source: 'google-classroom-image',      primaryFunction: 'Handskriven lösning, bildanalys',           weight: 'medel-hög' },
  { source: 'teacher-observation',         primaryFunction: 'Professionell bedömning',                   weight: 'konfigurerbar' },
  { source: 'manual',                      primaryFunction: 'Manuell inmatning',                         weight: 'konfigurerbar' },
];

/** Numerisk vikt för aggregering. 'konfigurerbar' faller tillbaka på config. */
export interface SuperTeachConfig {
  /** Vikt för 'konfigurerbar'-källor (lärarobservation, manuell). Default 1.0 */
  configurableWeight: number;
  /** Evidens äldre än så många dagar viktas ned linjärt mot decayFloor. Default 60 */
  decayAfterDays: number;
  /** Lägsta viktfaktor för gammal evidens. Default 0.4 */
  decayFloor: number;
  /** Om true räknas AI-evidens utan lärargranskning inte in i sammanställningen. Default true */
  requireTeacherReviewForAi: boolean;
}

export const DEFAULT_SUPERTEACH_CONFIG: SuperTeachConfig = {
  configurableWeight: 1.0,
  decayAfterDays: 60,
  decayFloor: 0.4,
  requireTeacherReviewForAi: true,
};

// ── Sammanställning (dashboardens datamodell) ─────────────────
export interface DimensionSummary {
  dimension: string;
  status: EvidenceStatus;
  /** 0–1, viktat medel av evidensens säkerhet */
  score: number | null;
  evidenceCount: number;
  latestCollectedAt: string | null;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
}

export interface StudentSummary {
  studentKey: StudentKey;
  subject: SubjectName;
  dimensions: DimensionSummary[];
  totalEvidence: number;
  excludedUnreviewedAi: number;
  gaps: string[];
}
ST25_TYPES
ok "packages/core/src/features/superteach/types.ts"
log "packages/core/src/features/superteach/logic.ts..."
cat > packages/core/src/features/superteach/logic.ts << 'ST25_LOGIC'
/**
 * SuperTeach — ren aggregeringslogik (Ring 1, inga sidoeffekter).
 * Importerar ENDAST från ./types.js — modulen är helt fristående.
 */
import {
  DEFAULT_SUPERTEACH_CONFIG,
  EVIDENCE_WEIGHTS,
  type DimensionSummary,
  type EvidenceStatus,
  type EvidenceWeight,
  type StudentSummary,
  type SuperTeachConfig,
  type SuperTeachEvidence,
} from './types.js';

const WEIGHT_VALUE: Record<Exclude<EvidenceWeight, 'konfigurerbar'>, number> = {
  'låg': 0.4,
  'låg-medel': 0.6,
  'medel': 0.8,
  'medel-hög': 1.0,
  'hög': 1.2,
};

const STATUS_VALUE: Record<EvidenceStatus, number | null> = {
  secure: 1.0,
  developing: 0.5,
  gap: 0.0,
  'not-assessed': null,
};

const CONFIDENCE_FACTOR = { low: 0.6, medium: 0.85, high: 1.0 } as const;

/** Numerisk grundvikt för en evidenskälla. */
export function sourceWeight(
  source: SuperTeachEvidence['source'],
  config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
): number {
  const entry = EVIDENCE_WEIGHTS.find((w) => w.source === source);
  if (!entry) return config.configurableWeight;
  return entry.weight === 'konfigurerbar'
    ? config.configurableWeight
    : WEIGHT_VALUE[entry.weight];
}

/** Linjär tidsavklingning: 1.0 fram till decayAfterDays, sedan mot decayFloor vid 2×. */
export function recencyFactor(
  collectedAt: string,
  now: Date,
  config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
): number {
  const ageDays = (now.getTime() - new Date(collectedAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays <= config.decayAfterDays) return 1.0;
  const t = Math.min(1, (ageDays - config.decayAfterDays) / config.decayAfterDays);
  return 1.0 - t * (1.0 - config.decayFloor);
}

/** Filtrerar bort AI-evidens som inte är lärargranskad (om konfigurerat). */
export function usableEvidence(
  evidence: SuperTeachEvidence[],
  config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
): { usable: SuperTeachEvidence[]; excludedUnreviewedAi: number } {
  if (!config.requireTeacherReviewForAi) {
    return { usable: [...evidence], excludedUnreviewedAi: 0 };
  }
  const usable: SuperTeachEvidence[] = [];
  let excluded = 0;
  for (const e of evidence) {
    if (e.aiAssisted && !e.teacherReviewed) excluded += 1;
    else usable.push(e);
  }
  return { usable, excludedUnreviewedAi: excluded };
}

function scoreToStatus(score: number | null): EvidenceStatus {
  if (score === null) return 'not-assessed';
  if (score >= 0.75) return 'secure';
  if (score >= 0.35) return 'developing';
  return 'gap';
}

function trendOf(points: Array<{ at: number; value: number }>): DimensionSummary['trend'] {
  if (points.length < 2) return 'unknown';
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const half = Math.floor(sorted.length / 2);
  const avg = (xs: typeof sorted) => xs.reduce((s, p) => s + p.value, 0) / xs.length;
  const early = avg(sorted.slice(0, half));
  const late = avg(sorted.slice(half));
  if (late - early > 0.15) return 'improving';
  if (early - late > 0.15) return 'declining';
  return 'stable';
}

/**
 * Bygger en sammanställning per elev och ämne av all evidens.
 * Viktning: källvikt × säkerhetsfaktor × tidsavklingning.
 */
export function buildStudentSummary(
  studentKey: string,
  subject: string,
  allEvidence: SuperTeachEvidence[],
  now: Date = new Date(),
  config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
): StudentSummary {
  const own = allEvidence.filter(
    (e) => e.studentKey === studentKey && e.subject === subject,
  );
  const { usable, excludedUnreviewedAi } = usableEvidence(own, config);

  const byDimension = new Map<
    string,
    { num: number; den: number; count: number; latest: string | null; points: Array<{ at: number; value: number }> }
  >();

  for (const e of usable) {
    const w = sourceWeight(e.source, config) * recencyFactor(e.collectedAt, now, config);
    for (const d of e.dimensions) {
      const base = STATUS_VALUE[d.status];
      const acc = byDimension.get(d.dimension) ?? {
        num: 0, den: 0, count: 0, latest: null, points: [],
      };
      acc.count += 1;
      if (acc.latest === null || e.collectedAt > acc.latest) acc.latest = e.collectedAt;
      if (base !== null) {
        const cw = w * CONFIDENCE_FACTOR[d.confidence];
        acc.num += base * cw;
        acc.den += cw;
        acc.points.push({ at: new Date(e.collectedAt).getTime(), value: base });
      }
      byDimension.set(d.dimension, acc);
    }
  }

  const dimensions: DimensionSummary[] = [...byDimension.entries()]
    .map(([dimension, acc]) => {
      const score = acc.den > 0 ? acc.num / acc.den : null;
      return {
        dimension,
        score,
        status: scoreToStatus(score),
        evidenceCount: acc.count,
        latestCollectedAt: acc.latest,
        trend: trendOf(acc.points),
      };
    })
    .sort((a, b) => a.dimension.localeCompare(b.dimension, 'sv'));

  const gaps = dimensions
    .filter((d) => d.status === 'gap' || d.status === 'not-assessed')
    .map((d) => d.dimension);

  return {
    studentKey,
    subject,
    dimensions,
    totalEvidence: own.length,
    excludedUnreviewedAi,
    gaps,
  };
}

/** Sammanställning för en hel klass: elevnyckel → StudentSummary. */
export function buildClassSummaries(
  studentKeys: string[],
  subject: string,
  allEvidence: SuperTeachEvidence[],
  now: Date = new Date(),
  config: SuperTeachConfig = DEFAULT_SUPERTEACH_CONFIG,
): Map<string, StudentSummary> {
  const out = new Map<string, StudentSummary>();
  for (const key of studentKeys) {
    out.set(key, buildStudentSummary(key, subject, allEvidence, now, config));
  }
  return out;
}
ST25_LOGIC
ok "packages/core/src/features/superteach/logic.ts"
log "packages/core/test/superteach/logic.test.ts..."
cat > packages/core/test/superteach/logic.test.ts << 'ST25_TEST'
import { describe, expect, it } from 'vitest';
import {
  buildClassSummaries,
  buildStudentSummary,
  recencyFactor,
  sourceWeight,
  usableEvidence,
} from '../../src/features/superteach/logic.js';
import {
  DEFAULT_SUPERTEACH_CONFIG,
  type SuperTeachEvidence,
} from '../../src/features/superteach/types.js';

const NOW = new Date('2026-07-19T12:00:00Z');

function ev(partial: Partial<SuperTeachEvidence> & { id: string }): SuperTeachEvidence {
  return {
    studentKey: 'elev-1',
    subject: 'matematik',
    source: 'google-forms',
    dimensions: [],
    aiAssisted: false,
    teacherReviewed: true,
    collectedAt: '2026-07-10T08:00:00Z',
    ...partial,
  };
}

describe('sourceWeight', () => {
  it('ger högre vikt för Forms än Socrative-läxa', () => {
    expect(sourceWeight('google-forms')).toBeGreaterThan(sourceWeight('socrative-homework'));
  });
  it('använder konfigurerbar vikt för lärarobservation', () => {
    expect(sourceWeight('teacher-observation', { ...DEFAULT_SUPERTEACH_CONFIG, configurableWeight: 1.5 })).toBe(1.5);
  });
});

describe('recencyFactor', () => {
  it('är 1.0 för färsk evidens', () => {
    expect(recencyFactor('2026-07-15T00:00:00Z', NOW)).toBe(1.0);
  });
  it('klingar av mot golvet för gammal evidens', () => {
    const old = recencyFactor('2025-09-01T00:00:00Z', NOW);
    expect(old).toBeCloseTo(DEFAULT_SUPERTEACH_CONFIG.decayFloor, 5);
  });
});

describe('usableEvidence', () => {
  it('exkluderar ogranskad AI-evidens som standard', () => {
    const { usable, excludedUnreviewedAi } = usableEvidence([
      ev({ id: 'a', aiAssisted: true, teacherReviewed: false }),
      ev({ id: 'b' }),
    ]);
    expect(usable.map((e) => e.id)).toEqual(['b']);
    expect(excludedUnreviewedAi).toBe(1);
  });
});

describe('buildStudentSummary', () => {
  it('aggregerar dimensioner, hittar luckor och räknar exkluderad AI', () => {
    const evidence: SuperTeachEvidence[] = [
      ev({
        id: '1',
        dimensions: [
          { dimension: 'begrepp', status: 'secure', confidence: 'high', evidenceText: 'Full poäng på begreppstest' },
          { dimension: 'procedur', status: 'gap', confidence: 'medium', evidenceText: 'Ekvationslösning brister' },
        ],
      }),
      ev({
        id: '2',
        source: 'teacher-observation',
        collectedAt: '2026-07-12T08:00:00Z',
        dimensions: [
          { dimension: 'begrepp', status: 'secure', confidence: 'medium', evidenceText: 'Resonerar säkert muntligt' },
        ],
      }),
      ev({ id: '3', aiAssisted: true, teacherReviewed: false, dimensions: [
        { dimension: 'begrepp', status: 'gap', confidence: 'high', evidenceText: 'AI-analys, ej granskad' },
      ]}),
      ev({ id: '4', studentKey: 'annan-elev' }),
    ];
    const s = buildStudentSummary('elev-1', 'matematik', evidence, NOW);
    expect(s.totalEvidence).toBe(3);
    expect(s.excludedUnreviewedAi).toBe(1);
    const begrepp = s.dimensions.find((d) => d.dimension === 'begrepp');
    expect(begrepp?.status).toBe('secure');
    expect(begrepp?.evidenceCount).toBe(2);
    expect(s.gaps).toContain('procedur');
  });

  it('markerar not-assessed när ingen bedömbar evidens finns', () => {
    const s = buildStudentSummary('elev-1', 'matematik', [
      ev({ id: '1', dimensions: [{ dimension: 'kommunikation', status: 'not-assessed', confidence: 'low', evidenceText: '' }] }),
    ], NOW);
    expect(s.dimensions[0]?.status).toBe('not-assessed');
    expect(s.dimensions[0]?.score).toBeNull();
    expect(s.gaps).toContain('kommunikation');
  });

  it('upptäcker förbättringstrend', () => {
    const dims = (status: 'gap' | 'secure') =>
      [{ dimension: 'procedur', status, confidence: 'high' as const, evidenceText: '' }];
    const s = buildStudentSummary('elev-1', 'matematik', [
      ev({ id: '1', collectedAt: '2026-06-01T08:00:00Z', dimensions: dims('gap') }),
      ev({ id: '2', collectedAt: '2026-06-20T08:00:00Z', dimensions: dims('gap') }),
      ev({ id: '3', collectedAt: '2026-07-05T08:00:00Z', dimensions: dims('secure') }),
      ev({ id: '4', collectedAt: '2026-07-15T08:00:00Z', dimensions: dims('secure') }),
    ], NOW);
    expect(s.dimensions[0]?.trend).toBe('improving');
  });
});

describe('buildClassSummaries', () => {
  it('bygger en sammanställning per elev', () => {
    const map = buildClassSummaries(['elev-1', 'elev-2'], 'matematik', [ev({ id: '1' })], NOW);
    expect(map.size).toBe(2);
    expect(map.get('elev-2')?.totalEvidence).toBe(0);
  });
});
ST25_TEST
ok "packages/core/test/superteach/logic.test.ts"

echo ""
ok "Sprint 25 klar — kör: npx vitest run packages/core/test/superteach"
