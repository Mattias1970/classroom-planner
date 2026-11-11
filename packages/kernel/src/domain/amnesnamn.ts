/**
 * Del 243 · Ämnen som bytt namn. (Ring 1, I2.)
 *
 * Stödämnet 'Matematik spec' heter 'MaNOTk-stöd'. Sparad data döps om när den läses: ämnet, dess fria
 * planeringsbok och planeringarnas namn — så att träd, planeringar och scheman visar samma namn överallt.
 * Namn som läraren själv har gett en sparfil rörs inte.
 */
import type { Struktur } from './typer.js';

/** Gammalt namn → nytt namn. */
export const AMNEN_NYA_NAMN: Readonly<Record<string, string>> = { 'Matematik spec': 'MaNOTk-stöd' };

/** Ämnets gällande namn ('Matematik spec' → 'MaNOTk-stöd'); andra namn lämnas som de är. */
export function gallandeAmnesnamn(namn: string): string {
  return AMNEN_NYA_NAMN[namn] ?? namn;
}

/** Byter ämnesnamnet överallt i strukturen. Samma objekt tillbaka när inget heter så. */
export function bytAmnesnamn(s: Struktur, fran: string, till: string): Struktur {
  if (fran === till || fran === '') return s;
  let andrad = false;
  const text = (t: string): string => { if (!t.includes(fran)) return t; andrad = true; return t.split(fran).join(till); };
  const exakt = (t: string): string => { if (t !== fran) return t; andrad = true; return till; };
  const amnen = s.amnen.map((a) => (a.namn === fran ? { ...a, namn: exakt(a.namn) } : a));
  const bocker = s.bocker.map((b) => (b.amne === fran ? { ...b, amne: exakt(b.amne), titel: text(b.titel) } : b));
  const planering = <T extends { namn?: string }>(p: T): T => (p.namn !== undefined && p.namn.includes(fran) ? { ...p, namn: text(p.namn) } : p);
  const planeringar = s.planeringar.map(planering);
  const planeringsarkiv = s.planeringsarkiv?.map(planering);
  const sparadePlaneringar = s.sparadePlaneringar?.map((p) => (p.amneNamn === fran || p.bokTitel.includes(fran) || (p.planering.namn ?? '').includes(fran)
    ? { ...p, amneNamn: exakt(p.amneNamn), bokTitel: text(p.bokTitel), planering: planering(p.planering) } : p));
  if (!andrad) return s;
  return {
    ...s, amnen, bocker, planeringar,
    ...(planeringsarkiv !== undefined ? { planeringsarkiv } : {}),
    ...(sparadePlaneringar !== undefined ? { sparadePlaneringar } : {}),
  };
}

/** Döper om alla ämnen som bytt namn (AMNEN_NYA_NAMN). Körs när sparad data läses in. */
export function uppdateraAmnesnamn(s: Struktur): Struktur {
  let ut = s;
  for (const [fran, till] of Object.entries(AMNEN_NYA_NAMN)) {
    // Finns det nya namnet redan i samma klass döps det gamla inte om — två ämnen får inte heta lika
    const krock = ut.amnen.some((a) => a.namn === fran && ut.amnen.some((b) => b.klassId === a.klassId && b.namn === till));
    if (!krock) ut = bytAmnesnamn(ut, fran, till);
  }
  return ut;
}
