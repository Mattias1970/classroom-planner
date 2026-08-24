/**
 * Strukturen (v2): immutabla operationer på trädet
 * Skolår ─ Tjänst ─ Klass ─ Ämne, plus lärare, böcker och planeringar.
 * Borttag kaskaderar nedåt; böcker är fristående och kopplas via bokId.
 */
import { bokLektioner } from './bok.js';
import { NO_TK_AMNEN } from './amnen.js';
import { isoVecka, passSparr } from './skolar.js';
import type {
  Amne, Bok, Elev, Klass, Larare, LektionsPlan, Pass, PlaneradLektion, Planering, Skolar,
  Struktur, Tjanst,
} from './typer.js';

let seq = 0;
// Sessionsunik bas: förhindrar att id:n återanvänds mellan sidladdningar
// (annars kunde ett nytt ämne ärva ett borttaget ämnes innehåll om räknaren
// startar om). Testerna får deterministiska id:n via resetIdRaknare.
let bas = Date.now().toString(36);
/** Unikt id: sessionsbas + räknare (deterministiskt i test via reset). */
export function nyttId(prefix: string): string { seq += 1; return `${prefix}-${bas}-${seq.toString(36)}`; }
export function resetIdRaknare(): void { seq = 0; bas = 'test'; }

export function giltigtPass(p: Pass): boolean {
  return p.dag >= 1 && p.dag <= 5 && /^\d{2}:\d{2}$/.test(p.start) && /^\d{2}:\d{2}$/.test(p.slut) && p.start < p.slut;
}

// ── Skolår ───────────────────────────────────────────────────
const normNamn = (n: string) => n.trim().toLowerCase();

/** Flera skolår får finnas, men högst ett av varje (namnet är unikt). */
export function laggTillSkolar(s: Struktur, skolar: Skolar): Struktur {
  if (skolar.namn.trim() === '') throw new Error('Skolåret behöver ett namn.');
  if (s.skolar.some((x) => normNamn(x.namn) === normNamn(skolar.namn))) {
    throw new Error(`Ett skolår med namnet "${skolar.namn.trim()}" finns redan.`);
  }
  return { ...s, skolar: [...s.skolar, skolar] };
}
export function uppdateraSkolar(s: Struktur, id: string, patch: Partial<Skolar>): Struktur {
  if (patch.namn !== undefined) {
    if (patch.namn.trim() === '') throw new Error('Skolåret behöver ett namn.');
    if (s.skolar.some((x) => x.id !== id && normNamn(x.namn) === normNamn(patch.namn!))) {
      throw new Error(`Ett skolår med namnet "${patch.namn.trim()}" finns redan.`);
    }
  }
  if (patch.start !== undefined || patch.slut !== undefined) {
    const nu = s.skolar.find((x) => x.id === id);
    const start = patch.start ?? nu?.start ?? '';
    const slut = patch.slut ?? nu?.slut ?? '';
    if (slut <= start) throw new Error('Skolårets slutdatum måste vara efter startdatumet.');
  }
  return { ...s, skolar: s.skolar.map((x) => (x.id === id ? { ...x, ...patch, id: x.id } : x)) };
}
export function taBortSkolar(s: Struktur, id: string): Struktur {
  const tjanster = s.tjanster.filter((t) => t.skolarId === id).map((t) => t.id);
  let ut: Struktur = { ...s, skolar: s.skolar.filter((x) => x.id !== id) };
  for (const t of tjanster) ut = taBortTjanst(ut, t);
  return ut;
}

// ── Lärare ───────────────────────────────────────────────────
export function laggTillLarare(s: Struktur, larare: Larare): Struktur {
  return { ...s, larare: [...s.larare, larare] };
}
export function taBortLarare(s: Struktur, id: string): Struktur {
  return {
    ...s,
    larare: s.larare.filter((l) => l.id !== id),
    tjanster: s.tjanster.map((t) => (t.larareId === id ? { ...t, larareId: undefined } : t)),
  };
}

// ── Tjänst ───────────────────────────────────────────────────
export function laggTillTjanst(s: Struktur, tjanst: Tjanst): Struktur {
  if (!s.skolar.some((x) => x.id === tjanst.skolarId)) throw new Error('Tjänsten måste höra till ett skolår.');
  return { ...s, tjanster: [...s.tjanster, tjanst] };
}
/** Kopplar (eller kopplar bort med undefined) en lärare till tjänsten. */
export function sattLarare(s: Struktur, tjanstId: string, larareId: string | undefined): Struktur {
  if (larareId !== undefined && !s.larare.some((l) => l.id === larareId)) throw new Error('Okänd lärare.');
  return { ...s, tjanster: s.tjanster.map((t) => (t.id === tjanstId ? { ...t, larareId } : t)) };
}
export function taBortTjanst(s: Struktur, id: string): Struktur {
  const klasser = s.klasser.filter((k) => k.tjanstId === id).map((k) => k.id);
  let ut: Struktur = { ...s, tjanster: s.tjanster.filter((t) => t.id !== id) };
  for (const k of klasser) ut = taBortKlass(ut, k);
  return ut;
}

// ── Klass ────────────────────────────────────────────────────
export function laggTillKlass(s: Struktur, klass: Klass): Struktur {
  if (!s.tjanster.some((t) => t.id === klass.tjanstId)) throw new Error('Klassen måste höra till en tjänst.');
  return { ...s, klasser: [...s.klasser, klass] };
}
export function uppdateraKlass(s: Struktur, id: string, patch: Partial<Klass>): Struktur {
  return { ...s, klasser: s.klasser.map((k) => (k.id === id ? { ...k, ...patch, id: k.id, tjanstId: k.tjanstId } : k)) };
}
export function taBortKlass(s: Struktur, id: string): Struktur {
  const amnen = s.amnen.filter((a) => a.klassId === id).map((a) => a.id);
  let ut: Struktur = {
    ...s,
    klasser: s.klasser.filter((k) => k.id !== id),
    elever: s.elever.filter((e) => e.klassId !== id),
  };
  for (const a of amnen) ut = taBortAmne(ut, a);
  return ut;
}

// ── Elever (Grupp A/B per klass) ─────────────────────────────
export function laggTillElev(s: Struktur, elev: Elev): Struktur {
  if (!s.klasser.some((k) => k.id === elev.klassId)) throw new Error('Eleven måste höra till en klass.');
  if (elev.namn.trim() === '') throw new Error('Eleven behöver ett namn.');
  return { ...s, elever: [...s.elever, elev] };
}
export function uppdateraElev(s: Struktur, id: string, patch: Partial<Pick<Elev, 'namn' | 'grupp'>>): Struktur {
  return { ...s, elever: s.elever.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}
export function taBortElev(s: Struktur, id: string): Struktur {
  return { ...s, elever: s.elever.filter((e) => e.id !== id) };
}

// ── Ämne ─────────────────────────────────────────────────────
/** Ämnet kräver ett eget schema — inget ärvs (minst ett giltigt pass). */
export function laggTillAmne(s: Struktur, amne: Amne): Struktur {
  if (!s.klasser.some((k) => k.id === amne.klassId)) throw new Error('Ämnet måste höra till en klass.');
  if (amne.schema.length === 0 || !amne.schema.every(giltigtPass)) {
    throw new Error('Ämnet behöver minst ett giltigt lektionspass (veckodag mån–fre, start < slut).');
  }
  if (amne.halvklass === true && (amne.schemaB === undefined || amne.schemaB.length === 0 || !amne.schemaB.every(giltigtPass))) {
    throw new Error('Halvklassämnen behöver ett giltigt schema även för Grupp B.');
  }
  if (amne.bokId !== undefined && !s.bocker.some((b) => b.id === amne.bokId)) throw new Error('Okänd bok.');
  return { ...s, amnen: [...s.amnen, amne] };
}
export function uppdateraAmne(s: Struktur, id: string, patch: Partial<Amne>): Struktur {
  if (patch.schema !== undefined && (patch.schema.length === 0 || !patch.schema.every(giltigtPass))) {
    throw new Error('Ämnet behöver minst ett giltigt lektionspass.');
  }
  if (patch.schemaB !== undefined && (patch.schemaB.length === 0 || !patch.schemaB.every(giltigtPass))) {
    throw new Error('Grupp B behöver minst ett giltigt lektionspass.');
  }
  if (patch.bokId !== undefined && patch.bokId !== '' && !s.bocker.some((b) => b.id === patch.bokId)) {
    throw new Error('Okänd bok.');
  }
  return {
    ...s,
    amnen: s.amnen.map((a) => (a.id === id
      ? { ...a, ...patch, id: a.id, bokId: patch.bokId === '' ? undefined : (patch.bokId ?? a.bokId) }
      : a)),
  };
}
export function taBortAmne(s: Struktur, id: string): Struktur {
  return {
    ...s,
    amnen: s.amnen.filter((a) => a.id !== id),
    planeringar: s.planeringar.filter((p) => p.amneId !== id),
    // Lektionsplaner (detaljerad planering, filmer, Magma, anteckningar) hör
    // till ämnet och får aldrig leva kvar — annars ärver ett återlagt ämne
    // det gamla innehållet.
    lektionsplaner: s.lektionsplaner.filter((p) => p.amneId !== id),
  };
}

// ── Bok ──────────────────────────────────────────────────────
/** Importerad bok läggs till/uppdateras (samma id ersätter). */
export function sparaBok(s: Struktur, bok: Bok): Struktur {
  const fanns = s.bocker.some((b) => b.id === bok.id);
  return { ...s, bocker: fanns ? s.bocker.map((b) => (b.id === bok.id ? bok : b)) : [...s.bocker, bok] };
}
export function taBortBok(s: Struktur, id: string): Struktur {
  return {
    ...s,
    bocker: s.bocker.filter((b) => b.id !== id),
    amnen: s.amnen.map((a) => (a.bokId === id ? { ...a, bokId: undefined } : a)),
    planeringar: s.planeringar.filter((p) => p.bokId !== id),
  };
}

// ── Härledda scheman ─────────────────────────────────────────
export interface SchemaRad extends Pass { klassNamn: string; amnesNamn: string; grupp?: 'A' | 'B'; }

/** Klassens schema = unionen av klassens ämnespass; halvklasspass märks med grupp. */
export function klassSchema(s: Struktur, klassId: string): SchemaRad[] {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (!klass) return [];
  return s.amnen.filter((a) => a.klassId === klassId)
    .flatMap((a) => [
      ...a.schema.map((p) => ({ ...p, klassNamn: klass.namn, amnesNamn: a.namn, grupp: a.halvklass === true ? 'A' as const : undefined })),
      ...(a.halvklass === true ? (a.schemaB ?? []).map((p) => ({ ...p, klassNamn: klass.namn, amnesNamn: a.namn, grupp: 'B' as const })) : []),
    ])
    .sort((x, y) => x.dag - y.dag || x.start.localeCompare(y.start));
}

/** Elevens schema: klassens helklasspass + halvklasspass för elevens grupp. */
export function elevSchema(s: Struktur, elevId: string): SchemaRad[] {
  const elev = s.elever.find((e) => e.id === elevId);
  if (!elev) return [];
  return klassSchema(s, elev.klassId).filter((r) => r.grupp === undefined || r.grupp === elev.grupp);
}

/** Lärarens schema HÄRLEDS: alla pass i lärarens tjänsters klassers ämnen. */
export function larareSchema(s: Struktur, larareId: string): SchemaRad[] {
  const tjanster = new Set(s.tjanster.filter((t) => t.larareId === larareId).map((t) => t.id));
  const klasser = s.klasser.filter((k) => tjanster.has(k.tjanstId));
  return klasser.flatMap((k) => klassSchema(s, k.id))
    .sort((x, y) => x.dag - y.dag || x.start.localeCompare(y.start));
}

/**
 * Sanerar dubblett-id:n (skapade av äldre versioner där id-räknaren startade
 * om per session): första förekomsten behåller sitt id, senare dubbletter får
 * nya unika id:n. Referenser (planeringar, lektionsplaner, klasser, ämnen …)
 * pekar kvar på första förekomsten. Utan detta kan två ämnen dela id — då
 * markeras och öppnas fel ämne i trädet.
 */
export function saneraIdn(s: Struktur): Struktur {
  const ny = { ...s };
  const gorUnika = <T extends { id: string }>(lista: T[], prefix: string): T[] => {
    const sedda = new Set<string>();
    return lista.map((x) => {
      if (!sedda.has(x.id)) { sedda.add(x.id); return x; }
      const nyId = nyttId(prefix);
      sedda.add(nyId);
      return { ...x, id: nyId };
    });
  };
  ny.skolar = gorUnika(ny.skolar, 'la');
  ny.larare = gorUnika(ny.larare, 'lr');
  ny.tjanster = gorUnika(ny.tjanster, 'tj');
  ny.klasser = gorUnika(ny.klasser, 'k');
  ny.elever = gorUnika(ny.elever, 'el');
  ny.amnen = gorUnika(ny.amnen, 'am');
  ny.planeringar = gorUnika(ny.planeringar, 'pl');
  ny.lektionsplaner = gorUnika(ny.lektionsplaner, 'lp');
  return ny;
}

/**
 * Halvklasspass med omfattning: Helklass = elever från Grupp A och B
 * tillsammans; Grupp A/B = halvklass med bara den gruppens elever.
 * Lagringen är oförändrad (schema = Grupp A:s pass, schemaB = Grupp B:s):
 * ett helklasspass ligger i båda listorna.
 */
export interface OmfattningsPass extends Pass { omfattning: 'hel' | 'A' | 'B'; }

const passNyckel = (p: Pass): string => `${p.dag}|${p.start}|${p.slut}`;

/** schema+schemaB → radlista med omfattning (för redigering). */
export function kombineraHalvklassPass(schema: Pass[], schemaB: Pass[]): OmfattningsPass[] {
  const bNycklar = new Set(schemaB.map(passNyckel));
  const anvandaB = new Set<string>();
  const ut: OmfattningsPass[] = schema.map((p) => {
    if (bNycklar.has(passNyckel(p))) { anvandaB.add(passNyckel(p)); return { ...p, omfattning: 'hel' as const }; }
    return { ...p, omfattning: 'A' as const };
  });
  for (const p of schemaB) if (!anvandaB.has(passNyckel(p))) ut.push({ ...p, omfattning: 'B' });
  return ut.sort((a, b) => a.dag - b.dag || a.start.localeCompare(b.start));
}

/** Radlista → {schema, schemaB}: hel hamnar i båda, A/B i sin lista. */
export function delaHalvklassPass(rader: OmfattningsPass[]): { schema: Pass[]; schemaB: Pass[] } {
  const ren = ({ dag, start, slut }: OmfattningsPass): Pass => ({ dag, start, slut });
  return {
    schema: rader.filter((r) => r.omfattning !== 'B').map(ren),
    schemaB: rader.filter((r) => r.omfattning !== 'A').map(ren),
  };
}

/** Upsert av en detaljerad lektionsplan (nyckel: ämne + lektionsposition). */
export function sattLektionsplan(s: Struktur, plan: LektionsPlan): Struktur {
  if (!s.amnen.some((a) => a.id === plan.amneId)) throw new Error('Ämnet finns inte.');
  const övriga = s.lektionsplaner.filter((p) => !(p.amneId === plan.amneId && p.lektionsIndex === plan.lektionsIndex));
  return { ...s, lektionsplaner: [...övriga, plan] };
}

/** Hämtar lektionsplanen för en position, eller null. */
export function hamtaLektionsplan(s: Struktur, amneId: string, lektionsIndex: number): LektionsPlan | null {
  return s.lektionsplaner.find((p) => p.amneId === amneId && p.lektionsIndex === lektionsIndex) ?? null;
}

/** Två pass krockar om de ligger samma dag och tiderna överlappar. */
export function passOverlapp(a: Pass, b: Pass): boolean {
  return a.dag === b.dag && a.start < b.slut && b.start < a.slut;
}

/** Överlappande pass i ett schema (t.ex. lärarens) — för varningar i UI. */
export function schemaKonflikter(rader: SchemaRad[]): Array<[SchemaRad, SchemaRad]> {
  const ut: Array<[SchemaRad, SchemaRad]> = [];
  for (let i = 0; i < rader.length; i++) for (let j = i + 1; j < rader.length; j++) {
    if (passOverlapp(rader[i], rader[j])) ut.push([rader[i], rader[j]]);
  }
  return ut;
}

/** Ett ämnes alla pass som schemarader (Grupp A + B för halvklass). */
function amneRader(s: Struktur, amne: Amne): SchemaRad[] {
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  if (!klass) return [];
  const rader: SchemaRad[] = amne.schema.map((p) => ({
    ...p, klassNamn: klass.namn, amnesNamn: amne.namn, grupp: amne.halvklass === true ? 'A' as const : undefined,
  }));
  if (amne.halvklass === true) {
    rader.push(...(amne.schemaB ?? []).map((p) => ({ ...p, klassNamn: klass.namn, amnesNamn: amne.namn, grupp: 'B' as const })));
  }
  return rader;
}

/**
 * Krockar mellan föreslagna pass och redan lagda lektioner: dels klassens
 * övriga ämnen (klassen kan inte vara på två ställen), dels — om tjänsten har
 * en lärare — lärarens andra klasser (läraren kan inte vara på två ställen).
 * ignoreAmneId hoppar över ett ämne som redigeras.
 */
/**
 * Föreslår ett ledigt standardpass (mån–fre) som inte krockar med tjänstens
 * övriga schema. Provar kl 08:10–09:10 mån→fre, sedan senare starttider.
 */
export function ledigtStandardpass(s: Struktur, klassId: string): Pass {
  for (const start of ['08:10', '09:20', '10:30', '13:00', '14:10']) {
    const [h, m] = start.split(':').map(Number);
    const slut = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    for (let dag = 1; dag <= 5; dag++) {
      const p: Pass = { dag, start, slut };
      if (passKonflikter(s, klassId, [p]).length === 0) return p;
    }
  }
  return { dag: 1, start: '08:10', slut: '09:10' };
}

export function passKonflikter(s: Struktur, klassId: string, nyaPass: Pass[], ignoreAmneId?: string): SchemaRad[] {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (!klass) return [];
  const tjanst = s.tjanster.find((t) => t.id === klass.tjanstId);
  const relevanta: Amne[] = s.amnen.filter((a) => a.klassId === klassId && a.id !== ignoreAmneId);
  if (tjanst?.larareId !== undefined) {
    const larartjanster = new Set(s.tjanster.filter((t) => t.larareId === tjanst.larareId).map((t) => t.id));
    const andraKlasser = s.klasser.filter((k) => larartjanster.has(k.tjanstId) && k.id !== klassId).map((k) => k.id);
    relevanta.push(...s.amnen.filter((a) => andraKlasser.includes(a.klassId) && a.id !== ignoreAmneId));
  }
  const rader = relevanta.flatMap((a) => amneRader(s, a));
  return rader.filter((r) => nyaPass.some((p) => passOverlapp(p, r)));
}

// ── Planering: bok + ämnesschema + skolår → datumsatta lektioner ──
interface Slot { datum: string; vecka: number; start: string; slut: string; }

/** Alla lediga lektionsslots i skolåret (helger/röda dagar/lov/temadagar/halvdagar hoppas över). */
function samlaSlots(skolar: Skolar, schema: Pass[]): Slot[] {
  const perDag = new Map<number, Pass[]>();
  for (const p of schema.filter(giltigtPass)) {
    if (!perDag.has(p.dag)) perDag.set(p.dag, []);
    perDag.get(p.dag)!.push(p);
  }
  for (const list of perDag.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  const slots: Slot[] = [];
  const d = new Date(`${skolar.start}T00:00:00Z`);
  let guard = 0;
  while (guard++ < 400) {
    const di = d.toISOString().slice(0, 10);
    if (di > skolar.slut) break;
    const veckodag = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    for (const pass of perDag.get(veckodag) ?? []) {
      if (veckodag <= 5 && passSparr(di, pass.start, skolar) === null) {
        slots.push({ datum: di, vecka: isoVecka(di), start: pass.start, slut: pass.slut });
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return slots;
}

/** Antal lediga lektionsslots i skolåret för ett schema. */
export function antalSlots(skolar: Skolar, schema: Pass[]): number {
  return samlaSlots(skolar, schema).length;
}

/**
 * NO+Tk: lika många lektioner per delämne = en fjärdedel av läsårets slots.
 */
export function noBudget(skolar: Skolar, schema: Pass[]): number {
  return Math.floor(antalSlots(skolar, schema) / NO_TK_AMNEN.length);
}

/** Sant om bokens lektioner är fler än delämnets budget (för varning). */
export function noOverBudget(bok: Bok, budget: number): boolean {
  return bokLektioner(bok).length > budget;
}

/**
 * Lägger bokens lektioner i ordning på ämnets pass inom skolåret. offset
 * hoppar över de första N slotsen (används av NO+Tk så delämne 2 börjar efter
 * delämne 1 osv.). Lektioner som inte ryms före skolårets slut får datum null.
 */
export function skapaPlanering(skolar: Skolar, schema: Pass[], bok: Bok, offset = 0): PlaneradLektion[] {
  const lektioner = bokLektioner(bok);
  const slots = samlaSlots(skolar, schema).slice(offset);
  return lektioner.map(({ kapitel, lektion }, i) => {
    const s = slots[i];
    return s
      ? { kapitel, lektion, datum: s.datum, vecka: s.vecka, start: s.start, slutTid: s.slut }
      : { kapitel, lektion, datum: null, vecka: null, start: null, slutTid: null };
  });
}

/** Registrerar en planering (ersätter tidigare för samma ämne). */
export function registreraPlanering(s: Struktur, p: Planering): Struktur {
  const amne = s.amnen.find((a) => a.id === p.amneId);
  if (!amne) throw new Error('Okänt ämne.');
  if (!s.bocker.some((b) => b.id === p.bokId)) throw new Error('Okänd bok.');
  return { ...s, planeringar: [...s.planeringar.filter((x) => x.amneId !== p.amneId), p] };
}
