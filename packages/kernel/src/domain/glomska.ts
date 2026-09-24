/**
 * Del 151 · Minnet — börjar eleven glömma begrepp den redan kunnat?
 *
 * Underlag: elevens svar fråga för fråga (frågematrisen med elevId). Ett begrepp
 * räknas som KUNNAT från första gången eleven svarat rätt. Allt som händer
 * därefter avgör:
 *
 *   håller i          — rätt varje gång det testats igen
 *   enstaka fel       — högst ett fel efter att det kunnats, eller fel som
 *                       följts av rätt igen. Noteras men flaggas inte: man kan
 *                       trycka fel.
 *   börjar glömma     — fel de två senaste gångerna det testats, efter att ha
 *                       kunnats. Flaggas.
 *
 * Begrepp som aldrig varit rätt hör inte hit (de är "kvar att lära"). (Ring 1, I2.)
 */
import type { Fragematris } from './delkapiteltrend.js';

export interface GlomskaBegrepp {
  nr: number;
  fraga: string;
  begrepp?: string;
  kod: string;
  /** När begreppet först var rätt. */
  kundeProv: string;
  kundeDatum: string;
  /** Felen efter att det kunnats. */
  fel: Array<{ prov: string; datum: string }>;
  /** Senaste svaret. */
  senasteRatt: boolean;
  senasteDatum: string;
  /** Antal gånger testat efter att det kunnats. */
  testadEfter: number;
}

export interface Glomska {
  /** Flaggas: fel de två senaste gångerna efter att ha kunnats. */
  borjarGlomma: GlomskaBegrepp[];
  /** Noteras: enstaka fel efter att ha kunnats (kan vara felklick). */
  enstakaFel: GlomskaBegrepp[];
  /** Kunnats och rätt varje gång det testats igen. */
  hallerI: number;
  /** Kunnats och testats igen minst en gång — nämnaren för "håller i". */
  testadeIgen: number;
  /** Andel av de återtestade begreppen som hållit i, 0–100; null utan återtest. */
  procentHallerI: number | null;
}

/** Glömskeanalys ur en frågematris byggd för en elev (`elevCeller` satta). */
export function glomskaAnalys(m: Fragematris): Glomska {
  const rader = [...m.rader].sort((a, b) => a.datum.localeCompare(b.datum) || (a.tid ?? '').localeCompare(b.tid ?? ''));
  const borjarGlomma: GlomskaBegrepp[] = [];
  const enstakaFel: GlomskaBegrepp[] = [];
  let hallerI = 0; let testadeIgen = 0;
  m.fragor.forEach((fr, i) => {
    const svar = rader
      .map((r) => ({ prov: r.prov, datum: r.datum, v: r.elevCeller?.[i] }))
      .filter((x): x is { prov: string; datum: string; v: boolean } => x.v === true || x.v === false);
    const k = svar.findIndex((x) => x.v);
    if (k < 0) return;
    const efter = svar.slice(k + 1);
    if (efter.length === 0) return;
    testadeIgen += 1;
    const fel = efter.filter((x) => !x.v);
    if (fel.length === 0) { hallerI += 1; return; }
    const sista = svar[svar.length - 1];
    const rad: GlomskaBegrepp = {
      nr: fr.nr, fraga: fr.fraga, ...(fr.begrepp !== undefined ? { begrepp: fr.begrepp } : {}), kod: fr.kod,
      kundeProv: svar[k].prov, kundeDatum: svar[k].datum,
      fel: fel.map((x) => ({ prov: x.prov, datum: x.datum })),
      senasteRatt: sista.v, senasteDatum: sista.datum, testadEfter: efter.length,
    };
    const tvaSenasteFel = efter.length >= 2 && !efter[efter.length - 1].v && !efter[efter.length - 2].v;
    (tvaSenasteFel ? borjarGlomma : enstakaFel).push(rad);
  });
  return {
    borjarGlomma, enstakaFel, hallerI, testadeIgen,
    procentHallerI: testadeIgen === 0 ? null : Math.round((hallerI / testadeIgen) * 100),
  };
}
