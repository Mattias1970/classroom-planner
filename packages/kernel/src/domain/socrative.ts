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
import { svarNyckel } from './svarsform.js';

export type Cell = string | number | null | undefined;

export interface SocrativeElevRad {
  namn: string;
  /** Det eleven själv knappade in som Student ID (ofta förnamnet). */
  sidId: string;
  deltog: boolean;
  poang: number;
  maxPoang: number;
  /** Elevens svar per fråga, i rapportens kolumnordning ('' = obesvarad). */
  svar?: string[];
}

export interface SocrativeRapport {
  quiz: string;
  rum: string;
  maxPoang: number;
  rader: SocrativeElevRad[];
  /** Frågetexterna i kolumnordning (tomt när rapporten saknar frågekolumner). */
  fragor: string[];
  /** Härledd svarsnyckel per fråga (null när den inte gick att härleda). */
  nyckel: Array<string | null>;
}

/**
 * Härleder facit ur rapporten: elever med full poäng har alla rätt, så deras
 * svar ÄR nyckeln. Saknas sådana elever används det vanligaste svaret bland
 * dem som har högst poäng, och frågan lämnas null om det står oavgjort.
 *
 * Del 242 · Det är bara en första gissning när ingen har alla rätt: den bästa eleven har ju fel på något,
 * och då blev elevens felsvar "facit". Nyckeln justeras därför tills den förklarar ALLA elevers poäng så
 * bra som möjligt — varje elevs antal svar som stämmer med nyckeln ska vara lika med elevens Score (#).
 * Ett byte av svar på en fråga görs bara när det minskar den sammanlagda avvikelsen.
 */
export function harledSvarsnyckel(rader: SocrativeElevRad[], antalFragor: number): Array<string | null> {
  return harledSvarsnyckelMedKvalitet(rader, antalFragor).nyckel;
}

export interface HarleddSvarsnyckel {
  nyckel: Array<string | null>;
  /** Summan över eleverna av |antal svar som stämmer med nyckeln − elevens poäng|. 0 = nyckeln förklarar allas poäng. */
  avvikelse: number;
  /** Nyckeln går att lita på: den förklarar allas poäng exakt och minst en elev har svarat. */
  exakt: boolean;
}

export function harledSvarsnyckelMedKvalitet(rader: Array<Pick<SocrativeElevRad, 'deltog' | 'poang' | 'maxPoang' | 'svar'>>, antalFragor: number): HarleddSvarsnyckel {
  const svarande = rader.filter((r) => r.deltog && r.svar !== undefined && r.svar.length > 0);
  if (svarande.length === 0 || antalFragor === 0) return { nyckel: new Array<string | null>(antalFragor).fill(null), avvikelse: 0, exakt: false };
  const basta = Math.max(...svarande.map((r) => r.poang));
  const topp = svarande.filter((r) => r.poang === basta);
  const kallor = topp.length > 0 ? topp : svarande;
  const start = Array.from({ length: antalFragor }, (_, i) => {
    const rakna = new Map<string, number>();
    for (const r of kallor) {
      const v = (r.svar?.[i] ?? '').trim();
      if (v === '') continue;
      rakna.set(v, (rakna.get(v) ?? 0) + 1);
    }
    if (rakna.size === 0) return null;
    const sorterad = [...rakna.entries()].sort((a, b) => b[1] - a[1]);
    if (sorterad.length > 1 && sorterad[0][1] === sorterad[1][1]) return null;
    return sorterad[0][0];
  });

  // Jämför på svarstexten (utan alternativbokstav). Poängen kan bara tolkas som "antal rätt" när varje fråga ger en poäng.
  const norm = svarande.map((r) => Array.from({ length: antalFragor }, (_, j) => svarNyckel((r.svar?.[j] ?? '').trim())));
  const nyckel: Array<string | null> = start.map((v) => (v === null ? null : svarNyckel(v)));
  const traffar = norm.map((rad) => rad.reduce((n, v, j) => n + (v !== '' && v === nyckel[j] ? 1 : 0), 0));
  const avvikelseAv = () => svarande.reduce((a, r, s) => a + Math.abs(traffar[s] - r.poang), 0);
  let avvikelse = avvikelseAv();
  if (svarande.every((r) => r.maxPoang === antalFragor) && avvikelse > 0) {
    const kandidater = Array.from({ length: antalFragor }, (_, j) => [...new Set(norm.map((rad) => rad[j]).filter((v) => v !== ''))]);
    const traff = (s: number, j: number, k: string | null) => (norm[s][j] !== '' && norm[s][j] === k ? 1 : 0);
    const bytPar = (): boolean => {
      for (let a = 0; a < antalFragor; a++) for (let b = a + 1; b < antalFragor; b++) {
        for (const ka of kandidater[a]) for (const kb of kandidater[b]) {
          if (ka === nyckel[a] || kb === nyckel[b]) continue;   // byten av en fråga i taget är redan prövade
          let summa = 0;
          for (let s = 0; s < svarande.length && summa < avvikelse; s++) {
            summa += Math.abs(traffar[s] - traff(s, a, nyckel[a]) + traff(s, a, ka) - traff(s, b, nyckel[b]) + traff(s, b, kb) - svarande[s].poang);
          }
          if (summa < avvikelse) {
            for (let s = 0; s < svarande.length; s++) traffar[s] += traff(s, a, ka) - traff(s, a, nyckel[a]) + traff(s, b, kb) - traff(s, b, nyckel[b]);
            nyckel[a] = ka; nyckel[b] = kb; avvikelse = summa;
            return true;
          }
        }
      }
      return false;
    };
    for (let varv = 0; varv < 25 && avvikelse > 0; varv++) {
      let battre = false;
      for (let j = 0; j < antalFragor; j++) {
        let basta2 = nyckel[j]; let lagst = avvikelse;
        for (const k of kandidater[j]) {
          if (k === nyckel[j]) continue;
          let a = 0;
          for (let s = 0; s < svarande.length; s++) {
            const v = norm[s][j];
            a += Math.abs(traffar[s] - (v !== '' && v === nyckel[j] ? 1 : 0) + (v === k ? 1 : 0) - svarande[s].poang);
          }
          if (a < lagst) { lagst = a; basta2 = k; }
        }
        if (basta2 !== nyckel[j]) {
          for (let s = 0; s < svarande.length; s++) { const v = norm[s][j]; traffar[s] += (v === basta2 ? 1 : 0) - (v !== '' && v === nyckel[j] ? 1 : 0); }
          nyckel[j] = basta2; avvikelse = lagst; battre = true;
        }
      }
      if (!battre) {
        // Fast med en avvikelse kvar: ibland måste två frågor bytas samtidigt (två elever med samma felsvar kan
        // lura in ett byte i taget). Pröva par av frågor; hittas ett bättre par fortsätter bytena en i taget.
        if (!bytPar()) break;
      }
    }
  }
  // Tillbaka till svaret som det står i rapporten: startgissningen om den gäller, annars den vanligaste skrivningen
  const ut = nyckel.map((k, j) => {
    if (k === null) return null;
    if (start[j] !== null && svarNyckel(start[j]!) === k) return start[j];
    const rakna = new Map<string, number>();
    for (const r of svarande) { const v = (r.svar?.[j] ?? '').trim(); if (v !== '' && svarNyckel(v) === k) rakna.set(v, (rakna.get(v) ?? 0) + 1); }
    return [...rakna.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });
  return { nyckel: ut, avvikelse, exakt: avvikelse === 0 && ut.some((k) => k !== null) };
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
  // Kolumn 5 och framåt är en fråga var; rubriken är frågetexten
  const fragor = (celler[rubrikIndex] ?? []).slice(5).map(text).filter((f) => f !== '');
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
      ...(fragor.length > 0 ? { svar: fragor.map((_, j) => text(rad[5 + j])) } : {}),
    });
  }
  if (rader.length === 0) throw new Error('Rapporten innehåller inga elevrader.');
  return { quiz, rum, maxPoang, rader, fragor, nyckel: harledSvarsnyckel(rader, fragor.length) };
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
  kalla: 'socrative-laxforhor' | 'socrative-exit' | 'socrative-ovning' | null;
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
    // Ingen lektion matchar tiden: det är en övning (extrapass, hemläxa, omtag)
    return { datum, tid, lektionsIndex: null, avsnitt: null, kalla: 'socrative-ovning',
      beskrivning: `övning — utanför lektionstid (${datum} ${tid})` };
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

// ── Del 61: klassificering via rumsnamn ──────────────────────
//
// I planeringen är läxförhör (socStart) och exit ticket (exit) angivna som
// Socrative-RUM ('Biologi41', 'Biologi412'). Quizet som körs i rummet kan
// heta vad som helst ('Biologi 4.1 Begrepp'). Rummet i rapporten är därför
// den säkraste nyckeln: det pekar ut både källa och lektion. Tiden i
// filnamnet används bara för att välja rätt lektion när samma rum
// förekommer flera gånger (kumulativa förhör) och som fallback när rummet
// inte finns i planen (t.ex. Matte8B som används för allt).

function normRum(r: string): string { return r.replace(/\s+/g, '').toUpperCase(); }

/**
 * Söker rummet i planen. Träff på `exit` ⇒ exit ticket, på `socStart` ⇒ läxförhör.
 * Vid flera lektioner med samma rum väljs den vars datum ligger närmast (och helst
 * senast på eller före) filens datum.
 */
export function klassificeraViaRum(rum: string, startUtc: string, plan: PlaneradLektion[]): AktivitetsKlassificering | null {
  const { datum, tid } = svenskTid(startUtc);
  const r = normRum(rum);
  if (r === '') return null;
  let bast: { index: number; rad: PlaneradLektion; kalla: 'socrative-laxforhor' | 'socrative-exit'; avstand: number } | null = null;
  const dagar = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
  for (const [index, rad] of plan.entries()) {
    if (rad.datum === null) continue;
    const kalla = normRum(rad.lektion.exit) === r ? 'socrative-exit' : normRum(rad.lektion.socStart) === r ? 'socrative-laxforhor' : null;
    if (kalla === null) continue;
    // straffa lektioner efter filens datum något: förhöret kan inte ha körts före lektionen
    const avstand = dagar(rad.datum, datum) + (rad.datum > datum ? 0.5 : 0);
    if (bast === null || avstand < bast.avstand) bast = { index, rad, kalla, avstand };
  }
  if (bast === null) return null;
  const sammaDag = bast.rad.datum === datum;
  return {
    datum: bast.rad.datum!, tid, lektionsIndex: bast.index, avsnitt: bast.rad.lektion.avsnitt, kalla: bast.kalla,
    beskrivning: `${bast.kalla === 'socrative-exit' ? 'exit ticket' : 'läxförhör'} via rum ${rum}${sammaDag ? '' : ` (körd ${datum}, lektion ${bast.rad.datum})`}`,
  };
}

/** Rum först, tid som fallback. */
export function klassificeraSocrativeFil(rum: string, startUtc: string, plan: PlaneradLektion[]): AktivitetsKlassificering {
  return klassificeraViaRum(rum, startUtc, plan) ?? klassificeraSocrativeAktivitet(startUtc, plan);
}
