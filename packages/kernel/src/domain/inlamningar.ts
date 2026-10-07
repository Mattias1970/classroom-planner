/**
 * Del 163 · Inlämningar ur Teams. Teams exporterar "Tilldelningsdata" (xlsx): en rad per
 * elev och tilldelning med Status (Inlämnat, Inlämnad sent, Inlämnad igen, Returnerad,
 * Visade, Inte inlämnat), förfallodatum och ev. feedback.
 *
 *  - Inlämnad: Inlämnat, Inlämnad sent, Inlämnad igen, Returnerad (returnerad är rättad).
 *    "Visade" betyder bara att eleven öppnat uppgiften — inte inlämnad.
 *  - Flera tilldelningar med samma namn (samma uppgift utdelad flera gånger) slås ihop:
 *    eleven räknas som inlämnad om någon av dem är inlämnad.
 *  - Exporten säger inget om bifogade filer. Appen kan därför inte se om en bild eller
 *    fil fanns med; det får avgöras i Teams. Läraren kan underkänna en inlämning här
 *    (t.ex. inlämnad utan bild) så att den räknas som ej inlämnad.
 *  - Ämnet tolkas ur tilldelningens namn ("Biologi 6.5 Begrepp" → Biologi), delkapitlet
 *    ur koden (6.5) och typen ur orden (Begrepp / Testa dig själv / Laboration).
 */
import { delkapitelKod } from './bok.js';
import { elevIKlassen, nyttId } from './struktur.js';
import { matchaElev } from './resultat.js';
import type { Elev, Struktur } from './typer.js';

export type InlamningsStatus = 'inlamnad' | 'sen' | 'ej';
export type InlamningsTyp = 'begrepp' | 'testa' | 'laboration' | 'annat';

export interface Inlamning {
  id: string;
  elevId: string;
  klassId: string;
  /** Ämnet ur tilldelningens namn — saknas när inget av klassens ämnen passar. */
  amneId?: string;
  /** Uppgiftens namn: 'Biologi 6.5 Begrepp' / 'Biologi 4.4 Testa dig själv' när delkapitel och typ är kända (alla tilldelningar för samma delkapitel och typ slås ihop), annars tilldelningens namn. */
  uppgift: string;
  /** Teams tilldelningsnamn som ingår i uppgiften. */
  teamsNamn: string[];
  /** Delkapitelkod ur namnet ('6.5'), om någon. */
  delkapitel?: string;
  typ: InlamningsTyp;
  /** Förfallodatum (YYYY-MM-DD). */
  forfallo: string;
  status: InlamningsStatus;
  /** Teams status i klartext, för spårbarhet ('Inlämnad sent'). */
  teamsStatus: string;
  feedback?: string;
  /** Läraren har underkänt inlämningen (t.ex. utan bild) — räknas som ej inlämnad. */
  underkand?: boolean;
  kalla: 'teams';
}

export interface TeamsRad {
  namn: string;
  fornamn: string;
  efternamn: string;
  epost: string;
  uppgift: string;
  forfallo: string;
  status: string;
  feedback: string;
}

const STATUS_INLAMNAD = ['inlämnat', 'inlämnad igen', 'returnerad', 'inlämnad'];
const STATUS_SEN = ['inlämnad sent', 'inlämnat sent'];

export function teamsStatusTillStatus(status: string): InlamningsStatus {
  const s = status.trim().toLowerCase();
  if (STATUS_SEN.includes(s)) return 'sen';
  if (STATUS_INLAMNAD.includes(s)) return 'inlamnad';
  return 'ej';
}

/** Uppgiftens namn utan dubbla mellanslag, avslutande skiljetecken och skiftlägesskillnader. */
export function normaliseraUppgift(namn: string): string {
  return namn.replace(/\s+/g, ' ').replace(/\s*[:\-–]\s*$/, '').trim();
}

export const TYP_NAMN: Record<InlamningsTyp, string> = { begrepp: 'Begrepp', testa: 'Testa dig själv', laboration: 'Laboration', annat: 'Uppgift' };

/**
 * Uppgiftens namn i appen: delkapitel + typ när båda är kända ('Biologi 4.4 Testa dig själv'),
 * så att flera tilldelningar för samma delkapitel och typ räknas som en uppgift. Annars
 * tilldelningens normaliserade namn.
 */
export function uppgiftsNamn(tilldelning: string, amnesNamn?: string): string {
  const n = normaliseraUppgift(tilldelning);
  const dk = uppgiftsDelkapitel(n); const typ = uppgiftsTyp(n);
  if (dk === null || typ === 'annat' || typ === 'laboration') return n;
  return `${amnesNamn !== undefined ? `${amnesNamn} ` : ''}${dk} ${TYP_NAMN[typ]}`;
}

export function uppgiftsTyp(namn: string): InlamningsTyp {
  const n = namn.toLowerCase();
  if (/laboration|labb/.test(n)) return 'laboration';
  if (/begrepp/.test(n)) return 'begrepp';
  if (/testa dig själv|frågor|\b\d+\s*[-–]\s*\d+\s*$/.test(n)) return 'testa';
  return 'annat';
}

/** Delkapitelkoden i uppgiftens namn ('Biologi 6.5 Begrepp' → '6.5'). */
export function uppgiftsDelkapitel(namn: string): string | null {
  const m = namn.match(/\b([1-9]\d?\.\d{1,2})\b/);
  return m === null ? null : (delkapitelKod(m[1]) ?? m[1]);
}

function tillDatum(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m === null ? '' : m[1];
}

/**
 * Tolkar bladet "Tilldelningsdata" som rader (xlsx → array of arrays). Rubrikraden hittas
 * på kolumnnamnen (Fullständigt namn, Tilldelningar, Status …), oavsett tomma kolumner före.
 */
export function tolkaTeamsTilldelningar(rader: unknown[][]): TeamsRad[] {
  const hitta = (rad: unknown[], namn: string) => rad.findIndex((c) => String(c ?? '').trim().toLowerCase() === namn);
  let rubrik = -1; let kol: Record<string, number> = {};
  for (let i = 0; i < Math.min(rader.length, 20); i += 1) {
    const r = rader[i];
    const namn = hitta(r, 'fullständigt namn'); const upg = hitta(r, 'tilldelningar'); const st = hitta(r, 'status');
    if (namn !== -1 && upg !== -1 && st !== -1) {
      rubrik = i;
      kol = { namn, fornamn: hitta(r, 'förnamn'), efternamn: hitta(r, 'efternamn'), epost: hitta(r, 'e-postadress'), uppgift: upg, forfallo: hitta(r, 'förfallodatum'), status: st, feedback: hitta(r, 'feedback') };
      break;
    }
  }
  if (rubrik === -1) throw new Error('Hittar inte Teams tilldelningsdata i filen (kolumnerna Fullständigt namn, Tilldelningar och Status).');
  const cell = (r: unknown[], k: string) => (kol[k] === undefined || kol[k] === -1 ? '' : String(r[kol[k]] ?? '').trim());
  const ut: TeamsRad[] = [];
  for (const r of rader.slice(rubrik + 1)) {
    const namn = cell(r, 'namn'); const uppgift = cell(r, 'uppgift');
    if (namn === '' || uppgift === '') continue;
    ut.push({
      namn, fornamn: cell(r, 'fornamn'), efternamn: cell(r, 'efternamn'), epost: cell(r, 'epost').toLowerCase(),
      uppgift, forfallo: tillDatum(kol.forfallo === -1 ? '' : r[kol.forfallo]), status: cell(r, 'status'), feedback: cell(r, 'feedback'),
    });
  }
  return ut;
}

/** Ämnet i klassen vars namn inleder uppgiftens namn ('Biologi 6.5 …' → klassens Biologi). */
export function amneForUppgift(s: Struktur, klassId: string, uppgift: string): string | undefined {
  const n = uppgift.trim().toLowerCase();
  const kandidater = s.amnen.filter((a) => a.klassId === klassId).sort((a, b) => b.namn.length - a.namn.length);
  return kandidater.find((a) => n.startsWith(a.namn.toLowerCase()))?.id;
}

export interface InlamningsImport {
  s: Struktur;
  /** Antal inlämningsposter (elev × uppgift) efter sammanslagning. */
  antal: number;
  uppgifter: number;
  /** Elever i filen som inte matchade någon i klassen. */
  omatchade: string[];
  /** Tilldelningar som slogs ihop (samma uppgift utdelad flera gånger). */
  sammanslagna: string[];
}

const RANG: Record<InlamningsStatus, number> = { inlamnad: 2, sen: 1, ej: 0 };

/**
 * Importerar Teams tilldelningsdata för klassen: eleverna matchas på e-post och namn,
 * tilldelningar med samma namn slås ihop (bästa status vinner) och posterna ersätter
 * tidigare importerade poster för samma uppgift. Lärarens underkännanden behålls.
 */
export function importeraInlamningar(s: Struktur, klassId: string, rader: TeamsRad[]): InlamningsImport {
  if (!s.klasser.some((k) => k.id === klassId)) throw new Error('Okänd klass.');
  const perNyckel = new Map<string, Inlamning>();
  const omatchade = new Set<string>();
  const raderPerNyckel = new Map<string, number>();
  const elevFor = (r: TeamsRad): Elev | null => {
    if (r.epost !== '') {
      const viaEpost = s.elever.find((e) => e.klassId === klassId && (e.epost ?? '').toLowerCase() === r.epost);
      if (viaEpost !== undefined) return viaEpost;
    }
    return matchaElev(s, klassId, r.namn) ?? (r.efternamn !== '' ? matchaElev(s, klassId, `${r.efternamn}, ${r.fornamn}`) : null);
  };
  for (const r of rader) {
    const elev = elevFor(r);
    if (elev === null) { omatchade.add(r.namn); continue; }
    const tilldelning = normaliseraUppgift(r.uppgift);
    const amneId = amneForUppgift(s, klassId, tilldelning);
    const uppgift = uppgiftsNamn(tilldelning, s.amnen.find((a) => a.id === amneId)?.namn);
    const nyckel = `${elev.id}|${uppgift}`;
    raderPerNyckel.set(nyckel, (raderPerNyckel.get(nyckel) ?? 0) + 1);
    const status = teamsStatusTillStatus(r.status);
    const fore = perNyckel.get(nyckel);
    if (fore !== undefined) {
      if (!fore.teamsNamn.includes(tilldelning)) fore.teamsNamn.push(tilldelning);
      if (r.forfallo !== '' && (fore.forfallo === '' || r.forfallo > fore.forfallo)) fore.forfallo = r.forfallo;
      if (RANG[fore.status] >= RANG[status]) continue;
      fore.status = status; fore.teamsStatus = r.status;
      if (r.feedback !== '') fore.feedback = r.feedback;
      continue;
    }
    const dk = uppgiftsDelkapitel(tilldelning);
    perNyckel.set(nyckel, {
      id: nyttId('inl'), elevId: elev.id, klassId, ...(amneId !== undefined ? { amneId } : {}), uppgift, teamsNamn: [tilldelning],
      ...(dk !== null ? { delkapitel: dk } : {}), typ: uppgiftsTyp(tilldelning), forfallo: r.forfallo,
      status, teamsStatus: r.status, ...(r.feedback !== '' ? { feedback: r.feedback } : {}), kalla: 'teams',
    });
  }
  const nya = [...perNyckel.values()];
  const uppgifter = new Set(nya.map((x) => x.uppgift));
  const gamla = s.inlamningar ?? [];
  const underkanda = new Set(gamla.filter((x) => x.klassId === klassId && x.underkand === true).map((x) => `${x.elevId}|${x.uppgift}`));
  const kvar = gamla.filter((x) => !(x.klassId === klassId && uppgifter.has(x.uppgift)));
  const medUnderkant = nya.map((x) => (underkanda.has(`${x.elevId}|${x.uppgift}`) ? { ...x, underkand: true } : x));
  const sammanslagna = [...new Set([...raderPerNyckel.entries()].filter(([, n]) => n > 1).map(([k]) => k.slice(k.indexOf('|') + 1)))].sort((a, b) => a.localeCompare(b, 'sv'));
  return { s: { ...s, inlamningar: [...kvar, ...medUnderkant] }, antal: nya.length, uppgifter: uppgifter.size, omatchade: [...omatchade].sort((a, b) => a.localeCompare(b, 'sv')), sammanslagna };
}

/** Underkänner (eller godkänner igen) en inlämning — t.ex. inlämnad utan bild. */
export function sattInlamningUnderkand(s: Struktur, id: string, underkand: boolean): Struktur {
  return { ...s, inlamningar: (s.inlamningar ?? []).map((x) => (x.id !== id ? x : underkand ? { ...x, underkand: true } : (({ underkand: _u, ...rest }) => { void _u; return rest; })(x))) };
}

/** Räknas inlämningen som gjord? Inlämnad eller sen, och inte underkänd. */
export function arInlamnad(x: Inlamning): boolean {
  return x.underkand !== true && x.status !== 'ej';
}

export interface UppgiftsRad {
  uppgift: string;
  /** Teams tilldelningar som ingår (flera när samma uppgift delats ut flera gånger). */
  teamsNamn: string[];
  amneId?: string;
  delkapitel?: string;
  typ: InlamningsTyp;
  forfallo: string;
  antal: number;
  inlamnade: number;
  sena: number;
  ej: number;
  underkanda: number;
  procent: number;
  /** Elever som inte lämnat in (namn), i klassens ordning. */
  saknas: Array<{ elevId: string; namn: string }>;
}

export interface ElevInlamningsRad {
  elevId: string;
  namn: string;
  antal: number;
  inlamnade: number;
  sena: number;
  procent: number;
  saknas: string[];
}

export interface InlamningsOversikt {
  uppgifter: UppgiftsRad[];
  elever: ElevInlamningsRad[];
  /** Andel inlämnade av alla elev × uppgift. */
  procent: number | null;
}

/** Inlämningarna för klassen (och ämnet), per uppgift och per elev. Elever utanför klassen räknas inte. */
export function inlamningsOversikt(s: Struktur, klassId: string, amneId?: string, idag?: string): InlamningsOversikt {
  const elever = s.elever.filter((e) => e.klassId === klassId && elevIKlassen(e, idag));
  const elevIds = new Set(elever.map((e) => e.id));
  const namn = new Map(elever.map((e) => [e.id, e.namn]));
  const alla = (s.inlamningar ?? []).filter((x) => x.klassId === klassId && elevIds.has(x.elevId) && (amneId === undefined || x.amneId === amneId));
  const perUppgift = new Map<string, Inlamning[]>();
  for (const x of alla) perUppgift.set(x.uppgift, [...(perUppgift.get(x.uppgift) ?? []), x]);
  const uppgifter: UppgiftsRad[] = [...perUppgift.entries()].map(([uppgift, lista]) => {
    const inlamnade = lista.filter((x) => arInlamnad(x) && x.status === 'inlamnad').length;
    const sena = lista.filter((x) => arInlamnad(x) && x.status === 'sen').length;
    const underkanda = lista.filter((x) => x.underkand === true).length;
    const saknas = elever.filter((e) => { const x = lista.find((y) => y.elevId === e.id); return x === undefined || !arInlamnad(x); }).map((e) => ({ elevId: e.id, namn: e.namn }));
    const forsta = lista[0];
    return {
      uppgift, teamsNamn: [...new Set(lista.flatMap((x) => x.teamsNamn))], ...(forsta.amneId !== undefined ? { amneId: forsta.amneId } : {}), ...(forsta.delkapitel !== undefined ? { delkapitel: forsta.delkapitel } : {}),
      typ: forsta.typ, forfallo: lista.map((x) => x.forfallo).sort().pop() ?? '', antal: elever.length, inlamnade, sena, ej: elever.length - inlamnade - sena, underkanda,
      procent: elever.length === 0 ? 0 : Math.round(((inlamnade + sena) / elever.length) * 100), saknas,
    };
  }).sort((a, b) => a.forfallo.localeCompare(b.forfallo) || a.uppgift.localeCompare(b.uppgift, 'sv'));
  const elevRader: ElevInlamningsRad[] = elever.map((e) => {
    const mina = uppgifter.map((u) => alla.find((x) => x.uppgift === u.uppgift && x.elevId === e.id));
    const inlamnade = mina.filter((x) => x !== undefined && arInlamnad(x) && x.status === 'inlamnad').length;
    const sena = mina.filter((x) => x !== undefined && arInlamnad(x) && x.status === 'sen').length;
    const saknas = uppgifter.filter((u, i) => mina[i] === undefined || !arInlamnad(mina[i]!)).map((u) => u.uppgift);
    return { elevId: e.id, namn: namn.get(e.id) ?? '', antal: uppgifter.length, inlamnade, sena, procent: uppgifter.length === 0 ? 0 : Math.round(((inlamnade + sena) / uppgifter.length) * 100), saknas };
  }).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const total = uppgifter.length * elever.length;
  const gjorda = uppgifter.reduce((n, u) => n + u.inlamnade + u.sena, 0);
  return { uppgifter, elever: elevRader, procent: total === 0 ? null : Math.round((gjorda / total) * 100) };
}
