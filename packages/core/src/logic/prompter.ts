/**
 * Promptbibliotek — ren kärna. Promptmallar finns i tre källor med precedens:
 * inbyggda (skeppas med appen, kan aldrig försvinna), datakällans
 * (prompter/ i data-repot, uppdaterbara utan appsläpp) och egna (lokala
 * varianter med eget namn/beskrivning). Egen > datakälla > inbyggd vid
 * samma id; övriga sorteras på namn.
 */

export type PromptKalla = 'inbyggd' | 'datakalla' | 'egen';

export interface PromptTemplate {
  id: string;            // stabilt id, t.ex. 'lektionsgenerator'
  namn: string;
  beskrivning: string;
  innehall: string;      // hela prompttexten (markdown)
  kalla: PromptKalla;
  uppdaterad?: string;   // ISO-tid för egna varianter
}

/** Slår samman källorna med precedens egen > datakälla > inbyggd per id. */
export function mergePromptSources(
  inbyggda: PromptTemplate[],
  datakalla: PromptTemplate[],
  egna: PromptTemplate[],
): PromptTemplate[] {
  const byId = new Map<string, PromptTemplate>();
  for (const p of inbyggda) byId.set(p.id, { ...p, kalla: 'inbyggd' });
  for (const p of datakalla) byId.set(p.id, { ...p, kalla: 'datakalla' });
  for (const p of egna) byId.set(p.id, { ...p, kalla: 'egen' });
  return [...byId.values()].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
}

/** Ledigt id ur önskat namn: 'Min variant' → 'min-variant', krock → '-2', '-3' … */
export function promptIdFromName(namn: string, existingIds: string[]): string {
  const base = namn.trim().toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'prompt';
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
