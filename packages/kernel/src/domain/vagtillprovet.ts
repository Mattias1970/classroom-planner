/**
 * Del 144 · Vägen till provet — kapitlets alla avsnitt som boxar i den ordning
 * de kommer i planeringen: delkapitel (1.1, 1.2 …) och kapitlets övriga avsnitt
 * (Blandade uppgifter, Träna/Utveckla, Förmågorna i fokus, Sammanfattning i
 * Matematik Y; PERSPEKTIV och FINALEN i Spektrum), egna rader (diagnos, prov …)
 * och till sist provet. Varje box vet vilka lektioner den har, om de är gjorda
 * (avklarat-kryss eller passerat datum), pågår eller kommer, och bär med sig
 * det man vill se vid ett klick: sidor, uppgifter per nivå, mål, begrepp,
 * genomgång och exempel.
 */
import type { Bok, Kapitel, Lektion, LektionsTyp, NivaEtiketter, PlaneradLektion, Struktur } from './typer.js';
import { amnesPlanFor, hamtaLektionsplan, lektionsNamn } from './struktur.js';
import { delkapitelKod } from './bok.js';
import { begreppForLektion, effektivaNivaer } from './lektionskort.js';

export type VagTyp = 'delkapitel' | 'blandade' | 'trana' | 'utveckla' | 'formagor' | 'sammanfattning' | 'perspektiv' | 'finalen' | 'diagnos' | 'prov' | 'laboration' | 'annat';
export type VagStatus = 'klar' | 'pagar' | 'kommande' | 'oplanerad';
export type VagLektionStatus = 'klar' | 'idag' | 'kommande' | 'oplanerad';

export interface VagLektion {
  /** Position i ämnets planering (0-baserad) — nyckel till lektionsplanen. */
  index: number;
  namn: string;
  del: number;
  typ: LektionsTyp;
  datum: string | null;
  vecka: number | null;
  grupp?: 'A' | 'B';
  status: VagLektionStatus;
  /** Avklarat-kryss i lektionsplanen. */
  kryss: boolean;
  sidor: string;
  /** Uppgifter per nivå med lärarens egna intervall om de finns. '—' = saknas. */
  uppgifter: { niva1: string; niva2: string; niva3: string };
  mal: string[];
  begrepp: string[];
  genomgang: string;
  exempel: string;
  laxa: string;
}

export interface VagBox {
  id: string;
  typ: VagTyp;
  ikon: string;
  /** '1.6 Tiopotenser', 'Blandade uppgifter', 'PERSPEKTIV' … */
  rubrik: string;
  /** Delkapitelkod när boxen är ett delkapitel. */
  kod: string | null;
  sidor: string;
  status: VagStatus;
  lektioner: VagLektion[];
  klara: number;
  /** Första och sista planerade datum. */
  fran: string | null;
  till: string | null;
  /** Delkapitlets/avsnittets mål och begrepp (samlade över lektionerna, dedupade). */
  mal: string[];
  begrepp: string[];
}

export interface VagTillProvet {
  kapitelNr: number;
  kapitelNamn: string;
  nivaer: NivaEtiketter;
  /** Avsnitten på vägen, i planeringsordning. Provet ligger inte här utan i `prov`. */
  boxar: VagBox[];
  /** Kapitlets prov (sista provboxen), eller null om inget prov är planerat. */
  prov: VagBox | null;
  /** Lektioner gjorda / totalt i kapitlet (inkl. provet). */
  klara: number;
  totalt: number;
}

const IKON: Record<VagTyp, string> = {
  delkapitel: '📖', blandade: '🔀', trana: '🏋️', utveckla: '🚀', formagor: '🎯', sammanfattning: '📝',
  perspektiv: '🔭', finalen: '🏁', diagnos: '🩺', prov: '🏆', laboration: '🧪', annat: '▪',
};

const TYP_NAMN: Record<VagTyp, string> = {
  delkapitel: 'Delkapitel', blandade: 'Blandade uppgifter', trana: 'Träna', utveckla: 'Utveckla', formagor: 'Förmågorna i fokus',
  sammanfattning: 'Sammanfattning', perspektiv: 'Perspektiv', finalen: 'Finalen', diagnos: 'Diagnos', prov: 'Prov', laboration: 'Laboration', annat: 'Avsnitt',
};

/** Läsbart namn på en boxtyp — för infopanelen. */
export function vagTypNamn(typ: VagTyp): string { return TYP_NAMN[typ]; }

/** Vilken sorts box ett avsnitt är, utifrån bokens typ och rubrik. */
export function vagTyp(lektion: Pick<Lektion, 'typ' | 'avsnitt'>): VagTyp {
  const a = lektion.avsnitt.trim();
  if (delkapitelKod(a) !== null) return 'delkapitel';
  if (lektion.typ === 'laboration') return 'laboration';
  if (lektion.typ === 'exam' || /\bprov\b/i.test(a)) return 'prov';
  if (/diagnos/i.test(a)) return 'diagnos';
  if (/blandade/i.test(a)) return 'blandade';
  if (/^träna\b/i.test(a)) return 'trana';
  if (/^utveckla\b/i.test(a)) return 'utveckla';
  if (/förmågor/i.test(a)) return 'formagor';
  if (/sammanfattning/i.test(a)) return 'sammanfattning';
  if (/perspektiv/i.test(a)) return 'perspektiv';
  if (/finalen/i.test(a)) return 'finalen';
  return 'annat';
}

function har(v: string | undefined): v is string { return v !== undefined && v.trim() !== '' && v.trim() !== '—'; }
function rader(v: string | undefined): string[] { return har(v) ? v.split('\n').map((x) => x.trim()).filter((x) => x !== '') : []; }
function unika(v: string[]): string[] { return [...new Set(v)]; }

/** Boxnyckel: delkapitelkod eller normaliserad rubrik (så att 'FINALEN' och 'Finalen' är samma box). */
function boxNyckel(lektion: Pick<Lektion, 'typ' | 'avsnitt'>): string {
  const kod = delkapitelKod(lektion.avsnitt);
  return kod !== null ? `dk:${kod}` : `x:${lektion.avsnitt.trim().toLowerCase()}`;
}

function tomBox(id: string, typ: VagTyp, rubrik: string, kod: string | null, sidor: string): VagBox {
  return { id, typ, ikon: IKON[typ], rubrik, kod, sidor, status: 'oplanerad', lektioner: [], klara: 0, fran: null, till: null, mal: [], begrepp: [] };
}

function boxarUrBoken(kap: Kapitel): VagBox[] {
  const ut: VagBox[] = [];
  const sedda = new Set<string>();
  for (const d of kap.delkapitel) {
    const id = `dk:${d.kod}`;
    if (sedda.has(id)) continue;
    sedda.add(id);
    const b = tomBox(id, 'delkapitel', `${d.kod} ${d.namn}`.trim(), d.kod, d.sidor);
    b.begrepp = [...d.begrepp];
    ut.push(b);
  }
  for (const l of kap.extraLektioner) {
    const id = boxNyckel(l);
    if (sedda.has(id)) continue;
    sedda.add(id);
    ut.push(tomBox(id, vagTyp(l), l.avsnitt.trim(), null, l.sidorTeori));
  }
  return ut;
}

function boxStatus(lektioner: VagLektion[]): VagStatus {
  const planerade = lektioner.filter((l) => l.status !== 'oplanerad');
  if (planerade.length === 0) return 'oplanerad';
  if (planerade.every((l) => l.status === 'klar')) return 'klar';
  if (planerade.some((l) => l.status === 'klar' || l.status === 'idag')) return 'pagar';
  return 'kommande';
}

/**
 * Vägen till provet för ett kapitel. `kapitelNr` undefined = det kapitel som pågår
 * (nästa lektion på eller efter `idag`, annars det sista). null när ämnet saknar
 * bok eller planering.
 */
export function vagTillProvet(s: Struktur, amneId: string, kapitelNr?: number, idag?: string): VagTillProvet | null {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok: Bok | undefined = s.bocker.find((b) => b.id === amne?.bokId);
  const ap = amnesPlanFor(s, amneId, idag);
  if (amne === undefined || bok === undefined || ap === null) return null;
  const dag = idag ?? '';
  const nasta = ap.a.find((r) => r.datum !== null && r.datum >= dag) ?? ap.a[ap.a.length - 1];
  const nr = kapitelNr ?? nasta?.kapitel ?? bok.kapitel[0]?.nr;
  const kap = bok.kapitel.find((k) => k.nr === nr);
  if (kap === undefined) return null;

  // Rader i kapitlet: grupp A i planeringsordning + grupp B:s pass som inte finns i A (halvklass)
  const aPass = new Set(ap.a.map((r) => `${r.datum}|${r.start}`));
  const halv = amne.halvklass === true;
  const alla: Array<{ r: PlaneradLektion; index: number; grupp?: 'A' | 'B' }> = [];
  ap.a.forEach((r, index) => { if (r.kapitel === nr) alla.push({ r, index, ...(halv && !ap.b.some((x) => x.datum === r.datum && x.start === r.start) ? { grupp: 'A' as const } : {}) }); });
  ap.b.forEach((r, index) => { if (r.kapitel === nr && !aPass.has(`${r.datum}|${r.start}`)) alla.push({ r, index, grupp: 'B' }); });
  alla.sort((x, y) => (x.r.datum ?? '9999').localeCompare(y.r.datum ?? '9999') || (x.r.start ?? '').localeCompare(y.r.start ?? '') || x.index - y.index);

  const boxar = boxarUrBoken(kap);
  const perId = new Map(boxar.map((b) => [b.id, b]));
  for (const { r, index, grupp } of alla) {
    const lp = hamtaLektionsplan(s, amneId, index);
    const id = boxNyckel(r.lektion);
    let box = perId.get(id);
    if (box === undefined) {
      box = tomBox(id, vagTyp(r.lektion), r.lektion.avsnitt.trim(), delkapitelKod(r.lektion.avsnitt), r.lektion.sidorTeori);
      perId.set(id, box); boxar.push(box);
    }
    const kryss = lp?.klar === true;
    const status: VagLektionStatus = kryss ? 'klar' : r.datum === null ? 'oplanerad' : r.datum < dag ? 'klar' : r.datum === dag ? 'idag' : 'kommande';
    const begrepp = har(lp?.begreppText) ? lp.begreppText.split(',').map((b) => b.trim()).filter((b) => b !== '') : begreppForLektion(bok, r.kapitel, r.lektion);
    box.lektioner.push({
      index, namn: lektionsNamn(r.lektion, lp), del: r.lektion.del, typ: r.lektion.typ, datum: r.datum, vecka: r.vecka,
      ...(grupp !== undefined ? { grupp } : {}), status, kryss,
      sidor: har(lp?.sidorTeori) ? lp.sidorTeori : r.lektion.sidorTeori,
      uppgifter: effektivaNivaer(r.lektion, lp),
      mal: rader(r.lektion.mal), begrepp, genomgang: r.lektion.genomgang, exempel: r.lektion.ex, laxa: r.lektion.laxa,
    });
  }
  for (const b of boxar) {
    b.klara = b.lektioner.filter((l) => l.status === 'klar').length;
    b.status = boxStatus(b.lektioner);
    const datum = b.lektioner.map((l) => l.datum).filter((d): d is string => d !== null).sort();
    b.fran = datum[0] ?? null; b.till = datum[datum.length - 1] ?? null;
    b.mal = unika(b.lektioner.flatMap((l) => l.mal));
    b.begrepp = unika([...b.begrepp, ...b.lektioner.flatMap((l) => l.begrepp)]);
  }
  // Planeringsordning: boxar med datum sorteras på första datum; boxar utan datum
  // behåller sin plats i bokordningen (efter föregående daterade box).
  let senast = '';
  const nycklad = boxar.map((b, i) => { if (b.fran !== null) senast = b.fran; return { b, i, k: b.fran ?? senast }; });
  nycklad.sort((x, y) => x.k.localeCompare(y.k) || x.i - y.i);
  const ordnade = nycklad.map((x) => x.b);
  const provIdx = ordnade.map((b) => b.typ).lastIndexOf('prov');
  const prov = provIdx >= 0 ? ordnade[provIdx] : null;
  const vag = provIdx >= 0 ? ordnade.filter((_, i) => i !== provIdx) : ordnade;
  const allaLekt = ordnade.flatMap((b) => b.lektioner);
  return {
    kapitelNr: kap.nr, kapitelNamn: kap.namn, nivaer: bok.nivaer, boxar: vag, prov,
    klara: allaLekt.filter((l) => l.status === 'klar').length, totalt: allaLekt.length,
  };
}
