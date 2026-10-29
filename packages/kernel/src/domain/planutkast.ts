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
import { isoVecka, laggTillAktivitet, skoldagarMellan, taBortAktivitet } from './skolar.js';
import {
  amnesOffset, amnesPlanFor, andraPlanering, gruppNyckel, hamtaLektionsplan, harLaborationsstandard,
  kopplaOmLektionsplaner, noFonster, nyttId, planeringsRader, registreraPlanering, samlaSlots, sattAntalLektioner, sattLektionerPerDelkapitel, sattLektionsplan, type PlanRad,
} from './struktur.js';
import type { Amne, LektionsDetaljer, LektionsPlan, LektionsTyp, PlaneradLektion, PlanFranUtkast, PlanUtkast, SchemaAktivitet, Skolar, Struktur, UtkastKort } from './typer.js';

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
  // Del 185: ett inlagt utkast som börjar före startdatumet gäller fram till det (tillampaUtkast behåller
  // dess pass) — då är det den planen som avgör vad som ligger före, inte bokens ordning utan utkast
  const a = hittaAmne(s, amneId);
  const bas = a.planFranUtkast !== undefined && a.planFranUtkast.fran < fran ? s : medUtkast(s, amneId, tomtUtkast('', fran));
  const plan = amnesPlanFor(bas, amneId, idag, false);
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
    const { offset, budget } = noFonster(skolar, a);
    const alla = samlaSlots(skolar, a.schema, a.klassId).slice(offset, a.noGrupp !== undefined ? offset + budget : undefined);
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
  /** Del 174 · Veckovis: lektioner som ströks (övningslektioner) för att veckorna skulle gå ihop. */
  strukna?: string[];
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
export interface FoljAlternativ {
  /**
   * Del 174 · Veckovis: klasserna gör samma saker samma vecka. Källans lektioner läggs på målets pass i
   * samma vecka (inte bara i samma ordning); målets egna kort (prov, diagnoser, laborationer, egna rader) och
   * provdatum ligger kvar på sina datum. Har målet färre pass en vecka stryks i första hand en övningslektion
   * (repetition/övning) — i den veckan eller nästa — annars flyttas lektionen till veckan efter. Har målet fler
   * pass fylls de med en övningslektion.
   */
  veckovis?: boolean;
  /**
   * Del 175 · Följ källan bara till och med detta datum; därefter planeras målets pass utifrån bokens
   * ordning (nästa lektion i boken som målet inte gjort) på målets eget schema. Målets fasta kort ligger kvar.
   */
  till?: string;
  /**
   * Del 175 · Tillåt startdatum före idag: genomförda lektioner skrivs om så att de stämmer med källan
   * (t.ex. när båda klasserna faktiskt gjort samma saker). Används bara på lärarens uttryckliga val.
   */
  historik?: boolean;
}

/** Måndagen i datumets vecka — nyckel för "samma vecka". */
function veckoNyckel(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag);
  return d.toISOString().slice(0, 10);
}

export function foljPlanering(s: Struktur, malAmneId: string, kallAmneId: string, fran: string, idagIn?: string, alternativ: FoljAlternativ = {}): FoljPlanering {
  // Historik: utan "idag" fryses inget — genomförda pass får källans innehåll
  const idag = alternativ.historik === true ? undefined : idagIn;
  const till = alternativ.till;
  if (till !== undefined && !DATUM.test(till)) throw new Error('Ange ett slutdatum (ÅÅÅÅ-MM-DD).');
  if (till !== undefined && till < fran) throw new Error('Slutdatum ligger före startdatum.');
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
  // Källans teorikort i ordning med datum och sort (för veckovis läggning)
  const kallKort: Array<{ nyckel: string; datum: string | null; typ: UtkastKort['typ'] }> = [];
  const veckovis = alternativ.veckovis === true;
  // Målets egna fasta kort från startdatum (prov, diagnoser, laborationer, egna rader) — rörs inte i veckovis läge
  const malPlan = veckovis ? (amnesPlanFor(s, malAmneId, idag, false)?.a ?? []) : [];
  const malEgna = mal.planFranUtkast?.egna ?? [];
  const fastTyp = (n: string): UtkastKort['typ'] | null => {
    if (n.startsWith('er:')) return 'annat';
    const e = malEgna.find((x) => `u:${x.id}` === n);
    return e !== undefined && e.typ !== 'lektion' && e.typ !== 'ovning' ? e.typ : null;
  };
  const fasta = new Map<string, { nyckel: string; typ: UtkastKort['typ'] }>();
  for (const r of malPlan) {
    if (r.datum === null || r.datum < fran || r.nyckel === undefined || arLab(r.nyckel) || arPass(r.nyckel)) continue;
    const typ = fastTyp(r.nyckel);
    if (typ !== null && !fasta.has(r.datum)) fasta.set(r.datum, { nyckel: r.nyckel, typ });
  }
  const fastaNycklar = new Set([...fasta.values()].map((f) => f.nyckel));
  const malHarProv = veckovis && ([...fasta.values()].some((f) => f.typ === 'prov') || (mal.planFranUtkast?.provDatum !== undefined && mal.planFranUtkast.provDatum >= fran));
  const detaljerFor = (r: PlaneradLektion, radNyckel: string): LektionsDetaljer => {
    const i = kallIndex.get(radNyckel);
    const lp = i === undefined ? null : hamtaLektionsplan(s, kallAmneId, i);
    if (lp === null) return {};
    const { id: _i, amneId: _a, lektionsIndex: _l, klar: _k, ...rest } = lp; void _i; void _a; void _l; void _k; void r;
    return rest;
  };
  for (const r of kallRader) {
    if ((r.datum !== null && r.datum < fran) || r.nyckel === undefined || arPass(r.nyckel)) continue;
    if (till !== undefined && (r.datum === null || r.datum > till)) continue;
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
      // Veckovis: målets eget prov ligger kvar — källans provkort hoppas över
      if (malHarProv && typ === 'prov') continue;
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
      kallKort.push({ nyckel, datum: r.datum, typ });
    } else {
      if (malHarProv && r.lektion.typ === 'exam') continue;
      const d = detaljerFor(r, nyckel); if (Object.keys(d).length > 0) { u.detaljer![nyckel] = d; kort += 1; }
      kallKort.push({ nyckel, datum: r.datum, typ: r.lektion.typ === 'exam' ? 'prov' : r.lektion.typ === 'test' ? 'diagnos' : r.lektion.typ === 'repetition' ? 'ovning' : 'lektion' });
    }
  }
  const strukna: string[] = [];
  if (!veckovis) {
    u.teori = kallKort.map((k) => k.nyckel);
    if (till !== undefined) {
      const gjorda = nycklarFore(ut, malAmneId, fran, idag).teori;
      const anvanda = new Set([...gjorda, ...u.teori]);
      for (const r of bokensRader(ut, malAmneId)) if (!anvanda.has(r.nyckel)) u.teori.push(r.nyckel);
    }
  }
  else {
    // Målets pass från startdatum (teoripassen), i datumordning
    const tomt = tomtUtkast(u.namn, fran);
    const pass = planeringstavla(ut, malAmneId, tomt, idag).kolumner.filter((k) => k.ko === 'teori' && k.datum !== null);
    // Lektioner målet redan gjort före startdatum läggs inte igen (passet blir en övning i stället)
    const gjorda = nycklarFore(ut, malAmneId, fran, idag).teori;
    for (let i = kallKort.length - 1; i >= 0; i -= 1) if (gjorda.has(kallKort[i].nyckel)) kallKort.splice(i, 1);
    const rubrikFor = (n: string) => malRader.get(n)?.lektion.avsnitt ?? u.egna.find((x) => `u:${x.id}` === n)?.rubrik ?? n;
    const ko: typeof kallKort = []; let idx = 0; let vecka: string | null = null;
    const malNamn = klassNamn(mal);
    const stryk = (lista: typeof kallKort, fran0: number): boolean => {
      const i = lista.findIndex((k, j) => j >= fran0 && k.typ === 'ovning');
      if (i < 0) return false;
      strukna.push(rubrikFor(lista[i].nyckel)); lista.splice(i, 1); return true;
    };
    let bokLage = false;
    for (const p of pass) {
      if (!bokLage && till !== undefined && p.datum! > till) {
        // Efter slutdatum: fortsätt med bokens ordning — nästa lektion målet inte gjort (före startdatum eller i följden)
        bokLage = true;
        const anvanda = new Set([...gjorda, ...u.teori, ...ko.map((k) => k.nyckel), ...kallKort.slice(idx).map((k) => k.nyckel)]);
        const rest = bokensRader(ut, malAmneId).filter((r) => !anvanda.has(r.nyckel) && !fastaNycklar.has(r.nyckel))
          .map((r) => ({ nyckel: r.nyckel, datum: null, typ: (r.lektion.typ === 'exam' ? 'prov' : r.lektion.typ === 'test' ? 'diagnos' : r.lektion.typ === 'repetition' ? 'ovning' : 'lektion') as UtkastKort['typ'] }));
        kallKort.splice(idx, kallKort.length - idx, ...kallKort.slice(idx), ...rest);
      }
      const w = veckoNyckel(p.datum!);
      if (w !== vecka && !bokLage) {
        // Ny vecka: det som inte fick plats förra veckan → stryk en övningslektion (i kön, annars nästa kommande)
        for (let n = ko.length; n > 0; n -= 1) {
          if (!stryk(ko, 0) && !stryk(kallKort, idx)) {
            varningar.push(`v. ${isoVecka(vecka!)}: ${ko.length} ${ko.length === 1 ? 'lektion fick' : 'lektioner fick'} inte plats i ${malNamn} och flyttas till veckan efter.`);
            break;
          }
        }
        vecka = w;
      }
      while (idx < kallKort.length && (kallKort[idx].datum === null || veckoNyckel(kallKort[idx].datum!) <= w)) ko.push(kallKort[idx++]);
      const fast = fasta.get(p.datum!);
      if (fast !== undefined) { u.teori.push(fast.nyckel); continue; }
      const k = ko.shift();
      if (k !== undefined) u.teori.push(k.nyckel);
      else if (idx >= kallKort.length && (till === undefined || bokLage)) break;   // källan (eller boken) är slut — inga fler övningar
      else {
        const id = `ov-${p.datum}`;
        u.egna.push({ id, rubrik: 'Övning', typ: 'ovning' }); egnaKort += 1;
        u.teori.push(`u:${id}`);
      }
    }
    for (const k of [...ko, ...kallKort.slice(idx)]) u.teori.push(k.nyckel);
    // Målets egna kort som ligger kvar måste finnas i utkastet
    for (const f of fasta.values()) {
      const e = malEgna.find((x) => `u:${x.id}` === f.nyckel);
      if (e !== undefined && !u.egna.some((x) => x.id === e.id)) u.egna.push({ ...e });
    }
    if (mal.planFranUtkast?.provDatum !== undefined && mal.planFranUtkast.provDatum >= fran) u.provDatum = mal.planFranUtkast.provDatum;
    if (mal.planFranUtkast !== undefined) {
      // Målets egna laborationer från startdatum ligger kvar
      const egnaLabbar = mal.planFranUtkast.labbar.filter((n) => n.startsWith('u:'));
      if (egnaLabbar.length > 0) u.labbar = [...new Set([...egnaLabbar, ...u.labbar])];
    }
    if (strukna.length > 0) varningar.push(`${strukna.length} ${strukna.length === 1 ? 'övningslektion ströks' : 'övningslektioner ströks'} för att veckorna skulle gå ihop: ${strukna.join(', ')}.`);
  }
  if (Object.keys(u.detaljer!).length === 0) delete u.detaljer;
  if (tappadeLabbar > 0) varningar.push(`${tappadeLabbar} laborationer hoppades över — ${klassNamn(mal)} har inte laborationer på halvklasspassen.`);
  if (!veckovis && u.provDatum === undefined && kalla.planFranUtkast?.provDatum !== undefined && kalla.planFranUtkast.provDatum >= fran) u.provDatum = kalla.planFranUtkast.provDatum;
  ut = tillampaUtkast(ut, malAmneId, u, idag);
  const efter = planeringstavla(ut, malAmneId, u, idag);
  if (efter.rymsEj.length > 0) varningar.push(`${efter.rymsEj.length} lektioner ryms inte före läsårets slut i ${klassNamn(mal)}.`);
  return { s: ut, teori: u.teori.length, labbar: u.labbar.length, egnaKort, kort, varningar, ...(veckovis ? { strukna } : {}) };
}

// ── Del 183 · Kapitlet börjar ett visst datum ───────────────────────────────

export interface KapitelStart {
  s: Struktur;
  /** Lektioner som flyttades fram till startdatumet. */
  flyttade: number;
  /** Pass före startdatumet som blev övningar. */
  ovningar: number;
  /** Egna kort (prov, diagnoser, laborationer, egna rader) som ligger kvar på sina datum. */
  fasta: number;
}

/**
 * Låter kapitel `kapitel` (och allt som följer i bokens ordning) börja på `datum`, även när planen
 * redan har lagt kapitlets lektioner tidigare och markerat dem som genomförda (planen var fel, inte
 * verkligheten). Lektionerna från kapitlet och framåt som ligger före datumet flyttas fram i samma
 * ordning; de pass som blir tomma före datumet blir övningar ("Övning" — byt till det som gjordes).
 * Egna kort (prov, diagnoser, laborationer, egna rader) ligger kvar på sina datum, före och efter.
 * Genomförda pass skrivs alltså om — bara på lärarens uttryckliga val.
 */
export function kapitelBorjar(s: Struktur, amneId: string, kapitel: number, datum: string): KapitelStart {
  if (!DATUM.test(datum)) throw new Error('Ange ett datum (ÅÅÅÅ-MM-DD).');
  const a = hittaAmne(s, amneId);
  if (a.bokId === undefined) throw new Error('Ämnet saknar bok.');
  const plan = amnesPlanFor(s, amneId, undefined, false);
  if (plan === null) throw new Error('Ämnet saknar bok eller skolår.');
  const rader = plan.a.filter((r) => r.datum !== null && r.nyckel !== undefined && !arPass(r.nyckel!) && !arLab(r.nyckel!));
  const egna = a.planFranUtkast?.egna ?? [];
  const arFast = (n: string): boolean => {
    if (n.startsWith('er:')) return true;
    const e = egna.find((x) => `u:${x.id}` === n);
    return e !== undefined && e.typ !== 'lektion' && e.typ !== 'ovning';
  };
  const attFlytta = (r: PlaneradLektion) => r.datum! < datum && r.kapitel >= kapitel && !arFast(r.nyckel!);
  const forsta = rader.find(attFlytta);
  if (forsta === undefined) throw new Error(`Inga lektioner ur kapitel ${kapitel} ligger före ${datum}.`);
  const fran = forsta.datum!;
  // Kön från startdatumet: det som flyttas (i ordning) följt av allt annat som redan låg efter datumet
  const flyttas = rader.filter(attFlytta).map((r) => r.nyckel!);
  const efter = rader.filter((r) => r.datum! >= datum && !arFast(r.nyckel!) && !flyttas.includes(r.nyckel!)).map((r) => r.nyckel!);
  const ko = [...flyttas, ...efter];
  const fasta = new Map(rader.filter((r) => r.datum! >= fran && arFast(r.nyckel!)).map((r) => [r.datum!, r.nyckel!]));
  const u: PlanFranUtkast = { namn: `Kapitel ${kapitel} från ${datum}`, fran, teori: [], labbar: [...(a.planFranUtkast?.labbar ?? [])], egna: [...egna] };
  const pass = planeringstavla(s, amneId, tomtUtkast(u.namn, fran)).kolumner.filter((k) => k.ko === 'teori' && k.datum !== null);
  let ovningar = 0; let idx = 0;
  for (const p of pass) {
    const fast = fasta.get(p.datum!);
    if (fast !== undefined) { u.teori.push(fast); continue; }
    if (p.datum! < datum) {
      const id = `ov-${p.datum}`;
      u.egna.push({ id, rubrik: 'Övning', typ: 'ovning' }); u.teori.push(`u:${id}`); ovningar += 1;
      continue;
    }
    if (idx >= ko.length) break;
    u.teori.push(ko[idx++]);
  }
  for (; idx < ko.length; idx += 1) u.teori.push(ko[idx]);
  if (a.planFranUtkast?.provDatum !== undefined && a.planFranUtkast.provDatum >= fran) u.provDatum = a.planFranUtkast.provDatum;
  const ut = tillampaUtkast(s, amneId, u);
  return { s: ut, flyttade: flyttas.length, ovningar, fasta: fasta.size };
}

// ── Del 185 · Ladda ett kapitel från ett pass · ta bort en lektion ─────────────
//
// Båda bygger på utkastsmekanismen: ett utkast från startdatumet (pass före rörs aldrig) där
// lärarens fasta kort — prov, diagnoser, laborationer och egna rader — ligger kvar på sina
// datum och allt annat läggs i kö på de lediga passen. Lektionskorten följer sina lektioner.

/** Nyckeln som anger ett pass: datum + starttid (två fasta kort samma dag hålls isär). */
const passNyckelFor = (datum: string, start: string | null) => `${datum}|${start ?? ''}`;

/** Lärarens fasta kort: egna kort som inte är lektion/övning, samt egna rader ('er:'). */
function arFastKort(a: Amne, nyckel: string): boolean {
  if (nyckel.startsWith('er:')) return true;
  const e = (a.planFranUtkast?.egna ?? []).find((x) => `u:${x.id}` === nyckel);
  return e !== undefined && e.typ !== 'lektion' && e.typ !== 'ovning';
}

/** De fasta korten från startdatumet med sina pass (datum|start → nyckel). */
function fastaKortFran(s: Struktur, amneId: string, fran: string, idag?: string): Map<string, string> {
  const a = hittaAmne(s, amneId);
  const ut = new Map<string, string>();
  for (const r of amnesPlanFor(s, amneId, idag, false)?.a ?? []) {
    if (r.datum === null || r.datum < fran || r.nyckel === undefined || arLab(r.nyckel) || arPass(r.nyckel)) continue;
    if (arFastKort(a, r.nyckel)) ut.set(passNyckelFor(r.datum, r.start), r.nyckel);
  }
  return ut;
}

/**
 * Lägger ut teorikön på passen från startdatumet: ett fast kort på sitt pass, annars nästa ur kön.
 * När kön är slut stannar utläggningen (inga fyllnadskort); fasta kort vars pass inte finns längre
 * läggs sist så att de inte tappas.
 */
function laggUtTeori(s: Struktur, amneId: string, fran: string, ko: string[], fasta: Map<string, string>, idag?: string): string[] {
  const pass = planeringstavla(s, amneId, tomtUtkast('—', fran), idag).kolumner.filter((k) => k.ko === 'teori' && k.datum !== null);
  const teori: string[] = []; const placerade = new Set<string>();
  let idx = 0;
  for (const p of pass) {
    const fast = fasta.get(passNyckelFor(p.datum!, p.start));
    if (fast !== undefined) { teori.push(fast); placerade.add(fast); continue; }
    if (idx >= ko.length) break;
    teori.push(ko[idx++]);
  }
  for (; idx < ko.length; idx += 1) teori.push(ko[idx]);
  for (const n of fasta.values()) if (!placerade.has(n)) teori.push(n);
  return teori;
}

export interface LaddatKapitel {
  s: Struktur;
  kapitel: number;
  namn: string;
  /** Första passet kapitlet lades på (första teoripasset på eller efter startdatumet). */
  forsta: string | null;
  /** Kapitlets sista lektion. */
  sista: string | null;
  /** Lektioner ur kapitlet som lades in. */
  inlagda: number;
  /** Kommande lektioner (andra kapitel) som flyttades senare. */
  framflyttade: number;
  /** Egna prov/diagnoser/laborationer/egna rader som ligger kvar på sina datum. */
  fasta: number;
  /** Lektioner ur kapitlet som var borttagna och nu lades in igen. */
  aterinforda: number;
  /** Lektioner ur kapitlet som redan var genomförda före startdatumet (läggs inte igen). */
  hoppade: number;
  /** Lektionskort som följde med sina lektioner. */
  kort: number;
  /** Lektioner som inte ryms före läsårets slut. */
  rymsEj: number;
  /** Del 186 · Egna kopior av kapitlets lektioner (t.ex. från 'Följ planering') som togs bort — boken ersätter dem. */
  kopior: number;
  varningar: string[];
}

/**
 * Lägger in ett helt kapitel ur boken från ett startdatum (första teoripasset på eller efter det):
 * kapitlets lektioner i bokens ordning först, därefter de kommande lektioner som redan låg där
 * (de flyttas senare). Lärarens fasta kort ligger kvar på sina datum. Lektioner ur kapitlet som
 * redan är genomförda före startdatumet läggs inte igen; borttagna läggs in igen. Pass före
 * startdatumet rörs aldrig; startdatum före idag avvisas.
 */
export function laddaKapitel(s: Struktur, amneId: string, kapitel: number, fran: string, idag?: string): LaddatKapitel {
  if (!DATUM.test(fran)) throw new Error('Ange ett startdatum (ÅÅÅÅ-MM-DD).');
  if (idag !== undefined && fran < idag) throw new Error('Startdatum ligger före idag — genomförda lektioner ändras aldrig. Välj idag eller senare.');
  const a = hittaAmne(s, amneId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (bok === undefined) throw new Error('Ämnet saknar bok.');
  const kap = bok.kapitel.find((k) => k.nr === kapitel);
  if (kap === undefined) throw new Error(`Kapitel ${kapitel} finns inte i ${bok.titel}.`);
  // Borttagna lektioner ur kapitlet läggs in igen
  const bortMarkerade = Object.entries(a.lektionsVal ?? {}).filter(([n, v]) => v.bort === true && n.startsWith(`${kapitel}:`)).map(([n]) => n);
  let st = s;
  if (bortMarkerade.length > 0) {
    const lv = { ...(a.lektionsVal ?? {}) };
    for (const n of bortMarkerade) { const { bort: _b, ...rest } = lv[n]; void _b; if (Object.keys(rest).length === 0) delete lv[n]; else lv[n] = rest; }
    st = andraPlanering(st, amneId, { lektionsVal: lv }, idag);
  }
  const kapNycklar = bokensRader(st, amneId).filter((r) => r.kapitel === kapitel).map((r) => r.nyckel);
  if (kapNycklar.length === 0) throw new Error(`Kapitel ${kapitel} har inga lektioner att lägga in.`);
  const gjorda = nycklarFore(st, amneId, fran, idag).teori;
  const fasta = fastaKortFran(st, amneId, fran, idag);
  const fastaNycklar = new Set(fasta.values());
  const u0 = utkastFranPlan(st, amneId, fran, idag, `Kapitel ${kapitel} från ${fran}`);
  const kapKo = kapNycklar.filter((n) => !gjorda.has(n) && !fastaNycklar.has(n));
  const hoppade = kapNycklar.filter((n) => gjorda.has(n)).length;
  const kapSet = new Set(kapKo);
  // Del 186 · Egna lektions-/övningskort som är kopior av kapitlets lektioner (skapade av 'Följ planering'
  // som f-<kap>-…, eller med samma rubrik som en lektion i kapitlet) ersätts av bokens rader — annars
  // hamnar de en gång till efter kapitlet. Fasta kort (prov, diagnoser, laborationer) rörs aldrig.
  const kapRubriker = new Set(bokensRader(st, amneId).filter((r) => r.kapitel === kapitel).map((r) => r.lektion.avsnitt.trim().toLowerCase()));
  const egnaAv = new Map(u0.egna.map((k) => [`u:${k.id}`, k]));
  const arKopia = (n: string): boolean => {
    const k = egnaAv.get(n);
    if (k === undefined || fastaNycklar.has(n) || (k.typ !== 'lektion' && k.typ !== 'ovning')) return false;
    return k.id.startsWith(`f-${kapitel}-`) || kapRubriker.has(k.rubrik.trim().toLowerCase());
  };
  const kopior = u0.teori.filter(arKopia);
  const ovriga = u0.teori.filter((n) => !kapSet.has(n) && !fastaNycklar.has(n) && !arKopia(n));
  const teori = laggUtTeori(st, amneId, fran, [...kapKo, ...ovriga], fasta, idag);
  const u: PlanFranUtkast = { ...u0, teori };
  const fore = amnesPlanFor(st, amneId, idag, false)?.a ?? [];
  const kortFore = fore.filter((r) => r.datum !== null && r.datum >= fran && r.nyckel !== undefined && kapSet.has(r.nyckel) && hamtaLektionsplan(st, amneId, fore.indexOf(r)) !== null).length;
  const ut = tillampaUtkast(st, amneId, u, idag);
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  const kapRader = efter.filter((r) => r.nyckel !== undefined && kapSet.has(r.nyckel));
  const tavla = planeringstavla(ut, amneId, u, idag);
  const varningar: string[] = [];
  if (tavla.rymsEj.length > 0) varningar.push(`${tavla.rymsEj.length} lektioner ryms inte före läsårets slut.`);
  if (hoppade > 0) varningar.push(`${hoppade} lektioner ur kapitlet var redan genomförda före ${fran} och lades inte igen.`);
  if (bortMarkerade.length > 0) varningar.push(`${bortMarkerade.length} borttagna lektioner ur kapitlet lades in igen.`);
  if (kopior.length > 0) varningar.push(`${kopior.length} egna kopior av kapitlets lektioner togs bort (boken ersätter dem).`);
  const provDatum = a.planFranUtkast?.provDatum;
  if (provDatum !== undefined && provDatum >= fran && kapRader.some((r) => r.datum !== null && r.datum > provDatum)) varningar.push(`Kapitlets sista lektion hamnar efter provdatumet ${provDatum}.`);
  return {
    s: ut, kapitel, namn: kap.namn,
    forsta: kapRader[0]?.datum ?? null, sista: kapRader[kapRader.length - 1]?.datum ?? null,
    inlagda: kapKo.length, framflyttade: ovriga.length, fasta: fasta.size, aterinforda: bortMarkerade.length, hoppade,
    kort: kortFore, rymsEj: tavla.rymsEj.length, kopior: kopior.length, varningar,
  };
}

export interface BorttagenLektion {
  s: Struktur;
  /** Lektionens rubrik och datum. */
  rubrik: string;
  datum: string;
  /** Lektioner efter som flyttades ett pass tidigare. */
  framflyttade: number;
  /** Fasta kort som ligger kvar på sina datum. */
  fasta: number;
  /** Lektionskortet (filmer, genomgång …) som försvann med lektionen, om det fanns. */
  hadeKort: boolean;
}

export interface BorttagnaLektioner {
  s: Struktur;
  /** Lektioner som togs bort, och hur många av dem som hade varit. */
  borttagna: number;
  genomforda: number;
  /** Första borttagna lektionens datum — härifrån läggs passen om. */
  fran: string;
  /** Lektioner efter som flyttades tidigare. */
  framflyttade: number;
  /** Fasta kort som ligger kvar på sina datum. */
  fasta: number;
  /** Lektionskort som försvann med lektionerna. */
  kort: number;
}

/**
 * Del 197 · Tar bort flera lektioner på en gång: passen från den första borttagna läggs om så att de
 * följande lektionerna flyttas tidigare medan lärarens fasta kort (prov, diagnoser, laborationer,
 * egna rader) ligger kvar på sina datum. Lektioner som har varit tas bara bort med `tillatGenomford`
 * — då skrivs passen om från det datumet (som ⏩ Kapitlet börjar), bara på lärarens uttryckliga val.
 * Nycklarna märks dessutom bort i lektionsVal så att ↺ Återställ kapitlet och 📥 Ladda kapitel hittar dem.
 */
export function taBortLektioner(s: Struktur, amneId: string, nycklar: string[], idag?: string, tillatGenomford = false): BorttagnaLektioner {
  const a = hittaAmne(s, amneId);
  const plan = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  const valda = new Set(nycklar);
  const rader = plan.filter((r) => r.nyckel !== undefined && valda.has(r.nyckel) && r.datum !== null);
  if (rader.length === 0) throw new Error('Lektionen finns inte i planeringen.');
  for (const r of rader) if (arLab(r.nyckel!) || arPass(r.nyckel!)) throw new Error('Laborationer och passlektioner ändras under 🧪 Laborationer.');
  const genomforda = idag === undefined ? 0 : rader.filter((r) => r.datum! < idag).length;
  if (genomforda > 0 && !tillatGenomford) throw new Error('Lektionen har varit och kan inte tas bort — då skulle alla genomförda lektioner efter den flyttas. Ersätt innehållet i stället.');
  const fran = rader.map((r) => r.datum!).sort()[0];
  // Skrivs det förflutna om läggs passen från det datumet — då får hjälpfunktionerna inget "idag"
  const dag = idag !== undefined && fran < idag ? undefined : idag;
  const u0 = utkastFranPlan(s, amneId, fran, dag, `Utan ${rader.length === 1 ? rader[0].lektion.avsnitt : `${rader.length} lektioner`} ${fran}`);
  const fasta = fastaKortFran(s, amneId, fran, dag);
  for (const [k, n] of [...fasta]) if (valda.has(n)) fasta.delete(k);
  const fastaNycklar = new Set(fasta.values());
  const ko = u0.teori.filter((n) => !valda.has(n) && !fastaNycklar.has(n));
  const teori = laggUtTeori(s, amneId, fran, ko, fasta, dag);
  const u: PlanFranUtkast = { ...u0, teori, egna: u0.egna.filter((k) => !valda.has(`u:${k.id}`)) };
  const kort = rader.filter((r) => hamtaLektionsplan(s, amneId, plan.indexOf(r)) !== null).length;
  let ut = tillampaUtkast(s, amneId, u, dag);
  const lv = { ...(a.lektionsVal ?? {}) };
  for (const r of rader) if (!r.nyckel!.startsWith('u:') && !r.nyckel!.startsWith('er:')) lv[r.nyckel!] = { ...(lv[r.nyckel!] ?? {}), bort: true };
  ut = andraPlanering(ut, amneId, { lektionsVal: lv }, dag);
  return { s: ut, borttagna: rader.length, genomforda, fran, framflyttade: ko.length, fasta: fasta.size, kort };
}

/**
 * Tar bort en lektion ur planeringen: de följande flyttas ett pass tidigare, lärarens fasta kort
 * ligger kvar på sina datum. Egna kort tas bort ur utkastet. Genomförda lektioner tas bara bort
 * med `tillatGenomford` (Del 197). Ångra = den vanliga ångra-funktionen (strukturen före).
 */
export function taBortLektion(s: Struktur, amneId: string, nyckel: string, idag?: string, tillatGenomford = false): BorttagenLektion {
  hittaAmne(s, amneId);
  const plan = amnesPlanFor(s, amneId, idag, false)?.a ?? [];
  const rad = plan.find((r) => r.nyckel === nyckel);
  if (rad === undefined || rad.datum === null) throw new Error('Lektionen finns inte i planeringen.');
  const b = taBortLektioner(s, amneId, [nyckel], idag, tillatGenomford);
  return { s: b.s, rubrik: rad.lektion.avsnitt, datum: b.fran, framflyttade: b.framflyttade, fasta: b.fasta, hadeKort: b.kort > 0 };
}

// ── Del 200 · Lägg till en lektion efter en rad ───────────────────────────────

export interface TillagdLektion {
  s: Struktur;
  /** Nyckeln till det nya kortet ('u:…'). */
  nyckel: string;
  /** Passet den hamnade på. */
  datum: string | null;
  /** Lektioner efter som flyttades ett pass senare. */
  senarelagda: number;
  fasta: number;
}

/**
 * Lägger in nycklar (bokens rader eller egna kort) direkt efter lektionen `efterNyckel`: det som låg efter
 * flyttas ett pass senare, fasta kort ligger kvar på sina datum. Ligger passet efter raden i det förflutna
 * krävs `tillatGenomford` — passen skrivs då om därifrån.
 */
function laggInEfter(s: Struktur, amneId: string, efterNyckel: string, nycklar: string[], egna: UtkastKort[], idag?: string, tillatGenomford = false): TillagdLektion {
  const plan = (amnesPlanFor(s, amneId, idag, false)?.a ?? []).filter((r) => r.datum !== null && r.nyckel !== undefined && !arPass(r.nyckel) && !arLab(r.nyckel));
  const i = plan.findIndex((r) => r.nyckel === efterNyckel);
  if (i === -1) throw new Error('Lektionen finns inte i planeringen.');
  const nasta = plan[i + 1];
  const fran = nasta?.datum ?? plan[i].datum!;
  if (idag !== undefined && fran < idag && !tillatGenomford) throw new Error('Passet efter lektionen har varit — bekräfta att genomförda lektioner får skrivas om.');
  const dag = idag !== undefined && fran < idag ? undefined : idag;
  const u0 = utkastFranPlan(s, amneId, fran, dag, `Efter ${efterNyckel} ${fran}`);
  const fasta = fastaKortFran(s, amneId, fran, dag);
  const fastaNycklar = new Set(fasta.values());
  const nya = new Set(nycklar);
  const fria = u0.teori.filter((n) => !fastaNycklar.has(n) && !nya.has(n));
  const ko = nasta === undefined ? [...fria, ...nycklar] : [...nycklar, ...fria];
  const teori = laggUtTeori(s, amneId, fran, ko, fasta, dag);
  const u: PlanFranUtkast = { ...u0, teori, egna: [...u0.egna, ...egna.filter((k) => !u0.egna.some((x) => x.id === k.id))] };
  const ut = tillampaUtkast(s, amneId, u, dag);
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  return { s: ut, nyckel: nycklar[0] ?? '', datum: efter.find((r) => r.nyckel === nycklar[0])?.datum ?? null, senarelagda: nasta === undefined ? 0 : fria.length, fasta: fasta.size };
}

/**
 * Lägger in en egen lektion (övning, prov, diagnos …) direkt efter lektionen `efterNyckel`: det som
 * låg efter flyttas ett pass senare, fasta kort ligger kvar på sina datum. Fungerar både med och utan
 * inlagt utkast (laggTillEgenRad syns inte under ett utkast — det här är vägen som alltid fungerar).
 * Ligger passet efter raden i det förflutna krävs `tillatGenomford`.
 */
export function laggTillLektionEfter(s: Struktur, amneId: string, efterNyckel: string, kort: { rubrik: string; typ: Exclude<UtkastKort['typ'], 'lab'>; beskrivning?: string }, idag?: string, tillatGenomford = false): TillagdLektion {
  hittaAmne(s, amneId);
  if (kort.rubrik.trim() === '') throw new Error('Ge lektionen en rubrik.');
  const id = nyttId('eg');
  const egen: UtkastKort = { id, rubrik: kort.rubrik.trim(), typ: kort.typ, ...(kort.beskrivning !== undefined && kort.beskrivning.trim() !== '' ? { beskrivning: kort.beskrivning.trim() } : {}) };
  return laggInEfter(s, amneId, efterNyckel, [`u:${id}`], [egen], idag, tillatGenomford);
}

/**
 * Del 202 · Flyttar en lektion så att den hamnar direkt efter `efterNyckel` (null = först bland passen
 * från den tidigaste berörda lektionen). De andra lektionerna behåller sin inbördes ordning, fasta
 * kort ligger kvar på sina datum. Berörs genomförda pass krävs `tillatGenomford`.
 */
export function flyttaLektionEfter(s: Struktur, amneId: string, nyckel: string, efterNyckel: string | null, idag?: string, tillatGenomford = false): { s: Struktur; fran: string; datum: string | null } {
  hittaAmne(s, amneId);
  if (nyckel === efterNyckel) throw new Error('Lektionen ligger redan där.');
  const plan = (amnesPlanFor(s, amneId, idag, false)?.a ?? []).filter((r) => r.datum !== null && r.nyckel !== undefined && !arPass(r.nyckel) && !arLab(r.nyckel));
  const i = plan.findIndex((r) => r.nyckel === nyckel);
  if (i === -1) throw new Error('Lektionen finns inte i planeringen.');
  const j = efterNyckel === null ? -1 : plan.findIndex((r) => r.nyckel === efterNyckel);
  if (efterNyckel !== null && j === -1) throw new Error('Lektionen att lägga efter finns inte i planeringen.');
  if (j === i - 1) return { s, fran: plan[i].datum!, datum: plan[i].datum };   // redan på plats
  const forstaBerord = Math.min(i, j + 1);
  const fran = plan[forstaBerord].datum!;
  if (idag !== undefined && fran < idag && !tillatGenomford) throw new Error('Flytten berör pass som har varit — bekräfta att genomförda lektioner får skrivas om.');
  const dag = idag !== undefined && fran < idag ? undefined : idag;
  const u0 = utkastFranPlan(s, amneId, fran, dag, `Flytt ${fran}`);
  const fasta = fastaKortFran(s, amneId, fran, dag);
  const fastaNycklar = new Set(fasta.values());
  // Den nya ordningen bland de fria korten från startpasset: som nu, men med lektionen efter målet
  const fria = u0.teori.filter((n) => !fastaNycklar.has(n) && n !== nyckel);
  const malIdx = efterNyckel === null ? -1 : fria.indexOf(efterNyckel);
  const ko = efterNyckel !== null && malIdx === -1 ? [nyckel, ...fria] : [...fria.slice(0, malIdx + 1), nyckel, ...fria.slice(malIdx + 1)];
  const teori = laggUtTeori(s, amneId, fran, ko, fasta, dag);
  const ut = tillampaUtkast(s, amneId, { ...u0, teori }, dag);
  const efter = amnesPlanFor(ut, amneId, idag, false)?.a ?? [];
  return { s: ut, fran, datum: efter.find((r) => r.nyckel === nyckel)?.datum ?? null };
}

/**
 * Del 200 · Rader som en inställning gav upphov till (fler lektioner på ett delkapitel) läggs in i ett
 * inlagt utkast — annars syns de inte, eftersom utkastet bara visar de nycklar det känner till. Varje ny
 * nyckel hamnar efter sin föregångare i bokens följd (sista lektionen på delkapitlet).
 */
function synkaNyaRader(fore: Struktur, efter: Struktur, amneId: string, idag?: string): Struktur {
  const a = hittaAmne(efter, amneId);
  if (a.planFranUtkast === undefined) return efter;
  const gamla = new Set(bokensRader(fore, amneId).map((r) => r.nyckel));
  const rader = bokensRader(efter, amneId);
  const nya = rader.filter((r) => !gamla.has(r.nyckel)).map((r) => r.nyckel);
  if (nya.length === 0) return efter;
  let ut = efter;
  for (const n of nya) {
    const iPlan = new Set((amnesPlanFor(ut, amneId, idag, false)?.a ?? []).map((r) => r.nyckel));
    if (iPlan.has(n)) continue;   // låg redan i den frysta delen
    const pos = rader.findIndex((r) => r.nyckel === n);
    const fore = [...rader.slice(0, pos)].reverse().find((r) => iPlan.has(r.nyckel));
    if (fore === undefined) continue;
    try { ut = laggInEfter(ut, amneId, fore.nyckel, [n], [], idag, true).s; } catch { /* ryms inte — lämnas */ }
  }
  return ut;
}

/** Antal lektioner (1–4) på ett delkapitel — fungerar även när ett utkast är inlagt. */
export function sattAntalLektionerIPlan(s: Struktur, amneId: string, grupp: string, antal: number | null, idag?: string): Struktur {
  return synkaNyaRader(s, sattAntalLektioner(s, amneId, grupp, antal, idag), amneId, idag);
}

/** Ämnets inställning 'lektioner per delkapitel' — fungerar även när ett utkast är inlagt. */
export function sattLektionerPerDelkapitelIPlan(s: Struktur, amneId: string, antal: number, fran?: string, idag?: string): Struktur {
  return synkaNyaRader(s, sattLektionerPerDelkapitel(s, amneId, antal, fran, idag), amneId, idag);
}

// ── Del 197 · Avsluta ett kapitel efter ett visst delkapitel ─────────────────

const kodTal = (kod: string): number => Number(kod.split('.')[1]);

/** Bokens lektioner (inklusive extra lektioner) i kapitlet som ligger efter delkapitlet `efterKod`, i bokens ordning. */
function lektionerEfterDelkapitel(s: Struktur, amneId: string, efterKod: string): Array<{ nyckel: string; kod: string }> {
  const a = hittaAmne(s, amneId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (bok === undefined) throw new Error('Ämnet saknar bok.');
  const kap = Number(efterKod.split('.')[0]);
  const grans = kodTal(efterKod);
  return planeringsRader(bok, { ...a, lektionsVal: undefined, planFranUtkast: undefined })
    .filter((r) => r.kapitel === kap && !r.nyckel.startsWith('er:'))
    .map((r) => ({ nyckel: r.nyckel, kod: delkapitelKod(r.lektion.avsnitt) }))
    .filter((x): x is { nyckel: string; kod: string } => x.kod !== null && Number(x.kod.split('.')[0]) === kap && kodTal(x.kod) > grans);
}

export interface KapitelSlut {
  kapitel: number;
  /** Sista delkapitlet som är med ('6.5'). */
  efter: string;
  /** Delkapitlen som tas bort ('6.6', '6.7', '6.8'). */
  bort: string[];
  /** Lektioner som tas bort (de som ligger i planeringen), och hur många av dem som har varit. */
  lektioner: number;
  genomforda: number;
}

/** Förhandsvisning: vad som tas bort om kapitlet avslutas efter `efterKod`. */
export function kapitelSlutFor(s: Struktur, amneId: string, efterKod: string, idag?: string): KapitelSlut {
  if (!/^\d+\.\d+$/.test(efterKod)) throw new Error('Ange ett delkapitel som 6.5.');
  const efter = lektionerEfterDelkapitel(s, amneId, efterKod);
  const p = amnesPlanFor(s, amneId, idag, false);
  const datum = new Map<string, string>();
  for (const r of [...(p?.a ?? []), ...(p?.b ?? [])]) if (r.nyckel !== undefined && r.datum !== null && (datum.get(r.nyckel) ?? '9999') > r.datum) datum.set(r.nyckel, r.datum);
  const iPlan = efter.filter((x) => datum.has(x.nyckel));
  const genomforda = idag === undefined ? 0 : iPlan.filter((x) => datum.get(x.nyckel)! < idag).length;
  return { kapitel: Number(efterKod.split('.')[0]), efter: efterKod, bort: [...new Set(iPlan.map((x) => x.kod))], lektioner: iPlan.length, genomforda };
}

/**
 * Avslutar kapitlet efter delkapitlet `efterKod` (t.ex. 6.5): alla lektioner på de följande
 * delkapitlen i samma kapitel (6.6, 6.7, 6.8 — även extra lektioner) tas bort och nästa kapitel
 * följer direkt; kapitlets prov, diagnoser och egna rader ligger kvar på sina datum. Har några av
 * lektionerna varit krävs `tillatGenomford` — de följande lektionerna flyttas då tidigare.
 */
export function avslutaKapitelEfter(s: Struktur, amneId: string, efterKod: string, idag?: string, tillatGenomford = false): BorttagnaLektioner {
  const info = kapitelSlutFor(s, amneId, efterKod, idag);
  if (info.lektioner === 0) throw new Error(`Kapitel ${info.kapitel} har inga delkapitel efter ${efterKod} i planeringen.`);
  if (info.genomforda > 0 && !tillatGenomford) throw new Error(`${info.genomforda} av lektionerna har varit — bekräfta att även genomförda lektioner får tas bort.`);
  const nycklar = lektionerEfterDelkapitel(s, amneId, efterKod).map((x) => x.nyckel);
  const r = taBortLektioner(s, amneId, nycklar, idag, tillatGenomford);
  // Lektioner som inte låg i planeringen (ryms ej) märks också bort, så att delkapitlet räknas som borttaget
  const a = hittaAmne(r.s, amneId);
  const lv = { ...(a.lektionsVal ?? {}) };
  let fler = false;
  for (const n of nycklar) if (lv[n]?.bort !== true) { lv[n] = { ...(lv[n] ?? {}), bort: true }; fler = true; }
  return fler ? { ...r, s: andraPlanering(r.s, amneId, { lektionsVal: lv }, idag) } : r;
}

/** Delkapitel i kapitlet som är borttagna ur planeringen (alla lektioner märkta bort), i ordning. */
export function borttagnaDelkapitel(s: Struktur, amneId: string, kapitel: number): string[] {
  const a = hittaAmne(s, amneId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (bok === undefined) return [];
  const per = new Map<string, { alla: number; borta: number }>();
  for (const r of planeringsRader(bok, { ...a, lektionsVal: undefined, planFranUtkast: undefined })) {
    if (r.kapitel !== kapitel || r.nyckel.startsWith('er:')) continue;
    const kod = delkapitelKod(r.lektion.avsnitt);
    if (kod === null) continue;
    const x = per.get(kod) ?? { alla: 0, borta: 0 };
    x.alla += 1; if (a.lektionsVal?.[r.nyckel]?.bort === true) x.borta += 1;
    per.set(kod, x);
  }
  return [...per.entries()].filter(([, x]) => x.alla > 0 && x.borta === x.alla).map(([k]) => k).sort((x, y) => kodTal(x) - kodTal(y));
}

export interface KapitelAterstallning {
  kapitel: number;
  koder: string[];
  lektioner: number;
  /** Passet de läggs in på (efter kapitlets sista kvarvarande lektion); null när inget ryms. */
  fran: string | null;
  /** Insättningspunkten ligger före idag — kräver tillatGenomford. */
  genomford: boolean;
  /** Datum för kapitlets sista kvarvarande delkapitel-lektion (de återställda läggs efter den). */
  sistaDatum: string | null;
}

/** Förhandsvisning av ↺ Återställ kapitlet: vilka delkapitel som läggs in igen och var (efter kapitlets sista kvarvarande delkapitel). */
export function kapitelAterstallningFor(s: Struktur, amneId: string, kapitel: number, idag?: string): KapitelAterstallning {
  const a = hittaAmne(s, amneId);
  const koder = borttagnaDelkapitel(s, amneId, kapitel);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  const nycklar = bok === undefined ? [] : planeringsRader(bok, { ...a, lektionsVal: undefined, planFranUtkast: undefined })
    .filter((r) => r.kapitel === kapitel && a.lektionsVal?.[r.nyckel]?.bort === true).map((r) => r.nyckel);
  const plan = (amnesPlanFor(s, amneId, idag, false)?.a ?? []).filter((r) => r.datum !== null && r.nyckel !== undefined);
  // Insättningspunkt: efter kapitlets sista kvarvarande delkapitel-lektion (före Finalen, prov och andra
  // avslutande rader i kapitlet), på nästa teoripass som inte är ett fast kort
  let sista = -1;
  plan.forEach((r, i) => { if (r.kapitel === kapitel && !r.nyckel!.startsWith('u:') && !r.nyckel!.startsWith('er:') && delkapitelKod(r.lektion.avsnitt) !== null) sista = i; });
  const nasta = plan.slice(sista + 1).find((r) => !arLab(r.nyckel!) && !arPass(r.nyckel!) && !arFastKort(a, r.nyckel!));
  const sistaDatum = sista >= 0 ? plan[sista].datum : null;
  const fran = nasta?.datum ?? sistaDatum ?? plan[plan.length - 1]?.datum ?? null;
  return { kapitel, koder, lektioner: nycklar.length, fran, genomford: idag !== undefined && fran !== null && fran < idag, sistaDatum };
}

/**
 * Tar tillbaka kapitlets borttagna delkapitel: bort-märkningarna hävs och lektionerna läggs in i bokens
 * ordning direkt efter kapitlets sista kvarvarande delkapitel (före Finalen/prov); det som låg där
 * flyttas senare, fasta kort ligger kvar. Ligger insättningspunkten före idag krävs `tillatGenomford`.
 */
export function aterstallKapitel(s: Struktur, amneId: string, kapitel: number, idag?: string, tillatGenomford = false): Struktur {
  const a = hittaAmne(s, amneId);
  const bok = s.bocker.find((b) => b.id === a.bokId);
  if (bok === undefined) throw new Error('Ämnet saknar bok.');
  const info = kapitelAterstallningFor(s, amneId, kapitel, idag);
  if (info.lektioner === 0) return s;
  if (info.genomford && !tillatGenomford) throw new Error('Delkapitlen skulle läggas in på pass som har varit — bekräfta att genomförda lektioner får skrivas om.');
  const nycklar = planeringsRader(bok, { ...a, lektionsVal: undefined, planFranUtkast: undefined })
    .filter((r) => r.kapitel === kapitel && a.lektionsVal?.[r.nyckel]?.bort === true).map((r) => r.nyckel);
  const lv = { ...(a.lektionsVal ?? {}) };
  for (const n of nycklar) { const { bort: _b, ...rest } = lv[n]; void _b; if (Object.keys(rest).length === 0) delete lv[n]; else lv[n] = rest; }
  const st = andraPlanering(s, amneId, { lektionsVal: lv }, idag);
  if (hittaAmne(st, amneId).planFranUtkast === undefined || info.fran === null) return st;   // ingen utkastordning: boken styr igen
  const fran = info.fran;
  const dag = idag !== undefined && fran < idag ? undefined : idag;
  const u0 = utkastFranPlan(st, amneId, fran, dag, `Kapitel ${kapitel} återställt ${fran}`);
  const fasta = fastaKortFran(st, amneId, fran, dag);
  const fastaNycklar = new Set(fasta.values());
  const redan = new Set(u0.teori);
  // Kön: det som ligger på eller före insättningspunkten först (finns inget pass efter kapitlets sista
  // delkapitel är startpasset självt kvar i kön), sedan de återställda, sedan resten
  const datumAv = new Map((amnesPlanFor(st, amneId, dag, false)?.a ?? []).filter((r) => r.nyckel !== undefined && r.datum !== null).map((r) => [r.nyckel!, r.datum!]));
  const sistaDatum = info.sistaDatum ?? '';
  const fore = u0.teori.filter((n) => !fastaNycklar.has(n) && (datumAv.get(n) ?? '9999') <= sistaDatum);
  const efter = u0.teori.filter((n) => !fastaNycklar.has(n) && (datumAv.get(n) ?? '9999') > sistaDatum);
  const ko = [...fore, ...nycklar.filter((n) => !redan.has(n)), ...efter];
  const teori = laggUtTeori(st, amneId, fran, ko, fasta, dag);
  return tillampaUtkast(st, amneId, { ...u0, teori }, dag);
}

// ── Del 187 · Schemabrytande aktiviteter ─────────────────────

export interface AktivitetPaverkan {
  amneId: string;
  /** '8A Matematik'. */
  amne: string;
  /** Lektionspass som aktiviteten tar (eller lämnar tillbaka vid borttag). */
  pass: number;
  /** Lärarens fasta kort (prov, diagnoser, egna rader) som ligger kvar på sina pass. */
  fasta: number;
}

export interface AktivitetResultat {
  s: Struktur;
  /** Ämnen vars pass berörs. */
  berorda: AktivitetPaverkan[];
  varningar: string[];
}

/** Ämnen i skolåret som aktiviteten gäller (klassens ämnen, eller alla klassers). */
function aktivitetensAmnen(s: Struktur, skolarId: string, akt: SchemaAktivitet): Amne[] {
  const tjanster = new Set(s.tjanster.filter((t) => t.skolarId === skolarId).map((t) => t.id));
  const klasser = new Set(s.klasser.filter((k) => tjanster.has(k.tjanstId) && (akt.klassIds === undefined || akt.klassIds.length === 0 || akt.klassIds.includes(k.id))).map((k) => k.id));
  return s.amnen.filter((a) => klasser.has(a.klassId));
}

/** Ämnets veckopass den dagen som överlappar aktiviteten. */
function passSomTas(a: Amne, akt: SchemaAktivitet): Array<{ start: string; slut: string }> {
  const d = new Date(`${akt.datum}T00:00:00Z`).getUTCDay();
  const veckodag = d === 0 ? 7 : d;
  return [...a.schema, ...(a.schemaB ?? [])].filter((p) => p.dag === veckodag && p.start < akt.slut && p.slut > akt.start);
}

function bytAktiviteter(s: Struktur, skolarId: string, ny: Skolar, akt: SchemaAktivitet, idag: string | undefined, laggTill: boolean): AktivitetResultat {
  const klassNamn = new Map(s.klasser.map((k) => [k.id, k.namn]));
  const s2bas: Struktur = { ...s, skolar: s.skolar.map((x) => (x.id === skolarId ? ny : x)) };
  let ut = s2bas;
  const berorda: AktivitetPaverkan[] = []; const varningar: string[] = [];
  for (const a of aktivitetensAmnen(s, skolarId, akt)) {
    const pass = passSomTas(a, akt);
    if (pass.length === 0) continue;
    const namn = `${klassNamn.get(a.klassId) ?? ''} ${a.namn}`.trim();
    let fore: ReturnType<typeof amnesPlanFor> = null;
    try { fore = amnesPlanFor(s, a.id, idag, false); } catch { fore = null; }
    if (fore === null) { berorda.push({ amneId: a.id, amne: namn, pass: pass.length, fasta: 0 }); continue; }
    // Lärarens fasta kort ligger kvar på sina pass; ett fast kort på ett pass som aktiviteten tar flyttas till nästa pass
    const fasta = fastaKortFran(s, a.id, akt.datum, idag);
    const u0 = utkastFranPlan(s, a.id, akt.datum, idag, `${laggTill ? 'Med' : 'Utan'} ${akt.label} ${akt.datum}`);
    const tagna = new Set(laggTill ? pass.map((p) => passNyckelFor(akt.datum, p.start)) : []);
    const flyttas: string[] = [];
    for (const [k, n] of [...fasta]) if (tagna.has(k)) { fasta.delete(k); flyttas.push(n); }
    berorda.push({ amneId: a.id, amne: namn, pass: pass.length, fasta: fasta.size });
    if (fasta.size === 0 && flyttas.length === 0) continue;   // inga fasta kort: lektionerna flyttas av sig själva
    const fastaNycklar = new Set(fasta.values());
    const ko = u0.teori.filter((n) => !fastaNycklar.has(n));
    const teori = laggUtTeori(ut, a.id, akt.datum, ko, fasta, idag);
    ut = tillampaUtkast(ut, a.id, { ...u0, teori }, idag);
    for (const n of flyttas) {
      const rubrik = (fore.a.find((r) => r.nyckel === n)?.lektion.avsnitt) ?? n;
      varningar.push(`${namn}: "${rubrik}" låg på ett pass som ${akt.label} tar — kortet flyttades till nästa pass.`);
    }
  }
  return { s: ut, berorda, varningar };
}

/**
 * Del 187 · Lägger till en schemabrytande aktivitet (datum, från–till, valfria klasser). Pass som
 * överlappar tiden används inte; lektionerna flyttas till nästa pass, lärarens fasta kort (prov,
 * diagnoser, egna rader) ligger kvar på sina datum. Genomförda dagar ändras aldrig.
 */
export function laggTillSchemaAktivitet(s: Struktur, skolarId: string, akt: Omit<SchemaAktivitet, 'id'> & { id?: string }, idag?: string): AktivitetResultat {
  const la = s.skolar.find((x) => x.id === skolarId);
  if (la === undefined) throw new Error('Okänt skolår.');
  const ny = laggTillAktivitet(la, akt, idag);
  const lagd = (ny.aktiviteter ?? []).find((x) => x.datum === akt.datum && x.start === akt.start && x.label === akt.label.trim() && (akt.id === undefined || x.id === akt.id))!;
  return bytAktiviteter(s, skolarId, ny, lagd, idag, true);
}

export interface AktivitetsPeriod {
  fran: string; till: string;
  /** 'HH:MM' — SKOLDAG_START (00:00) betyder från skoldagens början. */
  start: string;
  /** 'HH:MM' — SKOLDAG_SLUT (23:59) betyder resten av skoldagen. */
  slut: string;
  label: string;
  klassIds?: string[];
}

export interface PeriodResultat extends AktivitetResultat { grupp: string; dagar: string[] }

/**
 * Del 204 · Tid som försvinner från schemat under en period: en aktivitet per skoldag (mån–fre, inte lov
 * eller röda dagar) från `fran` till `till`, mellan `start` och `slut` (hela dagen med SKOLDAG_START/SLUT).
 * Alla dagarna delar en grupp så att perioden kan tas bort i ett svep. Berörda lektioner flyttas till
 * nästa pass, fasta kort ligger kvar — som för en enskild aktivitet.
 */
export function laggTillSchemaPeriod(s: Struktur, skolarId: string, p: AktivitetsPeriod, idag?: string, tillatGenomford = false): PeriodResultat {
  // Del 205: med tillatGenomford skrivs även pass som varit om — lärarens uttryckliga val
  if (tillatGenomford) idag = undefined;
  const la = s.skolar.find((x) => x.id === skolarId);
  if (la === undefined) throw new Error('Okänt skolår.');
  if (!DATUM.test(p.fran) || !DATUM.test(p.till)) throw new Error('Ange datum (ÅÅÅÅ-MM-DD) för från och till.');
  if (p.till < p.fran) throw new Error('Slutdatumet ligger före startdatumet.');
  if (p.label.trim() === '') throw new Error('Ge aktiviteten ett namn.');
  if (idag !== undefined && p.fran < idag) throw new Error('Startdatumet har redan varit — genomförda lektioner ändras aldrig. Välj idag eller senare.');
  const dagar = skoldagarMellan(la, p.fran, p.till);
  if (dagar.length === 0) throw new Error('Inga skoldagar i perioden (helg, lov eller utanför skolåret).');
  const grupp = `per-${p.fran}-${p.till}-${p.start.replace(':', '')}-${((la.aktiviteter ?? []).length + 1).toString(36)}`;
  let ut = s; const berorda = new Map<string, AktivitetPaverkan>(); const varningar: string[] = [];
  for (const datum of dagar) {
    const r = laggTillSchemaAktivitet(ut, skolarId, { datum, start: p.start, slut: p.slut, label: p.label, grupp, ...(p.klassIds !== undefined && p.klassIds.length > 0 ? { klassIds: p.klassIds } : {}) }, idag);
    ut = r.s;
    for (const b of r.berorda) { const x = berorda.get(b.amneId); berorda.set(b.amneId, x === undefined ? { ...b } : { ...x, pass: x.pass + b.pass, fasta: Math.max(x.fasta, b.fasta) }); }
    varningar.push(...r.varningar);
  }
  return { s: ut, berorda: [...berorda.values()], varningar, grupp, dagar };
}

/** Del 204 · Tar bort alla aktiviteter i en grupp (en period) — bara kommande dagar; dagar som varit lämnas. */
export function taBortSchemaPeriod(s: Struktur, skolarId: string, grupp: string, idag?: string, tillatGenomford = false): AktivitetResultat & { borttagna: number; kvar: number } {
  if (tillatGenomford) idag = undefined;
  const la = s.skolar.find((x) => x.id === skolarId);
  if (la === undefined) throw new Error('Okänt skolår.');
  const mina = (la.aktiviteter ?? []).filter((a) => a.grupp === grupp);
  if (mina.length === 0) throw new Error('Perioden finns inte.');
  let ut = s; const berorda = new Map<string, AktivitetPaverkan>(); const varningar: string[] = []; let borttagna = 0; let kvar = 0;
  for (const a of mina) {
    if (idag !== undefined && a.datum < idag) { kvar += 1; continue; }
    const r = taBortSchemaAktivitet(ut, skolarId, a.id, idag);
    ut = r.s; borttagna += 1;
    for (const b of r.berorda) { const x = berorda.get(b.amneId); berorda.set(b.amneId, x === undefined ? { ...b } : { ...x, pass: x.pass + b.pass, fasta: Math.max(x.fasta, b.fasta) }); }
    varningar.push(...r.varningar);
  }
  return { s: ut, berorda: [...berorda.values()], varningar, borttagna, kvar };
}

/** Del 187 · Tar bort en kommande aktivitet: passen används igen, fasta kort ligger kvar. */
export function taBortSchemaAktivitet(s: Struktur, skolarId: string, id: string, idag?: string): AktivitetResultat {
  const la = s.skolar.find((x) => x.id === skolarId);
  if (la === undefined) throw new Error('Okänt skolår.');
  const akt = (la.aktiviteter ?? []).find((x) => x.id === id);
  if (akt === undefined) throw new Error('Aktiviteten finns inte.');
  const ny = taBortAktivitet(la, id, idag);
  return bytAktiviteter(s, skolarId, ny, akt, idag, false);
}
