/**
 * SuperTeach · Studieguide inför prov.
 *
 * Utgår från vad eleven kan just nu (senaste svaret per fråga) och bygger en
 * plan fram till provet: svagaste delkapitlet först, begreppen att plugga
 * med förklaring, Socrative-rummet att öva i, filmerna att se, och en
 * fördelning över dagarna som är kvar.
 *
 * (Ring 1, I2: ingen fetch/DOM/lagring.)
 */
import type { Elev, PlaneradLektion, Struktur } from './typer.js';
import type { DashboardFilter } from './dashboard.js';
import { harmoniseraOvningar, nulage, type FragaNu } from './delkapiteltrend.js';
import { begreppForFraga, elevrapport, socrativeElevLank, type Elevrapport, type RapportDelkapitel } from './elevrapport.js';
import { amnesPlanFor } from './struktur.js';

export interface StudieDel {
  kod: string;
  namn: string;
  /** Andel rätt just nu på delkapitlets frågor (null = inte testat). */
  procent: number | null;
  /** Begrepp att plugga: senaste svaret fel, eller aldrig testade. */
  plugga: Array<{ begrepp: string; forklaring: string | null; status: 'fel' | 'otestat' }>;
  /** Begrepp som sitter — repeteras snabbt. */
  sitter: string[];
  rum: string | null;
  rumUrl: string | null;
  filmer: Array<{ titel: string; url: string }>;
  sammanfattning: string | null;
  /** Uppskattad tid i minuter. */
  minuter: number;
}

export interface StudieDag {
  /** Dag 1 = idag/första plugg-dagen. */
  dag: number;
  datum: string | null;
  delar: string[];
  minuter: number;
}

export interface Studieguide {
  elev: Elev;
  amneNamn: string;
  provDatum: string | null;
  provRubrik: string | null;
  dagarKvar: number | null;
  /** Delkapitel, svagaste först. */
  delar: StudieDel[];
  plan: StudieDag[];
  /** Andel rätt just nu totalt. */
  nuProcent: number | null;
  rubrik: string;
  text: string[];
  tips: string[];
}

/** Planen för ett ämne med datum (grupp A följt av grupp B) — samma plan som ämnessidan, kalendern och SuperTeach. */
export function planForAmne(s: Struktur, amneId: string, idag?: string): PlaneradLektion[] {
  const p = amnesPlanFor(s, amneId, idag);
  return p === null ? [] : [...p.a, ...p.b];
}

/** Nästa prov i planen på eller efter `idag`: bokens provlektion eller en egen rad av typen prov. */
export function nastaProv(plan: PlaneradLektion[], idag: string): { datum: string; rubrik: string } | null {
  const kandidater = plan
    .filter((p) => p.datum !== null && p.datum >= idag)
    .filter((p) => p.lektion.typ === 'exam' || /\bprov\b/i.test(p.lektion.avsnitt))
    .sort((a, b) => a.datum!.localeCompare(b.datum!));
  const p = kandidater[0];
  return p === undefined ? null : { datum: p.datum!, rubrik: p.lektion.avsnitt };
}

function dagarMellan(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function plusDagar(datum: string, n: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function studieguide(sIn: Struktur, elevId: string, f: DashboardFilter & { amneId: string }, idag: string): Studieguide {
  const s = harmoniseraOvningar(sIn, { klassId: f.klassId, amneId: f.amneId }).s;
  const elev = s.elever.find((e) => e.id === elevId);
  if (elev === undefined) throw new Error('Okänd elev.');
  const amne = s.amnen.find((a) => a.id === f.amneId);
  const amneNamn = amne?.namn ?? 'Ämne';
  const prov = nastaProv(planForAmne(s, f.amneId), idag);
  const dagarKvar = prov === null ? null : dagarMellan(idag, prov.datum);

  let rapport: Elevrapport | null = null;
  try { rapport = elevrapport(s, elevId, f.amneId); } catch { rapport = null; }
  const nu = nulage(s, elevId, { klassId: f.klassId, amneId: f.amneId });

  // Frågetext → begrepp via bokens förklaringar
  const forklaringar: Record<string, string> = {};
  const delkapitelBok: RapportDelkapitel[] = rapport?.kapitel.flatMap((k) => k.delkapitel) ?? [];
  for (const d of delkapitelBok) for (const b of d.begrepp) if (b.forklaring !== null) forklaringar[b.begrepp] = b.forklaring;
  const fragaTillBegrepp = (fr: FragaNu): string => fr.begrepp ?? (Object.keys(forklaringar).length === 0 ? fr.fraga : (begreppForFraga(forklaringar, fr.fraga) ?? fr.fraga));

  // Per delkapitel: vad sitter, vad är fel, vad är otestat
  const delar: StudieDel[] = [];
  const kandidater = delkapitelBok.length > 0
    ? delkapitelBok
    : [...new Set(nu.fragor.map((x) => x.kod))].map((kod) => ({ kod, namn: '', begrepp: [], socrativeRum: null, sammanfattning: null, mal: null, filmer: [] } as unknown as RapportDelkapitel));
  for (const d of kandidater) {
    const fragor = nu.fragor.filter((x) => x.kod === d.kod);
    const fel = fragor.filter((x) => !x.ratt).map(fragaTillBegrepp);
    const ratt = fragor.filter((x) => x.ratt).map(fragaTillBegrepp);
    const testade = new Set([...fel, ...ratt].map((b) => b.toLowerCase()));
    const otestade = d.begrepp.map((b) => b.begrepp).filter((b) => !testade.has(b.toLowerCase()));
    const plugga: StudieDel['plugga'] = [
      ...fel.map((b) => ({ begrepp: b, forklaring: forklaringar[b] ?? null, status: 'fel' as const })),
      ...otestade.map((b) => ({ begrepp: b, forklaring: forklaringar[b] ?? null, status: 'otestat' as const })),
    ];
    // Hoppa över delkapitel som varken testats eller finns i boken med begrepp
    if (plugga.length === 0 && ratt.length === 0) continue;
    delar.push({
      kod: d.kod, namn: d.namn,
      procent: fragor.length === 0 ? null : Math.round((ratt.length / fragor.length) * 100),
      plugga, sitter: ratt,
      rum: d.socrativeRum ?? null, rumUrl: d.socrativeRum !== null && d.socrativeRum !== undefined ? socrativeElevLank(d.socrativeRum) : null,
      filmer: d.filmer, sammanfattning: d.sammanfattning ?? d.mal ?? null,
      // 4 min per begrepp att plugga, 1 min per repetition, 10 min för ett Socrative-varv
      minuter: plugga.length * 4 + ratt.length + (d.socrativeRum ? 10 : 0),
    });
  }
  // Svagaste först: otestat/lågt procent högst upp
  delar.sort((a, b) => (a.procent ?? -1) - (b.procent ?? -1) || b.plugga.length - a.plugga.length);

  // Dagsplan: sprid delkapitlen över dagarna som finns, max 45 min/dag om möjligt
  const dagar = dagarKvar === null ? 3 : Math.max(1, Math.min(dagarKvar, 7));
  const plan: StudieDag[] = Array.from({ length: dagar }, (_, i) => ({
    dag: i + 1, datum: prov === null ? null : plusDagar(prov.datum, -(dagar - i)), delar: [], minuter: 0,
  }));
  for (const d of delar) {
    const dagen = plan.reduce((m, x) => (x.minuter < m.minuter ? x : m), plan[0]);
    dagen.delar.push(d.kod); dagen.minuter += d.minuter;
  }
  // Sista dagen: repetition av allt
  if (plan.length > 1 && delar.length > 0) {
    const sist = plan[plan.length - 1];
    if (sist.delar.length === 0) { sist.delar.push('repetition'); sist.minuter = Math.min(45, delar.reduce((n, d) => n + d.sitter.length + d.plugga.length, 0) * 2); }
  }

  const attPlugga = delar.reduce((n, d) => n + d.plugga.length, 0);
  const rubrik = prov === null
    ? `Plugga inför nästa prov i ${amneNamn}`
    : dagarKvar === 0 ? `Provet i ${amneNamn} är idag` : `${dagarKvar} dag${dagarKvar === 1 ? '' : 'ar'} kvar till provet i ${amneNamn}`;
  const text: string[] = [];
  if (nu.fragor.length > 0) text.push(`Du kan ${nu.kan.length} av ${nu.fragor.length} testade begrepp just nu (${nu.procent} %).`);
  if (attPlugga > 0) text.push(`${attPlugga} begrepp behöver du plugga in: ${delar.filter((d) => d.plugga.length > 0).map((d) => `${d.plugga.length} i ${d.kod}`).join(', ')}. Börja med ${delar[0]?.kod ?? ''}.`);
  else if (nu.fragor.length > 0) text.push('Allt du testats på sitter. Använd tiden till att repetera och köra Socrative-rummen en gång till.');
  if (prov !== null) text.push(`Provet ${prov.rubrik} är ${prov.datum}.`);

  const tips = [
    'Skriv en egen förklaring till varje begrepp du ska plugga — med ett exempel. Att formulera själv är det som gör att det fastnar.',
    'Testa dig i Socrative-rummet för delkapitlet när du pluggat klart det. Fel svar där är det som ska repeteras dagen efter.',
    'Repetera med mellanrum: en gång idag, en gång imorgon, en gång dagen före provet. Tre korta pass slår ett långt.',
    'Se filmen först om delkapitlet känns helt nytt, läs sammanfattningen efteråt — inte tvärtom.',
  ];

  return { elev, amneNamn, provDatum: prov?.datum ?? null, provRubrik: prov?.rubrik ?? null, dagarKvar, delar, plan, nuProcent: nu.procent, rubrik, text, tips };
}
