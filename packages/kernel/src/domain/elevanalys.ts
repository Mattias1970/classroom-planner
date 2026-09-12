/**
 * SuperTeach · Elevanalys — hur går det för eleven, och vad kan eleven göra?
 *
 * Väver ihop det som redan räknas fram på annat håll (kurva, närvaro,
 * lektionstest, trendkoll, delkapitel, begrepp som fastnat) till en
 * rapport som går att läsa av en elev eller vårdnadshavare, med konkreta
 * råd som följer av siffrorna — inga generella uppmaningar.
 *
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
import type { Elev, Struktur } from './typer.js';
import { kravFor, resultatProcent, type ResultatKalla } from './resultat.js';
import {
  elevKurva, elevLektionstest, elevNarvaro, provTillfallen, sokElever, trendFor,
  type DashboardFilter, type KurvPunkt, type ProvTillfalle, type Trend,
} from './dashboard.js';
import { trendkoll } from './trendkoll.js';
import { aterkommandeFel, aterkommandeFelKlass, delkapitelSegment, harmoniseraOvningar, nulage, ovningsDubbletter, type BegreppsFel, type Inkluderad, type Nulage, type OvningsMatchning, type SegmentTillfalle } from './delkapiteltrend.js';
import { begreppForFraga, elevrapport, socrativeElevLank, type Elevrapport } from './elevrapport.js';
import { fragematris, type Fragematris } from './delkapiteltrend.js';

export interface KallaSammanfattning {
  kalla: ResultatKalla;
  namn: string;
  snittProcent: number | null;
  krav: number | null;
  /** Andel av elevens prov i källan som klarade kravet. */
  andelKlarade: number | null;
  antal: number;
  trend: Trend | null;
  /** Klassens snitt i samma källa, för jämförelse. */
  klassSnitt: number | null;
}

export interface Rad {
  /** Kort rubrik, t.ex. 'Läxförhören håller'. */
  rubrik: string;
  /** Förklarande mening i löptext. */
  text: string;
  /** 'bra' | 'okej' | 'oro' — styr färg i utskriften. */
  ton: 'bra' | 'okej' | 'oro';
}


export interface Elevanalys {
  elev: Elev;
  amneNamn: string;
  period: { fran: string | null; till: string | null };
  kurva: KurvPunkt[];
  tillfallen: ProvTillfalle[];
  kallor: KallaSammanfattning[];
  narvaroProcent: number | null;
  narvaroLektioner: number;
  franvaroDatum: string[];
  /** Exit − läxförhör i procentenheter (elevens egna lektioner). */
  lektionsDiff: number | null;
  /** Fel → rätt och rätt → fel på upprepade frågor. */
  lart: number;
  glomt: number;
  segment: SegmentTillfalle[];
  /** Fråga × testtillfälle för eleven — rätt, fel eller inte gjord. */
  matris: Fragematris;
  /** Vad eleven kan NU — senaste svaret på varje fråga. */
  nu: Nulage;
  /** Övningar som återanvänder läxförhörens eller exit ticketsens frågor. */
  ovningsDubbletter: OvningsMatchning[];
  /** Övningar som räknats in som läxförhör/exit därför att de använder samma quiz. */
  inkluderadeOvningar: Inkluderad[];
  fastnat: BegreppsFel[];
  /** Socrative-rum att öva i, för de delkapitel som behöver repeteras. */
  ovningar: Array<{ kod: string; namn: string; rum: string; url: string }>;
  /** Filmer att se (Binogi m.fl.) för samma delkapitel. */
  filmer: Array<{ titel: string; url: string; for: string }>;
  rapport: Elevrapport | null;
  /** Läget i punkter — det som ska stå under "Hur går det?". */
  laget: Rad[];
  /** Konkreta råd — det som ska stå under "Vad kan du göra?". */
  rad: Rad[];
  sammanfattning: string;
}

const KALLNAMN: Record<ResultatKalla, string> = {
  'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit tickets', 'socrative-ovning': 'Övningar',
  magma: 'Magma', digiexam: 'Prov',
};

function snitt(v: number[]): number | null {
  return v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

/** Hela analysen för en elev i ett ämne. */
export function elevanalys(sIn: Struktur, elevId: string, f: DashboardFilter & { amneId?: string }): Elevanalys {
  // Övningar som kör samma quiz som ett läxförhör/exit räknas som det testet
  const harm = harmoniseraOvningar(sIn, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) });
  const s = harm.s;
  const elev = s.elever.find((e) => e.id === elevId);
  if (elev === undefined) throw new Error('Okänd elev.');
  const amneNamn = s.amnen.find((a) => a.id === f.amneId)?.namn ?? 'Alla ämnen';
  const egna = (s.resultat ?? []).filter((r) => r.elevId === elevId
    && (f.amneId === undefined || r.amneId === f.amneId)
    && (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till));

  const kallor: KallaSammanfattning[] = (['socrative-laxforhor', 'socrative-exit', 'socrative-ovning', 'magma', 'digiexam'] as ResultatKalla[])
    .map((kalla) => {
      const rs = egna.filter((r) => r.kalla === kalla);
      const p = rs.map(resultatProcent).filter((x): x is number => x !== null);
      const krav = kravFor(kalla);
      const klass = provTillfallen(s, { ...f, kallor: [kalla] });
      return {
        kalla, namn: KALLNAMN[kalla], snittProcent: snitt(p), krav,
        andelKlarade: krav === null || p.length === 0 ? null : Math.round((p.filter((x) => x >= krav).length / p.length) * 100),
        antal: p.length, trend: trendFor(p),
        klassSnitt: snitt(klass.map((t) => t.snittProcent).filter((x): x is number => x !== null)),
      };
    }).filter((k) => k.antal > 0);

  const narvaro = elevNarvaro(s, f).find((n) => n.elev.id === elevId) ?? null;
  const lekt = elevLektionstest(s, f).find((l) => l.elev.id === elevId) ?? null;
  const tk = trendkoll(s, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) });
  const tkElev = tk.elever.find((e) => e.elev.id === elevId) ?? null;
  const delF = { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}), ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) };
  const segment = delkapitelSegment(s, { ...delF, elevId });
  let nu = nulage(s, elevId, delF);
  const dubblettOvningar = ovningsDubbletter(s, delF);
  const fastnat = aterkommandeFel(s, elevId, delF);
  const matris = fragematris(s, { ...delF, elevId });
  let rapport: Elevrapport | null = null;
  if (f.amneId !== undefined) {
    try { rapport = elevrapport(s, elevId, f.amneId, { ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) }); } catch { rapport = null; }
  }

  // Frågetexten är begreppsbeskrivningen ur boken — slå upp vilket begrepp den gäller
  const forklaringar: Record<string, string> = {};
  for (const k of rapport?.kapitel ?? []) {
    for (const d of k.delkapitel) {
      for (const b of d.begrepp) if (b.forklaring !== null) forklaringar[b.begrepp] = b.forklaring;
    }
  }
  if (Object.keys(forklaringar).length > 0) {
    const berika = (fr: typeof nu.fragor[number]) => {
      if (fr.begrepp !== undefined) return fr; // ur elevernas rätta svar — säkrast
      const b = begreppForFraga(forklaringar, fr.fraga);
      return b === null ? fr : { ...fr, begrepp: b };
    };
    const fragor = nu.fragor.map(berika);
    nu = {
      ...nu, fragor,
      kan: fragor.filter((x) => x.ratt),
      kvar: fragor.filter((x) => !x.ratt),
      fixat: fragor.filter((x) => x.ratt && x.tidigareFel > 0),
    };
  }

  // ── Läget ────────────────────────────────────────────────
  // Nuläget först: det intressanta är vad eleven kan nu, inte vad som missades
  // för tre veckor sedan. Läxförhören är kumulativa, så senaste svaret gäller.
  const laget: Rad[] = [];
  if (nu.fragor.length > 0) {
    const svaga = nu.delkapitel.filter((d) => d.procent !== null && d.procent < 100);
    laget.push({
      ton: (nu.procent ?? 0) >= 90 ? 'bra' : (nu.procent ?? 0) >= 70 ? 'okej' : 'oro',
      rubrik: `Du kan ${nu.kan.length} av ${nu.fragor.length} begrepp just nu`,
      text: `Räknat på ditt senaste svar på varje fråga sitter ${nu.procent} % av begreppen`
        + `${nu.senastProv !== null ? ` (färskast: ${nu.senastProv}, ${nu.senastDatum})` : ''}. `
        + (nu.kvar.length === 0 ? 'Inget är kvar att lära in just nu.'
          : `Kvar att lära: ${nu.kvar.length} begrepp${svaga.length > 0 ? `, mest i ${svaga.map((d) => d.kod).join(' och ')}` : ''}.`)
        + (nu.fixat.length > 0 ? ` Du har vänt ${nu.fixat.length} begrepp från fel till rätt.` : ''),
    });
  }
  const lax = kallor.find((k) => k.kalla === 'socrative-laxforhor');
  const exit = kallor.find((k) => k.kalla === 'socrative-exit');
  if (lax !== undefined && lax.snittProcent !== null) {
    const over = lax.krav !== null && lax.snittProcent >= lax.krav;
    laget.push({
      ton: over ? 'bra' : lax.snittProcent >= 75 ? 'okej' : 'oro',
      rubrik: over ? 'Läxförhören sitter' : 'Läxförhören behöver mer tid',
      text: `Snittet på läxförhören är ${lax.snittProcent} %${lax.krav !== null ? ` mot kravet ${lax.krav} %` : ''}`
        + `${lax.klassSnitt !== null ? ` (klassen ${lax.klassSnitt} %)` : ''}. `
        + `Läxförhören är kumulativa: varje nytt förhör tar med begreppen från de tidigare, så resultatet visar hur mycket du har kvar från hela kapitlet.`
        + `${lax.trend === 'upp' ? ' Kurvan pekar uppåt.' : lax.trend === 'ned' ? ' Kurvan pekar nedåt.' : ''}`,
    });
  }
  if (exit !== undefined && exit.snittProcent !== null) {
    const over = exit.krav !== null && exit.snittProcent >= exit.krav;
    laget.push({
      ton: over ? 'bra' : exit.snittProcent >= 60 ? 'okej' : 'oro',
      rubrik: over ? 'Du tar till dig lektionerna' : 'Lektionsinnehållet fastnar inte helt',
      text: `Exit tickets ligger på ${exit.snittProcent} %${exit.krav !== null ? ` mot kravet ${exit.krav} %` : ''}`
        + `${exit.klassSnitt !== null ? ` (klassen ${exit.klassSnitt} %)` : ''}. Exit ticket görs i slutet av lektionen och mäter dagens innehåll.`,
    });
  }
  if (lekt?.diffSnitt !== null && lekt !== null) {
    const d = lekt.diffSnitt;
    laget.push({
      ton: d >= 5 ? 'bra' : d <= -5 ? 'oro' : 'okej',
      rubrik: d >= 5 ? 'Lektionerna lyfter dig' : d <= -5 ? 'Du tappar under lektionen' : 'Jämnt före och efter lektionen',
      text: `Skillnaden mellan exit ticket och läxförhör är i snitt ${d > 0 ? '+' : ''}${d} procentenheter. `
        + (d >= 5 ? 'Du kan mer efter lektionen än före — genomgångarna fungerar för dig.'
          : d <= -5 ? 'Du svarar sämre i slutet av lektionen än i början. Det brukar handla om att koncentrationen tar slut eller att det nya innehållet inte hann landa.'
            : 'Du ligger ungefär lika före och efter lektionen.'),
    });
  }
  if (narvaro?.narvaroProcent !== null && narvaro !== null) {
    laget.push({
      ton: narvaro.narvaroProcent >= 90 ? 'bra' : narvaro.narvaroProcent >= 80 ? 'okej' : 'oro',
      rubrik: narvaro.narvaroProcent >= 90 ? 'Du är med på lektionerna' : 'Frånvaron påverkar',
      text: `Du har deltagit i ${narvaro.narvarande} av ${narvaro.lektioner} lektioner (${narvaro.narvaroProcent} %).`
        + (narvaro.franvaroDatum.length > 0 ? ` Frånvaro: ${narvaro.franvaroDatum.join(', ')}.` : ''),
    });
  }
  if (tkElev !== null && (tkElev.lart > 0 || tkElev.glomt > 0)) {
    laget.push({
      ton: tkElev.netto > 0 ? 'bra' : tkElev.netto < 0 ? 'oro' : 'okej',
      rubrik: tkElev.netto > 0 ? 'Du lär dig mer än du glömmer' : tkElev.netto < 0 ? 'Du glömmer mer än du lär dig' : 'Lika mycket lärt som glömt',
      text: `På frågor som återkommit har ${tkElev.lart} svar gått från fel till rätt och ${tkElev.glomt} från rätt till fel.`,
    });
  }
  if (harm.inkluderade.length > 0) {
    laget.push({
      ton: 'bra', rubrik: 'Övningar som räknas som förhör',
      text: `${harm.inkluderade.map((o) => `${o.prov} (${o.datum}) kör samma quiz som ${o.liknar} och räknas därför som ${KALLNAMN[o.som].toLowerCase()}`).join('; ')}. `
        + 'Det senaste svaret på varje fråga gäller, så en övning där du fick rätt räknas dig till godo.',
    });
  }
  if (dubblettOvningar.length > 0) {
    laget.push({
      ton: 'okej', rubrik: 'Övningar med delvis samma frågor',
      text: `${dubblettOvningar.map((o) => `${o.ovning.prov} delar ${o.overlapp} % av frågorna med ${o.liknar.prov}`).join(', ')}. `
        + 'Under gränsen för att räknas som samma test — ligger som separat övning.',
    });
  }
  const svaga = segment.length === 0 ? [] : (segment[segment.length - 1].segment ?? []).filter((x) => x.procent !== null && x.procent < 70);
  if (svaga.length > 0) {
    laget.push({
      ton: 'oro', rubrik: 'Delar som halkat efter',
      text: `I det senaste förhöret låg ${svaga.map((x) => `${x.kod} på ${x.procent} %`).join(', ')}. Det är de delkapitlen som drar ner helheten.`,
    });
  }

  // ── Råd ──────────────────────────────────────────────────
  /** 'biotop — En naturtyp med …' när begreppet är känt, annars bara beskrivningen. */
  const begreppRad = (x: { begrepp?: string; fraga: string }): string =>
    (x.begrepp !== undefined ? `${x.begrepp} — ${x.fraga}` : x.fraga);
  const begreppNamn = new Map(nu.fragor.filter((x) => x.begrepp !== undefined).map((x) => [x.fraga, x.begrepp!]));
  const rad: Rad[] = [];
  if (nu.kvar.length > 0) {
    rad.push({
      ton: 'oro', rubrik: `${nu.kvar.length} begrepp kvar att lära`,
      text: `Det här svarade du fel på senast: ${nu.kvar.slice(0, 6).map(begreppRad).join(' · ')}`
        + `${nu.kvar.length > 6 ? ` (och ${nu.kvar.length - 6} till)` : ''}. `
        + 'Börja här — resten kan du redan. Skriv en egen förklaring till varje och testa dig själv i Socrative-rummet.',
    });
  }
  if (nu.fixat.length > 0) {
    rad.push({
      ton: 'bra', rubrik: `${nu.fixat.length} begrepp har du redan vänt`,
      text: `${nu.fixat.slice(0, 5).map(begreppRad).join(' · ')} satt inte förut men sitter nu. Håll dem vid liv genom att svara på dem igen i nästa kumulativa läxförhör.`,
    });
  }
  if (fastnat.length > 0) {
    rad.push({
      ton: 'oro', rubrik: `Börja med ${Math.min(3, fastnat.length)} begrepp`,
      text: `Dessa har du svarat fel på minst två gånger: ${fastnat.slice(0, 5).map((b) => b.fraga).join(' · ')}. `
        + 'Skriv en egen förklaring till varje, med ett exempel. De försvinner ur listan när du svarat rätt på dem två gånger i rad.',
    });
  }
  if (rapport !== null) {
    const ova = rapport.kapitel.flatMap((k) => k.delkapitel.filter((d) => d.status === 'ova'));
    if (ova.length > 0) {
      rad.push({
        ton: 'okej', rubrik: 'Repetera dessa delkapitel',
        text: `${ova.map((d) => `${d.kod} ${d.namn}`).join(', ')}. Läs sammanfattningen och gå igenom begreppen innan nästa läxförhör.`,
      });
    }
    const filmLista = rapport.kapitel.flatMap((k) => k.filmer).slice(0, 4);
    if (filmLista.length > 0) {
      rad.push({ ton: 'okej', rubrik: 'Se filmerna', text: filmLista.map((x) => `${x.titel} (${x.for})`).join(' · ') });
    }
    const rum = ova.filter((d) => d.socrativeRum !== null);
    if (rum.length > 0) {
      rad.push({
        ton: 'okej', rubrik: 'Öva i Socrative',
        text: `Kör quizet igen i ${rum.map((d) => d.socrativeRum!).join(' och ')} tills du har alla rätt. Länkarna finns under "Öva och se filmer".`,
      });
    }
  }
  if (lax !== undefined && lax.krav !== null && lax.snittProcent !== null && lax.snittProcent < lax.krav) {
    rad.push({
      ton: 'okej', rubrik: 'Plugga begreppen i flera omgångar',
      text: 'Eftersom läxförhören är kumulativa räcker det inte att läsa dagen före. Gå igenom alla tidigare delkapitels begrepp i tio minuter före varje läxförhör — det du redan kan går snabbt, och du upptäcker vad som glidit iväg.',
    });
  }
  if (lekt?.diffSnitt !== null && lekt !== null && lekt.diffSnitt <= -5) {
    rad.push({
      ton: 'okej', rubrik: 'Fånga upp lektionens slut',
      text: 'Skriv tre rader om vad lektionen handlade om innan du lämnar salen, och fråga direkt när något är oklart — exit ticket kommer på samma innehåll.',
    });
  }
  if (narvaro !== null && narvaro.narvaroProcent !== null && narvaro.narvaroProcent < 80) {
    rad.push({
      ton: 'oro', rubrik: 'Ta igen de missade lektionerna',
      text: `Du saknar ${narvaro.lektioner - narvaro.narvarande} lektioner. Be om materialet för ${narvaro.franvaroDatum.slice(0, 3).join(', ')} och gör förhören i efterhand — de räknas.`,
    });
  }
  if (tkElev !== null && tkElev.netto < 0) {
    rad.push({
      ton: 'okej', rubrik: 'Repetera med mellanrum',
      text: 'Du kan sakerna när du lär dig dem men tappar dem senare. Repetera samma begrepp efter en dag, efter en vecka och efter en månad i stället för allt på en gång.',
    });
  }
  if (rad.length === 0) {
    rad.push({ ton: 'bra', rubrik: 'Fortsätt som du gör', text: 'Inget i siffrorna pekar ut något som behöver ändras just nu. Håll i rutinen med begreppen före varje läxförhör.' });
  }

  const helhet = snitt(egna.map(resultatProcent).filter((x): x is number => x !== null));
  const sammanfattning = kallor.length === 0
    ? `${elev.namn} har inga resultat i urvalet.`
    : nu.fragor.length > 0
      ? `${elev.namn} kan ${nu.kan.length} av ${nu.fragor.length} begrepp i ${amneNamn} just nu (${nu.procent} %)`
        + `${nu.kvar.length > 0 ? `, med ${nu.kvar.length} kvar att lära` : ''}`
        + `${narvaro?.narvaroProcent !== undefined && narvaro.narvaroProcent !== null ? `. Närvaro ${narvaro.narvaroProcent} %` : ''}.`
      : `${elev.namn} ligger på ${helhet ?? '—'} % sammantaget i ${amneNamn}`
      + `${lax?.snittProcent !== undefined && lax.snittProcent !== null ? `, läxförhör ${lax.snittProcent} %` : ''}`
      + `${exit?.snittProcent !== undefined && exit.snittProcent !== null ? ` och exit tickets ${exit.snittProcent} %` : ''}`
      + `${narvaro?.narvaroProcent !== undefined && narvaro.narvaroProcent !== null ? `, med ${narvaro.narvaroProcent} % närvaro` : ''}.`;

  const ovningar = (rapport?.kapitel ?? []).flatMap((k) => k.delkapitel
    .filter((d) => d.status === 'ova' && d.socrativeRum !== null)
    .map((d) => ({ kod: d.kod, namn: d.namn, rum: d.socrativeRum!, url: socrativeElevLank(d.socrativeRum!) })));
  const filmer = (rapport?.kapitel ?? []).flatMap((k) => k.filmer);

  return {
    elev, amneNamn,
    period: { fran: f.fran ?? null, till: f.till ?? null },
    kurva: elevKurva(s, elevId, f),
    tillfallen: provTillfallen(s, f),
    kallor,
    narvaroProcent: narvaro?.narvaroProcent ?? null,
    narvaroLektioner: narvaro?.lektioner ?? 0,
    franvaroDatum: narvaro?.franvaroDatum ?? [],
    lektionsDiff: lekt?.diffSnitt ?? null,
    lart: tkElev?.lart ?? 0,
    glomt: tkElev?.glomt ?? 0,
    segment, matris, nu, ovningsDubbletter: dubblettOvningar, inkluderadeOvningar: harm.inkluderade, fastnat, ovningar, filmer, rapport, laget, rad, sammanfattning,
  };
}

// ── Del 85: lätt översikt för rapportlistan ──────────────────
//
// elevanalys() gör om hela analysen per elev (trendkoll, delkapitel,
// begrepp som fastnat, provtillfällen). Att köra den för 30 elever vid
// varje omritning låser gränssnittet. Översikten räknar i stället EN gång
// för klassen och delar ut siffrorna per elev.

export interface RapportRad {
  elev: Elev;
  laxforhorProcent: number | null;
  exitProcent: number | null;
  helhetProcent: number | null;
  narvaroProcent: number | null;
  antalFastnat: number;
  /** Antal saker som behöver tas tag i (låga snitt, frånvaro, glömska). */
  oro: number;
  antalProv: number;
}

/** Nyckeltal per elev för rapportlistan — en genomgång av data, inte en per elev. */
export function rapportOversikt(sIn: Struktur, f: DashboardFilter, sok = ''): RapportRad[] {
  const s = harmoniseraOvningar(sIn, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) }).s;
  const elever = sokElever(s, f.klassId, sok);
  const ids = new Set(elever.map((e) => e.id));
  const rs = (s.resultat ?? []).filter((r) => ids.has(r.elevId)
    && (f.amneId === undefined || r.amneId === f.amneId)
    && (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till));
  const perElev = new Map<string, typeof rs>();
  for (const r of rs) perElev.set(r.elevId, [...(perElev.get(r.elevId) ?? []), r]);
  const narvaro = new Map(elevNarvaro(s, f).map((n) => [n.elev.id, n]));
  const fastnat = new Map<string, number>();
  const delF = { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}), ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) };
  for (const b of aterkommandeFelKlass(s, delF)) {
    for (const e of b.elever) fastnat.set(e.elev.id, (fastnat.get(e.elev.id) ?? 0) + 1);
  }
  const procentFor = (rader: typeof rs, kalla?: ResultatKalla) =>
    snitt(rader.filter((r) => kalla === undefined || r.kalla === kalla).map(resultatProcent).filter((x): x is number => x !== null));

  return elever.map((elev) => {
    const egna = perElev.get(elev.id) ?? [];
    const lax = procentFor(egna, 'socrative-laxforhor');
    const exit = procentFor(egna, 'socrative-exit');
    const n = narvaro.get(elev.id)?.narvaroProcent ?? null;
    const antalFastnat = fastnat.get(elev.id) ?? 0;
    const laxKrav = kravFor('socrative-laxforhor') ?? 90;
    const exitKrav = kravFor('socrative-exit') ?? 70;
    // Utan resultat vet vi ingenting — då är det inte "oro", det är saknad data
    let oro = 0;
    if (egna.length === 0) return { elev, laxforhorProcent: null, exitProcent: null, helhetProcent: null, narvaroProcent: n, antalFastnat, oro: 0, antalProv: 0 };
    if (lax !== null && lax < laxKrav) oro += 1;
    if (exit !== null && exit < exitKrav) oro += 1;
    if (n !== null && n < 80) oro += 1;
    if (antalFastnat > 0) oro += 1;
    return {
      elev, laxforhorProcent: lax, exitProcent: exit, helhetProcent: procentFor(egna),
      narvaroProcent: n, antalFastnat, oro, antalProv: egna.length,
    };
  });
}
