/**
 * SuperTeach · Resultat — ren domänlogik (Ring 1, I2: ingen fetch/DOM/lagring).
 *
 * Tar emot NORMALISERADE rader (namn + poäng) från valfri källa — Socrative-
 * export (xlsx), Magma-resultat (xlsx), DigiExam — och matchar dem mot
 * klassens elever. Själva filparsningen sker i UI-lagret (adaptrar);
 * här bor matchning, krav och sammanställning.
 *
 * BAM-kraven: läxförhör ≥ 90 %, exit ticket ≥ 70 %. Magma/DigiExam har inget
 * fast krav — de bedöms i sitt sammanhang.
 */
import type { Elev, PlaneradLektion, Struktur } from './typer.js';
import { nyttId } from './struktur.js';
import { koderForProv } from './delkapitelkoder.js';

/**
 * Källa/testtyp. Socrative-testerna delas i tre typer: läxförhör (början av
 * lektionen, aggregerande), exit ticket (slutet, dagens avsnitt) och övning
 * (allt annat — extrapass, hemläxa, omtag utan lektionstid).
 */
export type ResultatKalla = 'socrative-laxforhor' | 'socrative-exit' | 'socrative-ovning' | 'magma' | 'digiexam';

/** Kort typnamn som i lärarens kalkylblad: Läxförhör · Exit · Övning. */
export const TYPNAMN: Record<ResultatKalla, string> = {
  'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit', 'socrative-ovning': 'Övning',
  magma: 'Magma', digiexam: 'DigiExam',
};

/** Ett provresultat för en elev — alltid kopplat till en matchad elev. */
export interface Resultat {
  id: string;
  elevId: string;
  /** Ämnet resultatet hör till (valfritt — quiz kan vara ämnesöverskridande). */
  amneId?: string;
  kalla: ResultatKalla;
  /** Quiz-/testnamn, t.ex. 'Quiz 1.1a', 'Biologi612' eller Magma-testets namn. */
  prov: string;
  /** ISO-datum (YYYY-MM-DD) när provet genomfördes. */
  datum: string;
  /** Klockslag HH:MM (svensk tid) när det är känt, t.ex. ur Socrative-filnamnet. */
  tid?: string;
  /** Socrative-rum där quizet kördes ('Biologi41') — planens nyckel för förhöret. */
  rum?: string;
  /** Svar per fråga när rapporten innehåller frågekolumner. */
  svar?: FragaSvar[];
  poang: number;
  maxPoang: number;
}

/** En rad ur en resultatfil, före elevmatchning. */
/** Ett svar på en enskild fråga. */
export interface FragaSvar { fraga: string; svar: string; ratt: boolean | null; }
export interface ImportRad { namn: string; poang: number; maxPoang: number; /** Student ID ur Socrative-rapporten (valfritt). */ sidId?: string; svar?: FragaSvar[]; }

export interface ImportUnderlag {
  klassId: string;
  kalla: ResultatKalla;
  prov: string;
  datum: string;
  /** Klockslag HH:MM (valfritt). */
  tid?: string;
  /** Socrative-rum (valfritt). */
  rum?: string;
  amneId?: string;
  rader: ImportRad[];
}

export interface ImportUtfall {
  s: Struktur;
  /** Antal rader som matchades mot en elev. */
  traffar: number;
  /** Namn som inte kunde matchas — visas för läraren för manuell hantering. */
  omatchade: string[];
}

/** BAM-kravet för en källa i procent, eller null när inget fast krav finns. */
export function kravFor(kalla: ResultatKalla): number | null {
  if (kalla === 'socrative-laxforhor') return 90;
  if (kalla === 'socrative-exit') return 70;
  return null;
}

/** Resultatets procent (0–100, avrundad till heltal); null vid maxPoang 0. */
export function resultatProcent(r: Pick<Resultat, 'poang' | 'maxPoang'>): number | null {
  if (r.maxPoang <= 0) return null;
  return Math.round((r.poang / r.maxPoang) * 100);
}

/** true/false mot källans BAM-krav; null när källan saknar krav eller procent saknas. */
export function klaratKrav(r: Pick<Resultat, 'poang' | 'maxPoang' | 'kalla'>): boolean | null {
  const krav = kravFor(r.kalla);
  const pct = resultatProcent(r);
  if (krav === null || pct === null) return null;
  return pct >= krav;
}

/** Normaliserar ett elevnamn för matchning: gemener, enkla mellanslag, utan kommatecken. */
function normalisera(namn: string): string {
  return namn.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Ordningsoberoende nyckel: 'Anna Berg', 'Berg, Anna' och 'BERG anna' blir samma. */
function namnNyckel(namn: string): string {
  return normalisera(namn).split(' ').sort().join(' ');
}

/**
 * Matchar ett namn ur en resultatfil mot klassens elever. Ett Student ID
 * som finns i rostern (`socrativeId`) vinner alltid.
 * Exakt (normaliserad) träff vinner; annars ordningsoberoende ('Efternamn, Förnamn');
 * annars entydig förnamnsträff (Socrative låter elever skriva bara förnamn).
 */
export function matchaElev(s: Struktur, klassId: string, namn: string, sidId?: string): Elev | null {
  const elever = s.elever.filter((e) => e.klassId === klassId);
  if (sidId !== undefined && sidId.trim() !== '') {
    const viaId = elever.filter((e) => (e.socrativeId ?? '').toLowerCase().trim() === sidId.toLowerCase().trim());
    if (viaId.length === 1) return viaId[0];
  }
  const mal = normalisera(namn);
  if (mal.includes('@')) {
    const viaEpost = elever.find((e) => (e.epost ?? '').toLowerCase().trim() === mal);
    if (viaEpost) return viaEpost;
  }
  const exakt = elever.find((e) => normalisera(e.namn) === mal);
  if (exakt) return exakt;
  const nyckel = namnNyckel(namn);
  const flippad = elever.filter((e) => namnNyckel(e.namn) === nyckel);
  if (flippad.length === 1) return flippad[0];
  const fornamn = elever.filter((e) => normalisera(e.namn).split(' ')[0] === mal);
  if (fornamn.length === 1) return fornamn[0];
  return null;
}

/**
 * Importerar en resultatomgång. Matchade rader blir Resultat på strukturen;
 * en ny import av samma (elev, källa, prov) ERSÄTTER det gamla resultatet
 * (omkörningar och rättade filer skriver inte dubbletter). Omatchade namn
 * returneras för manuell hantering — de tystas aldrig bort.
 */
export function importeraResultat(s: Struktur, u: ImportUnderlag): ImportUtfall {
  if (!s.klasser.some((k) => k.id === u.klassId)) throw new Error('Okänd klass.');
  if (u.amneId !== undefined && !s.amnen.some((a) => a.id === u.amneId && a.klassId === u.klassId)) {
    throw new Error('Okänt ämne för klassen.');
  }
  if (u.prov.trim() === '') throw new Error('Provet måste ha ett namn.');
  const omatchade: string[] = [];
  const nya: Resultat[] = [];
  for (const rad of u.rader) {
    const elev = matchaElev(s, u.klassId, rad.namn, rad.sidId);
    if (elev === null) { omatchade.push(rad.namn); continue; }
    nya.push({
      id: nyttId('res'), elevId: elev.id, kalla: u.kalla, prov: u.prov.trim(),
      datum: u.datum, poang: rad.poang, maxPoang: rad.maxPoang,
      ...(u.tid !== undefined ? { tid: u.tid } : {}),
      ...(u.rum !== undefined ? { rum: u.rum } : {}),
      ...(rad.svar !== undefined && rad.svar.length > 0 ? { svar: rad.svar } : {}),
      ...(u.amneId !== undefined ? { amneId: u.amneId } : {}),
    });
  }
  const ersatta = new Set(nya.map((r) => `${r.elevId}|${r.kalla}|${r.prov}`));
  const kvar = (s.resultat ?? []).filter((r) => !ersatta.has(`${r.elevId}|${r.kalla}|${r.prov}`));
  return { s: { ...s, resultat: [...kvar, ...nya] }, traffar: nya.length, omatchade };
}

/** Alla resultat för en elev, senaste datum först. */
export function resultatForElev(s: Struktur, elevId: string): Resultat[] {
  return (s.resultat ?? [])
    .filter((r) => r.elevId === elevId)
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov));
}

export interface ProvRad { elev: Elev; resultat: Resultat | null; }

/** Klassens sammanställning för ett prov: en rad per elev (null = saknar resultat). */
export function provSammanstallning(s: Struktur, klassId: string, prov: string): ProvRad[] {
  const perElev = new Map((s.resultat ?? []).filter((r) => r.prov === prov).map((r) => [r.elevId, r]));
  return s.elever
    .filter((e) => e.klassId === klassId)
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((elev) => ({ elev, resultat: perElev.get(elev.id) ?? null }));
}

/** Alla provnamn som förekommer för en klass, i bokstavsordning per källa. */
export function provLista(s: Struktur, klassId: string): Array<{ kalla: ResultatKalla; prov: string }> {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klassId).map((e) => e.id));
  const set = new Map<string, { kalla: ResultatKalla; prov: string }>();
  for (const r of s.resultat ?? []) {
    if (elevIds.has(r.elevId)) set.set(`${r.kalla}|${r.prov}`, { kalla: r.kalla, prov: r.prov });
  }
  return [...set.values()].sort((a, b) => a.kalla.localeCompare(b.kalla) || a.prov.localeCompare(b.prov, 'sv'));
}

// ── Aggregering: ämnesvis och över alla aktuella ämnen, med källfilter ──

/** Filter för resultatvyer: ämne och/eller källor (Exit, Läxförhör, Magma, DigiExam). */
export interface ResultatFilter { amneId?: string; kallor?: ResultatKalla[]; }

function matcharFilter(r: Resultat, f: ResultatFilter | undefined): boolean {
  if (f?.amneId !== undefined && r.amneId !== f.amneId) return false;
  if (f?.kallor !== undefined && f.kallor.length > 0 && !f.kallor.includes(r.kalla)) return false;
  return true;
}

/** Alla resultat som matchar filtret, senaste datum först. */
export function filtreraResultat(s: Struktur, f?: ResultatFilter): Resultat[] {
  return (s.resultat ?? [])
    .filter((r) => matcharFilter(r, f))
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.prov.localeCompare(b.prov, 'sv'));
}

/** Sammandrag för en källa: antal prov, snittprocent och klarade krav. */
export interface KallAggregat {
  kalla: ResultatKalla;
  antal: number;
  /** Snitt av resultatens procent; null när inget resultat har maxpoäng. */
  snittProcent: number | null;
  /** Antal som klarade källans BAM-krav (endast källor med krav). */
  klarade: number;
  /** Antal resultat som kunde bedömas mot kravet. */
  medKrav: number;
}

const ALLA_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'magma', 'digiexam'];

function aggregera(resultat: Resultat[]): KallAggregat[] {
  return ALLA_KALLOR.map((kalla) => {
    const rs = resultat.filter((r) => r.kalla === kalla);
    const procenten = rs.map(resultatProcent).filter((p): p is number => p !== null);
    const bedomda = rs.map(klaratKrav).filter((k): k is boolean => k !== null);
    return {
      kalla,
      antal: rs.length,
      snittProcent: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      klarade: bedomda.filter(Boolean).length,
      medKrav: bedomda.length,
    };
  }).filter((a) => a.antal > 0);
}

/** En elevs sammandrag per källa, valfritt begränsat till ett ämne/källor. */
export function aggregatForElev(s: Struktur, elevId: string, f?: ResultatFilter): KallAggregat[] {
  return aggregera((s.resultat ?? []).filter((r) => r.elevId === elevId && matcharFilter(r, f)));
}

/** En rad per elev i en översikt: sammandrag per källa + totalsnitt. */
export interface ElevAggregatRad {
  elev: Elev;
  perKalla: KallAggregat[];
  snittProcent: number | null;
}

function oversiktFor(s: Struktur, elever: Elev[], f: ResultatFilter | undefined): ElevAggregatRad[] {
  return elever
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'))
    .map((elev) => {
      const rs = (s.resultat ?? []).filter((r) => r.elevId === elev.id && matcharFilter(r, f));
      const procenten = rs.map(resultatProcent).filter((p): p is number => p !== null);
      return {
        elev,
        perKalla: aggregera(rs),
        snittProcent: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      };
    });
}

/** Ämnesvis översikt: klassens elever × källor för ETT ämne. */
export function amnesOversikt(s: Struktur, amneId: string, kallor?: ResultatKalla[]): ElevAggregatRad[] {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (!amne) throw new Error('Okänt ämne.');
  const elever = s.elever.filter((e) => e.klassId === amne.klassId);
  return oversiktFor(s, elever, { amneId, ...(kallor !== undefined ? { kallor } : {}) });
}

/** Aggregerad översikt över ALLA aktuella ämnen för en klass, med källfilter. */
export function klassOversikt(s: Struktur, klassId: string, f?: ResultatFilter): ElevAggregatRad[] {
  return oversiktFor(s, s.elever.filter((e) => e.klassId === klassId), f);
}

// ── Filregister: vilka resultatfiler som importerats, per ämne ──

/** En importerad resultatfil — appen minns filerna så inget importeras dubbelt eller glöms. */
export interface FilPost {
  id: string;
  amneId: string;
  /** Filnamnet som det ser ut i mappen, t.ex. 'Matte8B Quiz 1.1a.xlsx'. */
  filnamn: string;
  /** ISO-tidpunkt när filen importerades i appen. */
  importerad: string;
  /** Provdatum (YYYY-MM-DD) som filen klassificerades till — matchar planeringens förväntade prov på datum. */
  datum?: string;
  /** Antal resultat som matchade elever vid importen; 0 betyder att filen bör importeras om när eleverna finns. */
  traffar?: number;
  /** Socrative-rum ('Biologi41'). */
  rum?: string;
  kalla: ResultatKalla;
  prov: string;
}

/** Registrerar en importerad fil; samma (ämne, filnamn) ersätts vid omimport. */
export function registreraFil(s: Struktur, post: Omit<FilPost, 'id'>): Struktur {
  if (!s.amnen.some((a) => a.id === post.amneId)) throw new Error('Okänt ämne.');
  const kvar = (s.filregister ?? []).filter((f) => !(f.amneId === post.amneId && f.filnamn === post.filnamn));
  return { ...s, filregister: [...kvar, { ...post, id: nyttId('fil') }] };
}

/** Har filen redan importerats för ämnet? Skanning av mappen hoppar då över den. */
export function arFilRegistrerad(s: Struktur, amneId: string, filnamn: string): boolean {
  return (s.filregister ?? []).some((f) => f.amneId === amneId && f.filnamn === filnamn);
}

/**
 * Sant när filen är registrerad OCH gav minst ett resultat. En fil som importerades
 * innan klassens elever fanns (0 träffar) räknas inte som klar utan erbjuds igen.
 */
export function arFilImporterad(s: Struktur, amneId: string, filnamn: string): boolean {
  const post = (s.filregister ?? []).find((f) => f.amneId === amneId && f.filnamn === filnamn);
  if (post === undefined) return false;
  if (post.traffar !== undefined) return post.traffar > 0;
  // Äldre poster utan traffar: klar om något resultat finns för provet
  return (s.resultat ?? []).some((r) => r.amneId === amneId && r.kalla === post.kalla && r.prov === post.prov);
}

// ── Förväntningar ur planeringen: vilka prov BORDE ha resultat nu? ──

/** Ett prov som planeringen säger ska ha genomförts (datum har passerat). */
export interface ForvantatProv { datum: string; kalla: ResultatKalla; prov: string; avsnitt: string; }

/**
 * Läser ämnets plan och listar alla läxförhör (soc_start) och exit tickets
 * (exit) på lektioner med datum till och med `idag`. '—' och tomt ignoreras.
 */
export function forvantadeProv(plan: PlaneradLektion[], idag: string): ForvantatProv[] {
  const ut: ForvantatProv[] = [];
  for (const r of plan) {
    if (r.datum === null || r.datum > idag) continue;
    const soc = r.lektion.socStart;
    if (soc !== '—' && soc.trim() !== '') {
      ut.push({ datum: r.datum, kalla: 'socrative-laxforhor', prov: soc, avsnitt: r.lektion.avsnitt });
    }
    const exit = r.lektion.exit;
    if (exit !== '—' && exit.trim() !== '') {
      ut.push({ datum: r.datum, kalla: 'socrative-exit', prov: exit, avsnitt: r.lektion.avsnitt });
    }
  }
  return ut;
}

/**
 * Varningslistan: förväntade prov som varken har importerade resultat eller en
 * registrerad fil för ämnet — 'läxförhöret 2026-08-24 (Quiz 1.1a) saknar fil'.
 */
export function saknadeResultat(s: Struktur, amneId: string, plan: PlaneradLektion[], idag: string): ForvantatProv[] {
  const rs = (s.resultat ?? []).filter((r) => r.amneId === amneId);
  const norm = (x: string) => x.replace(/\s+/g, '').toUpperCase();
  // Planens fält ser ut som 'Biologi41234 (omtag)' — bara rumsnamnet ska matchas
  const rumMonster = /^\s*([A-Za-zÅÄÖåäö]+\d+)/;
  const rumAv = (falt: string): string => norm(rumMonster.exec(falt)?.[1] ?? falt);
  const koderAv = (prov: string, rum?: string): string => koderForProv(prov, rum).join(',');
  const dagDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const filer = (s.filregister ?? []).filter((f) => f.amneId === amneId && (f.traffar === undefined || f.traffar > 0));
  // En övning kan ersätta ett förväntat läxförhör eller exit ticket (samma begrepp
  // testade, bara i annan form); läxförhör och exit ticket ersätter inte varandra
  const poster = [
    ...rs.map((r) => ({ kalla: r.kalla, datum: r.datum, rum: r.rum !== undefined ? norm(r.rum) : null, prov: norm(r.prov), koder: koderAv(r.prov, r.rum) })),
    ...filer.map((f) => ({ kalla: f.kalla, datum: f.datum ?? '', rum: f.rum !== undefined ? norm(f.rum) : null, prov: norm(f.prov), koder: koderAv(f.prov, f.rum) })),
  ];
  const tacker = (p: ForvantatProv): boolean => {
    const rum = rumAv(p.prov);
    const koder = koderForProv(rum, rum).join(','); // rummet bär koderna (Biologi41234 → 4.1–4.4)
    const arRum = rumMonster.test(p.prov);
    return poster.some((x) => {
      const typOk = x.kalla === p.kalla || x.kalla === 'socrative-ovning';
      if (!typOk) return false;
      if (x.rum === rum || x.prov === rum) return true;                      // rummet stämmer
      if (x.kalla === p.kalla && x.datum === p.datum) return true;           // samma typ samma dag
      // Rumsnamn i planen (Biologi41234): samma delkapitel inom en vecka räcker —
      // quizet heter sällan som rummet och omtaget kan köras en annan dag
      return arRum && koder !== '' && x.koder === koder && x.datum !== '' && dagDiff(x.datum, p.datum) <= 7;
    });
  };
  const sedda = new Set<string>();
  return forvantadeProv(plan, idag).filter((p) => {
    if (tacker(p)) return false;
    const dubbel = `${p.kalla}|${p.datum}|${rumAv(p.prov)}`;
    if (sedda.has(dubbel)) return false;
    sedda.add(dubbel);
    return true;
  });
}

// ── Del 67: ta bort importerade filer och resultat ──────────

/** Tar bort en filpost och alla resultat den gav (samma ämne, källa och prov). Grafer töms när sista filen är borta. */
export function taBortFil(s: Struktur, filId: string): Struktur {
  const post = (s.filregister ?? []).find((f) => f.id === filId);
  if (post === undefined) return s;
  return {
    ...s,
    filregister: (s.filregister ?? []).filter((f) => f.id !== filId),
    resultat: (s.resultat ?? []).filter((r) => !(r.amneId === post.amneId && r.kalla === post.kalla && r.prov === post.prov
      && (post.rum === undefined || r.rum === undefined || r.rum === post.rum))),
  };
}

/** Rensar alla resultat och filposter för en klass (valfritt bara ett ämne). */
export function rensaResultat(s: Struktur, klassId: string, amneId?: string): Struktur {
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klassId).map((e) => e.id));
  const amnesIds = new Set(s.amnen.filter((a) => a.klassId === klassId && (amneId === undefined || a.id === amneId)).map((a) => a.id));
  const bort = (r: Resultat) => elevIds.has(r.elevId) && (amneId === undefined || r.amneId === amneId);
  return {
    ...s,
    resultat: (s.resultat ?? []).filter((r) => !bort(r)),
    filregister: (s.filregister ?? []).filter((f) => !amnesIds.has(f.amneId)),
  };
}

/** Källor som ingår i ett ämnes undervisning: Magma är ett matematikverktyg och visas inte i NO. */
export function amnesKallor(amnesNamn: string | undefined): ResultatKalla[] {
  const alla: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'socrative-ovning', 'magma', 'digiexam'];
  if (amnesNamn === undefined || amnesNamn.trim() === '') return alla;
  return /matematik|matte/i.test(amnesNamn) ? alla : alla.filter((k) => k !== 'magma');
}

/**
 * Byter testtyp på ett helt tillfälle — t.ex. märka ett quiz som Övning så
 * att det inte blandas ihop med lektionens läxförhör och exit ticket.
 * Matchar på ämne, provnamn och datum, och uppdaterar även filregistret.
 */
export function andraKalla(s: Struktur, val: { amneId: string; prov: string; datum: string; franKalla: ResultatKalla; tillKalla: ResultatKalla }): Struktur {
  const traff = (r: { amneId?: string; prov: string; datum?: string; kalla: ResultatKalla }): boolean =>
    r.amneId === val.amneId && r.prov === val.prov && r.kalla === val.franKalla && (r.datum === undefined || r.datum === val.datum);
  return {
    ...s,
    resultat: (s.resultat ?? []).map((r) => (traff(r) ? { ...r, kalla: val.tillKalla } : r)),
    filregister: (s.filregister ?? []).map((f) => (traff(f) ? { ...f, kalla: val.tillKalla } : f)),
  };
}


/** 'Godkänt' / 'Ej godkänt' / '—' — kravsiffran hör hemma i tooltip, inte i texten. */
export function godkantText(klarat: boolean | null): string {
  return klarat === null ? '—' : klarat ? 'Godkänt' : 'Ej godkänt';
}
