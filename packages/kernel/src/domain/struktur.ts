/**
 * Strukturen (v2): immutabla operationer på trädet
 * Skolår ─ Tjänst ─ Klass ─ Ämne, plus lärare, böcker och planeringar.
 * Borttag kaskaderar nedåt; böcker är fristående och kopplas via bokId.
 */
import { bokLektioner, delkapitelKod, NIVA_GRON_BLA_ROD, byggKapitel } from './bok.js';
import { NO_TK_AMNEN } from './amnen.js';
import { isoVecka, passSparr } from './skolar.js';
import type {
  Amne, Bok, EgenRad, Elev, Klass, Laboration, Larare, Lektion, LektionsPlan, LektionsVal, Pass, PassVal, PlaneradLektion,
  Planering, Skolar, StodPass, Struktur, Tjanst } from './typer.js';

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

/**
 * Lärarens schema HÄRLEDS: alla pass i lärarens tjänsters klassers ämnen.
 * Samma fysiska pass visas EN gång: NO+Tk-blockets fyra delämnen (och ett
 * helklasspass som ligger i både Grupp A:s och B:s listor) delar tid och sal
 * — de slås ihop till en rad, som får namnet 'NO+Tk' när alla ihopslagna
 * ämnen är blockdelämnen.
 */
export function larareSchema(s: Struktur, larareId: string): SchemaRad[] {
  const tjanster = new Set(s.tjanster.filter((t) => t.larareId === larareId).map((t) => t.id));
  const klasser = s.klasser.filter((k) => tjanster.has(k.tjanstId));
  const alla = klasser.flatMap((k) => klassSchema(s, k.id));
  const grupper = new Map<string, SchemaRad[]>();
  for (const r of alla) {
    const nyckel = `${r.dag}|${r.start}|${r.slut}|${r.klassNamn}`;
    grupper.set(nyckel, [...(grupper.get(nyckel) ?? []), r]);
  }
  const noNamn = new Set<string>(NO_TK_AMNEN);
  const ut: SchemaRad[] = [];
  for (const rader of grupper.values()) {
    const namn = [...new Set(rader.map((r) => r.amnesNamn))];
    const alltNo = namn.every((n) => noNamn.has(n));
    ut.push({
      ...rader[0],
      amnesNamn: namn.length > 1 ? (alltNo ? 'NO+Tk' : namn.join(' / ')) : namn[0],
    });
  }
  return ut.sort((x, y) => x.dag - y.dag || x.start.localeCompare(y.start));
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
  // Lärardubbletter (samma signatur, t.ex. efter dubbel PDF-import): behåll
  // första, peka om tjänsternas larareId och släng resten.
  {
    const forsta = new Map<string, string>();       // signatur → id
    const ersatt = new Map<string, string>();       // dubblett-id → första id
    ny.larare = ny.larare.filter((l) => {
      const bef = forsta.get(l.signatur);
      if (bef === undefined) { forsta.set(l.signatur, l.id); return true; }
      ersatt.set(l.id, bef);
      return false;
    });
    if (ersatt.size > 0) {
      ny.tjanster = ny.tjanster.map((t) =>
        t.larareId !== undefined && ersatt.has(t.larareId)
          ? { ...t, larareId: ersatt.get(t.larareId) }
          : t);
    }
  }
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
export function samlaSlots(skolar: Skolar, schema: Pass[]): Slot[] {
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

/** Sant om planeringens lektioner (bokens + egna rader + extra lektioner) är fler än delämnets budget (för varning). */
export function noOverBudget(bok: Bok, budget: number, val: PlanInstallning = {}): boolean {
  return planeringsRader(bok, val).length > budget;
}

/**
 * Lägger bokens lektioner i ordning på ämnets pass inom skolåret. offset
 * hoppar över de första N slotsen (används av NO+Tk så delämne 2 börjar efter
 * delämne 1 osv.). Lektioner som inte ryms före skolårets slut får datum null.
 */
const EGEN_TYP = { prov: 'exam', diagnos: 'test', ovning: 'repetition', annat: 'regular' } as const;

/** Bygger en Lektion av en egen rad (prov/diagnos/övning) för planeringen. */
export function egenRadTillLektion(r: EgenRad): Lektion {
  return {
    id: 0, typ: EGEN_TYP[r.typ], avsnitt: r.rubrik, del: 1,
    niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—',
    genomgang: r.beskrivning ?? '—', laxa: '—', ex: '—', socStart: '—', exit: '—',
  };
}

/** En rad i planeringens lektionsföljd (innan den läggs på schemats slots). */
export interface PlanRad { kapitel: number; lektion: Lektion; nyckel: string }

/** Radnyckel för en av bokens lektioner: 'kapitel:lektionsId'. */
export function radNyckel(kapitel: number, lektion: Lektion): string { return `${kapitel}:${lektion.id}`; }

/**
 * Nyckel för det delkapitel en rad hör till ('4:4.2'); rader utan delkapitelkod
 * (Blandade uppgifter, prov, egna rader …) bildar en egen grupp med radnyckeln.
 */
export function gruppNyckel(rad: { kapitel: number; lektion: Lektion; nyckel?: string }): string {
  const kod = delkapitelKod(rad.lektion.avsnitt);
  return kod === null || rad.nyckel?.startsWith('er:') === true ? (rad.nyckel ?? radNyckel(rad.kapitel, rad.lektion)) : `${rad.kapitel}:${kod}`;
}

/** Infogar egna rader i tilläggsordning — varje rads position avser planen som den
 * såg ut när raden lades till (inklusive tidigare egna rader). Grannens kapitel ärvs. */
export function medEgnaRader<T extends { kapitel: number; lektion: Lektion; nyckel?: string }>(
  lektioner: T[],
  rader: EgenRad[],
): Array<T | PlanRad> {
  const ut: Array<T | PlanRad> = [...lektioner];
  for (const r of rader) {
    const pos = Math.max(0, Math.min(r.position, ut.length));
    const granne = ut[pos - 1] ?? ut[pos];
    ut.splice(pos, 0, { kapitel: granne?.kapitel ?? 1, lektion: egenRadTillLektion(r), nyckel: `er:${r.id}` });
  }
  return ut;
}

/** Det som styr lektionsföljden utöver boken — ämnets planeringsfält. */
export type PlanInstallning = Pick<Amne, 'egnaRader' | 'lektionerPerDelkapitel' | 'antalLektioner' | 'lektionsVal'>;

/** Ämnets inställning 'lektioner per delkapitel' (senaste loggposten), 1–4, standard 1. */
export function lektionerPerDelkapitel(val: PlanInstallning): number {
  const logg = val.lektionerPerDelkapitel ?? [];
  const sista = logg[logg.length - 1];
  return sista === undefined ? 1 : Math.max(1, Math.min(4, sista.antal));
}

/** Grundföljden: bokens lektioner med egna rader infogade — utan extra lektioner, borttag eller ersättningar. */
export function grundRader(bok: Bok, val: PlanInstallning): PlanRad[] {
  const bas: PlanRad[] = bokLektioner(bok).map(({ kapitel, lektion }) => ({ kapitel, lektion, nyckel: radNyckel(kapitel, lektion) }));
  return medEgnaRader(bas, val.egnaRader ?? []);
}

/**
 * Del 129 — planeringens lektionsföljd i fyra steg, alla stabila bakåt:
 *  1. bokens lektioner + egna rader (grundRader)
 *  2. extra lektioner per delkapitel: ämnets inställning (loggad med giltighet framåt)
 *     och enskilda delkapitel (antalLektioner). Ett delkapitel med k lektioner i boken
 *     får N−k extra efter sin sista lektion (Del k+1 … N); har boken fler behålls de.
 *  3. ersatta lektioner byter innehåll men behåller plats och nyckel
 *  4. borttagna lektioner försvinner — efterföljande flyttas fram
 * Eftersom ändringar bara görs på lektioner som ligger framåt i tiden (gränssnittet
 * släpper inte in ändringar på genomförda) ändras aldrig följden före ändringspunkten.
 */
export function planeringsRader(bok: Bok, val: PlanInstallning): PlanRad[] {
  const grund = grundRader(bok, val);
  // ── Steg 2: extra lektioner per delkapitel ──
  const logg = val.lektionerPerDelkapitel ?? [];
  const index = new Map(grund.map((r, i) => [r.nyckel, i] as const));
  const antalForGrupp = (nyckel: string, sistaIndex: number, iBoken: number): number => {
    let antal = 1;
    for (const post of logg) {
      const fran = post.fran === undefined ? 0 : index.get(post.fran);
      if (fran !== undefined && fran <= sistaIndex) antal = post.antal;   // posten gäller från och med `fran`
    }
    const egen = val.antalLektioner?.[nyckel];
    if (egen !== undefined) antal = egen;
    return Math.max(iBoken, Math.min(4, Math.max(1, antal)));
  };
  const grupper = new Map<string, number[]>();
  grund.forEach((r, i) => { const g = gruppNyckel(r); grupper.set(g, [...(grupper.get(g) ?? []), i]); });
  const extraEfter = new Map<number, PlanRad[]>();
  for (const [g, idx] of grupper) {
    const sista = idx[idx.length - 1];
    const forlaga = grund[sista];
    if (forlaga.nyckel.startsWith('er:') || forlaga.lektion.typ === 'exam') continue;   // egna rader och prov utökas inte
    const mal = antalForGrupp(g, sista, idx.length);
    if (mal <= idx.length) continue;
    const maxDel = Math.max(...idx.map((i) => grund[i].lektion.del));
    const extra: PlanRad[] = [];
    for (let j = 1; j <= mal - idx.length; j += 1) {
      extra.push({ kapitel: forlaga.kapitel, lektion: { ...forlaga.lektion, del: maxDel + j }, nyckel: `${forlaga.nyckel}#${idx.length + j}` });
    }
    extraEfter.set(sista, extra);
  }
  const medExtra = grund.flatMap((r, i) => [r, ...(extraEfter.get(i) ?? [])]);
  // ── Steg 3–4: ersättningar och borttag ──
  const ut: PlanRad[] = [];
  for (const r of medExtra) {
    const v = val.lektionsVal?.[r.nyckel];
    if (v?.bort === true) continue;
    if (v?.ersatt !== undefined) {
      if ('kapitel' in v.ersatt) {
        const e = v.ersatt;
        const ur = bokLektioner(bok).find((x) => x.kapitel === e.kapitel && x.lektion.id === e.lektionId);
        ut.push(ur === undefined ? r : { kapitel: ur.kapitel, lektion: ur.lektion, nyckel: r.nyckel });
      } else {
        const e = v.ersatt;
        ut.push({ kapitel: r.kapitel, nyckel: r.nyckel, lektion: egenRadTillLektion({ id: r.nyckel, position: 0, rubrik: e.rubrik, typ: e.typ ?? 'annat', ...(e.beskrivning !== undefined ? { beskrivning: e.beskrivning } : {}) }) });
      }
      continue;
    }
    ut.push(r);
  }
  return ut;
}

/** Lägger en lektionsföljd på slots: rad i → slot i (rader som inte ryms får datum null). */
function laggPaSlots(rader: PlanRad[], slots: Slot[]): PlaneradLektion[] {
  return rader.map(({ kapitel, lektion, nyckel }, i) => {
    const s = slots[i];
    return s
      ? { kapitel, lektion, nyckel, datum: s.datum, vecka: s.vecka, start: s.start, slutTid: s.slut }
      : { kapitel, lektion, nyckel, datum: null, vecka: null, start: null, slutTid: null };
  });
}

export function skapaPlanering(skolar: Skolar, schema: Pass[], bok: Bok, offset = 0, val: EgenRad[] | PlanInstallning = []): PlaneradLektion[] {
  const inst: PlanInstallning = Array.isArray(val) ? { egnaRader: val } : val;
  return laggPaSlots(planeringsRader(bok, inst), samlaSlots(skolar, schema).slice(offset));
}

/** Sätter tjänstens stödpass (t.ex. Ma/NO-stöd). */
export function sattStodPass(s: Struktur, tjanstId: string, stodPass: StodPass[]): Struktur {
  if (!s.tjanster.some((t) => t.id === tjanstId)) throw new Error('Okänd tjänst.');
  return { ...s, tjanster: s.tjanster.map((t) => (t.id === tjanstId ? { ...t, stodPass } : t)) };
}

/**
 * Registrerar en planering. Tidigare version för samma ämne skrivs ALDRIG
 * över — den arkiveras i planeringsarkivet. Den nya får nästa versionsnummer
 * och ett unikt namn (klass · bok · vN · datum) och kan återställas vid behov.
 */
export function registreraPlanering(s: Struktur, p: Planering): Struktur {
  const amne = s.amnen.find((a) => a.id === p.amneId);
  if (!amne) throw new Error('Okänt ämne.');
  const bok = s.bocker.find((b) => b.id === p.bokId);
  if (!bok) throw new Error('Okänd bok.');
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const tidigare = s.planeringar.find((x) => x.amneId === p.amneId);
  const arkiv = s.planeringsarkiv ?? [];
  const version = Math.max(0, ...[...arkiv, ...(tidigare ? [tidigare] : [])]
    .filter((x) => x.amneId === p.amneId).map((x) => x.version ?? 1)) + 1;
  const ny: Planering = {
    ...p, version,
    namn: p.namn ?? `${amne.namn} ${klass?.namn ?? ''} · ${bok.titel} · v${version} (${p.skapad.slice(0, 10)})`.trim(),
  };
  return {
    ...s,
    planeringar: [...s.planeringar.filter((x) => x.amneId !== p.amneId), ny],
    planeringsarkiv: tidigare ? [...arkiv, tidigare] : arkiv,
  };
}

/** Återställer en arkiverad planeringsversion: den aktiva arkiveras, arkivposten blir aktiv. */
export function aterstallPlanering(s: Struktur, planeringsId: string): Struktur {
  const arkiv = s.planeringsarkiv ?? [];
  const post = arkiv.find((x) => x.id === planeringsId);
  if (!post) throw new Error('Okänd arkiverad planering.');
  if (!s.bocker.some((b) => b.id === post.bokId)) throw new Error(`Boken för "${post.namn ?? post.id}" finns inte längre i biblioteket.`);
  const aktiv = s.planeringar.find((x) => x.amneId === post.amneId);
  return {
    ...s,
    planeringar: [...s.planeringar.filter((x) => x.amneId !== post.amneId), post],
    planeringsarkiv: [...arkiv.filter((x) => x.id !== planeringsId), ...(aktiv ? [aktiv] : [])],
  };
}

/** Fri bok för ett stödämne: ett kapitel med `antal` öppna tillfällen som detaljplaneras fritt. */
export function friBok(id: string, namn: string, antal: number): Bok {
  const lektioner: Lektion[] = [];
  for (let i = 1; i <= Math.max(1, antal); i++) {
    lektioner.push({
      id: i, typ: 'regular', avsnitt: `Tillfälle ${i}`, del: 1,
      niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—',
      genomgang: '—', laxa: '—', ex: '—', socStart: '—', exit: '—',
    });
  }
  return {
    id, titel: `${namn} (fri planering)`, forlag: '', amne: namn, arskurs: 0,
    nivaer: NIVA_GRON_BLA_ROD,
    kapitel: [byggKapitel(1, 'Planering', '#5c6b7a', lektioner)],
  };
}

/**
 * Skapar (eller uppdaterar) planeringen för ett stödämne utan bok: en fri bok
 * med ett tillfälle per ledig slot i ämnets schema genereras och kopplas.
 * Körs om efter schemaändringar — lektionsplanerna (overlayerna) ligger kvar.
 */
export function skapaFriPlanering(s: Struktur, amneId: string, skapad: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (!amne) throw new Error('Okänt ämne.');
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const skolar = s.skolar.find((x) => x.id === tjanst?.skolarId);
  if (!skolar) throw new Error('Ämnet saknar skolår.');
  const bokId = `fri-${amneId}`;
  const bok = friBok(bokId, amne.namn, samlaSlots(skolar, amne.schema).length);
  let ut = sparaBok(s, bok);
  ut = uppdateraAmne(ut, amneId, { bokId });
  return registreraPlanering(ut, { id: `pl-${amneId}`, amneId, bokId, skapad });
}


/** Lektionens namn: planens överstyrning om den finns, annars bokens avsnitt. */
export function lektionsNamn(lektion: { avsnitt: string }, lp?: { avsnittText?: string } | null): string {
  const eget = lp?.avsnittText?.trim() ?? '';
  return eget !== '' ? eget : lektion.avsnitt;
}

/** Sparar (eller tar bort, med null) QR-bilden för ett Socrative-rum. */
export function sattSocrativeQr(s: Struktur, rum: string, dataUrl: string | null): Struktur {
  const nyckel = rum.trim().toUpperCase();
  if (nyckel === '') return s;
  const qr = { ...(s.socrativeQr ?? {}) };
  if (dataUrl === null || dataUrl.trim() === '') delete qr[nyckel];
  else qr[nyckel] = dataUrl;
  return { ...s, socrativeQr: qr };
}

/** QR-bilden för ett rum, om någon sparats. */
export function socrativeQr(s: Struktur, rum: string): string | null {
  return (s.socrativeQr ?? {})[rum.trim().toUpperCase()] ?? null;
}


/** Sparar (eller tar bort) delningslänken till ett Socrative-rum. */
export function sattSocrativeLank(s: Struktur, rum: string, lank: string | null): Struktur {
  const nyckel = rum.trim().toUpperCase();
  if (nyckel === '') return s;
  const kartan = { ...(s.socrativeLankar ?? {}) };
  if (lank === null || lank.trim() === '') delete kartan[nyckel];
  else kartan[nyckel] = lank.trim();
  return { ...s, socrativeLankar: kartan };
}

/** Delningslänken för ett rum, annars standardlänken till rummet. */
export function socrativeLank(s: Struktur, rum: string): string {
  const egen = (s.socrativeLankar ?? {})[rum.trim().toUpperCase()];
  return egen ?? `https://b.socrative.com/student/#joinRoom/${encodeURIComponent(rum.trim().toUpperCase())}`;
}

// ── Del 127: halvklasspass som laborationer ──────────────────

/** Nyckel för ett halvklasspass: grupp A:s datum och starttid. */
export function sessionsNyckel(datum: string, start: string): string { return `${datum}|${start}`; }

export function laborationTillLektion(lab: Laboration | null, nr: number): Lektion {
  return {
    id: 0, typ: 'laboration', avsnitt: lab === null ? `Laboration ${nr}` : `🧪 ${lab.rubrik}`, del: 1,
    niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—',
    genomgang: lab === null ? 'Laboration — planera under 🧪 Laborationer.' : [lab.syfte, lab.genomforande].filter((x) => x !== undefined && x !== '').join('\n'),
    laxa: lab?.rapport === true ? 'Labbrapport' : '—', ex: lab?.material ?? '—', socStart: '—', exit: '—',
    ...(lab?.delkapitel !== undefined && lab.delkapitel !== '' ? { mal: `Hör till ${lab.delkapitel}` } : {}),
  };
}

export interface HalvklassSession {
  nyckel: string;
  vecka: number;
  /** Samma tid i grupp A:s och B:s schema — hela klassen. */
  helklass: boolean;
  /** Passet ligger före planFrystTill — genomförd planering som inte ändras. */
  fryst: boolean;
  /** Passet ligger före idag (Del 129) — genomfört, valet får inte ändras i gränssnittet. */
  genomford: boolean;
  a: { datum: string; start: string; slut: string };
  b: { datum: string; start: string; slut: string } | null;
  /** Vad passet fick: 'teori' (ur boken eller egen) eller 'lab' (ur listan eller egen). */
  typ: 'teori' | 'lab';
  /** Standard för passet (helklass → teori, halvklass → lab) — true när inget val gjorts. */
  standard: boolean;
  /** Valet som gjorts, om något. */
  val: PassVal | null;
  /** Rubriken som ligger på passet. */
  rubrik: string;
  /** Laborationen ur listan när typ är lab och källan är listan; null = platshållare. */
  laboration: Laboration | null;
}

export interface HalvklassPlanering { a: PlaneradLektion[]; b: PlaneradLektion[]; sessioner: HalvklassSession[] }

/** Egen teorilektion/laboration som lagts på ett pass (kalla 'egen'). */
function egenPassLektion(val: PassVal): Lektion {
  const rubrik = val.rubrik?.trim() !== '' && val.rubrik !== undefined ? val.rubrik : (val.typ === 'lab' ? 'Egen laboration' : 'Egen lektion');
  return {
    id: 0, typ: val.typ === 'lab' ? 'laboration' : 'regular', avsnitt: val.typ === 'lab' ? `🧪 ${rubrik}` : rubrik, del: 1,
    niva1: '—', niva2: '—', niva3: '—', sidorTeori: '—', begrepp: '—',
    genomgang: val.beskrivning ?? '—', laxa: '—', ex: '—', socStart: '—', exit: '—',
  };
}

/** Passets val: passVal först, annars äldre labUndantag (= nästa teorilektion). */
export function passValFor(amne: Amne, nyckel: string): PassVal | null {
  const v = amne.passVal?.[nyckel];
  if (v !== undefined) return v;
  return (amne.labUndantag ?? []).includes(nyckel) ? { typ: 'teori', kalla: 'nasta' } : null;
}

/**
 * Planering för ett halvklassämne där halvklasspassen är laborationer.
 *
 *  - Pass före `fryst` (amne.planFrystTill, annars `idag`): genomförd planering. De
 *    behåller den vanliga följden — bokens lektioner i tur och ordning i varje grupp —
 *    och påverkas inte av laborationer eller passval. Det som redan hänt ändras aldrig.
 *  - Helklasspass (samma datum+tid i A och B): nästa teorilektion ur boken, i båda grupperna.
 *  - Halvklasspass: laboration för både A och B (A:s i:te halvklasspass paras med B:s i:te).
 *    Laborationerna läggs ut i ordning; saknas fler blir det en platshållare.
 *  - Ett passVal byter innehåll på passet: nästa teorilektion, nästa laboration, eller en
 *    egen lektion/laboration (som inte tar något ur köerna).
 *  - Delämne i NO+Tk-blocket: bara budgetens pass används, inte hela läsåret.
 *
 * Bokens lektioner som inte ryms får datum null som förut.
 */
export function skapaHalvklassPlanering(skolar: Skolar, amne: Amne, bok: Bok, offset = 0, idag?: string): HalvklassPlanering {
  const lektioner = planeringsRader(bok, amne);
  const budget = amne.noGrupp !== undefined ? noBudget(skolar, amne.schema) : Number.POSITIVE_INFINITY;
  const slotsA = samlaSlots(skolar, amne.schema).slice(offset, budget === Number.POSITIVE_INFINITY ? undefined : offset + budget);
  const slotsB = samlaSlots(skolar, amne.schemaB ?? []).slice(offset, budget === Number.POSITIVE_INFINITY ? undefined : offset + budget);
  const fryst = amne.planFrystTill ?? idag ?? '';
  const genomford = (datum: string) => datum < (idag ?? '');
  const bAvNyckel = new Map(slotsB.map((x) => [sessionsNyckel(x.datum, x.start), x]));
  const helklass = new Set(slotsA.filter((x) => bAvNyckel.has(sessionsNyckel(x.datum, x.start))).map((x) => sessionsNyckel(x.datum, x.start)));
  const halvB = slotsB.filter((x) => !helklass.has(sessionsNyckel(x.datum, x.start)));
  const labbar = amne.laborationer ?? [];
  const a: PlaneradLektion[] = []; const b: PlaneradLektion[] = []; const sessioner: HalvklassSession[] = [];
  const lagg = (lista: PlaneradLektion[], kapitel: number, lektion: Lektion, nyckel: string, x: { datum: string; vecka: number; start: string; slut: string }) =>
    lista.push({ kapitel, lektion, nyckel, datum: x.datum, vecka: x.vecka, start: x.start, slutTid: x.slut });

  // ── Genomförd del: den vanliga följden, grupp för grupp ──
  const frystaA = slotsA.filter((x) => x.datum < fryst);
  const frystaB = slotsB.filter((x) => x.datum < fryst);
  frystaA.forEach((x, i) => { const l = lektioner[i]; if (l !== undefined) lagg(a, l.kapitel, l.lektion, l.nyckel, x); });
  frystaB.forEach((x, i) => { const l = lektioner[i]; if (l !== undefined) lagg(b, l.kapitel, l.lektion, l.nyckel, x); });
  const frystaHalvB = frystaB.filter((x) => !helklass.has(sessionsNyckel(x.datum, x.start))).length;
  for (const x of frystaA) {
    const nyckel = sessionsNyckel(x.datum, x.start);
    const arHel = helklass.has(nyckel);
    const idx = frystaA.indexOf(x);
    const l = lektioner[idx];
    sessioner.push({
      nyckel, vecka: x.vecka, helklass: arHel, fryst: true, genomford: true, a: x, b: arHel ? (bAvNyckel.get(nyckel) ?? null) : null, typ: 'teori',
      standard: true, val: null, laboration: null, rubrik: l?.lektion.avsnitt ?? '(boken är slut)',
    });
  }

  // ── Kommande del: laborationer på halvklasspassen ──
  let nastaLektion = frystaA.length; let nastaLab = 0; let halvIdx = frystaHalvB;
  for (const x of slotsA.filter((x) => x.datum >= fryst)) {
    const nyckel = sessionsNyckel(x.datum, x.start);
    const arHel = helklass.has(nyckel);
    const xb = arHel ? bAvNyckel.get(nyckel)! : (halvB[halvIdx] ?? null);
    if (!arHel) halvIdx += 1;
    const val = passValFor(amne, nyckel);
    const typ: 'teori' | 'lab' = val !== null ? val.typ : (arHel ? 'teori' : 'lab');
    const kapitel = a[a.length - 1]?.kapitel ?? lektioner[nastaLektion]?.kapitel ?? 1;
    let lektion: Lektion | null = null; let kap = kapitel; let laboration: Laboration | null = null; let radNyckel = '';
    if (val !== null && val.kalla === 'egen') {
      lektion = egenPassLektion(val); radNyckel = `pass:${nyckel}`;
    } else if (typ === 'teori') {
      const l = lektioner[nastaLektion];
      if (l !== undefined) { nastaLektion += 1; lektion = l.lektion; kap = l.kapitel; radNyckel = l.nyckel; }
    } else {
      laboration = labbar[nastaLab] ?? null; nastaLab += 1;
      lektion = laborationTillLektion(laboration, nastaLab); radNyckel = laboration === null ? `lab:#${nastaLab}` : `lab:${laboration.id}`;
    }
    if (lektion !== null) { lagg(a, kap, lektion, radNyckel, x); if (xb !== null && xb.datum >= fryst) lagg(b, kap, lektion, radNyckel, xb); }
    sessioner.push({
      nyckel, vecka: x.vecka, helklass: arHel, fryst: false, genomford: genomford(x.datum), a: x, b: xb, typ, standard: val === null, val, laboration,
      rubrik: lektion?.avsnitt ?? (typ === 'teori' ? '(boken är slut)' : 'Laboration'),
    });
  }
  // Bokens lektioner som inte fick plats
  for (let i = nastaLektion; i < lektioner.length; i += 1) {
    const l = lektioner[i];
    a.push({ kapitel: l.kapitel, lektion: l.lektion, nyckel: l.nyckel, datum: null, vecka: null, start: null, slutTid: null });
  }
  b.sort((p, q) => p.datum!.localeCompare(q.datum!) || p.start!.localeCompare(q.start!));
  return { a, b, sessioner };
}

/** Ska ämnet planeras med laborationer på halvklasspassen? Ja för alla halvklassämnen om det inte stängts av. */
export function harLaborationsstandard(amne: Amne): boolean {
  return amne.halvklass === true && amne.laborationsstandard !== false;
}

/** Sätter (eller tar bort med null) valet för ett pass. */
export function sattPassVal(s: Struktur, amneId: string, nyckel: string, val: PassVal | null): Struktur {
  return {
    ...s,
    amnen: s.amnen.map((a) => {
      if (a.id !== amneId) return a;
      const pv = { ...(a.passVal ?? {}) };
      if (val === null) delete pv[nyckel]; else pv[nyckel] = val;
      // Äldre labUndantag för samma pass ersätts av passVal
      const u = (a.labUndantag ?? []).filter((n) => n !== nyckel);
      const { labUndantag: _gammal, ...rest } = a;
      void _gammal;
      return { ...rest, passVal: pv, ...(u.length > 0 ? { labUndantag: u } : {}) };
    }),
  };
}

/** Slår av/på 'nästa teorilektion' på ett halvklasspass (äldre gränssnitt). */
export function vaxlaLabUndantag(s: Struktur, amneId: string, nyckel: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  const nu = amne === undefined ? null : passValFor(amne, nyckel);
  return sattPassVal(s, amneId, nyckel, nu !== null && nu.typ === 'teori' && nu.kalla === 'nasta' ? null : { typ: 'teori', kalla: 'nasta' });
}

export function sparaLaborationer(s: Struktur, amneId: string, laborationer: Laboration[]): Struktur {
  return { ...s, amnen: s.amnen.map((a) => (a.id === amneId ? { ...a, laborationer } : a)) };
}

export function sattLaborationsstandard(s: Struktur, amneId: string, pa: boolean, idag?: string): Struktur {
  return {
    ...s,
    amnen: s.amnen.map((a) => (a.id === amneId
      ? { ...a, laborationsstandard: pa, ...(pa && a.planFrystTill === undefined && idag !== undefined ? { planFrystTill: idag } : {}) }
      : a)),
  };
}

/** Fryser den genomförda planeringen till och med dagen före `datum` — pass före datumet ändras aldrig. */
export function sattPlanFrystTill(s: Struktur, amneId: string, datum: string): Struktur {
  return { ...s, amnen: s.amnen.map((a) => (a.id === amneId ? { ...a, planFrystTill: datum } : a)) };
}

// ── Del 129: en plats för ämnets plan; lektioner tas bort, ersätts och utökas ──

export interface AmnesPlan {
  /** Helklassens (eller grupp A:s) plan. */
  a: PlaneradLektion[];
  /** Grupp B:s plan — tom för helklassämnen. */
  b: PlaneradLektion[];
  /** Passen när halvklasspassen är laborationer; null annars. */
  sessioner: HalvklassSession[] | null;
}

/**
 * Ämnets plan — samma funktion för ämnessidan, kalendern, SuperTeach och studieguiden.
 * Halvklassämnen med laborationsstandard räknas via skapaHalvklassPlanering, övriga via
 * skapaPlanering (grupp A och B var för sig med samma lektionsföljd).
 */
export function amnesPlan(skolar: Skolar, amne: Amne, bok: Bok, offset = 0, idag?: string): AmnesPlan {
  if (harLaborationsstandard(amne)) {
    const h = skapaHalvklassPlanering(skolar, amne, bok, offset, idag);
    return { a: h.a, b: h.b, sessioner: h.sessioner };
  }
  return {
    a: skapaPlanering(skolar, amne.schema, bok, offset, amne),
    b: amne.halvklass === true && amne.schemaB !== undefined ? skapaPlanering(skolar, amne.schemaB, bok, offset, amne) : [],
    sessioner: null,
  };
}

/** NO+Tk: delämnet börjar efter föregående delämnens block. */
export function amnesOffset(skolar: Skolar, amne: Amne): number {
  return amne.noGrupp !== undefined && amne.noOrder !== undefined ? amne.noOrder * noBudget(skolar, amne.schema) : 0;
}

/**
 * Ämnets plan ur strukturen (skolår via klass → tjänst, bok via ämnet). null när skolår
 * eller bok saknas, eller — om `kravPlanering` — när ingen planering registrerats.
 */
export function amnesPlanFor(s: Struktur, amneId: string, idag?: string, kravPlanering = true): AmnesPlan | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) return null;
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const skolar = s.skolar.find((x) => x.id === tjanst?.skolarId);
  const bok = s.bocker.find((b) => b.id === amne.bokId);
  if (skolar === undefined || bok === undefined) return null;
  if (kravPlanering && !s.planeringar.some((pl) => pl.amneId === amneId)) return null;
  return amnesPlan(skolar, amne, bok, amnesOffset(skolar, amne), idag);
}

/**
 * Lektionsplanerna (detaljplanering, filmer, kryss …) är lagrade per position. När
 * lektionsföljden ändras följer de sin lektion via radnyckeln: en plan på rad 12
 * som flyttar till rad 11 får lektionsIndex 11. Planer vars lektion försvunnit tas bort.
 */
export function kopplaOmLektionsplaner(s: Struktur, amneId: string, fore: PlaneradLektion[], efter: PlaneradLektion[]): Struktur {
  const nyIndex = new Map<string, number>();
  efter.forEach((r, i) => { if (r.nyckel !== undefined && !nyIndex.has(r.nyckel)) nyIndex.set(r.nyckel, i); });
  const andra = s.lektionsplaner.filter((p) => p.amneId !== amneId);
  const egna = s.lektionsplaner.filter((p) => p.amneId === amneId);
  const upptagna = new Set<number>();
  const omkopplade: LektionsPlan[] = [];
  for (const p of egna) {
    const nyckel = fore[p.lektionsIndex]?.nyckel;
    if (nyckel === undefined) continue;                 // raden fanns inte i planen — planen faller
    const ny = nyIndex.get(nyckel);
    if (ny === undefined || upptagna.has(ny)) continue; // lektionen borttagen
    upptagna.add(ny);
    omkopplade.push(p.lektionsIndex === ny ? p : { ...p, lektionsIndex: ny });
  }
  return { ...s, lektionsplaner: [...andra, ...omkopplade] };
}

/** Ändrar ämnets planeringsfält och låter lektionsplanerna följa sina lektioner. */
export function andraPlanering(s: Struktur, amneId: string, patch: Partial<PlanInstallning>, idag?: string): Struktur {
  const fore = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  const ut = uppdateraAmne(s, amneId, patch);
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  return kopplaOmLektionsplaner(ut, amneId, fore, efter);
}

/** Tar bort (bort: true), ersätter (ersatt) eller återställer (null) en lektion. */
export function sattLektionsVal(s: Struktur, amneId: string, nyckel: string, val: LektionsVal | null, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const lv = { ...(amne.lektionsVal ?? {}) };
  if (val === null || (val.bort !== true && val.ersatt === undefined)) delete lv[nyckel]; else lv[nyckel] = val;
  return andraPlanering(s, amneId, { lektionsVal: lv }, idag);
}

/** Antal lektioner (1–4) för ett delkapitel — null återgår till ämnets inställning. */
export function sattAntalLektioner(s: Struktur, amneId: string, grupp: string, antal: number | null, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const al = { ...(amne.antalLektioner ?? {}) };
  if (antal === null) delete al[grupp]; else al[grupp] = Math.max(1, Math.min(4, Math.round(antal)));
  return andraPlanering(s, amneId, { antalLektioner: al }, idag);
}

/**
 * Ämnets inställning 'lektioner per delkapitel' (1–4). `fran` är radnyckeln för den
 * första lektionen inställningen ska gälla från (den första som inte är genomförd) —
 * utan `fran` gäller den från början. Loggen växer; tidigare poster styr fortfarande
 * det som redan genomförts.
 */
export function sattLektionerPerDelkapitel(s: Struktur, amneId: string, antal: number, fran?: string, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const n = Math.max(1, Math.min(4, Math.round(antal)));
  const logg = [...(amne.lektionerPerDelkapitel ?? [])];
  const sista = logg[logg.length - 1];
  if (sista !== undefined && sista.antal === n && sista.fran === fran) return s;
  // Samma startpunkt som förra posten: ersätt den (inget har hunnit genomföras emellan)
  if (sista !== undefined && sista.fran === fran) logg.pop();
  logg.push(fran === undefined ? { antal: n } : { fran, antal: n });
  return andraPlanering(s, amneId, { lektionerPerDelkapitel: logg }, idag);
}

/** Lägger till en egen rad (prov, diagnos, övning …) och låter lektionsplanerna följa sina lektioner. */
export function laggTillEgenRad(s: Struktur, amneId: string, rad: EgenRad, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  return andraPlanering(s, amneId, { egnaRader: [...(amne.egnaRader ?? []), rad] }, idag);
}

/** Tar bort en egen rad. */
export function taBortEgenRad(s: Struktur, amneId: string, radId: string, idag?: string): Struktur {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  return andraPlanering(s, amneId, { egnaRader: (amne.egnaRader ?? []).filter((r) => r.id !== radId) }, idag);
}

/** Antal lektioner ett delkapitel har i boken (utan extra). */
export function antalIBoken(bok: Bok, val: PlanInstallning, grupp: string): number {
  return grundRader(bok, val).filter((r) => gruppNyckel(r) === grupp).length;
}
