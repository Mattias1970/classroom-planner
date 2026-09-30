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
import type { FragaSvar } from './resultat.js';

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
