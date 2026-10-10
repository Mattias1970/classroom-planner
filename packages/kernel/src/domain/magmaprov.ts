/**
 * SuperTeach · Magma — ren tolkning av Magmas exporterade provresultat
 * (Ring 1, I2: ingen fetch/DOM/lagring; xlsx-avläsningen sker i UI-lagret
 * som skickar in kalkylbladet som en cellmatris).
 *
 * Filens form (Magma "Exportera resultat", ett blad döpt efter datumet):
 *   rad 1:      '' | '' | 1 | 2 | 3 | … | 16          (uppgiftsnummer)
 *   elevrader:  Förnamn | Efternamn | 1/0 per uppgift  (tomt = eleven gjorde inte provet)
 *
 * Det intressanta är vilka uppgifter som gick rätt (1) och fel (0) samt
 * andelen rätt. Omdömet följer lärarens skala:
 *   70 – <85 % Godkänt · 85 – <95 % Bra · 95 – 100 % Utmärkt · under 70 % Under godkänt.
 */
import { elevernaIKlassen } from './struktur.js';
import type { FragaSvar } from './resultat.js';
import type { Struktur } from './typer.js';

export type MagmaCell = string | number | boolean | null | undefined;

/** Omdömesgränserna i procent (inklusive nedre gräns). */
export const MAGMA_GRANSER = { godkant: 70, bra: 85, utmarkt: 95 } as const;

export type MagmaOmdome = 'Under godkänt' | 'Godkänt' | 'Bra' | 'Utmärkt';

/** Omdöme ur andelen rätt (0–100, ej avrundad så att 84,9 % blir Godkänt, inte Bra); null utan procent. */
export function magmaOmdome(procent: number | null): MagmaOmdome | null {
  if (procent === null || !Number.isFinite(procent)) return null;
  if (procent >= MAGMA_GRANSER.utmarkt) return 'Utmärkt';
  if (procent >= MAGMA_GRANSER.bra) return 'Bra';
  if (procent >= MAGMA_GRANSER.godkant) return 'Godkänt';
  return 'Under godkänt';
}

export interface MagmaUppgift {
  /** Uppgiftens nummer som det står i filen ('1', '2', '12b'). */
  nr: string;
  /** Kolumnindex i matrisen. */
  kolumn: number;
}

export interface MagmaElevRad {
  /** 'Förnamn Efternamn' — matchas mot rostern av resultat.ts. */
  namn: string;
  /** false när alla uppgiftsceller är tomma — eleven gjorde inte provet. */
  deltog: boolean;
  poang: number;
  maxPoang: number;
  /** Andel rätt 0–100 (ej avrundad); null när eleven inte deltog. */
  procent: number | null;
  /** Uppgift för uppgift: rätt/fel; null = ej besvarad. */
  svar: FragaSvar[];
  /** Uppgiftsnummer som gick fel — det läraren vill se snabbt. */
  fel: string[];
}

export interface MagmaRapport {
  /** Provdatum ur bladnamnet (YYYY-MM-DD) när det finns. */
  datum: string | null;
  uppgifter: MagmaUppgift[];
  rader: MagmaElevRad[];
}

function text(c: MagmaCell): string { return c === null || c === undefined ? '' : String(c).trim(); }

/** '1', '12', '3a', 'Uppgift 4', 'Uppg. 5b' → uppgiftsnummer; annars null. */
function uppgiftsNr(c: MagmaCell): string | null {
  const t = text(c);
  if (t === '') return null;
  const m = /^(?:uppg(?:ift)?\.?\s*|fråga\s*|nr\.?\s*)?(\d{1,3}\s*[a-z]?)$/i.exec(t);
  return m === null ? null : m[1].replace(/\s+/g, '').toLowerCase();
}

/** En uppgiftscell → poäng och rätt/fel. 1/0 är normalfallet; text som 'rätt'/'fel' och bråk '2/2' stöds också. */
function tolkaCell(c: MagmaCell): { poang: number; max: number; ratt: boolean | null; svar: string } | null {
  if (c === null || c === undefined) return null;
  if (typeof c === 'boolean') return { poang: c ? 1 : 0, max: 1, ratt: c, svar: c ? '1' : '0' };
  if (typeof c === 'number') {
    if (!Number.isFinite(c)) return null;
    return { poang: c, max: Math.max(1, c), ratt: c >= 1, svar: String(c) };
  }
  const t = c.trim();
  if (t === '' || t === '-' || t === '–') return null;
  const brak = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(t);
  if (brak !== null) {
    const p = Number(brak[1].replace(',', '.')); const m = Number(brak[2].replace(',', '.'));
    return { poang: p, max: m > 0 ? m : 1, ratt: m > 0 ? p >= m : null, svar: t };
  }
  const tal = Number(t.replace(',', '.').replace('%', ''));
  if (Number.isFinite(tal)) {
    if (t.includes('%')) return { poang: tal / 100, max: 1, ratt: tal >= 100, svar: t };
    return { poang: tal, max: Math.max(1, tal), ratt: tal >= 1, svar: t };
  }
  const l = t.toLowerCase();
  if (/^(rätt|ratt|korrekt|ja|yes|true|✓|✔|r)$/.test(l)) return { poang: 1, max: 1, ratt: true, svar: t };
  if (/^(fel|inkorrekt|nej|no|false|✗|✘|x|f)$/.test(l)) return { poang: 0, max: 1, ratt: false, svar: t };
  return null;
}

/** Bladnamn '2026-09-30' (eller '30/9/2026', '2026-09-30 Test') → 'YYYY-MM-DD'; annars null. */
export function magmaDatumUrBladnamn(bladnamn: string | null | undefined): string | null {
  const t = text(bladnamn);
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso !== null) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const sv = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
  if (sv !== null) return `${sv[3]}-${sv[2].padStart(2, '0')}-${sv[1].padStart(2, '0')}`;
  return null;
}

/** Filnamnet utan ändelse och understreck: '8b_1.4_-_1.5.xlsx' → '8b 1.4 - 1.5'. */
export function magmaProvnamnUrFilnamn(filnamn: string): string {
  return filnamn.replace(/\.(xlsx|xls|csv)$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tolkar en Magma-resultatexport ur en cellmatris. Kastar svenska fel.
 * Rubrikraden är den första raden med minst två uppgiftsnummer; namnet är
 * cellerna före första uppgiftskolumnen (förnamn + efternamn).
 */
export function tolkaMagmaRapport(celler: MagmaCell[][], bladnamn?: string | null): MagmaRapport {
  let rubrikIndex = -1;
  let uppgifter: MagmaUppgift[] = [];
  for (let i = 0; i < Math.min(celler.length, 30); i++) {
    const rad = celler[i] ?? [];
    const kand: MagmaUppgift[] = [];
    rad.forEach((c, k) => { const nr = uppgiftsNr(c); if (nr !== null) kand.push({ nr, kolumn: k }); });
    if (kand.length >= 2) { rubrikIndex = i; uppgifter = kand; break; }
  }
  if (rubrikIndex === -1) throw new Error('Hittar ingen rubrikrad med uppgiftsnummer (1, 2, 3 …) — är det en Magma-resultatexport?');
  const forstaKolumn = uppgifter[0].kolumn;
  if (forstaKolumn === 0) throw new Error('Rubrikraden har uppgiftsnummer i första kolumnen — namnkolumnerna saknas.');

  const rader: MagmaElevRad[] = [];
  for (let i = rubrikIndex + 1; i < celler.length; i++) {
    const rad = celler[i] ?? [];
    const namn = rad.slice(0, forstaKolumn).map(text).filter((x) => x !== '').join(' ').replace(/\s+/g, ' ').trim();
    if (namn === '') continue;
    // Sammanfattningsrader (medel, summa) hör inte till eleverna
    if (/^(medel|snitt|medelvärde|summa|totalt|klass(en)?|average|total)\b/i.test(namn)) continue;
    const svar: FragaSvar[] = [];
    const fel: string[] = [];
    let poang = 0; let max = 0; let besvarade = 0;
    for (const u of uppgifter) {
      const t = tolkaCell(rad[u.kolumn]);
      if (t === null) { svar.push({ fraga: `Uppgift ${u.nr}`, svar: '', ratt: null }); continue; }
      besvarade += 1; poang += t.poang; max += t.max;
      svar.push({ fraga: `Uppgift ${u.nr}`, svar: t.svar, ratt: t.ratt });
      if (t.ratt === false) fel.push(u.nr);
    }
    const deltog = besvarade > 0;
    // Obesvarade uppgifter räknas som fel i andelen när eleven deltog — annars saknas resultat helt
    const maxPoang = deltog ? Math.max(max, uppgifter.length) : uppgifter.length;
    rader.push({
      namn, deltog, poang: deltog ? poang : 0, maxPoang,
      procent: deltog && maxPoang > 0 ? (poang / maxPoang) * 100 : null,
      svar, fel,
    });
  }
  if (rader.length === 0) throw new Error('Filen innehåller inga elevrader under rubrikraden.');
  return { datum: magmaDatumUrBladnamn(bladnamn), uppgifter, rader };
}

/** Andel elever (av de som deltog) som hade rätt på varje uppgift — 'vilka uppgifter gick fel för klassen'. */
export function magmaUppgiftsStatistik(rapport: MagmaRapport): Array<{ nr: string; ratt: number; fel: number; andelRatt: number | null }> {
  return rapport.uppgifter.map((u, j) => {
    let ratt = 0; let fel = 0;
    for (const r of rapport.rader) {
      if (!r.deltog) continue;
      const s = r.svar[j];
      if (s.ratt === true) ratt += 1; else fel += 1;
    }
    return { nr: u.nr, ratt, fel, andelRatt: ratt + fel > 0 ? Math.round((ratt / (ratt + fel)) * 100) : null };
  });
}

// ── Analys av sparade Magma-prov (per klass/ämne) ─────────────────────────────

export interface MagmaProvNyckel { datum: string; prov: string; }

export interface MagmaUppgiftUtfall { nr: string; ratt: number; fel: number; andelRatt: number | null; }

export interface MagmaProvAnalys extends MagmaProvNyckel {
  antal: number;
  /** Klassens medelprocent (avrundad) för provet. */
  medel: number | null;
  fordelning: Record<MagmaOmdome, number>;
  uppgifter: MagmaUppgiftUtfall[];
  /** Uppgifter där mindre än hälften hade rätt — de som bör tas upp igen. */
  svaga: string[];
}

export interface MagmaElevSerie {
  elevId: string;
  namn: string;
  /** Procent per prov i samma ordning som `prov` i analysen; null = saknar resultat. */
  procent: Array<number | null>;
  senaste: number | null;
  /** Förändring i procentenheter mellan de två senaste proven eleven gjort; null om färre än två. */
  trend: number | null;
  omdome: MagmaOmdome | null;
}

export interface MagmaAnalys {
  prov: MagmaProvAnalys[];
  elever: MagmaElevSerie[];
}

/**
 * Del 176 · Två Magma-diagnoser med samma namn kombineras: har en elev resultat i båda räknas det
 * senaste, så länge det inte har mycket färre gjorda uppgifter (färre än två tredjedelar av det
 * andra försökets). Gjorda uppgifter = besvarade uppgifter i svaren; saknas svar jämförs maxpoängen.
 */
export const MAGMA_MINST_ANDEL_GJORDA = 2 / 3;

/** Antal besvarade uppgifter i ett resultat (svar med rätt/fel), annars maxpoängen som mått. */
export function magmaGjorda(r: { maxPoang: number; svar?: FragaSvar[] }): number {
  return r.svar !== undefined && r.svar.length > 0 ? r.svar.filter((x) => x.ratt !== null).length : r.maxPoang;
}

/** Det resultat som räknas av två försök på samma diagnos: det senaste, om det inte har mycket färre gjorda uppgifter. */
export function valjMagmaResultat<T extends { datum: string; maxPoang: number; svar?: FragaSvar[] }>(a: T, b: T): T {
  const [aldre, senare] = a.datum <= b.datum ? [a, b] : [b, a];
  const ga = magmaGjorda(aldre); const gs = magmaGjorda(senare);
  return ga > 0 && gs < ga * MAGMA_MINST_ANDEL_GJORDA ? aldre : senare;
}

// ── Del 178 · Namnkonvention för Magma-filer i matematik ─────────────────────
//   "Ma 8B Kap 1 Diagnos 1.3 - 1.4", "Ma 8B Kap 2 Exit ticket 2.1a", "Ma 8B Kap 2 Läxförhör 2.1 - 2.4",
//   "Stockholm stads screening". Typen avgör var resultatet hamnar: diagnoser, Exit tickets eller Magma Läxförhör.

export type MagmaTyp = 'diagnos' | 'exit' | 'laxforhor' | 'screening';
export const MAGMA_TYP_NAMN: Record<MagmaTyp, string> = { diagnos: 'Diagnos', exit: 'Exit ticket', laxforhor: 'Läxförhör', screening: 'Screening' };

export interface MagmaNamn {
  /** Ämnesförkortning ('Ma') när namnet börjar med en. */
  amne: string | null;
  /** Klass ('8B') när namnet anger en. */
  klass: string | null;
  /** Kapitel ur 'Kap 1' / 'Kapitel 1'. */
  kapitel: number | null;
  typ: MagmaTyp;
  /** Delen efter typordet: '1.3 - 1.4', '2.1a', '2.1 - 2.4' ('' när den saknas). */
  del: string;
  /** Kort visningsnamn: 'Diagnos 1.3 - 1.4', 'Exit ticket 2.1a', 'Läxförhör 2.1 - 2.4', 'Stockholm stads screening'. */
  kort: string;
}

/** Typen ur namnet: screening, exit ticket, läxförhör — annars diagnos. */
export function magmaTyp(prov: string): MagmaTyp {
  const n = prov.toLowerCase();
  if (/screening/.test(n)) return 'screening';
  if (/exit/.test(n)) return 'exit';
  if (/l[äa]xf[öo]rh[öo]r/.test(n)) return 'laxforhor';
  return 'diagnos';
}

/** Tolkar ett Magma-filnamn enligt konventionen Ämne Klass Kapitel Typ Del. Okända delar blir null. */
export function tolkaMagmaNamn(prov: string): MagmaNamn {
  let namn = prov.replace(/\.(xlsx|xls|csv|pdf)$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const typ = magmaTyp(namn);
  const am = /^(ma|matte|matematik)\b\s*/i.exec(namn);
  const amne = am !== null ? 'Ma' : null;
  if (am !== null) namn = namn.slice(am[0].length);
  const kl = /^(\d[a-zåäö]?)(?=\s|$)\s*/i.exec(namn);
  const klass = kl !== null ? kl[1].toUpperCase() : null;
  if (kl !== null) namn = namn.slice(kl[0].length);
  const kp = /\bkap(?:itel)?\.?\s*(\d+)\b\s*/i.exec(namn);
  const kapitel = kp !== null ? Number(kp[1]) : null;
  if (kp !== null) namn = `${namn.slice(0, kp.index)} ${namn.slice(kp.index + kp[0].length)}`;
  const ty = /\b(diagnos(?:en)?|exit\s*tickets?|l[äa]xf[öo]rh[öo]r(?:et|en)?|screening)\b\s*/i.exec(namn);
  if (ty !== null) namn = `${namn.slice(0, ty.index)} ${namn.slice(ty.index + ty[0].length)}`;
  const del = namn.replace(/\s+/g, ' ').trim();
  // Screeningen behåller sitt namn ('Stockholm stads screening'); övriga visas som Typ + del
  const kort = typ === 'screening' ? prov.replace(/\.(xlsx|xls|csv|pdf)$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : `${MAGMA_TYP_NAMN[typ]}${del !== '' ? ` ${del}` : ''}`;
  return { amne, klass, kapitel, typ, del, kort };
}

/** Tar bort alla Magma-resultat för ett prov (namnet, oavsett datum) i ett ämne, och filposterna för det. */
export function taBortMagmaProv(s: Struktur, amneId: string, prov: string): Struktur {
  const n = prov.trim().toLowerCase();
  return {
    ...s,
    resultat: (s.resultat ?? []).filter((r) => !(r.kalla === 'magma' && r.amneId === amneId && r.prov.trim().toLowerCase() === n)),
    filregister: (s.filregister ?? []).filter((f) => !(f.kalla === 'magma' && f.amneId === amneId && f.prov.trim().toLowerCase() === n)),
  };
}

/** Tar bort samtliga Magma-resultat och Magma-filposter i ett ämne. */
export function taBortAllaMagma(s: Struktur, amneId: string): Struktur {
  return {
    ...s,
    resultat: (s.resultat ?? []).filter((r) => !(r.kalla === 'magma' && r.amneId === amneId)),
    filregister: (s.filregister ?? []).filter((f) => !(f.kalla === 'magma' && f.amneId === amneId)),
  };
}

/** Procent 0–100 utan avrundning ur ett resultat; null vid maxpoäng 0. */
export function magmaProcent(r: { poang: number; maxPoang: number }): number | null {
  return r.maxPoang > 0 ? (r.poang / r.maxPoang) * 100 : null;
}

interface MinimalResultat { elevId: string; amneId?: string; kalla: string; prov: string; datum: string; poang: number; maxPoang: number; svar?: FragaSvar[]; }
interface MinimalElev { id: string; klassId: string; namn: string; }

/**
 * Sammanställer klassens sparade Magma-prov: per prov andel rätt per uppgift,
 * omdömesfördelning och svaga uppgifter; per elev procentserien över proven
 * (äldst → senast), senaste omdöme och trend.
 */
export function magmaAnalys(
  s: { elever: MinimalElev[]; resultat?: MinimalResultat[]; magmaTester?: Array<{ titel: string; filnamn: string; testNyckel: string }> }, klassId: string, amneId?: string,
): MagmaAnalys {
  const elever = elevernaIKlassen(s, klassId).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const elevIds = new Set(elever.map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => r.kalla === 'magma' && elevIds.has(r.elevId) && (amneId === undefined || amneId === '' || r.amneId === amneId));
  // Del 153: prov med samma uppgifter (samma test, olika kopior/namn) räknas som ett test
  const norm = (x: string) => x.toLowerCase().replace(/\.(pdf|xlsx|xls)$/i, '').replace(/[_–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const testFor = (prov: string) => (s.magmaTester ?? []).find((t) => norm(t.titel) === norm(prov) || norm(t.filnamn) === norm(prov));
  // Del 176: samma namn = samma diagnos (olika importdatum kombineras)
  const grupp = (r: MinimalResultat) => { const t = testFor(r.prov); return t !== undefined ? `T:${t.testNyckel}` : `P:${r.prov.trim().toLowerCase()}`; };
  const grupper = new Map<string, MinimalResultat[]>();
  for (const r of rs) grupper.set(grupp(r), [...(grupper.get(grupp(r)) ?? []), r]);
  const nycklar = [...grupper.entries()].map(([g, lista]) => ({
    g, datum: lista.map((r) => r.datum).sort()[0], prov: [...new Set(lista.map((r) => r.prov))].sort((a, b) => a.localeCompare(b, 'sv')).join(' = '),
    // Per elev: det senaste försöket när eleven gjort testet flera gånger — om det inte har mycket färre gjorda uppgifter
    egna: [...lista.reduce((m, r) => { const f = m.get(r.elevId); m.set(r.elevId, f === undefined ? r : valjMagmaResultat(f, r)); return m; }, new Map<string, MinimalResultat>()).values()],
  })).sort((a, b) => a.datum.localeCompare(b.datum) || a.prov.localeCompare(b.prov, 'sv'));
  const prov: MagmaProvAnalys[] = nycklar.map((n) => {
    const egna = n.egna;
    const fordelning: Record<MagmaOmdome, number> = { 'Under godkänt': 0, 'Godkänt': 0, 'Bra': 0, 'Utmärkt': 0 };
    const procenten: number[] = [];
    const perUppgift = new Map<string, { ratt: number; fel: number }>();
    for (const r of egna) {
      const p = magmaProcent(r);
      if (p !== null) { procenten.push(p); fordelning[magmaOmdome(p)!] += 1; }
      for (const sv of r.svar ?? []) {
        const nr = sv.fraga.replace(/^Uppgift\s*/i, '');
        const u = perUppgift.get(nr) ?? { ratt: 0, fel: 0 };
        if (sv.ratt === true) u.ratt += 1; else u.fel += 1;
        perUppgift.set(nr, u);
      }
    }
    const uppgifter = [...perUppgift.entries()].map(([nr, u]) => ({ nr, ...u, andelRatt: u.ratt + u.fel > 0 ? Math.round((u.ratt / (u.ratt + u.fel)) * 100) : null }));
    return {
      datum: n.datum, prov: n.prov, antal: egna.length,
      medel: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      fordelning, uppgifter,
      svaga: uppgifter.filter((u) => u.andelRatt !== null && u.andelRatt < 50).map((u) => u.nr),
    };
  });
  const serier: MagmaElevSerie[] = elever.map((e) => {
    const procent = nycklar.map((n) => { const r = n.egna.find((x) => x.elevId === e.id); return r === undefined ? null : magmaProcent(r); });
    const gjorda = procent.filter((p): p is number => p !== null);
    const senaste = gjorda.length > 0 ? gjorda[gjorda.length - 1] : null;
    return {
      elevId: e.id, namn: e.namn, procent, senaste,
      trend: gjorda.length >= 2 ? Math.round(gjorda[gjorda.length - 1] - gjorda[gjorda.length - 2]) : null,
      omdome: magmaOmdome(senaste),
    };
  });
  return { prov, elever: serier };
}
