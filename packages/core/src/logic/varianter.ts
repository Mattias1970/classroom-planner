/**
 * Lektionsvarianter + tokengiltighet — ren kärna.
 *
 * Varianter: en lektion (kapitel + lektionsnummer) kan ha namngivna varianter
 * utöver originalet. En variant är en partiell fältuppsättning som läggs
 * ovanpå källlektionen; redigeringar går alltid till det som är aktivt
 * (originalet = vanliga fältöverstyrningar, en variant = variantens fält).
 * Bokfilerna i datakällan muteras aldrig.
 */
import type { LessonRecord } from '../records/lesson-record.js';

export type VariantFields = Partial<Record<keyof LessonRecord, string>>;

export interface LessonVariants {
  /** null = originalet är aktivt. */
  active: string | null;
  varianter: Record<string, VariantFields>;
}

export const EMPTY_VARIANTS: LessonVariants = { active: null, varianter: {} };

/** Fältvärde med variantprecedens: aktiv variant → basöverstyrning → källa. */
export function resolveField(
  source: string,
  baseOverride: string | undefined,
  variants: LessonVariants,
  field: keyof LessonRecord,
): string {
  if (variants.active !== null) {
    const v = variants.varianter[variants.active]?.[field];
    if (v !== undefined) return v;
  }
  return baseOverride ?? source;
}

/** Ledigt variantnamn: 'Variant' → 'Variant', krock → 'Variant 2', 'Variant 3' … */
export function uniqueVariantName(wanted: string, existing: string[]): string {
  const base = wanted.trim() || 'Variant';
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// ── Tokengiltighet (fine-grained PAT) ─────────────────────────

export interface TokenExpiry { iso: string; daysLeft: number; }

/**
 * Tolkar GitHubs svarsheader `github-authentication-token-expiration`
 * (format "2027-06-30 00:00:00 UTC" eller ISO). null om otolkbar/saknad.
 */
export function parseTokenExpiry(header: string | null, now: Date = new Date()): TokenExpiry | null {
  if (!header) return null;
  const normalized = header.trim().replace(' UTC', 'Z').replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  const daysLeft = Math.floor((d.getTime() - now.getTime()) / 86_400_000);
  return { iso: d.toISOString().slice(0, 10), daysLeft };
}
