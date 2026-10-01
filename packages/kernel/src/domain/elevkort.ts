/**
 * Del 154 · Elevkortet — enkla resultatdata per elev, en serie per källa
 * (läxförhör, exit tickets, övningar, DigiExam, Magma) för var sitt diagram,
 * samt vårdnadshavarnas e-post (Ring 1, I2: ingen fetch/DOM/lagring).
 *
 * Beskrivande: antal, snitt, senaste och hur många som nått gränsen — inga
 * orsaksslutsatser. Gränserna är källornas egna: läxförhör/övning 90 %, exit
 * 70 %, Magma 70 % (Godkänt), DigiExam provets poänggräns (E-prov: mer än hälften).
 */
import type { Elev, Struktur, Vardnadshavare } from './typer.js';
import { godkantGransFor, klaratKrav, kravFor, nivaText, resultatProcent, TYPNAMN, type Resultat, type ResultatKalla } from './resultat.js';

export const ELEVKORT_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'socrative-ovning', 'digiexam', 'magma'];
const RUBRIK: Record<ResultatKalla, string> = {
  'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit tickets', 'socrative-ovning': 'Övningar', digiexam: 'DigiExam-prov', magma: 'Magma-test',
};

export interface ElevkortPunkt {
  datum: string;
  prov: string;
  /** Procent rätt (avrundad) eller null. */
  procent: number | null;
  poang: number;
  maxPoang: number;
  /** Nådd gräns: true/false, null när källan saknar gräns (övning har 90 %; DigiExam utan tolkbar gräns). */
  klarat: boolean | null;
  /** 'Bra', 'Godkänt', 'Under godkänd nivå', '8 av 14 p (godkänt från 8)' … */
  omdome: string;
  omprov?: boolean;
}

export interface ElevkortSerie {
  kalla: ResultatKalla;
  rubrik: string;
  /** Gränsen i procent som linje i diagrammet (DigiExam: senaste provets gräns i procent). */
  gransProcent: number | null;
  gransText: string;
  punkter: ElevkortPunkt[];
  antal: number;
  snitt: number | null;
  senaste: number | null;
  klarade: number;
  /** Antal med känd gräns (nämnaren i 'klarade X av Y'). */
  bedomda: number;
}

export interface Elevkort {
  elev: Elev;
  klass: string;
  amne: string | null;
  vardnadshavare: Vardnadshavare[];
  serier: ElevkortSerie[];
  /** Totalt antal resultat i urvalet. */
  antal: number;
}

const snitt = (v: number[]) => (v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length));

function punkt(r: Resultat): ElevkortPunkt {
  const procent = resultatProcent(r);
  const p = (x: number) => String(x).replace('.', ',');
  if (r.kalla === 'digiexam') {
    const g = godkantGransFor(r);
    return {
      datum: r.datum, prov: r.prov, procent, poang: r.poang, maxPoang: r.maxPoang,
      klarat: g === null ? null : r.poang >= g,
      omdome: `${p(r.poang)} av ${p(r.maxPoang)} p${g !== null ? (r.poang >= g ? ' · godkänt' : ` · ej godkänt (gräns ${g})`) : ' · gräns saknas'}`,
      ...(r.omprov === true || /omprov/i.test(r.prov) ? { omprov: true } : {}),
    };
  }
  return { datum: r.datum, prov: r.prov, procent, poang: r.poang, maxPoang: r.maxPoang, klarat: klaratKrav(r), omdome: nivaText(r.kalla, procent) };
}

/** Elevkortet för en elev, valfritt avgränsat till ett ämne. */
export function elevkort(s: Struktur, elevId: string, amneId?: string): Elevkort | null {
  const elev = s.elever.find((e) => e.id === elevId);
  if (elev === undefined) return null;
  const klass = s.klasser.find((k) => k.id === elev.klassId)?.namn ?? '';
  const amne = amneId === undefined || amneId === '' ? null : s.amnen.find((a) => a.id === amneId)?.namn ?? null;
  const egna = (s.resultat ?? []).filter((r) => r.elevId === elevId && (amneId === undefined || amneId === '' || r.amneId === amneId));
  const serier = ELEVKORT_KALLOR.map((kalla): ElevkortSerie => {
    const rs = egna.filter((r) => r.kalla === kalla).sort((a, b) => a.datum.localeCompare(b.datum) || (a.tid ?? '').localeCompare(b.tid ?? '') || a.prov.localeCompare(b.prov, 'sv'));
    const punkter = rs.map(punkt);
    const procent = punkter.map((x) => x.procent).filter((x): x is number => x !== null);
    const bedomda = punkter.filter((x) => x.klarat !== null);
    let gransProcent = kravFor(kalla);
    let gransText = gransProcent === null ? '' : `gräns ${gransProcent} %`;
    if (kalla === 'digiexam') {
      const sista = rs[rs.length - 1];
      const g = sista === undefined ? null : godkantGransFor(sista);
      gransProcent = g === null || sista.maxPoang <= 0 ? null : Math.round((g / sista.maxPoang) * 100);
      gransText = g === null ? (sista === undefined ? 'E-prov: mer än hälften av poängen' : 'gräns saknas') : `godkänt från ${g} av ${sista.maxPoang} p`;
    }
    if (kalla === 'magma') gransText = 'Godkänt 70 % · Bra 85 % · Utmärkt 95 %';
    return {
      kalla, rubrik: RUBRIK[kalla] ?? TYPNAMN[kalla], gransProcent, gransText, punkter,
      antal: punkter.length, snitt: snitt(procent), senaste: procent.length > 0 ? procent[procent.length - 1] : null,
      klarade: bedomda.filter((x) => x.klarat === true).length, bedomda: bedomda.length,
    };
  });
  return { elev, klass, amne, vardnadshavare: elev.vardnadshavare ?? [], serier, antal: egna.length };
}

// ── Vårdnadshavare ───────────────────────────────────────────────────────────

/** Enkel kontroll av en e-postadress: något@något.toppdomän, utan mellanslag. */
export function giltigEpost(epost: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-zåäö]{2,}$/i.test(epost.trim());
}

/** Lägger till en vårdnadshavare (e-posten normaliseras till gemener; samma adress ersätts). Kastar svenska fel. */
export function laggTillVardnadshavare(s: Struktur, elevId: string, v: Vardnadshavare): Struktur {
  const epost = v.epost.trim().toLowerCase();
  if (!giltigEpost(epost)) throw new Error(`"${v.epost.trim()}" är ingen giltig e-postadress.`);
  if (!s.elever.some((e) => e.id === elevId)) throw new Error('Eleven finns inte.');
  const namn = v.namn?.trim() ?? '';
  return {
    ...s,
    elever: s.elever.map((e) => {
      if (e.id !== elevId) return e;
      const kvar = (e.vardnadshavare ?? []).filter((x) => x.epost !== epost);
      return { ...e, vardnadshavare: [...kvar, { epost, ...(namn !== '' ? { namn } : {}) }] };
    }),
  };
}

export function taBortVardnadshavare(s: Struktur, elevId: string, epost: string): Struktur {
  const mal = epost.trim().toLowerCase();
  return {
    ...s,
    elever: s.elever.map((e) => {
      if (e.id !== elevId) return e;
      const kvar = (e.vardnadshavare ?? []).filter((x) => x.epost !== mal);
      if (kvar.length > 0) return { ...e, vardnadshavare: kvar };
      const { vardnadshavare: _bort, ...rest } = e;
      return rest;
    }),
  };
}

/** mailto-länk till elevens vårdnadshavare (tom sträng när inga adresser finns). */
export function vardnadshavareMailto(elev: Pick<Elev, 'vardnadshavare'>, amne = '', text = ''): string {
  const till = (elev.vardnadshavare ?? []).map((v) => v.epost).join(',');
  if (till === '') return '';
  const delar = [amne !== '' ? `subject=${encodeURIComponent(amne)}` : '', text !== '' ? `body=${encodeURIComponent(text)}` : ''].filter((x) => x !== '');
  return `mailto:${till}${delar.length > 0 ? `?${delar.join('&')}` : ''}`;
}
