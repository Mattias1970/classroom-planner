/**
 * Del 151 · Elevrapportens pedagogiska områden.
 *
 *   1 Lektionerna  — hur mycket eleven lär sig på lektionen: exit tickets (krav 70 %).
 *   2 Läxorna      — hur eleven läser läxan och ökar från gång till gång:
 *                    läxförhör (krav 90 %), begrepp som vänts från fel till rätt.
 *   3 Minnet       — håller eleven i det den kunnat? Upprepade fel på begrepp som
 *                    varit rätt flaggas; ett enstaka fel noteras men flaggas inte.
 *
 * Texterna beskriver resultaten och drar inga orsaksslutsatser. Gränserna är
 * förhörsgränser, inte ämnesbetyg. Råd anger underlag (prov, datum) och högst
 * två fokus. Studio ritar; här bestäms innehållet. (Ring 1, I2.)
 */
import type { Elevanalys } from './elevanalys.js';
import type { GlomskaBegrepp } from './glomska.js';
import { kravFor, niva } from './resultat.js';
/** '2026-09-25' → '25 sep' — utan veckodagsförkortning (fre, tis), som Words svenska stavningskontroll inte känner igen. */
const MAN = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function rapportDatum(d: string): string { return `${Number(d.slice(8, 10))} ${MAN[Number(d.slice(5, 7)) - 1] ?? ''}`; }
const kortDatum = rapportDatum;

export type OmradeTon = 'bra' | 'okej' | 'oro' | 'ingen';

export interface Nyckeltal { etikett: string; varde: string; under?: string }

export interface OmradeBas {
  ton: OmradeTon;
  /** Kort status för översiktsrutan: 'Når kravet', 'Delvis', 'Under kravet', 'Inget underlag'. */
  status: string;
  /** En eller två meningar som beskriver resultaten. */
  slutsats: string;
  nyckeltal: Nyckeltal[];
}

export interface LektionRad { datum: string; prov: string; procent: number; klarat: boolean; niva: string }
export interface LektionOmrade extends OmradeBas {
  rader: LektionRad[];
  snitt: number | null;
  klarade: number;
  /** Snitt senare halvan − första halvan (procentenheter), null vid < 4 exit tickets. */
  utveckling: number | null;
}

export interface LaxRad {
  datum: string; prov: string; procent: number; klarat: boolean; niva: string;
  /** Frågor från exit ticket(s) sedan förra läxförhöret — förra lektionens begrepp (rätt/antal). */
  forraLektionen: { ratt: number; antal: number } | null;
  /** Frågor som var nya i förhöret (varken från exit ticket eller tidigare läxa). */
  nya: { ratt: number; antal: number } | null;
  /** Frågor från tidigare läxförhör — den gamla läxan. */
  tidigare: { ratt: number; antal: number } | null;
}
export interface VandSteg { fran: string; franDatum: string; till: string; tillDatum: string; antal: number; begrepp: string[] }
export interface LaxOmrade extends OmradeBas {
  rader: LaxRad[];
  snitt: number | null;
  klarade: number;
  /** Förändring första → senaste läxförhöret (procentenheter). */
  forandring: number | null;
  /** Steg mellan förhören där begrepp gick från fel till rätt. */
  vandSteg: VandSteg[];
  vantTotalt: number;
  /** Fel i senaste försöket — kvar att lära. */
  kvar: Array<{ begrepp?: string; fraga: string; kod: string; prov: string; datum: string }>;
  /** Tidigare fel, rätt i senaste försöket. */
  fixat: Array<{ begrepp?: string; fraga: string; kod: string }>;
}

export interface MinnesOmrade extends OmradeBas {
  flaggade: GlomskaBegrepp[];
  noterade: GlomskaBegrepp[];
  hallerI: number;
  testadeIgen: number;
}

/** Del 153 · Proven (DigiExam) — finns bara när prov är inrapporterade. */
export interface ProvOmrade extends OmradeBas {
  rader: Array<{ prov: string; datum: string; poang: number; maxPoang: number; procent: number | null; klassSnitt: number | null; mot: number | null }>;
}

export interface RapportOmraden {
  lektioner: LektionOmrade;
  laxor: LaxOmrade;
  minne: MinnesOmrade;
  /** null när inga DigiExam-prov finns i perioden. */
  prov: ProvOmrade | null;
  /** Högst två fokus, med underlag — 'Så går du vidare'. */
  fokus: Array<{ rubrik: string; text: string }>;
}

function snitt(v: number[]): number | null {
  return v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
function halvor(v: number[]): number | null {
  if (v.length < 4) return null;
  const h = Math.floor(v.length / 2);
  return Math.round((snitt(v.slice(v.length - h))! - snitt(v.slice(0, h))!));
}
const tecken = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`;
/** 1 begrepp / 3 begrepp — med rätt pronomen efter (det/de). */
const ettFlera = (n: number, en: string, flera: string) => (n === 1 ? en : flera);

function lektioner(a: Elevanalys): LektionOmrade {
  const krav = kravFor('socrative-exit') ?? 70;
  const rader: LektionRad[] = [...a.lektionsarbete.rader].sort((x, y) => x.datum.localeCompare(y.datum))
    .map((r) => ({ datum: r.datum, prov: r.prov, procent: r.procent, klarat: r.procent >= krav, niva: r.niva }));
  const v = rader.map((r) => r.procent);
  const s = snitt(v);
  const klarade = rader.filter((r) => r.klarat).length;
  const utveckling = halvor(v);
  if (rader.length === 0) {
    return { ton: 'ingen', status: 'Inget underlag', slutsats: 'Inga exit tickets i perioden.', nyckeltal: [], rader, snitt: null, klarade: 0, utveckling: null };
  }
  const andel = klarade / rader.length;
  const ton: OmradeTon = s !== null && s >= krav && andel >= 0.7 ? 'bra' : s !== null && s >= krav - 15 ? 'okej' : 'oro';
  const utv = utveckling === null ? '' : utveckling >= 5 ? ` Resultaten på de senare exit tickets ligger ${utveckling} procentenheter högre än på de första.`
    : utveckling <= -5 ? ` Resultaten på de senare exit tickets ligger ${-utveckling} procentenheter lägre än på de första.` : ' Resultaten ligger på ungefär samma nivå under hela perioden.';
  const slutsats = ton === 'bra'
    ? `Exit ticket nådde kravet (${krav} %) på ${klarade} av ${rader.length} lektioner, med ett snitt på ${s} %.${utv}`
    : `Exit ticket nådde kravet (${krav} %) på ${klarade} av ${rader.length} lektioner, med ett snitt på ${s} % (${(niva('socrative-exit', s) ?? '—').toLowerCase()}).${utv}`;
  return {
    ton, status: ton === 'bra' ? 'Når kravet' : ton === 'okej' ? 'Delvis' : 'Under kravet', slutsats,
    nyckeltal: [
      { etikett: 'Snitt exit ticket', varde: `${s} %`, under: niva('socrative-exit', s) ?? undefined },
      { etikett: `Nådde ${krav} %`, varde: `${klarade} av ${rader.length}`, under: 'lektioner' },
      ...(utveckling !== null ? [{ etikett: 'Utveckling', varde: tecken(utveckling), under: 'procentenheter, senare mot första lektionerna' }] : []),
    ],
    rader, snitt: s, klarade, utveckling,
  };
}

function laxor(a: Elevanalys): LaxOmrade {
  const krav = kravFor('socrative-laxforhor') ?? 90;
  const punkter = a.kurva.filter((p) => p.kalla === 'socrative-laxforhor').sort((x, y) => x.datum.localeCompare(y.datum));
  const rader: LaxRad[] = punkter.map((p) => {
    const o = a.ovar.find((x) => x.datum === p.datum && x.prov === p.prov);
    return {
      datum: p.datum, prov: p.prov, procent: p.procent, klarat: p.procent >= krav, niva: niva('socrative-laxforhor', p.procent) ?? '—',
      forraLektionen: o?.exit === null || o?.exit === undefined ? null : { ratt: o.exit.ratt, antal: o.exit.antal },
      nya: o?.nya === null || o?.nya === undefined ? null : { ratt: o.nya.ratt, antal: o.nya.antal },
      tidigare: o?.tidigare === null || o?.tidigare === undefined ? null : { ratt: o.tidigare.ratt, antal: o.tidigare.antal },
    };
  });
  const v = rader.map((r) => r.procent);
  const s = snitt(v);
  const klarade = rader.filter((r) => r.klarat).length;
  const forandring = v.length >= 2 ? v[v.length - 1] - v[0] : null;
  const vandSteg: VandSteg[] = a.trendsteg.filter((st) => st.lart > 0).map((st) => ({
    fran: st.foreProv, franDatum: st.foreDatum, till: st.prov, tillDatum: st.datum, antal: st.lart,
    begrepp: (st.lartBegrepp.length > 0 ? st.lartBegrepp : st.lartFragor).map((b) => b.split(' — ')[0].trim()),
  }));
  const vantTotalt = vandSteg.reduce((n, st) => n + st.antal, 0);
  const kvar = a.nu.kvar.map((x) => ({ ...(x.begrepp !== undefined ? { begrepp: x.begrepp } : {}), fraga: x.fraga, kod: x.kod, prov: x.senastProv, datum: x.senastDatum }));
  const fixat = a.nu.fixat.map((x) => ({ ...(x.begrepp !== undefined ? { begrepp: x.begrepp } : {}), fraga: x.fraga, kod: x.kod }));
  if (rader.length === 0) {
    return { ton: 'ingen', status: 'Inget underlag', slutsats: 'Inga läxförhör i perioden.', nyckeltal: [], rader, snitt: null, klarade: 0, forandring: null, vandSteg, vantTotalt, kvar, fixat };
  }
  const senaste = rader[rader.length - 1];
  const ton: OmradeTon = senaste.klarat && (s ?? 0) >= krav - 5 ? 'bra' : (s ?? 0) >= krav - 20 || (forandring ?? 0) >= 10 ? 'okej' : 'oro';
  const riktning = forandring === null ? '' : forandring >= 5 ? ` Från första till senaste förhöret har resultatet ökat med ${forandring} procentenheter.`
    : forandring <= -5 ? ` Från första till senaste förhöret har resultatet minskat med ${-forandring} procentenheter.` : ' Resultatet ligger på ungefär samma nivå i första och senaste förhöret.';
  const vant = vantTotalt > 0 ? ` ${vantTotalt} ${ettFlera(vantTotalt, 'begrepp har gått', 'begrepp har gått')} från fel till rätt mellan förhören.` : '';
  return {
    ton, status: ton === 'bra' ? 'Når kravet' : ton === 'okej' ? 'På väg' : 'Under kravet',
    slutsats: `Läxförhören nådde kravet (${krav} %) ${klarade} av ${rader.length} gånger. Senaste förhöret gav ${senaste.procent} % (${kortDatum(senaste.datum)}).${riktning}${vant}`,
    nyckeltal: [
      { etikett: 'Senaste läxförhör', varde: `${senaste.procent} %`, under: senaste.niva },
      { etikett: `Nådde ${krav} %`, varde: `${klarade} av ${rader.length}`, under: 'läxförhör' },
      { etikett: 'Från fel till rätt', varde: String(vantTotalt), under: 'begrepp mellan förhören' },
    ],
    rader, snitt: s, klarade, forandring, vandSteg, vantTotalt, kvar, fixat,
  };
}

function minne(a: Elevanalys): MinnesOmrade {
  const g = a.glomska;
  if (g.testadeIgen === 0) {
    return { ton: 'ingen', status: 'Inget underlag', slutsats: 'Inget inlärt begrepp har testats igen ännu.', nyckeltal: [], flaggade: [], noterade: [], hallerI: 0, testadeIgen: 0 };
  }
  const ton: OmradeTon = g.borjarGlomma.length === 0 ? 'bra' : g.borjarGlomma.length <= 2 ? 'okej' : 'oro';
  const flagg = g.borjarGlomma.length === 0 ? ' Inget begrepp har varit fel de två senaste gångerna.'
    : ` ${g.borjarGlomma.length} ${ettFlera(g.borjarGlomma.length, 'begrepp har varit fel de två senaste gångerna efter att tidigare ha varit rätt – det behöver repeteras.', 'begrepp har varit fel de två senaste gångerna efter att tidigare ha varit rätt – de behöver repeteras.')}`;
  const not = g.enstakaFel.length > 0 ? ` ${g.enstakaFel.length} enstaka ${ettFlera(g.enstakaFel.length, 'fel', 'fel')} på inlärda begrepp noteras men flaggas inte.` : '';
  return {
    ton, status: ton === 'bra' ? 'Sitter kvar' : ton === 'okej' ? 'Några att repetera' : 'Behöver repeteras',
    slutsats: `Av ${g.testadeIgen} inlärda begrepp som testats igen var ${g.hallerI} rätt varje gång.${flagg}${not}`,
    nyckeltal: [
      { etikett: 'Rätt varje gång', varde: `${g.procentHallerI ?? '—'} %`, under: `${g.hallerI} av ${g.testadeIgen} inlärda begrepp` },
      { etikett: 'Börjar glömmas', varde: String(g.borjarGlomma.length), under: 'fel två gånger i rad' },
      { etikett: 'Enstaka fel', varde: String(g.enstakaFel.length), under: 'noteras, flaggas inte' },
    ],
    flaggade: g.borjarGlomma, noterade: g.enstakaFel, hallerI: g.hallerI, testadeIgen: g.testadeIgen,
  };
}

function prov(a: Elevanalys): ProvOmrade | null {
  if (a.prov.length === 0) return null;
  const rader = a.prov.map((p) => ({ ...p, mot: p.procent === null || p.klassSnitt === null ? null : Math.round(p.procent - p.klassSnitt) }));
  const sista = rader[rader.length - 1];
  const tal = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  const jamfor = sista.mot === null ? '' : sista.mot >= 0 ? `, ${sista.mot} procentenheter över klassens snitt` : `, ${-sista.mot} procentenheter under klassens snitt`;
  const diff = rader.length >= 2 && rader[0].procent !== null && sista.procent !== null ? Math.round(sista.procent - rader[0].procent) : null;
  const utv = diff === null ? '' : diff > 0 ? ` Från första till senaste provet har resultatet ökat med ${diff} procentenheter.`
    : diff < 0 ? ` Från första till senaste provet har resultatet minskat med ${-diff} procentenheter.` : ' Första och senaste provet gav samma resultat.';
  return {
    ton: 'ingen', status: `${rader.length} prov`,
    slutsats: `Senaste provet, ${sista.prov} (${kortDatum(sista.datum)}): ${tal(sista.poang)} av ${tal(sista.maxPoang)} poäng${sista.procent !== null ? ` (${sista.procent} %)` : ''}${jamfor}.${utv} Provet bedöms per förmåga i DigiExam; betyget är lärarens sammanvägda bedömning.`,
    nyckeltal: [
      { etikett: 'Senaste provet', varde: sista.procent !== null ? `${sista.procent} %` : '—', under: `${tal(sista.poang)} av ${tal(sista.maxPoang)} poäng` },
      { etikett: 'Klassens snitt', varde: sista.klassSnitt !== null ? `${sista.klassSnitt} %` : '—', under: 'samma prov' },
      { etikett: 'Prov i perioden', varde: String(rader.length) },
    ],
    rader,
  };
}

const namnPa = (x: { begrepp?: string; fraga: string }) => x.begrepp ?? x.fraga;

/** Bygger rapportens tre områden och högst två fokus ur elevanalysen. */
export function rapportOmraden(a: Elevanalys): RapportOmraden {
  const lek = lektioner(a); const lax = laxor(a); const min = minne(a);
  const fokus: Array<{ rubrik: string; text: string }> = [];
  if (min.flaggade.length > 0) {
    const b = min.flaggade.slice(0, 4);
    fokus.push({ rubrik: 'Repetera begrepp du har lärt dig',
      text: `${b.map(namnPa).join(', ')}${min.flaggade.length > 4 ? ` och ${min.flaggade.length - 4} till` : ''} – rätt tidigare men fel de två senaste gångerna (senast ${kortDatum(b[0].senasteDatum)}). Läraren går igenom ${ettFlera(min.flaggade.length, 'det', 'dem')} med dig, och ${ettFlera(min.flaggade.length, 'det', 'de')} följs upp i nästa läxförhör.` });
  }
  if (lax.kvar.length > 0 && fokus.length < 2) {
    const b = lax.kvar.slice(0, 4);
    fokus.push({ rubrik: 'Lär dig begreppen som är kvar',
      text: `${lax.kvar.length} begrepp var fel i senaste försöket, till exempel ${b.map(namnPa).join(', ')} (${b[0].prov}, ${kortDatum(b[0].datum)}). Läs sammanfattningen i bilaga B och öva i Socrative-rummet. ${ettFlera(lax.kvar.length, 'Det', 'De')} följs upp i nästa läxförhör.` });
  }
  if (lek.ton === 'oro' && fokus.length < 2) {
    fokus.push({ rubrik: 'Exit ticket på lektionerna',
      text: `Du har nått ${kravFor('socrative-exit') ?? 70} % på exit ticket på ${lek.klarade} av ${lek.rader.length} lektioner. Läraren stämmer av med dig under lektionsarbetet, och det följs upp med nästa exit ticket.` });
  }
  if (fokus.length === 0 && lax.rader.length + lek.rader.length > 0) {
    fokus.push({ rubrik: 'Fortsätt som nu', text: 'Resultaten når förhörsgränserna. Fortsätt att läsa läxan inför varje läxförhör och gör exit ticket noggrant.' });
  }
  return { lektioner: lek, laxor: lax, minne: min, prov: prov(a), fokus };
}
