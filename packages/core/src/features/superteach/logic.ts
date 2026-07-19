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
