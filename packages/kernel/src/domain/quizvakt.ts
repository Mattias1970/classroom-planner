/**
 * Del 242 · Vakten vid quizimporten. (Ring 1, I2.)
 *
 *   1. Rätt klass: en rapport hör till klassen vars Socrative-rum den kördes i ('BIOLOGI8AA' → 8A), annars
 *      till klassen där eleverna finns. Den importeras dit — inte till klassen som råkar vara vald — och
 *      elever som redan finns i en annan klass läggs aldrig till i den valda.
 *   2. För få svar: ett quiz där under 30 % av elevernas möjliga svar finns är ett felstartat quiz. Appen
 *      frågar om det ska bort, och kommer ihåg filnamnet (sparradefiler.ts).
 *   3. Elever i fel klass: elever som hamnat i två klasser flyttas hem, med sina resultat och filer.
 *   4. Facit: quiz där ingen hade alla rätt fick en osäker svarsnyckel. Den räknas om så att den förklarar
 *      allas poäng (socrative.ts) — begreppet, som frågan känns igen på, är det rätta svaret.
 */
import { socrativeRum } from './amnen.js';
import { fragenyckel } from './fragaidentitet.js';
import { sammaElevNamn, type FilPost, type Resultat, type ResultatKalla } from './resultat.js';
import { harledSvarsnyckelMedKvalitet, klassificeraSocrativeFil, tolkaSocrativeFilnamn } from './socrative.js';
import { sparraFilnamn } from './sparradefiler.js';
import { elevIKlassen } from './struktur.js';
import { planForAmne } from './studieguide.js';
import { svarNyckel } from './svarsform.js';
import { arRatt } from './trendkoll.js';
import type { Elev, Struktur } from './typer.js';

const SOCRATIVE: ReadonlySet<ResultatKalla> = new Set<ResultatKalla>(['socrative-laxforhor', 'socrative-exit', 'socrative-ovning']);

/** Under den här andelen av elevernas möjliga svar räknas ett quiz som felstartat. */
export const LAGSTA_SVARSANDEL = 0.3;

const namnNyckel = (namn: string) => namn.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter((x) => x !== '').sort().join(' ');
/** Samma person: samma namn oavsett ordning ('Berg, Anna' = 'Anna Berg'), med eller utan mellannamn. Inte bara förnamnet. */
export function sammaPerson(a: string, b: string): boolean {
  const na = namnNyckel(a);
  return na !== '' && (na === namnNyckel(b) || sammaElevNamn(a, b));
}

// ── 1. Rätt klass ───────────────────────────────────────────────────────────────────────

export interface RapportKlass {
  klassId: string;
  /** Ämnet när rummet pekar ut det ('BIOLOGI8AA' → Biologi i 8A), annars null. */
  amneId: string | null;
  /** Hur klassen avgjordes: rapportens rum, var eleverna finns, eller den valda klassen. */
  skal: 'rum' | 'elever' | 'vald';
}

/**
 * Klassen en Socrative-rapport hör till. Klassrummet ('BIOLOGI8AA') avgör; annars klassen där flest av
 * rapportens elever finns, om det är fler än i den valda klassen och minst hälften av rapportens namn.
 */
export function klassForRapport(s: Struktur, valdKlassId: string, rum: string, namn: Array<{ namn: string }>): RapportKlass {
  const rumN = rum.replace(/\s+/g, '').toUpperCase();
  const viaRum = s.amnen.filter((a) => {
    const k = s.klasser.find((x) => x.id === a.klassId);
    return k !== undefined && rumN !== '' && socrativeRum(a.namn, k.namn).toUpperCase() === rumN;
  });
  if (new Set(viaRum.map((a) => a.klassId)).size === 1) return { klassId: viaRum[0].klassId, amneId: viaRum.length === 1 ? viaRum[0].id : null, skal: 'rum' };
  const traffar = (klassId: string) => {
    const elever = s.elever.filter((e) => e.klassId === klassId);
    return namn.filter((n) => elever.some((e) => sammaPerson(e.namn, n.namn))).length;
  };
  const vald = traffar(valdKlassId);
  let bast: { klassId: string; n: number } | null = null;
  for (const k of s.klasser) {
    if (k.id === valdKlassId) continue;
    const n = traffar(k.id);
    if (bast === null || n > bast.n) bast = { klassId: k.id, n };
  }
  if (bast !== null && bast.n > vald && bast.n * 2 >= namn.length) return { klassId: bast.klassId, amneId: null, skal: 'elever' };
  return { klassId: valdKlassId, amneId: null, skal: 'vald' };
}

/**
 * Delar en roster i dem som får läggas till i klassen och dem som redan finns i en ANNAN klass — de hör
 * hemma där och läggs inte till här.
 */
export function rosterUtanAndraKlasser<T extends { namn: string }>(s: Struktur, klassId: string, rader: T[]): { rader: T[]; iAndraKlasser: Array<{ namn: string; klassNamn: string }> } {
  const andra = s.elever.filter((e) => e.klassId !== klassId);
  const ut: T[] = []; const iAndra = new Map<string, { namn: string; klassNamn: string }>();
  for (const r of rader) {
    const e = andra.find((x) => sammaPerson(x.namn, r.namn));
    if (e === undefined) { ut.push(r); continue; }
    iAndra.set(namnNyckel(r.namn), { namn: r.namn, klassNamn: s.klasser.find((k) => k.id === e.klassId)?.namn ?? '?' });
  }
  return { rader: ut, iAndraKlasser: [...iAndra.values()] };
}

// ── 2. För få svar ──────────────────────────────────────────────────────────────────────

export interface Svarsandel {
  /** Svar som finns (besvarade frågor; utan frågekolumner: elever som deltog). */
  besvarade: number;
  /** Elevernas möjliga antal svar: elever × frågor. */
  mojliga: number;
  andel: number;
  elever: number;
  fragor: number;
  deltog: number;
}

/** Eleverna som kunde ha svarat: klassen den dagen — eller bara halvklassgruppen när alla som svarade går i samma grupp. */
function mojligaElever(s: Struktur, klassId: string, datum: string, deltagare: Elev[]): number {
  const klassen = s.elever.filter((e) => e.klassId === klassId && elevIKlassen(e, datum));
  if (klassen.length === 0) return 0;
  const grupper = new Set(deltagare.map((e) => e.grupp));
  if (deltagare.length > 0 && grupper.size === 1 && new Set(klassen.map((e) => e.grupp)).size > 1) {
    const g = [...grupper][0];
    return klassen.filter((e) => e.grupp === g).length;
  }
  return klassen.length;
}

function andelAv(besvarade: number, elever: number, fragor: number, deltog: number): Svarsandel {
  const n = Math.max(elever, deltog);
  const mojliga = n * Math.max(1, fragor);
  return { besvarade, mojliga, andel: mojliga === 0 ? 1 : besvarade / mojliga, elever: n, fragor, deltog };
}

/** Andelen av elevernas möjliga svar i en rapport som ska importeras till klassen. */
export function svarsandelForRapport(
  s: Struktur, klassId: string, datum: string, roster: Array<{ namn: string; deltog: boolean; svar?: string[] }>, fragor: number,
): Svarsandel {
  const deltagare = roster.filter((r) => r.deltog);
  const klassen = s.elever.filter((e) => e.klassId === klassId);
  const matchade = deltagare.map((r) => klassen.find((e) => sammaPerson(e.namn, r.namn))).filter((e): e is Elev => e !== undefined);
  // Klassen kan vara tom eller ofullständig (rostern läggs till vid importen) — då gäller rapportens egen roster
  const elever = Math.max(mojligaElever(s, klassId, datum, matchade), matchade.length === deltagare.length ? 0 : roster.length);
  const besvarade = fragor > 0 ? deltagare.reduce((a, r) => a + (r.svar ?? []).filter((v) => v.trim() !== '').length, 0) : deltagare.length;
  return andelAv(besvarade, elever === 0 ? roster.length : elever, fragor, deltagare.length);
}

function filensResultat(s: Struktur, post: FilPost): Resultat[] {
  return (s.resultat ?? []).filter((r) => r.amneId === post.amneId && r.kalla === post.kalla && r.prov === post.prov
    && (post.datum === undefined || r.datum === post.datum) && (post.rum === undefined || r.rum === undefined || r.rum === post.rum));
}

/** Andelen av elevernas möjliga svar i en importerad fil; null när filen inte har några resultat. */
export function svarsandelForFil(s: Struktur, post: FilPost): Svarsandel | null {
  const rs = filensResultat(s, post);
  if (rs.length === 0) return null;
  const klassId = s.amnen.find((a) => a.id === post.amneId)?.klassId;
  const deltagare = rs.map((r) => s.elever.find((e) => e.id === r.elevId)).filter((e): e is Elev => e !== undefined);
  const elever = klassId === undefined ? 0 : mojligaElever(s, klassId, post.datum ?? rs[0].datum, deltagare);
  const fragor = Math.max(0, ...rs.map((r) => (r.svar ?? []).length));
  const besvarade = fragor > 0 ? rs.reduce((a, r) => a + (r.svar ?? []).filter((x) => x.svar.trim() !== '').length, 0) : rs.length;
  return andelAv(besvarade, elever, fragor, rs.length);
}

export interface FilMedFaSvar { fil: FilPost; klassId: string; andel: Svarsandel }

/** Importerade Socrative-filer med under 30 % av elevernas möjliga svar som läraren inte sagt ska behållas. */
export function filerMedFaSvar(s: Struktur): FilMedFaSvar[] {
  const ut: FilMedFaSvar[] = [];
  for (const fil of s.filregister ?? []) {
    if (!SOCRATIVE.has(fil.kalla) || fil.behallTrotsFaSvar === true) continue;
    const klassId = s.amnen.find((a) => a.id === fil.amneId)?.klassId;
    const andel = svarsandelForFil(s, fil);
    if (klassId === undefined || andel === null || andel.andel >= LAGSTA_SVARSANDEL) continue;
    ut.push({ fil, klassId, andel });
  }
  return ut.sort((a, b) => (a.fil.datum ?? '').localeCompare(b.fil.datum ?? '') || a.fil.filnamn.localeCompare(b.fil.filnamn));
}

/** Tar bort filen och just dess resultat (samma ämne, källa, prov och dag) och spärrar filnamnet. */
export function sparraFil(s: Struktur, filId: string, idag: string): Struktur {
  const post = (s.filregister ?? []).find((f) => f.id === filId);
  if (post === undefined) return s;
  const andel = svarsandelForFil(s, post);
  const bort = new Set(filensResultat(s, post).map((r) => r.id));
  const utan: Struktur = {
    ...s,
    filregister: (s.filregister ?? []).filter((f) => f.id !== filId),
    resultat: (s.resultat ?? []).filter((r) => !bort.has(r.id)),
  };
  return sparraFilnamn(utan, {
    filnamn: post.filnamn, orsak: 'fa-svar', sparrad: idag, prov: post.prov, amneId: post.amneId,
    ...(post.rum !== undefined ? { rum: post.rum } : {}),
    ...(post.datum !== undefined ? { datum: post.datum } : {}), ...(andel !== null ? { andel: andel.andel } : {}),
  });
}

/** Läraren behåller filen trots få svar — appen frågar inte om den igen. */
export function behallFil(s: Struktur, filId: string): Struktur {
  if (!(s.filregister ?? []).some((f) => f.id === filId)) return s;
  return { ...s, filregister: (s.filregister ?? []).map((f) => (f.id === filId ? { ...f, behallTrotsFaSvar: true } : f)) };
}

// ── 3. Elever i fel klass ───────────────────────────────────────────────────────────────

export interface FelKlass {
  /** Klassen eleverna ligger fel i, och klassen de hör hemma i. */
  franKlassId: string;
  tillKlassId: string;
  par: Array<{ franId: string; tillId: string; namn: string }>;
  /** Vad rensningen gör: resultat som flyttas hem, kopior som redan finns där, filer som följer med, resultat utan motsvarande ämne. */
  resultat: number;
  dubbletter: number;
  filer: number;
  utanAmne: number;
}

/** Resultat i klassens eget Socrative-rum ('BIOLOGI8AA') bland de givna eleverna. */
function resultatIKlassrum(s: Struktur, klassId: string, elevIds: ReadonlySet<string>): number {
  const klass = s.klasser.find((k) => k.id === klassId);
  if (klass === undefined) return 0;
  const rum = new Set(s.amnen.filter((a) => a.klassId === klassId).map((a) => socrativeRum(a.namn, klass.namn).toUpperCase()));
  return (s.resultat ?? []).filter((r) => elevIds.has(r.elevId) && r.rum !== undefined && rum.has(r.rum.replace(/\s+/g, '').toUpperCase())).length;
}

/**
 * Elever som finns i två klasser och klassen de hör hemma i. De hör till klassen som (nästan) bara består
 * av dem — 8A:s trettio elever i ett 8B med sextio hör till 8A. Väger det jämnt avgör klassrummet deras
 * resultat kördes i; går det inte att avgöra föreslås ingenting. Minst tre gemensamma elever krävs — en
 * enstaka namne i en annan klass är en annan person.
 */
export function eleverIFelKlass(s: Struktur): FelKlass[] {
  const olika = new Set(s.olikaElever ?? []);
  const ut: FelKlass[] = [];
  for (let i = 0; i < s.klasser.length; i++) for (let j = i + 1; j < s.klasser.length; j++) {
    const [ka, kb] = [s.klasser[i], s.klasser[j]];
    const ea = s.elever.filter((e) => e.klassId === ka.id); const eb = s.elever.filter((e) => e.klassId === kb.id);
    const gemensamma: Array<{ a: Elev; b: Elev }> = [];
    for (const b of eb) {
      const kandidater = ea.filter((a) => sammaPerson(a.namn, b.namn) && !olika.has([a.id, b.id].sort().join('|')));
      if (kandidater.length === 1) gemensamma.push({ a: kandidater[0], b });
    }
    if (gemensamma.length < 3) continue;
    const andelA = gemensamma.length / ea.length; const andelB = gemensamma.length / eb.length;
    let hemma: 'a' | 'b' | null = andelA - andelB >= 0.15 ? 'a' : andelB - andelA >= 0.15 ? 'b' : null;
    if (hemma === null) {
      const ids = new Set(gemensamma.flatMap((g) => [g.a.id, g.b.id]));
      const [ra, rb] = [resultatIKlassrum(s, ka.id, ids), resultatIKlassrum(s, kb.id, ids)];
      hemma = ra > rb ? 'a' : rb > ra ? 'b' : null;
    }
    if (hemma === null) continue;
    const bas = {
      franKlassId: hemma === 'a' ? kb.id : ka.id, tillKlassId: hemma === 'a' ? ka.id : kb.id,
      par: gemensamma.map((g) => (hemma === 'a' ? { franId: g.b.id, tillId: g.a.id, namn: g.a.namn } : { franId: g.a.id, tillId: g.b.id, namn: g.b.namn })),
    };
    const u = rensaEleverIFelKlass(s, bas);
    ut.push({ ...bas, resultat: u.resultat, dubbletter: u.dubbletter, filer: u.filer, utanAmne: u.utanAmne });
  }
  return ut;
}

export interface FelKlassRensning { s: Struktur; resultat: number; dubbletter: number; filer: number; utanAmne: number }

/**
 * Flyttar hem eleverna: deras resultat går till samma elev i rätt klass och till det ämnet där (samma
 * ämnesnamn), filer som bara innehöll de eleverna följer med, och posterna i fel klass tas bort.
 * Resultat som redan finns hemma (samma källa, prov, dag och tid) tas inte dit en gång till.
 */
export function rensaEleverIFelKlass(s: Struktur, f: Pick<FelKlass, 'franKlassId' | 'tillKlassId' | 'par'>, idag?: string): FelKlassRensning {
  const hem = new Map(f.par.map((p) => [p.franId, p.tillId]));
  const hemIds = new Set(hem.values());
  const amneHem = new Map<string, string>();
  for (const a of s.amnen.filter((x) => x.klassId === f.franKlassId)) {
    const m = s.amnen.find((x) => x.klassId === f.tillKlassId && x.namn.trim().toLowerCase() === a.namn.trim().toLowerCase());
    if (m !== undefined) amneHem.set(a.id, m.id);
  }
  // Filer i fel klass där ALLA resultat hör till eleverna som flyttas är den andra klassens quiz
  const filerHem = (s.filregister ?? []).filter((post) => {
    if (!amneHem.has(post.amneId)) return false;
    const rs = filensResultat(s, post);
    return rs.length > 0 && rs.every((r) => hem.has(r.elevId));
  });
  const nyckel = (r: Resultat) => [r.elevId, r.kalla, r.prov.trim().toLowerCase(), r.datum, r.tid ?? '', r.amneId ?? ''].join('|');
  const finnsHemma = new Set((s.resultat ?? []).filter((r) => hemIds.has(r.elevId)).map(nyckel));
  let flyttade = 0; let dubbletter = 0; let utanAmne = 0;
  let resultat: Resultat[] = [];
  for (const r of s.resultat ?? []) {
    const till = hem.get(r.elevId);
    if (till === undefined) { resultat.push(r); continue; }
    const amne = r.amneId !== undefined ? amneHem.get(r.amneId) : undefined;
    if (r.amneId !== undefined && amne === undefined) utanAmne += 1;
    const ny: Resultat = { ...r, elevId: till, ...(amne !== undefined ? { amneId: amne } : {}) };
    if (finnsHemma.has(nyckel(ny))) { dubbletter += 1; continue; }
    finnsHemma.add(nyckel(ny)); resultat.push(ny); flyttade += 1;
  }
  // Filposterna följer med; finns filen redan hemma behålls den som finns där
  const flyttas = new Set(filerHem.map((p) => p.id));
  let filregister: FilPost[] = [];
  for (const post of s.filregister ?? []) {
    if (!flyttas.has(post.id)) { filregister.push(post); continue; }
    const amneId = amneHem.get(post.amneId)!;
    if ((s.filregister ?? []).some((x) => x.amneId === amneId && x.filnamn === post.filnamn)) continue;
    filregister.push({ ...post, amneId });
  }
  // Typen (läxförhör/exit/övning) sattes mot fel klass schema — räkna om den mot rätt klass plan, om läraren inte valt själv
  const efterFlytt: Struktur = { ...s, resultat, filregister };
  for (const post of filerHem) {
    const amneId = amneHem.get(post.amneId)!;
    const namn = tolkaSocrativeFilnamn(post.filnamn);
    if (namn === null || !SOCRATIVE.has(post.kalla)) continue;
    const rs = resultat.filter((r) => r.amneId === amneId && r.kalla === post.kalla && r.prov === post.prov && (post.datum === undefined || r.datum === post.datum));
    if (rs.length === 0 || rs.some((r) => r.manuellTyp === true || r.autoTyp !== true)) continue;
    let k: ReturnType<typeof klassificeraSocrativeFil> | null = null;
    try { k = klassificeraSocrativeFil(post.rum ?? '', namn.startUtc, planForAmne(efterFlytt, amneId, idag)); } catch { k = null; }
    if (k === null || k.kalla === null || k.kalla === post.kalla) continue;
    const ids = new Set(rs.map((r) => r.id)); const kalla: ResultatKalla = k.kalla;
    resultat = resultat.map((r) => (ids.has(r.id) ? { ...r, kalla } : r));
    filregister = filregister.map((x) => (x.id === post.id ? { ...x, kalla } : x));
  }
  const flyttadeNamn = new Set(filerHem.map((p) => `${p.amneId}|${p.filnamn}`));
  const till = new Map(s.elever.filter((e) => hemIds.has(e.id)).map((e) => [e.id, e]));
  const fran = new Map(s.elever.filter((e) => hem.has(e.id)).map((e) => [e.id, e]));
  const inlamnatHemma = new Set((s.inlamningar ?? []).filter((x) => hemIds.has(x.elevId)).map((x) => `${x.elevId}|${x.uppgift}`));
  const ut: Struktur = {
    ...s,
    elever: s.elever.filter((e) => !hem.has(e.id)).map((e) => {
      if (!till.has(e.id)) return e;
      const kopia = [...fran.values()].find((x) => hem.get(x.id) === e.id);
      if (kopia === undefined) return e;
      return {
        ...e,
        ...(e.socrativeId === undefined && kopia.socrativeId !== undefined ? { socrativeId: kopia.socrativeId } : {}),
        ...(e.epost === undefined && kopia.epost !== undefined ? { epost: kopia.epost } : {}),
      };
    }),
    resultat, filregister,
    ...(s.resultatArkiv !== undefined ? {
      resultatArkiv: s.resultatArkiv.map((x) => (flyttadeNamn.has(`${x.amneId}|${x.filnamn}`) ? { ...x, amneId: amneHem.get(x.amneId)! } : x)),
    } : {}),
    ...(s.inlamningar !== undefined ? {
      inlamningar: s.inlamningar.flatMap((x) => {
        const t = hem.get(x.elevId);
        if (t === undefined) return [x];
        if (inlamnatHemma.has(`${t}|${x.uppgift}`)) return [];
        const amne = x.amneId !== undefined ? amneHem.get(x.amneId) : undefined;
        const { amneId: _a, ...utanAmneId } = x; void _a;
        return [{ ...utanAmneId, elevId: t, klassId: f.tillKlassId, ...(amne !== undefined ? { amneId: amne } : {}) }];
      }),
    } : {}),
    ...(s.sittplatser !== undefined ? {
      sittplatser: s.sittplatser.map((x) => (x.klassId !== f.franKlassId ? x : { ...x, platser: x.platser.map((p) => (p.elevId !== null && hem.has(p.elevId) ? { ...p, elevId: null } : p)) })),
    } : {}),
    ...(s.samtalsUtvarderingar !== undefined ? {
      samtalsUtvarderingar: Object.fromEntries(Object.entries(s.samtalsUtvarderingar).filter(([k]) => !hem.has(k.split('|')[0]))),
    } : {}),
  };
  return { s: ut, resultat: flyttade, dubbletter, filer: filerHem.length, utanAmne };
}

// ── 4. Facit ────────────────────────────────────────────────────────────────────────────

export interface FacitRattning {
  s: Struktur;
  /** Quiz där minst ett svar fick ändrad rättning. */
  quiz: number;
  /** Svar som bytte mellan rätt och fel. */
  svar: number;
}

/**
 * Räknar om svarsnyckeln för importerade Socrative-quiz och rättar svaren efter den. Bara quiz där nyckeln
 * går att lita på ändras: den förklarar varje elevs poäng exakt, och quizet har minst 30 % av de möjliga
 * svaren. Äldre resultat utan sparat facit får det. Oförändrad struktur returneras som samma objekt.
 */
export function rattaFacit(s: Struktur): FacitRattning {
  const grupper = new Map<string, Resultat[]>();
  for (const r of s.resultat ?? []) {
    if (!SOCRATIVE.has(r.kalla) || (r.svar ?? []).length === 0) continue;
    const n = `${r.amneId ?? ''}|${r.datum}|${r.kalla}|${r.prov}|${r.rum ?? ''}`;
    const g = grupper.get(n);
    if (g === undefined) grupper.set(n, [r]); else g.push(r);
  }
  const nya = new Map<string, Resultat>();
  let quiz = 0; let svar = 0;
  for (const rs of grupper.values()) {
    const index = new Map<string, number>();
    for (const r of rs) for (const sv of r.svar ?? []) { const n = fragenyckel(sv.fraga); if (!index.has(n)) index.set(n, index.size); }
    const antal = index.size;
    const rader = rs.map((r) => {
      const rad = new Array<string>(antal).fill('');
      for (const sv of r.svar ?? []) rad[index.get(fragenyckel(sv.fraga))!] = sv.svar;
      return { deltog: true, poang: r.poang, maxPoang: r.maxPoang, svar: rad };
    });
    const besvarade = rader.reduce((a, x) => a + x.svar.filter((v) => v.trim() !== '').length, 0);
    if (besvarade < LAGSTA_SVARSANDEL * rader.length * antal) continue;
    const k = harledSvarsnyckelMedKvalitet(rader, antal);
    if (!k.exakt) continue;
    let ommarkerat = false;
    for (const r of rs) {
      let andrad = false;
      const nySvar = (r.svar ?? []).map((sv) => {
        const facit = k.nyckel[index.get(fragenyckel(sv.fraga))!];
        if (facit === null) return sv;
        const ratt = arRatt(sv.svar, facit);
        const sammaFacit = sv.facit !== undefined && svarNyckel(sv.facit) === svarNyckel(facit);
        if (sammaFacit && sv.ratt === ratt) return sv;
        andrad = true;
        if (sv.ratt !== ratt) { svar += 1; ommarkerat = true; }
        return { ...sv, ratt, facit: sammaFacit ? sv.facit! : facit };
      });
      if (andrad) nya.set(r.id, { ...r, svar: nySvar });
    }
    if (ommarkerat) quiz += 1;
  }
  if (nya.size === 0) return { s, quiz: 0, svar: 0 };
  return { s: { ...s, resultat: (s.resultat ?? []).map((r) => nya.get(r.id) ?? r) }, quiz, svar };
}
