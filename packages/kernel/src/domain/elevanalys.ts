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
import { kravFor, niva, resultatProcent, type ResultatKalla } from './resultat.js';
import {
  elevKurva, elevLektionstest, elevNarvaro, provTillfallen, sokElever, trendFor,
  type DashboardFilter, type KurvPunkt, type ProvTillfalle, type Trend,
} from './dashboard.js';
import { trendkoll, type TrendSteg } from './trendkoll.js';
import { aterkommandeFel, aterkommandeFelKlass, befastaDelkapitel, delkapitelSegment, harmoniseraOvningar, nulage, ovarBild, ovningsDubbletter, type BegreppsFel, type Inkluderad, type Nulage, type OvarRad, type OvningsMatchning, type SegmentTillfalle } from './delkapiteltrend.js';
import { begreppForFraga, elevrapport, socrativeElevLank, type Elevrapport } from './elevrapport.js';
import { planForAmne } from './studieguide.js';
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
  /** Trendkoll: varje jämförelse mellan två förhör med datum och vilka begrepp som glömdes/vändes. */
  trendsteg: TrendSteg[];
  /** Lektionsarbete: varje exit ticket med bedömningsnivå, samt snitt. */
  lektionsarbete: { rader: Array<{ prov: string; datum: string; procent: number; niva: string }>; snitt: number | null; niva: string | null };
  /** Övar eleven? Per läxförhör: exit-begreppen, tidigare läxa och nya frågor var för sig. */
  ovar: OvarRad[];
  /** Delkapitel med alla rätt de två senaste läxförhören — märks aldrig 'öva' eller 'ej godkänt'. */
  befasta: string[];
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

/** Delkapitel där andelen rätt gick ned från exit ticket till nästa läxförhör. */
function exitTillLaxTapp(segment: SegmentTillfalle[]): Array<{ kod: string; exitProcent: number; exitDatum: string; laxProcent: number; laxDatum: string }> {
  const ut: Array<{ kod: string; exitProcent: number; exitDatum: string; laxProcent: number; laxDatum: string }> = [];
  for (const ex of segment.filter((t) => t.kalla === 'socrative-exit')) {
    for (const seg of ex.segment) {
      if (seg.procent === null) continue;
      const nasta = segment.find((t) => t.kalla === 'socrative-laxforhor' && t.datum > ex.datum && t.segment.some((x) => x.kod === seg.kod && x.procent !== null));
      if (nasta === undefined) continue;
      const laxSeg = nasta.segment.find((x) => x.kod === seg.kod)!;
      if ((laxSeg.procent ?? 0) < seg.procent) ut.push({ kod: seg.kod, exitProcent: seg.procent, exitDatum: ex.datum, laxProcent: laxSeg.procent ?? 0, laxDatum: nasta.datum });
    }
  }
  return ut;
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
  const befasta = befastaDelkapitel(segment);
  const ovar = ovarBild(s, elevId, delF);
  const exitRader = egna.filter((r) => r.kalla === 'socrative-exit').map((r) => {
    const procent = resultatProcent(r) ?? 0;
    return { prov: r.prov, datum: r.datum, procent, niva: niva('socrative-exit', procent) ?? '—' };
  });
  const exitSnitt = snitt(exitRader.map((x) => x.procent));
  const lektionsarbete = { rader: exitRader, snitt: exitSnitt, niva: niva('socrative-exit', exitSnitt) };
  let nu = nulage(s, elevId, delF);
  const dubblettOvningar = ovningsDubbletter(s, delF);
  const fastnat = aterkommandeFel(s, elevId, delF);
  const matris = fragematris(s, { ...delF, elevId });
  let rapport: Elevrapport | null = null;
  if (f.amneId !== undefined) {
    try { rapport = elevrapport(s, elevId, f.amneId, { ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) }); } catch { rapport = null; }
  }
  if (rapport !== null && befasta.size > 0) {
    // Befästa delkapitel visas som klarade även om ett äldre prov låg under gränsen
    rapport = { ...rapport, kapitel: rapport.kapitel.map((k) => ({ ...k, delkapitel: k.delkapitel.map((d) => (befasta.has(d.kod) && d.status === 'ova' ? { ...d, status: 'klarat' as const } : d)) })) };
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
  // Principer (efter granskning av 29 rapporter):
  //  • Beskriv vad resultaten visar. Dra inga orsaksslutsatser ("koncentration",
  //    "genomgångarna fungerar") — testerna prövar olika innehåll och svårighet.
  //  • Ange underlaget för varje siffra: vilka prov, hur många, vilket datum.
  //  • Saknat underlag ska synas separat, aldrig som "allt sitter".
  //  • "Rätt i senaste försöket" är det som visats — inte att begreppet "sitter".
  //  • Frånvaro = inget quizsvar den dagen; det bevisar inte lektionsfrånvaro.
  const laget: Rad[] = [];
  const lax = kallor.find((k) => k.kalla === 'socrative-laxforhor');
  const exit = kallor.find((k) => k.kalla === 'socrative-exit');
  const otestade = rapport === null ? 0
    : rapport.kapitel.flatMap((k) => k.delkapitel).flatMap((d) => d.begrepp.map((b) => b.begrepp.toLowerCase()))
      .filter((b, i, arr) => arr.indexOf(b) === i)
      .filter((b) => !nu.fragor.some((fr) => (fr.begrepp ?? '').toLowerCase() === b)).length;
  const senastDatum = nu.senastDatum ?? null;
  const senastProv = nu.senastProv ?? null;

  if (nu.fragor.length > 0) {
    const svaga = nu.delkapitel.filter((d) => d.procent !== null && d.procent < 100);
    laget.push({
      ton: (nu.procent ?? 0) >= 90 ? 'bra' : (nu.procent ?? 0) >= 70 ? 'okej' : 'oro',
      rubrik: `Rätt på ${nu.kan.length} av ${nu.fragor.length} testade begreppsfrågor`,
      text: `Räknat på ditt senaste svar på varje fråga (senaste förhöret ${senastProv ?? ''}${senastDatum !== null ? `, ${senastDatum}` : ''}). `
        + (nu.kvar.length === 0
          ? `Du valde rätt begrepp i senaste försöket på alla ${nu.fragor.length} testade frågor.`
          : `${nu.kvar.length} frågor var fel i senaste försöket${svaga.length > 0 ? `, mest i ${svaga.map((d) => d.kod).join(' och ')}` : ''}.`)
        + (otestade > 0 ? ` ${otestade} begrepp i kapitlet är inte testade än och återstår att följa upp.` : '')
        + (nu.fixat.length > 0 ? ` ${nu.fixat.length} frågor som tidigare var fel är rätt i senaste försöket.` : ''),
    });
  }
  if (lax !== undefined && lax.snittProcent !== null) {
    const over = lax.krav !== null && lax.snittProcent >= lax.krav;
    const n = niva('socrative-laxforhor', lax.snittProcent);
    laget.push({
      ton: over ? 'bra' : lax.snittProcent >= 75 ? 'okej' : 'oro',
      rubrik: over ? `Läxförhör: ${n}` : 'Läxförhören ligger under godkänd nivå',
      text: `Snitt ${lax.snittProcent} % på ${lax.antal} läxförhör${lax.krav !== null ? ` (godkänd nivå från ${lax.krav} %: 90–93 Bra, 94–96 Mycket bra, 97–100 Utmärkt` : ''}`
        + `${lax.klassSnitt !== null ? `; klassens snitt ${lax.klassSnitt} %` : ''}${lax.krav !== null ? ')' : ''}. `
        + 'Läxförhören är kumulativa — varje nytt tar med begreppen från de tidigare delkapitlen.'
        + `${lax.trend === 'upp' ? ' Serien går uppåt.' : lax.trend === 'ned' ? ' Serien går nedåt.' : ''}`
        + ' Förhörsgränsen är ett mått på begreppsfrågorna, inte ett ämnesbetyg.',
    });
  }
  if (exit !== undefined && exit.snittProcent !== null) {
    const over = exit.krav !== null && exit.snittProcent >= exit.krav;
    const n = niva('socrative-exit', exit.snittProcent);
    laget.push({
      ton: over ? 'bra' : exit.snittProcent >= 60 ? 'okej' : 'oro',
      rubrik: over ? `Lektionsarbete: ${n}` : 'Lektionsarbete under godkänd nivå',
      text: `Exit tickets visar hur väl du följde med på lektionen. Snitt ${exit.snittProcent} % på ${exit.antal} exit tickets`
        + `${exit.krav !== null ? ` (godkänd nivå från ${exit.krav} %: 70–80 Bra, 81–90 Mycket bra, 91–100 Utmärkt)` : ''}`
        + `${exit.klassSnitt !== null ? `; klassens snitt ${exit.klassSnitt} %` : ''}. `
        + (lektionsarbete.rader.length > 0 ? `Per lektion: ${lektionsarbete.rader.map((x) => `${x.datum} ${x.procent} % (${x.niva})`).join(', ')}. ` : '')
        + (over ? 'Vi följer upp om du kan använda kunskapen vid ett senare tillfälle.' : 'Vi följer upp vilket stöd som behövs under lektionen.'),
    });
  }
  // Övar eleven? Läxförhör och exit ticket bedöms var för sig; det intressanta är vad som
  // hände från exit ticket till nästa läxförhör, och med den äldre läxan.
  if (ovar.length > 0) {
    const ord: Record<OvarRad['tolkning'], string> = {
      'hela läxan': 'övade hela läxan', 'bara exit-begreppen': 'övade bara exit-begreppen', 'bara tidigare läxa': 'övade bara den äldre läxan',
      'inte övat': 'övade inte inför förhöret', okänt: 'går inte att avgöra',
    };
    const sista = ovar[ovar.length - 1];
    laget.push({
      ton: sista.tolkning === 'hela läxan' ? 'bra' : sista.tolkning === 'inte övat' ? 'oro' : 'okej',
      rubrik: `Inför läxförhöret ${sista.datum}: ${ord[sista.tolkning]}`,
      text: ovar.map((o) => `${o.datum}: `
        + [o.exit !== null ? `exit-begreppen ${o.exit.ratt}/${o.exit.antal} rätt (${o.exit.procent} %)` : null,
          o.tidigare !== null ? `tidigare läxa ${o.tidigare.ratt}/${o.tidigare.antal} (${o.tidigare.procent} %)` : null,
          o.nya !== null ? `nya frågor ${o.nya.ratt}/${o.nya.antal} (${o.nya.procent} %)` : null].filter((x) => x !== null).join(', ')
        + ` → ${ord[o.tolkning]}`).join('. ')
        + '. Högt på exit-begreppen men lågt på den tidigare läxan betyder att bara det senaste avsnittet lästes på; hela läxan är alla begrepp hittills.',
    });
  }
  if (narvaro !== null && narvaro.narvaroProcent !== null) {
    const saknade = narvaro.lektioner - narvaro.narvarande;
    laget.push({
      ton: narvaro.narvaroProcent >= 90 ? 'bra' : narvaro.narvaroProcent >= 80 ? 'okej' : 'oro',
      rubrik: saknade === 0 ? 'Quizsvar på alla lektioner' : `Quizsvar saknas på ${saknade} av ${narvaro.lektioner} lektioner`,
      text: `Registrerat quizsvar på ${narvaro.narvarande} av ${narvaro.lektioner} lektioner (${narvaro.narvaroProcent} %).`
        + (narvaro.franvaroDatum.length > 0 ? ` Utan svar: ${narvaro.franvaroDatum.join(', ')}.` : '')
        + ' Ett saknat quizsvar visar inte att du var borta från lektionen — det stäms av mot närvaroregistreringen.',
    });
  }
  // Glömska och vändningar: det som säger något om hur ofta man läser på
  const tappadeDelar = (segment.length > 0 ? exitTillLaxTapp(segment) : []);
  if (tkElev !== null && (tkElev.lart > 0 || tkElev.glomt > 0)) {
    laget.push({
      ton: tkElev.glomt > tkElev.lart ? 'oro' : tkElev.glomt > 0 ? 'okej' : 'bra',
      rubrik: `${tkElev.glomt} svar glömda, ${tkElev.lart} vända till rätt`,
      text: `På frågor som ställts igen i ett senare förhör gick ${tkElev.glomt} svar från rätt till fel och ${tkElev.lart} från fel till rätt (${tkElev.steg.length} jämförelser). `
        + (tkElev.glomt > 0
          ? 'Svar som går från rätt till fel betyder oftast att repetitionen inte täckt allt sedan förra förhöret — hur ofta du läser på väger tyngre än hur mycket du läser per gång.'
          : 'Inget svar har gått från rätt till fel — det du en gång kunnat har hållit i sig.'),
    });
  }
  if (tappadeDelar.length > 0) {
    laget.push({
      ton: 'okej',
      rubrik: `${tappadeDelar.length} delkapitel tappade från exit ticket till nästa läxförhör`,
      text: `${tappadeDelar.map((x) => `${x.kod}: ${x.exitProcent} % på exit ticket (${x.exitDatum}) → ${x.laxProcent} % på samma delkapitels frågor i läxförhöret (${x.laxDatum})`).join('; ')}. `
        + 'Det som satt direkt efter lektionen höll inte till förhöret — vanligen för att det inte lästes på däremellan.',
    });
  }

  if (harm.inkluderade.length > 0) {
    laget.push({
      ton: 'okej', rubrik: 'Övningar som räknas som förhör',
      text: `${harm.inkluderade.map((o) => `${o.prov} (${o.datum}) kör samma quiz som ${o.liknar} och räknas därför som ${KALLNAMN[o.som].toLowerCase()}`).join('; ')}. `
        + 'Senaste svaret per fråga gäller, så ett rätt svar i övningen räknas.',
    });
  }
  if (dubblettOvningar.length > 0) {
    laget.push({
      ton: 'okej', rubrik: 'Övningar med delvis samma frågor',
      text: `${dubblettOvningar.map((o) => `${o.ovning.prov} delar ${o.overlapp} % av frågorna med ${o.liknar.prov}`).join(', ')}. Ligger som separat övning.`,
    });
  }

  // ── Råd: ett eller två fokus, med underlag och uppföljning ──
  const rad: Rad[] = [];
  const begreppRad = (x: { begrepp?: string; fraga: string }): string =>
    (x.begrepp !== undefined ? `${x.begrepp} — ${x.fraga}` : x.fraga);
  const nastaLax = (() => {
    if (f.amneId === undefined) return null;
    try {
      const plan = planForAmne(s, f.amneId);
      const idag = new Date().toISOString().slice(0, 10);
      const n = plan.filter((p) => p.datum !== null && p.datum > idag && p.lektion.socStart !== '—' && p.lektion.socStart.trim() !== '').sort((a, b) => a.datum!.localeCompare(b.datum!))[0];
      return n === undefined ? null : n.datum;
    } catch { return null; }
  })();
  const uppfoljning = nastaLax !== null ? `Uppföljning vid nästa läxförhör, ${nastaLax}.` : 'Uppföljning vid nästa läxförhör.';

  if (nu.kvar.length > 0) {
    rad.push({
      ton: 'oro', rubrik: `Fokus 1: ${Math.min(nu.kvar.length, 5)} begrepp som var fel i senaste försöket`,
      text: `${nu.kvar.slice(0, 5).map(begreppRad).join(' · ')}${nu.kvar.length > 5 ? ` (och ${nu.kvar.length - 5} till i bilagan)` : ''}. `
        + `Du skriver en egen förklaring med ett exempel till varje och testar dig i Socrative-rummet. Läraren går igenom dem med dig vid nästa lektion. ${uppfoljning}`,
    });
  }
  if (otestade > 0) {
    rad.push({
      ton: 'okej', rubrik: `${otestade} begrepp är inte testade än`,
      text: 'De kommer i nästa kumulativa läxförhör. Läs förklaringarna i bilagan och ta med dem i din repetition.',
    });
  }
  if (nu.fixat.length > 0) {
    rad.push({
      ton: 'bra', rubrik: `${nu.fixat.length} begrepp du svarade rätt på efter tidigare fel`,
      text: `${nu.fixat.slice(0, 5).map(begreppRad).join(' · ')}${nu.fixat.length > 5 ? ` (fler i bilagan)` : ''}. `
        + 'Nästa steg är att förklara dem med egna ord och använda dem i ett sammanhang — det följer vi upp separat.',
    });
  }
  // "Öva mer"-delkapitel bara när begreppsfrågorna faktiskt visar fel, och med underlaget utskrivet
  if (rapport !== null) {
    const ova = rapport.kapitel.flatMap((k) => k.delkapitel.filter((d) => d.status === 'ova'));
    const medUnderlag = ova.map((d) => {
      const nuDel = nu.delkapitel.find((x) => x.kod === d.kod);
      const senaste = d.senaste[0];
      return { d, nuDel, senaste };
    });
    // Delkapitel med alla rätt de två senaste läxförhören är befästa — de får aldrig 'öva' eller 'ej godkänt'
    const behovs = medUnderlag.filter((x) => !befasta.has(x.d.kod) && (x.nuDel === undefined || (x.nuDel.procent ?? 0) < 100));
    const redanRatt = medUnderlag.filter((x) => !befasta.has(x.d.kod) && x.nuDel !== undefined && (x.nuDel.procent ?? 0) >= 100);
    if (behovs.length > 0) {
      rad.push({
        ton: 'okej', rubrik: 'Delkapitel att repetera',
        text: behovs.map((x) => `${x.d.kod} ${x.d.namn} (underlag: ${x.senaste !== undefined ? `${x.senaste.kalla === 'socrative-laxforhor' ? 'läxförhör' : x.senaste.kalla === 'socrative-exit' ? 'exit ticket' : x.senaste.kalla} ${x.senaste.datum}, ${x.senaste.procent} %` : 'äldre resultat'}${x.nuDel !== undefined && x.nuDel.procent !== null ? `; begreppsfrågorna just nu ${x.nuDel.procent} %` : ''})`).join('; ') + '.',
      });
    }
    if (redanRatt.length > 0) {
      rad.push({
        ton: 'bra', rubrik: 'Delkapitel där begreppsfrågorna redan är rätt',
        text: `${redanRatt.map((x) => `${x.d.kod} ${x.d.namn}`).join(', ')}: ett äldre prov (${redanRatt.map((x) => x.senaste?.datum ?? '—').join(', ')}) låg under gränsen, men i senaste förhöret var begreppsfrågorna rätt. Nästa steg här är egen förklaring och tillämpning, inte mer repetition av begreppen.`,
      });
    }
    const filmer = rapport.kapitel.flatMap((k) => k.filmer).slice(0, 4);
    if (filmer.length > 0 && (behovs.length > 0 || nu.kvar.length > 0)) {
      rad.push({ ton: 'okej', rubrik: 'Filmer att se', text: filmer.map((x) => `${x.titel} (${x.for})`).join(' · ') });
    }
  }
  if (lax !== undefined && lax.krav !== null && lax.snittProcent !== null && lax.snittProcent < lax.krav && nu.kvar.length === 0) {
    rad.push({
      ton: 'okej', rubrik: 'Läxförhören under gränsen — vi väljer fokus tillsammans',
      text: `Snittet är ${lax.snittProcent} % mot gränsen ${lax.krav} %. Resultatet säger inte hur mycket du övat. Vi bestämmer ett eller två fokus (till exempel begreppen i ett delkapitel), hur läraren stöttar under lektionen, och ${uppfoljning.toLowerCase()}`,
    });
  }
  if (narvaro !== null && narvaro.narvaroProcent !== null && narvaro.narvaroProcent < 80 && narvaro.franvaroDatum.length > 0) {
    rad.push({
      ton: 'okej', rubrik: 'Lektioner utan quizsvar',
      text: `${narvaro.franvaroDatum.slice(0, 4).join(', ')}${narvaro.franvaroDatum.length > 4 ? ' m.fl.' : ''}. Om du var borta: be om materialet och gör förhören i efterhand — de räknas. Om du var där: säg till läraren så stäms registreringen av.`,
    });
  }
  if ((tkElev !== null && tkElev.glomt > 0) || tappadeDelar.length > 0) {
    const glomda = tkElev?.glomt ?? 0;
    rad.push({
      ton: glomda > (tkElev?.lart ?? 0) ? 'oro' : 'okej',
      rubrik: `Fokus ${nu.kvar.length > 0 ? '2' : '1'}: läs på oftare, inte mer`,
      text: `${glomda > 0 ? `${glomda} svar gick från rätt till fel` : ''}${glomda > 0 && tappadeDelar.length > 0 ? ' och ' : ''}${tappadeDelar.length > 0 ? `${tappadeDelar.length} delkapitel tappade från exit ticket till läxförhör` : ''}. `
        + 'Det tyder på att begreppen inte lästs på mellan lektionerna. Prova tio minuter varje dag i stället för ett långt pass före förhöret: dag 1 samma dag som lektionen, dag 2, sedan varannan dag. '
        + `Läraren kollar av vid nästa lektion vilka dagar du läst. ${uppfoljning}`,
    });
  }
  if (rad.length === 0) {
    rad.push({ ton: 'bra', rubrik: 'Fortsätt som du gör', text: `Inget i underlaget pekar ut något att ändra just nu. ${uppfoljning}` });
  }

  const helhet = snitt(egna.map(resultatProcent).filter((x): x is number => x !== null));
  const sammanfattning = kallor.length === 0
    ? `${elev.namn} har inga resultat i urvalet.`
    : nu.fragor.length > 0
      ? `${elev.namn}: rätt på ${nu.kan.length} av ${nu.fragor.length} testade begreppsfrågor i ${amneNamn} (senaste försöket per fråga${senastDatum !== null ? `, till och med ${senastDatum}` : ''})`
        + `${nu.kvar.length > 0 ? `, ${nu.kvar.length} var fel` : ''}${otestade > 0 ? `, ${otestade} begrepp inte testade än` : ''}.`
      : `${elev.namn}: ${helhet ?? '—'} % i snitt i ${amneNamn}`
      + `${lax?.snittProcent !== undefined && lax.snittProcent !== null ? `, läxförhör ${lax.snittProcent} % (${lax.antal} st)` : ''}`
      + `${exit?.snittProcent !== undefined && exit.snittProcent !== null ? `, exit tickets ${exit.snittProcent} % (${exit.antal} st)` : ''}.`;

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
    trendsteg: tkElev?.steg ?? [],
    lektionsarbete, ovar, befasta: [...befasta].sort(),
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
