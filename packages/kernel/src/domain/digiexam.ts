/**
 * SuperTeach · DigiExam — ren tolkning av DigiExams exporterade provresultat
 * (Ring 1, I2: ingen fetch/DOM/lagring; xlsx-avläsningen sker i UI-lagret
 * som skickar in kalkylbladet som en cellmatris).
 *
 * DigiExam-prov, Magma-prov och Socrative-test är olika saker och har varsin
 * tolkare. DigiExams fil (blad "Grades", verifierad mot fem exporter):
 *   rad 1:      First Name | Last Name | E-mail | Student Code | Final Grade | Fråga 1 | Fråga 2 | …
 *   elevrader:  förnamn | efternamn | e-post | kod | totalpoäng | poäng per fråga (0, 0.5, 1 …)
 *
 * Filen anger ingen maxpoäng per fråga: den härleds som den högsta poäng någon
 * elev fått på frågan (minst 1) och kan skrivas över av läraren i UI-lagret.
 * Eleven kopplas i första hand via e-posten (Elev.epost), annars via namnet.
 * DigiExam har inget fast procentkrav — provet bedöms per förmåga av läraren.
 */
import type { FragaSvar } from './resultat.js';

export type DigiExamCell = string | number | boolean | null | undefined;

export interface DigiExamFraga {
  /** Frågans nummer som det står i rubriken ('1', '2', '3b'). */
  nr: string;
  /** Rubriktexten ('Fråga 1'). */
  rubrik: string;
  /** Kolumnindex i matrisen. */
  kolumn: number;
  /** Härledd maxpoäng: högsta poäng någon elev fått på frågan (minst 1). */
  max: number;
}

export interface DigiExamElevRad {
  /** 'Förnamn Efternamn' — matchas mot rostern av resultat.ts när e-posten inte träffar. */
  namn: string;
  /** E-post ur filen (tom sträng när kolumnen saknas). */
  epost: string;
  /** Student Code ur filen. */
  kod: string;
  /** Totalpoäng: kolumnen Final Grade när den är ett tal, annars summan av frågepoängen. */
  poang: number;
  /** Poäng per fråga i frågornas ordning; null = tom cell. */
  fragePoang: Array<number | null>;
  /** Sant när eleven har 0 poäng på alla frågor — troligen inte genomfört provet. */
  nollrad: boolean;
}

export interface DigiExamRapport {
  fragor: DigiExamFraga[];
  /** Summan av frågornas härledda maxpoäng. */
  maxPoang: number;
  rader: DigiExamElevRad[];
  /** Sant när Final Grade inte stämde med summan av frågepoängen för någon elev. */
  avvikandeSumma: boolean;
}

function text(c: DigiExamCell): string { return c === null || c === undefined ? '' : String(c).trim(); }

function tal(c: DigiExamCell): number | null {
  if (c === null || c === undefined || c === '') return null;
  if (typeof c === 'boolean') return c ? 1 : 0;
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const n = Number(String(c).trim().replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 'Fråga 1', 'Question 12', 'Uppgift 3b', 'Q4' → frågenummer; annars null. */
function frageNr(c: DigiExamCell): string | null {
  const m = /^(?:fråga|fraga|question|uppgift|uppg\.?|q)\s*(\d{1,3}\s*[a-z]?)$/i.exec(text(c));
  return m === null ? null : m[1].replace(/\s+/g, '').toLowerCase();
}

function kolumnMed(rad: DigiExamCell[], ...namn: string[]): number {
  const mal = namn.map((n) => n.toLowerCase());
  return rad.findIndex((c) => mal.includes(text(c).toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ')));
}

/**
 * Filnamnet '2026-09-30-2249-8b-ekologi-eprov.xlsx' → provnamn '8b ekologi eprov'
 * (exportens tidsstämpel skalas bort, bindestreck blir mellanslag).
 */
export function digiexamProvnamnUrFilnamn(filnamn: string): string {
  return filnamn
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}-\d{4}-?/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exportdatumet ur filnamnet ('2026-09-30-2249-…') → '2026-09-30'; annars null. OBS: exportens datum, inte nödvändigtvis provets. */
export function digiexamDatumUrFilnamn(filnamn: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})-\d{4}/.exec(filnamn.trim());
  return m === null ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Tolkar en DigiExam-export ur en cellmatris. Kastar svenska fel.
 * Rubrikraden är den första raden med minst en frågekolumn ('Fråga 1' …) och
 * en namnkolumn (First Name / Förnamn); namnet är förnamn + efternamn.
 */
export function tolkaDigiExamRapport(celler: DigiExamCell[][]): DigiExamRapport {
  let rubrik = -1; let fragor: DigiExamFraga[] = [];
  let kFornamn = -1; let kEfternamn = -1; let kEpost = -1; let kKod = -1; let kTotal = -1;
  for (let i = 0; i < Math.min(celler.length, 20); i++) {
    const rad = celler[i] ?? [];
    const kand: DigiExamFraga[] = [];
    rad.forEach((c, k) => { const nr = frageNr(c); if (nr !== null) kand.push({ nr, rubrik: text(c), kolumn: k, max: 1 }); });
    const fn = kolumnMed(rad, 'first name', 'förnamn', 'fornamn', 'namn', 'name');
    if (kand.length >= 1 && fn !== -1) {
      rubrik = i; fragor = kand; kFornamn = fn;
      kEfternamn = kolumnMed(rad, 'last name', 'efternamn', 'surname');
      kEpost = kolumnMed(rad, 'e mail', 'email', 'e post', 'epost', 'mail');
      kKod = kolumnMed(rad, 'student code', 'elevkod', 'kod', 'student id');
      kTotal = kolumnMed(rad, 'final grade', 'total', 'totalt', 'poäng', 'score', 'grade');
      break;
    }
  }
  if (rubrik === -1) throw new Error('Hittar ingen rubrikrad med "First Name" och "Fråga 1, Fråga 2 …" — är det en DigiExam-export (bladet Grades)?');

  const rader: DigiExamElevRad[] = [];
  let avvikandeSumma = false;
  for (let i = rubrik + 1; i < celler.length; i++) {
    const rad = celler[i] ?? [];
    const namn = [text(rad[kFornamn]), kEfternamn === -1 ? '' : text(rad[kEfternamn])].filter((x) => x !== '').join(' ').replace(/\s+/g, ' ').trim();
    const epost = kEpost === -1 ? '' : text(rad[kEpost]).toLowerCase();
    if (namn === '' && epost === '') continue;
    if (/^(medel|snitt|medelvärde|summa|totalt|average|total)\b/i.test(namn)) continue;
    const fragePoang = fragor.map((f) => tal(rad[f.kolumn]));
    const summa = fragePoang.reduce<number>((a, p) => a + (p ?? 0), 0);
    const total = kTotal === -1 ? null : tal(rad[kTotal]);
    if (total !== null && Math.abs(total - summa) > 1e-9) avvikandeSumma = true;
    rader.push({
      namn: namn === '' ? epost : namn, epost, kod: kKod === -1 ? '' : text(rad[kKod]),
      poang: total ?? summa, fragePoang,
      nollrad: fragePoang.every((p) => p === null || p === 0),
    });
  }
  if (rader.length === 0) throw new Error('Filen innehåller inga elevrader under rubrikraden.');
  for (const f of fragor) {
    const j = fragor.indexOf(f);
    f.max = Math.max(1, ...rader.map((r) => r.fragePoang[j] ?? 0));
  }
  return { fragor, maxPoang: fragor.reduce((a, f) => a + f.max, 0), rader, avvikandeSumma };
}

/** Svar per fråga för en elevrad: `ratt` = full poäng på frågan, `svar` = poängen som text ('0,5'). */
export function digiexamSvar(rapport: DigiExamRapport, rad: DigiExamElevRad): FragaSvar[] {
  return rapport.fragor.map((f, j) => {
    const p = rad.fragePoang[j];
    return { fraga: `Fråga ${f.nr}`, svar: p === null ? '' : String(p).replace('.', ','), ratt: p === null ? null : p >= f.max };
  });
}

/** Per fråga: hur många elever (utan nollrader) som fick full poäng, delpoäng eller noll, samt medel i procent av frågans max. */
export function digiexamFrageStatistik(rapport: DigiExamRapport, medNollrader = false): Array<{ nr: string; full: number; del: number; noll: number; medel: number | null }> {
  const rader = rapport.rader.filter((r) => medNollrader || !r.nollrad);
  return rapport.fragor.map((f, j) => {
    let full = 0; let del = 0; let noll = 0; let summa = 0; let n = 0;
    for (const r of rader) {
      const p = r.fragePoang[j]; if (p === null) continue;
      n += 1; summa += p / f.max;
      if (p >= f.max) full += 1; else if (p > 0) del += 1; else noll += 1;
    }
    return { nr: f.nr, full, del, noll, medel: n > 0 ? Math.round((summa / n) * 100) : null };
  });
}

// ── Analys av sparade DigiExam-prov (per klass/ämne) ──────────────────────────

export interface DigiExamProvAnalys {
  datum: string;
  prov: string;
  antal: number;
  /** Klassens medelprocent (avrundad). */
  medel: number | null;
  /** Per fråga: andel elever med full poäng (avrundad procent). */
  fragor: Array<{ nr: string; full: number; ejFull: number; andelFull: number | null }>;
  /** Frågor där mindre än hälften fick full poäng. */
  svaga: string[];
}

export interface DigiExamElevSerie {
  elevId: string;
  namn: string;
  /** Procent per prov i samma ordning som `prov`; null = saknar resultat. */
  procent: Array<number | null>;
  senaste: number | null;
}

export interface DigiExamAnalys { prov: DigiExamProvAnalys[]; elever: DigiExamElevSerie[]; }

interface MinimalResultat { elevId: string; amneId?: string; kalla: string; prov: string; datum: string; poang: number; maxPoang: number; svar?: FragaSvar[]; }
interface MinimalElev { id: string; klassId: string; namn: string; }

/** Sammanställer klassens sparade DigiExam-prov: per prov medel och andel full poäng per fråga; per elev procentserien (äldst → senast). */
export function digiexamAnalys(s: { elever: MinimalElev[]; resultat?: MinimalResultat[] }, klassId: string, amneId?: string): DigiExamAnalys {
  const elever = s.elever.filter((e) => e.klassId === klassId).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const elevIds = new Set(elever.map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => r.kalla === 'digiexam' && elevIds.has(r.elevId) && (amneId === undefined || amneId === '' || r.amneId === amneId));
  const nycklar = [...new Map(rs.map((r) => [`${r.datum}|${r.prov}`, { datum: r.datum, prov: r.prov }])).values()]
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.prov.localeCompare(b.prov, 'sv'));
  const procentAv = (r: MinimalResultat) => (r.maxPoang > 0 ? (r.poang / r.maxPoang) * 100 : null);
  const prov = nycklar.map((n) => {
    const egna = rs.filter((r) => r.datum === n.datum && r.prov === n.prov);
    const procenten = egna.map(procentAv).filter((p): p is number => p !== null);
    const perFraga = new Map<string, { full: number; ejFull: number }>();
    for (const r of egna) {
      for (const sv of r.svar ?? []) {
        const nr = sv.fraga.replace(/^Fråga\s*/i, '');
        const u = perFraga.get(nr) ?? { full: 0, ejFull: 0 };
        if (sv.ratt === true) u.full += 1; else u.ejFull += 1;
        perFraga.set(nr, u);
      }
    }
    const fragor = [...perFraga.entries()].map(([nr, u]) => ({ nr, ...u, andelFull: u.full + u.ejFull > 0 ? Math.round((u.full / (u.full + u.ejFull)) * 100) : null }));
    return {
      ...n, antal: egna.length,
      medel: procenten.length > 0 ? Math.round(procenten.reduce((a, b) => a + b, 0) / procenten.length) : null,
      fragor, svaga: fragor.filter((f) => f.andelFull !== null && f.andelFull < 50).map((f) => f.nr),
    };
  });
  const serier = elever.map((e) => {
    const procent = nycklar.map((n) => { const r = rs.find((x) => x.elevId === e.id && x.datum === n.datum && x.prov === n.prov); return r === undefined ? null : procentAv(r); });
    const gjorda = procent.filter((p): p is number => p !== null);
    return { elevId: e.id, namn: e.namn, procent, senaste: gjorda.length > 0 ? gjorda[gjorda.length - 1] : null };
  });
  return { prov, elever: serier };
}
