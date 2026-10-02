/**
 * Del 158 · Planeringstavlan — ett utkast till ämnets planering som läggs ut på
 * schemats pass från ett startdatum. Utkastet är två köer (teori och, för halvklass-
 * ämnen, laborationer) av radnycklar: bokens lektioner ('4:12', '4:12#2', 'er:<id>')
 * och lärarens egna kort ('u:<id>' — tom lektion, prov, repetition, laboration …).
 *
 * Bokens lektionskort behålls som de är: utkastet pekar på samma radnycklar, och när
 * det läggs in följer lektionsplanerna (filmer, begrepp, BAM, anteckningar) sina
 * lektioner via andraPlanering. Pass före startdatum ändras aldrig.
 */
import { delkapitelKod } from './bok.js';
import {
  amnesOffset, amnesPlanFor, andraPlanering, gruppNyckel, hamtaLektionsplan, harLaborationsstandard,
  kopplaOmLektionsplaner, noBudget, nyttId, planeringsRader, registreraPlanering, samlaSlots, sattLektionsplan, type PlanRad,
} from './struktur.js';
import type { Amne, LektionsDetaljer, LektionsPlan, LektionsTyp, PlaneradLektion, PlanFranUtkast, PlanUtkast, Struktur, UtkastKort } from './typer.js';

export type UtkastKo = 'teori' | 'labbar';

/** Ett pass på tavlan med det kort som hamnar där. */
export interface TavlaKort {
  /** Passets nummer från startdatum (0-baserat); null för lektioner som inte ryms. */
  slotNr: number | null;
  datum: string | null;
  vecka: number | null;
  /** 1 = måndag … 5 = fredag. */
  veckodag: number | null;
  start: string | null;
  slut: string | null;
  /** Halvklassämnen: grupp B:s pass för samma laboration. */
  b: { datum: string; start: string; slut: string } | null;
  /** Passets sort: teori (helklass), lab (halvklass) eller ett låst eget passval. */
  passTyp: 'teori' | 'lab' | 'pass';
  /** Kön kortet tillhör (null för låsta passval). */
  ko: UtkastKo | null;
  /** Position i kön — ett släppt kort infogas här. */
  koIndex: number | null;
  /** Nyckeln i kön ('4:12', 'lab:<id>', 'u:<id>'); null för tomma pass. */
  nyckel: string | null;
  /** Radnyckeln i planen (lektionsplanerna följer den). */
  radNyckel: string | null;
  rubrik: string;
  kapitel: number | null;
  /** Delkapitelkod ('1.2') om lektionen har en. */
  kod: string | null;
  lektionsTyp: LektionsTyp | null;
  /** Lärarens eget kort. */
  egen: UtkastKort | null;
  /** Passet saknar lektion (kön är slut). */
  tom: boolean;
}

export interface PalettLektion { nyckel: string; rubrik: string; typ: LektionsTyp; anvand: 'fore' | 'utkast' | null }
export interface PalettGrupp { nyckel: string; titel: string; kod: string | null; lektioner: PalettLektion[] }
export interface PalettKapitel { nr: number; namn: string; farg: string; grupper: PalettGrupp[] }
export interface PalettLab { nyckel: string; rubrik: string; delkapitel: string | null; anvand: boolean }

export interface ProvInfo {
  provDatum: string;
  /** Provkortets nyckel i teorikön, om det finns ett. */
  nyckel: string | null;
  /** Datum provet hamnar på med nuvarande ordning. */
  hamnar: string | null;
  /** Första teoripasset på eller efter provdatum. */
  malDatum: string | null;
  /** Antal teoripass från startdatum fram till provdatum. */
  passFore: number;
  /** Provet ligger på provdatum (eller första teoripasset därefter). */
  paPlats: boolean;
  /** Bokens lektioner som hamnar efter provet. */
  efterProv: number;
}

export interface Planeringstavla {
  fran: string;
  halvklass: boolean;
  kolumner: TavlaKort[];
  /** Lektioner som inte ryms före läsårets slut. */
  rymsEj: TavlaKort[];
  palett: PalettKapitel[];
  labbar: PalettLab[];
  prov: ProvInfo | null;
  varningar: string[];
  /** Utkastet efter rensning (okända och dubbla nycklar borttagna). */
  utkast: PlanFranUtkast;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const arLab = (n: string) => n.startsWith('lab:');
const arPass = (n: string) => n.startsWith('pass:');
const koNyckel = (rad: string): string | null => (rad.startsWith('lab:#') ? null : rad.startsWith('lab:u:') ? rad.slice(4) : rad);

function hittaAmne(s: Struktur, amneId: string): Amne {
  const a = s.amnen.find((x) => x.id === amneId);
  if (a === undefined) throw new Error('Okänt ämne.');
  return a;
}

function utanUtkast(s: Struktur, amneId: string): Struktur {
  return { ...s, amnen: s.amnen.map((a) => { if (a.id !== amneId) return a; const { planFranUtkast: _u, ...rest } = a; void _u; return rest; }) };
}

function medUtkast(s: Struktur, amneId: string, u: PlanFranUtkast): Struktur {
  return { ...s, amnen: s.amnen.map((a) => (a.id === amneId ? { ...a, planFranUtkast: u } : a)) };
}

/** Bokens lektionsföljd (med ämnets inställningar men utan utkast) — paletten. */
export function bokensRader(s: Struktur, amneId: string): PlanRad[] {
  const a = hittaAmne(s, amneId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (bok === undefined) throw new Error('Ämnet saknar bok.');
  return planeringsRader(bok, a);
}

/** Ett tomt utkast. */
export function tomtUtkast(namn: string, fran: string): PlanFranUtkast {
  return { namn, fran, teori: [], labbar: [], egna: [] };
}

/** Nycklar som redan används i passen före startdatum (de ändras aldrig). */
function nycklarFore(s: Struktur, amneId: string, fran: string, idag?: string): { teori: Set<string>; labbar: Set<string> } {
  const plan = amnesPlanFor(medUtkast(s, amneId, tomtUtkast('', fran)), amneId, idag, false);
  const teori = new Set<string>(); const labbar = new Set<string>();
  for (const r of plan?.a ?? []) {
    if (r.datum === null || r.datum >= fran || r.nyckel === undefined) continue;
    if (arLab(r.nyckel)) { const k = koNyckel(r.nyckel); if (k !== null) labbar.add(k); } else if (!arPass(r.nyckel)) teori.add(r.nyckel);
  }
  return { teori, labbar };
}

/** Tar bort okända nycklar, dubbletter och lektioner som redan ligger före startdatum. */
export function rensaUtkast(s: Struktur, amneId: string, u: PlanFranUtkast, idag?: string): PlanFranUtkast {
  const a = hittaAmne(s, amneId);
  const rader = new Set(bokensRader(s, amneId).map((r) => r.nyckel));
  const egna = new Map(u.egna.map((k) => [`u:${k.id}`, k]));
  const labIds = new Set((a.laborationer ?? []).map((l) => `lab:${l.id}`));
  const fore = nycklarFore(s, amneId, u.fran, idag);
  const sett = new Set<string>();
  const teori = u.teori.filter((n) => {
    if (sett.has(n) || fore.teori.has(n) || !(rader.has(n) || egna.has(n))) return false;
    sett.add(n); return true;
  });
  const labbar = u.labbar.filter((n) => {
    if (sett.has(n) || fore.labbar.has(n) || !(labIds.has(n) || egna.has(n))) return false;
    sett.add(n); return true;
  });
  const anvanda = new Set([...teori, ...labbar]);
  return { ...u, teori, labbar, egna: u.egna.filter((k) => anvanda.has(`u:${k.id}`)) };
}

/**
 * Ett utkast som börjar som ämnets nuvarande planering från `fran`: samma lektioner och
 * laborationer i samma ordning (även ett tidigare inlagt utkasts egna kort).
 */
export function utkastFranPlan(s: Struktur, amneId: string, fran: string, idag?: string, namn = ''): PlanFranUtkast {
  if (!DATUM.test(fran)) throw new Error('Ange ett startdatum (ÅÅÅÅ-MM-DD).');
  const a = hittaAmne(s, amneId);
  const plan = amnesPlanFor(s, amneId, idag, false);
  if (plan === null) throw new Error('Ämnet saknar bok eller skolår.');
  const teori: string[] = []; const labbar: string[] = [];
  for (const r of plan.a) {
    if ((r.datum !== null && r.datum < fran) || r.nyckel === undefined || arPass(r.nyckel)) continue;
    if (arLab(r.nyckel)) { const k = koNyckel(r.nyckel); if (k !== null) labbar.push(k); } else teori.push(r.nyckel);
  }
  const u: PlanFranUtkast = { namn, fran, teori, labbar, egna: [...(a.planFranUtkast?.egna ?? [])] };
  if (a.planFranUtkast?.provDatum !== undefined && a.planFranUtkast.provDatum >= fran) u.provDatum = a.planFranUtkast.provDatum;
  return rensaUtkast(s, amneId, u, idag);
}

const VECKODAG = (datum: string) => { const d = new Date(`${datum}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

/** Tavlan: passen från startdatum med sina kort, paletten med kapitlen och laborationerna. */
export function planeringstavla(s: Struktur, amneId: string, utkast: PlanFranUtkast, idag?: string): Planeringstavla {
  if (!DATUM.test(utkast.fran)) throw new Error('Ange ett startdatum (ÅÅÅÅ-MM-DD).');
  const a = hittaAmne(s, amneId);
  const klass = s.klasser.find((k) => k.id === a.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const skolar = s.skolar.find((x) => x.id === tjanst?.skolarId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (skolar === undefined || bok === undefined) throw new Error('Ämnet saknar bok eller skolår.');
  const u = rensaUtkast(s, amneId, utkast, idag);
  const s2 = medUtkast(s, amneId, u);
  const plan = amnesPlanFor(s2, amneId, idag, false)!;
  const egna = new Map(u.egna.map((k) => [`u:${k.id}`, k]));
  const halvklass = harLaborationsstandard(a);
  const radPa = new Map(plan.a.filter((r) => r.datum !== null).map((r) => [`${r.datum}|${r.start}`, r]));

  type Pass = { datum: string; vecka: number; start: string; slut: string; passTyp: TavlaKort['passTyp']; b: TavlaKort['b'] };
  let pass: Pass[];
  if (plan.sessioner !== null) {
    pass = plan.sessioner.filter((x) => x.a.datum >= u.fran).map((x) => ({
      datum: x.a.datum, vecka: x.vecka, start: x.a.start, slut: x.a.slut,
      passTyp: x.val?.kalla === 'egen' ? 'pass' : x.typ, b: x.helklass ? null : x.b,
    }));
  } else {
    const offset = amnesOffset(skolar, a);
    const alla = samlaSlots(skolar, a.schema).slice(offset, a.noGrupp !== undefined ? offset + noBudget(skolar, a.schema) : undefined);
    pass = alla.filter((x) => x.datum >= u.fran).map((x) => ({ ...x, passTyp: 'teori' as const, b: null }));
  }

  const kortFor = (r: { kapitel: number; lektion: { avsnitt: string; typ: LektionsTyp }; nyckel?: string } | undefined, ko: UtkastKo | null) => {
    if (r === undefined || r.nyckel === undefined) return { nyckel: null, radNyckel: null, rubrik: ko === 'labbar' ? 'Laboration' : 'Tomt pass', kapitel: null, kod: null, lektionsTyp: null, egen: null, tom: true };
    const n = ko === null ? null : koNyckel(r.nyckel);
    return {
      nyckel: n, radNyckel: r.nyckel, rubrik: r.lektion.avsnitt, kapitel: r.kapitel, kod: delkapitelKod(r.lektion.avsnitt),
      lektionsTyp: r.lektion.typ, egen: n === null ? null : (egna.get(n) ?? null), tom: n === null && ko !== null,
    };
  };
  let ti = 0; let li = 0;
  const kolumner: TavlaKort[] = pass.map((p, i) => {
    const r = radPa.get(`${p.datum}|${p.start}`);
    const ko: UtkastKo | null = p.passTyp === 'pass' ? null : p.passTyp === 'lab' ? 'labbar' : 'teori';
    const k = kortFor(r, ko);
    // Ett halvklasspass som valts till 'nästa teorilektion' tar ur teorikön
    const iKo: UtkastKo | null = ko === 'labbar' && r?.nyckel !== undefined && !arLab(r.nyckel) ? 'teori' : ko;
    const koIndex = iKo === 'teori' ? (k.tom ? u.teori.length : ti++) : iKo === 'labbar' ? (k.tom ? u.labbar.length : li++) : null;
    return { slotNr: i, datum: p.datum, vecka: p.vecka, veckodag: VECKODAG(p.datum), start: p.start, slut: p.slut, b: p.b, passTyp: p.passTyp, ko: iKo, koIndex, ...k };
  });
  const rymsEj: TavlaKort[] = plan.a.filter((r) => r.datum === null).map((r) => ({
    slotNr: null, datum: null, vecka: null, veckodag: null, start: null, slut: null, b: null, passTyp: 'teori', ko: 'teori', koIndex: ti++, ...kortFor(r, 'teori'),
  }));

  // ── Paletten: kapitel → delkapitel → lektioner ──
  const fore = nycklarFore(s, amneId, u.fran, idag);
  const iUtkast = new Set([...u.teori, ...u.labbar]);
  const palett: PalettKapitel[] = [];
  for (const r of bokensRader(s, amneId)) {
    let kap = palett.find((k) => k.nr === r.kapitel);
    if (kap === undefined) {
      const bk = bok.kapitel.find((k) => k.nr === r.kapitel);
      kap = { nr: r.kapitel, namn: bk?.namn ?? `Kapitel ${r.kapitel}`, farg: bk?.farg ?? '#5c6b7a', grupper: [] };
      palett.push(kap);
    }
    const g = gruppNyckel(r);
    let grupp = kap.grupper.find((x) => x.nyckel === g);
    if (grupp === undefined) {
      const kod = delkapitelKod(r.lektion.avsnitt);
      grupp = { nyckel: g, kod, titel: kod === null ? r.lektion.avsnitt : r.lektion.avsnitt.replace(/\s*·?\s*Del \d+$/i, ''), lektioner: [] };
      kap.grupper.push(grupp);
    }
    grupp.lektioner.push({
      nyckel: r.nyckel, rubrik: r.lektion.del > 1 ? `${r.lektion.avsnitt} · Del ${r.lektion.del}` : r.lektion.avsnitt, typ: r.lektion.typ,
      anvand: fore.teori.has(r.nyckel) ? 'fore' : iUtkast.has(r.nyckel) ? 'utkast' : null,
    });
  }
  const labbar: PalettLab[] = (a.laborationer ?? []).map((l) => ({ nyckel: `lab:${l.id}`, rubrik: l.rubrik, delkapitel: l.delkapitel ?? null, anvand: iUtkast.has(`lab:${l.id}`) || fore.labbar.has(`lab:${l.id}`) }));

  // ── Provet ──
  let prov: ProvInfo | null = null;
  if (u.provDatum !== undefined && DATUM.test(u.provDatum)) {
    const teoriPass = kolumner.filter((k) => k.ko === 'teori');
    const mal = teoriPass.find((k) => k.datum! >= u.provDatum!) ?? null;
    const provKort = [...kolumner, ...rymsEj].find((k) => k.ko === 'teori' && k.lektionsTyp === 'exam') ?? null;
    const provIdx = provKort === null ? -1 : [...kolumner, ...rymsEj].indexOf(provKort);
    const efterProv = provIdx === -1 ? 0 : [...kolumner, ...rymsEj].slice(provIdx + 1)
      .filter((k) => k.ko === 'teori' && !k.tom && k.egen === null && k.lektionsTyp !== 'exam').length;
    prov = {
      provDatum: u.provDatum, nyckel: provKort?.nyckel ?? null, hamnar: provKort?.datum ?? null, malDatum: mal?.datum ?? null,
      passFore: teoriPass.filter((k) => k.datum! < u.provDatum!).length,
      paPlats: provKort !== null && mal !== null && provKort.datum === mal.datum && provKort.start === mal.start, efterProv,
    };
  }

  const varningar: string[] = [];
  if (idag !== undefined && u.fran < idag) varningar.push(`Startdatum ${u.fran} ligger före idag — genomförda lektioner ändras aldrig. Välj idag eller senare för att lägga in utkastet.`);
  if (rymsEj.length > 0) varningar.push(`${rymsEj.length} ${rymsEj.length === 1 ? 'lektion ryms' : 'lektioner ryms'} inte före läsårets slut.`);
  if (prov !== null) {
    if (prov.malDatum === null) varningar.push(`Det finns inget teoripass på eller efter provdatum ${prov.provDatum}.`);
    else if (prov.nyckel === null) varningar.push(`Inget prov i utkastet — ”📌 Lägg provet på provdatum” lägger in det ${prov.malDatum}.`);
    else if (!prov.paPlats) varningar.push(`Provet hamnar ${prov.hamnar ?? 'efter läsårets slut'}, inte på provdatum (${prov.malDatum}).`);
    if (prov.efterProv > 0) varningar.push(`${prov.efterProv} av bokens lektioner ligger efter provet.`);
  }
  if (u.teori.length !== utkast.teori.length || u.labbar.length !== utkast.labbar.length) varningar.push('Lektioner som redan ligger före startdatum (eller saknas i boken) togs bort ur utkastet.');
  return { fran: u.fran, halvklass, kolumner, rymsEj, palett, labbar, prov, varningar, utkast: u };
}

// ── Ändringar i utkastet (rena funktioner) ──

/** Lägger in en nyckel på plats `index` i kön; finns den redan i någon kö flyttas den. */
export function infogaIUtkast(u: PlanFranUtkast, ko: UtkastKo, nyckel: string, index: number): PlanFranUtkast {
  const ut = { ...u, teori: [...u.teori], labbar: [...u.labbar] };
  for (const k of ['teori', 'labbar'] as const) {
    const i = ut[k].indexOf(nyckel);
    if (i !== -1) { ut[k].splice(i, 1); if (k === ko && i < index) index -= 1; }
  }
  const lista = ut[ko];
  lista.splice(Math.max(0, Math.min(index, lista.length)), 0, nyckel);
  return ut;
}

/** Tar bort kortet ur kön — de följande lektionerna flyttas fram ett pass. Egna kort försvinner helt. */
export function taBortUrUtkast(u: PlanFranUtkast, nyckel: string): PlanFranUtkast {
  const detaljer = { ...(u.detaljer ?? {}) };
  delete detaljer[nyckel]; delete detaljer[`lab:${nyckel}`];
  const ut: PlanFranUtkast = {
    ...u, teori: u.teori.filter((n) => n !== nyckel), labbar: u.labbar.filter((n) => n !== nyckel),
    egna: u.egna.filter((k) => `u:${k.id}` !== nyckel),
  };
  if (Object.keys(detaljer).length > 0) ut.detaljer = detaljer; else delete ut.detaljer;
  return ut;
}

/** Skapar ett eget kort (tom lektion, prov, repetition, laboration …) och lägger det i kön. */
export function nyttKortIUtkast(u: PlanFranUtkast, kort: Omit<UtkastKort, 'id'> & { id?: string }, ko: UtkastKo, index: number): { utkast: PlanFranUtkast; nyckel: string } {
  const rubrik = kort.rubrik.trim();
  if (rubrik === '') throw new Error('Kortet behöver en rubrik.');
  if (ko === 'labbar' && kort.typ !== 'lab') throw new Error('Halvklasspassen tar bara laborationer.');
  const id = kort.id ?? nyttId('uk');
  const nytt: UtkastKort = { id, rubrik, typ: kort.typ, ...(kort.beskrivning !== undefined && kort.beskrivning.trim() !== '' ? { beskrivning: kort.beskrivning.trim() } : {}) };
  const nyckel = `u:${id}`;
  return { utkast: infogaIUtkast({ ...u, egna: [...u.egna.filter((k) => k.id !== id), nytt] }, ko, nyckel, index), nyckel };
}

/** Ändrar ett eget korts rubrik, typ eller beskrivning. */
export function uppdateraKortIUtkast(u: PlanFranUtkast, id: string, patch: Partial<Omit<UtkastKort, 'id'>>): PlanFranUtkast {
  if (patch.rubrik !== undefined && patch.rubrik.trim() === '') throw new Error('Kortet behöver en rubrik.');
  return { ...u, egna: u.egna.map((k) => (k.id === id ? { ...k, ...patch, ...(patch.rubrik !== undefined ? { rubrik: patch.rubrik.trim() } : {}) } : k)) };
}

/** Sätter lektionskortets delar (BAM, genomgång, uppgifter, filmer …) för en radnyckel; null tar bort dem. */
export function sattKortDetaljer(u: PlanFranUtkast, radNyckel: string, detaljer: LektionsDetaljer | null): PlanFranUtkast {
  const d = { ...(u.detaljer ?? {}) };
  if (detaljer === null) delete d[radNyckel];
  else {
    const ren = Object.fromEntries(Object.entries(detaljer).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as LektionsDetaljer;
    if (Object.keys(ren).length === 0) delete d[radNyckel]; else d[radNyckel] = ren;
  }
  const ut: PlanFranUtkast = { ...u, detaljer: d };
  if (Object.keys(d).length === 0) delete ut.detaljer;
  return ut;
}

/**
 * Lektionskortets delar som de ser ut nu: utkastets ändringar, annars lektionsplanen
 * som redan finns för lektionen i ämnets planering (filmer, begrepp, BAM …).
 */
export function kortDetaljer(s: Struktur, amneId: string, u: PlanFranUtkast, radNyckel: string, idag?: string): LektionsDetaljer {
  const egen = u.detaljer?.[radNyckel];
  if (egen !== undefined) return egen;
  const plan = amnesPlanFor(s, amneId, idag, false);
  const i = plan?.a.findIndex((r) => r.nyckel === radNyckel) ?? -1;
  if (i === -1) return {};
  const lp = hamtaLektionsplan(s, amneId, i);
  if (lp === null) return {};
  const { id: _i, amneId: _a, lektionsIndex: _l, klar: _k, ...rest } = lp;
  void _i; void _a; void _l; void _k;
  return rest;
}

/**
 * Lägger provet på provdatum: provkortet (bokens provlektion eller ett eget) flyttas till
 * första teoripasset på eller efter provdatum. Finns inget prov skapas ett. Räcker inte
 * lektionerna fram till provet fylls passen före med repetition.
 */
export function laggProvPaDatum(s: Struktur, amneId: string, u: PlanFranUtkast, idag?: string): { utkast: PlanFranUtkast; repetition: number; efterProv: number } {
  if (u.provDatum === undefined || !DATUM.test(u.provDatum)) throw new Error('Ange ett provdatum (ÅÅÅÅ-MM-DD).');
  if (u.provDatum < u.fran) throw new Error('Provdatum ligger före startdatum.');
  const tavla = planeringstavla(s, amneId, u, idag);
  const ren = tavla.utkast;
  const teoriPass = tavla.kolumner.filter((k) => k.ko === 'teori');
  const k = teoriPass.filter((x) => x.datum! < u.provDatum!).length;
  if (!teoriPass.some((x) => x.datum! >= u.provDatum!)) throw new Error(`Det finns inget teoripass på eller efter ${u.provDatum}.`);
  const provNyckel = [...tavla.kolumner, ...tavla.rymsEj].find((x) => x.ko === 'teori' && x.lektionsTyp === 'exam')?.nyckel ?? null;
  let utkast: PlanFranUtkast = { ...ren, teori: ren.teori.filter((n) => n !== provNyckel), egna: [...ren.egna] };
  let nyckel = provNyckel;
  if (nyckel === null) {
    const fore = bokensRader(s, amneId).find((r) => r.nyckel === utkast.teori[Math.min(k, utkast.teori.length) - 1]);
    const id = `prov-${u.provDatum}`;
    utkast.egna = [...utkast.egna.filter((x) => x.id !== id), { id, rubrik: fore === undefined ? 'Prov' : `Prov kapitel ${fore.kapitel}`, typ: 'prov' }];
    nyckel = `u:${id}`;
  }
  let repetition = 0;
  while (utkast.teori.length < k) {
    repetition += 1;
    const id = `rep-${u.provDatum}-${repetition}`;
    utkast = { ...utkast, egna: [...utkast.egna, { id, rubrik: 'Repetition inför provet', typ: 'ovning' }], teori: [...utkast.teori, `u:${id}`] };
  }
  utkast = { ...utkast, teori: [...utkast.teori.slice(0, k), nyckel, ...utkast.teori.slice(k)] };
  const efter = planeringstavla(s, amneId, utkast, idag);
  return { utkast, repetition, efterProv: efter.prov?.efterProv ?? 0 };
}

// ── Sparade utkast ──

/** Sparar (eller ersätter) ett namngivet utkast. */
export function sparaUtkast(s: Struktur, amneId: string, u: PlanFranUtkast, id?: string, skapad = ''): { s: Struktur; id: string } {
  hittaAmne(s, amneId);
  const namn = u.namn.trim();
  if (namn === '') throw new Error('Ge planeringen ett namn.');
  const lista = s.planUtkast ?? [];
  if (lista.some((x) => x.amneId === amneId && x.id !== id && x.namn.trim().toLowerCase() === namn.toLowerCase())) throw new Error(`Det finns redan en planering som heter ”${namn}”.`);
  const nyId = id ?? nyttId('pu');
  const tidigare = lista.find((x) => x.id === nyId);
  const post: PlanUtkast = { ...u, namn, id: nyId, amneId, skapad: tidigare?.skapad ?? skapad };
  return { s: { ...s, planUtkast: [...lista.filter((x) => x.id !== nyId), post] }, id: nyId };
}

export function taBortUtkast(s: Struktur, id: string): Struktur {
  return { ...s, planUtkast: (s.planUtkast ?? []).filter((x) => x.id !== id) };
}

/** Ämnets sparade utkast, senast skapade först. */
export function amnetsUtkast(s: Struktur, amneId: string): PlanUtkast[] {
  return (s.planUtkast ?? []).filter((x) => x.amneId === amneId).sort((a, b) => b.skapad.localeCompare(a.skapad) || a.namn.localeCompare(b.namn, 'sv'));
}

/**
 * Ersätter ämnets planering från utkastets startdatum. Pass före startdatum behålls (också
 * ett tidigare inlagt utkasts lektioner), lektionsplanerna följer sina lektioner och
 * utkastets kortdelar (BAM, genomgång …) förs över till lektionsplanerna.
 */
export function tillampaUtkast(s: Struktur, amneId: string, utkast: PlanFranUtkast, idag?: string): Struktur {
  const a = hittaAmne(s, amneId);
  if (utkast.namn.trim() === '') throw new Error('Ge planeringen ett namn.');
  if (!DATUM.test(utkast.fran)) throw new Error('Ange ett startdatum (ÅÅÅÅ-MM-DD).');
  if (idag !== undefined && utkast.fran < idag) throw new Error('Startdatum ligger före idag — genomförda lektioner ändras aldrig. Välj idag eller senare.');
  if (a.bokId === undefined || !s.bocker.some((b) => b.id === a.bokId)) throw new Error('Ämnet saknar bok.');
  let u = rensaUtkast(s, amneId, utkast, idag);
  // Ett tidigare inlagt utkast som börjar före: behåll dess pass fram till det nya startdatumet
  const gammalt = a.planFranUtkast;
  if (gammalt !== undefined && gammalt.fran < u.fran) {
    const plan = amnesPlanFor(s, amneId, idag, false);
    const teori: string[] = []; const labbar: string[] = [];
    for (const r of plan?.a ?? []) {
      if (r.datum === null || r.datum < gammalt.fran || r.datum >= u.fran || r.nyckel === undefined || arPass(r.nyckel)) continue;
      if (arLab(r.nyckel)) { const k = koNyckel(r.nyckel); if (k !== null) labbar.push(k); } else teori.push(r.nyckel);
    }
    const anvanda = new Set([...teori, ...labbar]);
    const egnaGamla = gammalt.egna.filter((k) => anvanda.has(`u:${k.id}`) && !u.egna.some((x) => x.id === k.id));
    u = {
      ...u, fran: gammalt.fran,
      teori: [...teori, ...u.teori.filter((n) => !anvanda.has(n))],
      labbar: [...labbar, ...u.labbar.filter((n) => !anvanda.has(n))],
      egna: [...egnaGamla, ...u.egna],
    };
  }
  const { detaljer, ...lagras } = u;
  let ut = s.planeringar.some((p) => p.amneId === amneId) ? s
    : registreraPlanering(s, { id: nyttId('pl'), amneId, bokId: a.bokId, skapad: idag ?? utkast.fran, namn: utkast.namn.trim() });
  ut = andraPlanering(ut, amneId, { planFranUtkast: { ...lagras, namn: utkast.namn.trim() } }, idag);
  // Kortdelarna → lektionsplanerna
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  for (const [nyckel, d] of Object.entries(detaljer ?? {})) {
    const i = efter.findIndex((r) => r.nyckel === nyckel);
    if (i === -1) continue;
    const bas: LektionsPlan = hamtaLektionsplan(ut, amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i };
    ut = sattLektionsplan(ut, { ...bas, ...d });
  }
  return ut;
}

/** Tar bort det inlagda utkastet — planeringen följer boken igen (lektionsplanerna följer med). */
export function tabortInlagtUtkast(s: Struktur, amneId: string, idag?: string): Struktur {
  const a = hittaAmne(s, amneId);
  if (a.planFranUtkast === undefined) return s;
  if (idag !== undefined && a.planFranUtkast.fran < idag) throw new Error('Utkastet har redan börjat gälla — lägg in ett nytt utkast från idag i stället.');
  const fore = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  const ren = utanUtkast(s, amneId);
  return kopplaOmLektionsplaner(ren, amneId, fore, amnesPlanFor(ren, amneId, idag, false)?.a ?? []);
}

// ── Del 161 · Följ en annan klass planering ─────────────────────────────────

export interface FoljPlanering {
  s: Struktur;
  /** Antal teorilektioner och laborationer som lades in från startdatum. */
  teori: number;
  labbar: number;
  /** Lektioner som inte fanns i målämnets bokföljd (extra lektioner, egna rader) och blev egna kort. */
  egnaKort: number;
  /** Lektionskort (filmer, genomgång, BAM …) som fördes över. */
  kort: number;
  varningar: string[];
}

/** Ämnen som kan följas: samma ämnesnamn, samma bok, annan klass, med planering. */
export function foljbaraAmnen(s: Struktur, amneId: string): Amne[] {
  const a = s.amnen.find((x) => x.id === amneId);
  if (a === undefined) return [];
  return s.amnen.filter((x) => x.id !== a.id && x.klassId !== a.klassId && x.namn === a.namn && x.bokId !== undefined && x.bokId === a.bokId
    && s.planeringar.some((p) => p.amneId === x.id));
}

/**
 * Låter målämnet följa källämnets planering från `fran` (standard idag): samma lektioner
 * och laborationer i samma ordning som källans kommande lektioner, med källans lektionskort
 * (filmer, genomgång, uppgifter, BAM …). Målets genomförda lektioner ändras aldrig —
 * det är utkastsmekanismen (Del 158) som lägger in följden. Lektioner som inte finns i
 * målets bokföljd (källans extra lektioner och egna rader) blir egna kort med källans
 * innehåll. Socrative-rummen följer målets klass.
 */
export function foljPlanering(s: Struktur, malAmneId: string, kallAmneId: string, fran: string, idag?: string): FoljPlanering {
  const mal = hittaAmne(s, malAmneId);
  const kalla = hittaAmne(s, kallAmneId);
  if (mal.id === kalla.id) throw new Error('Välj ett annat ämne att följa.');
  if (mal.bokId === undefined || mal.bokId !== kalla.bokId) throw new Error('Ämnena måste använda samma bok.');
  if (!DATUM.test(fran)) throw new Error('Ange ett startdatum (ÅÅÅÅ-MM-DD).');
  const kallPlan = amnesPlanFor(s, kallAmneId, idag, false);
  if (kallPlan === null) throw new Error('Källämnet saknar planering.');
  const klassNamn = (a: Amne) => s.klasser.find((k) => k.id === a.klassId)?.namn ?? '';
  const varningar: string[] = [];

  // Källans laborationer som saknas hos målet läggs till, så 'lab:<id>' finns
  let ut = s;
  const malLabbar = mal.laborationer ?? [];
  const saknade = (kalla.laborationer ?? []).filter((l) => !malLabbar.some((x) => x.id === l.id));
  if (saknade.length > 0) ut = { ...ut, amnen: ut.amnen.map((a) => (a.id === malAmneId ? { ...a, laborationer: [...malLabbar, ...saknade] } : a)) };

  const malRader = new Map(bokensRader(ut, malAmneId).map((r) => [r.nyckel, r]));
  const kallRader = amnesPlanFor(s, kallAmneId, idag, false)!.a;
  const kallIndex = new Map<string, number>();
  kallRader.forEach((r, i) => { if (r.nyckel !== undefined && !kallIndex.has(r.nyckel)) kallIndex.set(r.nyckel, i); });
  const malHalvklass = harLaborationsstandard(mal);

  const u: PlanFranUtkast = { namn: `Följer ${klassNamn(kalla)} · ${kalla.namn}`, fran, teori: [], labbar: [], egna: [], detaljer: {} };
  let egnaKort = 0; let kort = 0; let tappadeLabbar = 0;
  const detaljerFor = (r: PlaneradLektion, radNyckel: string): LektionsDetaljer => {
    const i = kallIndex.get(radNyckel);
    const lp = i === undefined ? null : hamtaLektionsplan(s, kallAmneId, i);
    if (lp === null) return {};
    const { id: _i, amneId: _a, lektionsIndex: _l, klar: _k, ...rest } = lp; void _i; void _a; void _l; void _k; void r;
    return rest;
  };
  for (const r of kallRader) {
    if ((r.datum !== null && r.datum < fran) || r.nyckel === undefined || arPass(r.nyckel)) continue;
    if (arLab(r.nyckel)) {
      const k = koNyckel(r.nyckel);
      if (k === null) continue;
      if (!malHalvklass) { tappadeLabbar += 1; continue; }
      if (k.startsWith('u:')) {
        const eget = kalla.planFranUtkast?.egna.find((x) => `u:${x.id}` === k);
        if (eget === undefined) continue;
        u.egna.push({ ...eget }); egnaKort += 1;
      }
      u.labbar.push(k);
      const d = detaljerFor(r, r.nyckel); if (Object.keys(d).length > 0) { u.detaljer![r.nyckel] = d; kort += 1; }
      continue;
    }
    let nyckel = r.nyckel;
    if (!malRader.has(nyckel)) {
      // Extra lektion ('4:1#2'), egen rad ('er:…') eller eget kort hos källan → eget kort med källans innehåll
      const eget = kalla.planFranUtkast?.egna.find((x) => `u:${x.id}` === nyckel);
      const id = `f-${nyckel.replace(/[^a-z0-9]/gi, '-')}`;
      const typ: UtkastKort['typ'] = eget?.typ ?? (r.lektion.typ === 'exam' ? 'prov' : r.lektion.typ === 'test' ? 'diagnos' : r.lektion.typ === 'repetition' ? 'ovning' : 'lektion');
      u.egna.push({ id, rubrik: r.lektion.avsnitt, typ, ...(r.lektion.genomgang !== '—' ? { beskrivning: r.lektion.genomgang } : {}) });
      egnaKort += 1;
      const bas: LektionsDetaljer = {
        ...(r.lektion.begrepp !== '—' ? { begreppText: r.lektion.begrepp } : {}),
        ...(r.lektion.sidorTeori !== '—' ? { sidorTeori: r.lektion.sidorTeori } : {}),
        ...(r.lektion.niva1 !== '—' ? { uppgNiva1: r.lektion.niva1 } : {}),
        ...(r.lektion.niva2 !== '—' ? { uppgNiva2: r.lektion.niva2 } : {}),
        ...(r.lektion.niva3 !== '—' ? { uppgNiva3: r.lektion.niva3 } : {}),
        ...(r.lektion.ex !== '—' ? { exempelRakna: r.lektion.ex } : {}),
      };
      const d = { ...bas, ...detaljerFor(r, nyckel) };
      nyckel = `u:${id}`;
      if (Object.keys(d).length > 0) { u.detaljer![nyckel] = d; kort += 1; }
    } else {
      const d = detaljerFor(r, nyckel); if (Object.keys(d).length > 0) { u.detaljer![nyckel] = d; kort += 1; }
    }
    u.teori.push(nyckel);
  }
  if (Object.keys(u.detaljer!).length === 0) delete u.detaljer;
  if (tappadeLabbar > 0) varningar.push(`${tappadeLabbar} laborationer hoppades över — ${klassNamn(mal)} har inte laborationer på halvklasspassen.`);
  if (u.provDatum === undefined && kalla.planFranUtkast?.provDatum !== undefined && kalla.planFranUtkast.provDatum >= fran) u.provDatum = kalla.planFranUtkast.provDatum;
  ut = tillampaUtkast(ut, malAmneId, u, idag);
  const efter = planeringstavla(ut, malAmneId, u, idag);
  if (efter.rymsEj.length > 0) varningar.push(`${efter.rymsEj.length} lektioner ryms inte före läsårets slut i ${klassNamn(mal)}.`);
  return { s: ut, teori: u.teori.length, labbar: u.labbar.length, egnaKort, kort, varningar };
}
