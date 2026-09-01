/**
 * SuperTeach · Socrative — ren tolkning av exporterade klassrapporter
 * (Ring 1, I2: ingen fetch/DOM/lagring; xlsx-avläsningen sker i UI-lagret
 * som skickar in kalkylbladet som en cellmatris).
 *
 * Rapportens form (Socrative "Whole class"-export):
 *   rad 1: quiznamn · rad 2: exporttidpunkt · rad 3: RUMSNAMN
 *   rubrikrad: Presence | Student Name | Student ID | Score (%) | Score (#) | fråga …
 *   raden under: maxpoäng i Score (#)-kolumnen
 *   elevrader: Yes/No | 'Efternamn, Förnamn' | ID | procent | poäng | svar …
 *
 * Filnamnet bär aktivitetens STARTTID I UTC:
 *   Class_2026_08_20__08_49_QZ_Biologi_4_1_Begrepp.xlsx
 */
import type { PlaneradLektion } from './typer.js';

export type Cell = string | number | null | undefined;

export interface SocrativeElevRad {
  namn: string;
  /** Det eleven själv knappade in som Student ID (ofta förnamnet). */
  sidId: string;
  deltog: boolean;
  poang: number;
  maxPoang: number;
}

export interface SocrativeRapport {
  quiz: string;
  rum: string;
  maxPoang: number;
  rader: SocrativeElevRad[];
}

function text(c: Cell): string { return c === null || c === undefined ? '' : String(c).trim(); }

/** Tolkar en Socrative-klassrapport ur en cellmatris. Kastar svenska fel. */
export function tolkaSocrativeRapport(celler: Cell[][]): SocrativeRapport {
  const quiz = text(celler[0]?.[0]);
  if (quiz === '') throw new Error('Rapporten saknar quiznamn på rad 1 — är det en Socrative-klassrapport?');
  const rubrikIndex = celler.findIndex((rad) => text(rad?.[1]) === 'Student Name');
  if (rubrikIndex === -1) throw new Error("Hittar ingen rubrikrad med 'Student Name' — är det en Socrative-klassrapport?");
  const rum = text(celler[2]?.[0]);
  const maxPoang = Number(text(celler[rubrikIndex + 1]?.[4]));
  if (!Number.isFinite(maxPoang) || maxPoang <= 0) throw new Error('Hittar ingen maxpoäng under Score (#).');
  const rader: SocrativeElevRad[] = [];
  for (let i = rubrikIndex + 2; i < celler.length; i++) {
    const rad = celler[i] ?? [];
    const namn = text(rad[1]);
    if (namn === '') continue;
    const deltog = text(rad[0]).toLowerCase() === 'yes';
    const poang = Number(text(rad[4]));
    rader.push({
      namn, sidId: text(rad[2]), deltog,
      poang: deltog && Number.isFinite(poang) ? poang : 0,
      maxPoang,
    });
  }
  if (rader.length === 0) throw new Error('Rapporten innehåller inga elevrader.');
  return { quiz, rum, maxPoang, rader };
}

export interface SocrativeFilnamn {
  /** Aktivitetens start i UTC, ISO (t.ex. 2026-08-20T08:49:00Z). */
  startUtc: string;
  quiz: string;
}

/** Tolkar Socratives filnamn: Class_YYYY_MM_DD__HH_MM_QZ_<quiz>.xlsx (tiden är UTC). */
export function tolkaSocrativeFilnamn(filnamn: string): SocrativeFilnamn | null {
  const m = /^Class_(\d{4})_(\d{2})_(\d{2})__(\d{2})_(\d{2})_QZ_(.+?)\.xlsx$/i.exec(filnamn.trim());
  if (m === null) return null;
  return {
    startUtc: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`,
    quiz: m[6].replace(/_/g, ' '),
  };
}

/** Svensk lokal tid (Europe/Stockholm) för en UTC-tidpunkt: { datum: 'YYYY-MM-DD', tid: 'HH:MM' }. */
export function svenskTid(utcIso: string): { datum: string; tid: string } {
  const d = new Date(utcIso);
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const [datumDel, tidDel] = fmt.format(d).split(' ');
  return { datum: datumDel, tid: tidDel };
}

export interface AktivitetsKlassificering {
  datum: string;
  tid: string;
  /** Index i planen när aktiviteten kunde knytas till en lektion. */
  lektionsIndex: number | null;
  avsnitt: string | null;
  kalla: 'socrative-laxforhor' | 'socrative-exit' | null;
  /** Läsbar förklaring: 'läxförhör (2 min efter lektionsstart)' osv. */
  beskrivning: string;
}

function minuter(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

/**
 * Knyter en Socrative-aktivitet (start i UTC) till en lektion i planen och
 * avgör läxförhör/exit enligt BAM-rytmen: läxförhör startas nära
 * lektionsstart, exit ticket när ca 10 min återstår. Marginal ±15 min
 * runt passet fångar förhör som öppnats strax före start.
 */
export function klassificeraSocrativeAktivitet(startUtc: string, plan: PlaneradLektion[]): AktivitetsKlassificering {
  const { datum, tid } = svenskTid(startUtc);
  const t = minuter(tid);
  let bast: { index: number; rad: PlaneradLektion; avstand: number } | null = null;
  for (const [index, rad] of plan.entries()) {
    if (rad.datum !== datum || rad.start === null || rad.slutTid === null) continue;
    const s = minuter(rad.start); const e = minuter(rad.slutTid);
    const avstand = t < s ? s - t : t > e ? t - e : 0;
    if (avstand <= 15 && (bast === null || avstand < bast.avstand)) bast = { index, rad, avstand };
  }
  if (bast === null) {
    return { datum, tid, lektionsIndex: null, avsnitt: null, kalla: null,
      beskrivning: `utanför lektionstid (${datum} ${tid})` };
  }
  const s = minuter(bast.rad.start ?? '0:0'); const e = minuter(bast.rad.slutTid ?? '0:0');
  const franStart = t - s; const tillSlut = e - t;
  if (tillSlut <= 20 && tillSlut < franStart) {
    return { datum, tid, lektionsIndex: bast.index, avsnitt: bast.rad.lektion.avsnitt, kalla: 'socrative-exit',
      beskrivning: `exit ticket (${tillSlut} min före lektionsslut)` };
  }
  return { datum, tid, lektionsIndex: bast.index, avsnitt: bast.rad.lektion.avsnitt, kalla: 'socrative-laxforhor',
    beskrivning: franStart >= 0 ? `läxförhör (${franStart} min efter lektionsstart)` : `läxförhör (${-franStart} min före lektionsstart)` };
}
