/**
 * SuperTeach · Enkel rapport — ett kortare alternativ till elevanalysen.
 *
 * Tre frågor, inget mer:
 *   1. Går det uppåt? (trenden i läxförhören — positiv om den stiger)
 *   2. Vilka begrepp har eleven haft problem med? (kvar att lära + de som vänts)
 *   3. Hur syns utvecklingen? Från läxförhör till läxförhör, och från exit ticket
 *      till nästa läxförhör som testar samma delkapitel.
 *
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
import type { Elev, Struktur } from './typer.js';
import { kravFor, resultatProcent, type ResultatKalla } from './resultat.js';
import type { DashboardFilter, Trend } from './dashboard.js';
import { delkapitelSegment, harmoniseraOvningar, nulage, type FragaNu } from './delkapiteltrend.js';
import { begreppForFraga, elevrapport } from './elevrapport.js';

export interface EnkelSteg {
  prov: string;
  datum: string;
  procent: number;
  godkant: boolean | null;
  /** Skillnad mot föregående steg i procentenheter. */
  delta: number | null;
}

export interface ExitTillLax {
  kod: string;
  exitProv: string;
  exitDatum: string;
  exitProcent: number;
  laxProv: string;
  laxDatum: string;
  /** Andel rätt på samma delkapitels frågor i läxförhöret. */
  laxProcent: number;
  delta: number;
}

export interface EnkelRapport {
  elev: Elev;
  amneNamn: string;
  trend: Trend | null;
  /** Läxförhör i tidsordning. */
  laxforhor: EnkelSteg[];
  /** Exit ticket → nästa läxförhör på samma delkapitel. */
  exitTillLax: ExitTillLax[];
  /** Begrepp med senaste svaret fel. */
  kvar: FragaNu[];
  /** Begrepp som varit fel men sitter nu. */
  vant: FragaNu[];
  /** Andel rätt just nu (senaste svaret per fråga). */
  nuProcent: number | null;
  /** Rubrik och några meningar, i positiv ton när det går uppåt. */
  rubrik: string;
  text: string[];
  ton: 'bra' | 'okej' | 'oro';
}

const LAX: ResultatKalla = 'socrative-laxforhor';
const EXIT: ResultatKalla = 'socrative-exit';

export function enkelRapport(sIn: Struktur, elevId: string, f: DashboardFilter & { amneId?: string }): EnkelRapport {
  const s = harmoniseraOvningar(sIn, { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}) }).s;
  const elev = s.elever.find((e) => e.id === elevId);
  if (elev === undefined) throw new Error('Okänd elev.');
  const amneNamn = s.amnen.find((a) => a.id === f.amneId)?.namn ?? 'Alla ämnen';
  const egna = (s.resultat ?? []).filter((r) => r.elevId === elevId
    && (f.amneId === undefined || r.amneId === f.amneId)
    && (f.fran === undefined || r.datum >= f.fran) && (f.till === undefined || r.datum <= f.till))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.prov.localeCompare(b.prov, 'sv'));

  // 1. Läxförhör till läxförhör
  const laxRader = egna.filter((r) => r.kalla === LAX);
  const laxforhor: EnkelSteg[] = laxRader.map((r, i) => {
    const procent = resultatProcent(r) ?? 0;
    const fore = i === 0 ? null : (resultatProcent(laxRader[i - 1]) ?? 0);
    const krav = kravFor(LAX);
    return { prov: r.prov, datum: r.datum, procent, godkant: krav === null ? null : procent >= krav, delta: fore === null ? null : Math.round((procent - fore) * 10) / 10 };
  });
  // Trend i den enkla rapporten: första läxförhöret mot det senaste (±5 pe). Enklare
  // än dashboardens halvsplit och begriplig för eleven: "du gick från 50 till 100".
  const trend: Trend | null = laxforhor.length < 2 ? null
    : (() => { const d = laxforhor[laxforhor.length - 1].procent - laxforhor[0].procent; return d > 5 ? 'upp' : d < -5 ? 'ned' : 'jamn'; })();

  // 2. Exit ticket → nästa läxförhör som testar samma delkapitel (per delkapitelsegment)
  const delF = { klassId: f.klassId, ...(f.amneId !== undefined ? { amneId: f.amneId } : {}), ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) };
  const segment = delkapitelSegment(s, { ...delF, elevId });
  const exitTillLax: ExitTillLax[] = [];
  for (const ex of segment.filter((t) => t.kalla === EXIT)) {
    for (const seg of ex.segment) {
      if (seg.procent === null) continue;
      const nasta = segment.find((t) => t.kalla === LAX && t.datum > ex.datum && t.segment.some((x) => x.kod === seg.kod && x.procent !== null));
      if (nasta === undefined) continue;
      const laxSeg = nasta.segment.find((x) => x.kod === seg.kod)!;
      exitTillLax.push({
        kod: seg.kod, exitProv: ex.prov, exitDatum: ex.datum, exitProcent: seg.procent,
        laxProv: nasta.prov, laxDatum: nasta.datum, laxProcent: laxSeg.procent ?? 0,
        delta: (laxSeg.procent ?? 0) - seg.procent,
      });
    }
  }

  // 3. Begrepp — senaste svaret räknas; namn slås upp ur boken
  let nu = nulage(s, elevId, delF);
  if (f.amneId !== undefined) {
    try {
      const rapport = elevrapport(s, elevId, f.amneId, { ...(f.fran !== undefined ? { fran: f.fran } : {}), ...(f.till !== undefined ? { till: f.till } : {}) });
      const forklaringar: Record<string, string> = {};
      for (const k of rapport.kapitel) for (const d of k.delkapitel) for (const b of d.begrepp) if (b.forklaring !== null) forklaringar[b.begrepp] = b.forklaring;
      if (Object.keys(forklaringar).length > 0) {
        const fragor = nu.fragor.map((fr) => { if (fr.begrepp !== undefined) return fr; const b = begreppForFraga(forklaringar, fr.fraga); return b === null ? fr : { ...fr, begrepp: b }; });
        nu = { ...nu, fragor, kan: fragor.filter((x) => x.ratt), kvar: fragor.filter((x) => !x.ratt), fixat: fragor.filter((x) => x.ratt && x.tidigareFel > 0) };
      }
    } catch { /* ämne utan bok — begreppen visas som frågetext */ }
  }

  // Rubrik och text — positivt när det går uppåt
  const sista = laxforhor[laxforhor.length - 1];
  const forsta = laxforhor[0];
  const text: string[] = [];
  let rubrik: string; let ton: EnkelRapport['ton'];
  if (laxforhor.length === 0) {
    rubrik = `${elev.namn} har inga läxförhör i perioden`; ton = 'okej';
  } else if (trend === 'upp') {
    rubrik = `Det går uppåt för ${elev.namn}`; ton = 'bra';
    text.push(`Läxförhören har gått från ${forsta.procent} % (${forsta.datum}) till ${sista.procent} % (${sista.datum}). Bra jobbat — fortsätt så.`);
  } else if (trend === 'ned') {
    rubrik = `${elev.namn} har tappat lite`; ton = sista.godkant === true ? 'okej' : 'oro';
    text.push(`Läxförhören har gått från ${forsta.procent} % till ${sista.procent} %. ${sista.godkant === true ? 'Det är fortfarande godkänt, men riktningen är värd att bryta.' : 'Senaste förhöret var under godkänt.'}`);
  } else {
    rubrik = `${elev.namn} ligger stabilt`; ton = sista.godkant === true ? 'bra' : 'okej';
    text.push(`Läxförhören ligger runt ${sista.procent} %${sista.godkant === true ? ', godkänt' : ''}.`);
  }
  const lyft = exitTillLax.filter((x) => x.delta > 0).length;
  const tapp = exitTillLax.filter((x) => x.delta < 0).length;
  if (exitTillLax.length > 0) {
    text.push(lyft >= tapp
      ? `Från exit ticket till nästa läxförhör förbättrades ${lyft} av ${exitTillLax.length} delkapitel — det du övat på efter lektionen sitter bättre på förhöret.`
      : `Från exit ticket till nästa läxförhör tappade ${tapp} av ${exitTillLax.length} delkapitel — det som satt på lektionen försvann till förhöret, så repetera innan förhöret.`);
  }
  if (nu.kvar.length === 0 && nu.fragor.length > 0) text.push('Inga begrepp är kvar att lära just nu.');
  else if (nu.kvar.length > 0) text.push(`${nu.kvar.length} begrepp är kvar att lära — de står nedan.`);
  if (nu.fixat.length > 0) text.push(`${nu.fixat.length} begrepp som tidigare var fel sitter nu.`);

  return { elev, amneNamn, trend, laxforhor, exitTillLax, kvar: nu.kvar, vant: nu.fixat, nuProcent: nu.procent, rubrik, text, ton };
}
