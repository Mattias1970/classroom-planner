/**
 * Del 203 · Resultatarkivet — varje importerad resultatfil (Socrative, Magma, DigiExam, Teams) laddas
 * upp till datarepot under årskurs/klass/ämne/källa, så att samma filer finns på alla datorer. Här finns
 * sökvägskonventionen och registret över vad som är uppladdat och importerat; själva uppladdningen
 * sker i UI-lagret (I2: ingen fetch här).
 *
 *   resultat/ak8/8B/Biologi/socrative/Biologi41 ... .xlsx
 */
import type { Struktur } from './typer.js';

export type ArkivKalla = 'socrative' | 'magma' | 'digiexam' | 'teams';
export const ARKIV_KALLOR: ArkivKalla[] = ['socrative', 'magma', 'digiexam', 'teams'];
export const ARKIV_KALLA_NAMN: Record<ArkivKalla, string> = { socrative: 'Socrative', magma: 'Magma', digiexam: 'DigiExam', teams: 'Teams' };

export interface ArkivFil {
  /** Sökvägen i datarepot ('resultat/ak8/8B/Biologi/socrative/fil.xlsx'). */
  sokvag: string;
  filnamn: string;
  amneId: string;
  kalla: ArkivKalla;
  /** När filen laddades upp (ISO), eller '' när posten bara registrerar en import från arkivet. */
  uppladdad: string;
  /** Filen har importerats i den här appen. */
  importerad: boolean;
}

const ROT = 'resultat';

/** Ett sökvägsled utan tecken som ställer till det i GitHub-sökvägar. */
export function arkivLed(text: string): string {
  return text.trim().replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').replace(/^\.+/, '') || '-';
}

/** Årskursen för ett ämne: bokens årskurs, annars siffrorna i klassnamnet ('8B' → 8), annars 0. */
export function arskursFor(s: Struktur, amneId: string): number {
  const amne = s.amnen.find((a) => a.id === amneId);
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  if (bok !== undefined && Number.isFinite(bok.arskurs) && bok.arskurs > 0) return bok.arskurs;
  const klass = s.klasser.find((k) => k.id === amne?.klassId);
  const m = /\d+/.exec(klass?.namn ?? '');
  return m === null ? 0 : Number(m[0]);
}

/** Sökvägen en resultatfil får i datarepot. */
export function arkivSokvag(s: Struktur, amneId: string, kalla: ArkivKalla, filnamn: string): string {
  const amne = s.amnen.find((a) => a.id === amneId);
  if (amne === undefined) throw new Error('Okänt ämne.');
  const klass = s.klasser.find((k) => k.id === amne.klassId);
  const ak = arskursFor(s, amneId);
  return `${ROT}/${ak > 0 ? `ak${ak}` : 'ak'}/${arkivLed(klass?.namn ?? 'klass')}/${arkivLed(amne.namn)}/${kalla}/${arkivLed(filnamn)}`;
}

export interface ArkivSokvag { arskurs: number; klass: string; amne: string; kalla: ArkivKalla; filnamn: string }

/** Tolkar en sökväg i arkivet; null för filer som inte följer konventionen. */
export function tolkaArkivSokvag(sokvag: string): ArkivSokvag | null {
  const m = /^resultat\/ak(\d*)\/([^/]+)\/([^/]+)\/(socrative|magma|digiexam|teams)\/([^/]+)$/.exec(sokvag);
  if (m === null) return null;
  return { arskurs: m[1] === '' ? 0 : Number(m[1]), klass: m[2], amne: m[3], kalla: m[4] as ArkivKalla, filnamn: m[5] };
}

/** Ämnet i strukturen som en arkivsökväg hör till (klassnamn + ämnesnamn), eller null. */
export function amneForArkivSokvag(s: Struktur, sokvag: string): string | null {
  const t = tolkaArkivSokvag(sokvag);
  if (t === null) return null;
  const klass = s.klasser.find((k) => arkivLed(k.namn) === t.klass);
  const amne = s.amnen.find((a) => a.klassId === klass?.id && arkivLed(a.namn) === t.amne);
  return amne?.id ?? null;
}

/** Registrerar (eller uppdaterar) en arkivfil. */
export function registreraArkivFil(s: Struktur, fil: ArkivFil): Struktur {
  const kvar = (s.resultatArkiv ?? []).filter((x) => x.sokvag !== fil.sokvag);
  return { ...s, resultatArkiv: [...kvar, fil] };
}

export function arkivFilFor(s: Struktur, sokvag: string): ArkivFil | undefined {
  return (s.resultatArkiv ?? []).find((x) => x.sokvag === sokvag);
}

/** Är filen (för ämnet och källan) redan importerad här? Socrative/Magma/DigiExam syns i filregistret, Teams bara i arkivet. */
export function arArkivFilImporterad(s: Struktur, amneId: string, kalla: ArkivKalla, filnamn: string): boolean {
  // Del 239: jämför som namnet står i arkivet — 'Procent 50%.xlsx' heter 'Procent 50-.xlsx' där, och ska
  // inte se ut som en ny fil på datorn den laddades upp från
  const led = arkivLed(filnamn);
  if ((s.filregister ?? []).some((f) => f.amneId === amneId && arkivLed(f.filnamn) === led)) return true;
  return (s.resultatArkiv ?? []).some((x) => x.amneId === amneId && x.kalla === kalla && arkivLed(x.filnamn) === led && x.importerad);
}

export interface ArkivStatus {
  /** Importerade filer (filregistret + Teams) som har en kopia i datarepot. */
  uppladdade: number;
  /** Importerade filer utan kopia — importera om dem så laddas de upp. */
  saknarKopia: Array<{ amneId: string; filnamn: string; kalla: ArkivKalla }>;
}

/** Hur många av appens importerade filer som finns i arkivet, och vilka som saknas. */
export function arkivStatus(s: Struktur, amneId?: string): ArkivStatus {
  const arkiv = s.resultatArkiv ?? [];
  const har = (aId: string, filnamn: string) => arkiv.some((x) => x.amneId === aId && x.filnamn === filnamn && x.uppladdad !== '');
  const kallaAv = (k: string): ArkivKalla => (k === 'magma' ? 'magma' : k === 'digiexam' ? 'digiexam' : 'socrative');
  const saknarKopia: ArkivStatus['saknarKopia'] = [];
  let uppladdade = 0;
  const sett = new Set<string>();
  for (const f of s.filregister ?? []) {
    if (amneId !== undefined && f.amneId !== amneId) continue;
    const n = `${f.amneId}|${f.filnamn}`; if (sett.has(n)) continue; sett.add(n);
    if (har(f.amneId, f.filnamn)) uppladdade += 1; else saknarKopia.push({ amneId: f.amneId, filnamn: f.filnamn, kalla: kallaAv(f.kalla) });
  }
  for (const x of arkiv) {
    if (x.kalla !== 'teams' || !x.importerad || (amneId !== undefined && x.amneId !== amneId)) continue;
    const n = `${x.amneId}|${x.filnamn}`; if (sett.has(n)) continue; sett.add(n);
    if (x.uppladdad !== '') uppladdade += 1; else saknarKopia.push({ amneId: x.amneId, filnamn: x.filnamn, kalla: 'teams' });
  }
  return { uppladdade, saknarKopia };
}

// ── Del 239 · Var filerna ligger, och vad som är nytt i datarepot ────────────────────────

/** Mappen en arkivsökväg ligger i ('resultat/ak8/8B/Biologi/socrative/fil.xlsx' → 'resultat/ak8/8B/Biologi/socrative'). */
export function arkivMappAv(sokvag: string): string {
  const i = sokvag.lastIndexOf('/');
  return i === -1 ? '' : sokvag.slice(0, i);
}

/** Mappen i datarepot där ämnets filer från en viss källa hamnar. */
export function arkivMappFor(s: Struktur, amneId: string, kalla: ArkivKalla): string {
  return arkivMappAv(arkivSokvag(s, amneId, kalla, 'x'));
}

export interface ArkivRad {
  sokvag: string;
  /** null för filer som ligger utanför konventionen. */
  tolk: ArkivSokvag | null;
  /** Ämnet här i appen, eller null när klassen/ämnet inte finns här. */
  amneId: string | null;
  /** Filen är redan importerad i den här appen. */
  importerad: boolean;
}

export interface ArkivJamforelse {
  rader: ArkivRad[];
  /** Filer i datarepot som hör till en klass och ett ämne här men inte är importerade här. */
  nya: ArkivRad[];
  /** Filer utanför konventionen, eller för klasser/ämnen som inte finns här. */
  okanda: ArkivRad[];
  importerade: number;
}

/** Jämför datarepots resultatfiler (sökvägar under resultat/) med det som är importerat i appen. */
export function jamforArkiv(s: Struktur, sokvagar: string[]): ArkivJamforelse {
  const rader: ArkivRad[] = [...new Set(sokvagar)].sort((a, b) => a.localeCompare(b, 'sv', { numeric: true })).map((sokvag) => {
    const tolk = tolkaArkivSokvag(sokvag);
    const amneId = amneForArkivSokvag(s, sokvag);
    return { sokvag, tolk, amneId, importerad: tolk !== null && amneId !== null && arArkivFilImporterad(s, amneId, tolk.kalla, tolk.filnamn) };
  });
  return {
    rader,
    nya: rader.filter((r) => r.tolk !== null && r.amneId !== null && !r.importerad),
    okanda: rader.filter((r) => r.tolk === null || r.amneId === null),
    importerade: rader.filter((r) => r.importerad).length,
  };
}

export interface ArkivMapp {
  /** Mappens sökväg i datarepot. */
  mapp: string;
  /** Ämnet här i appen (null: mappen hör inte till en klass/ett ämne här). */
  amneId: string | null;
  kalla: ArkivKalla | null;
  /** Filnamnen i mappen. */
  filer: string[];
  /** Hur många av filerna som inte är importerade här. */
  nya: number;
}

/** Mapparna som resultatfilerna ligger i, med filerna per mapp — för att visa var allt finns. */
export function arkivMappar(rader: ArkivRad[]): ArkivMapp[] {
  const ut = new Map<string, ArkivMapp>();
  for (const r of rader) {
    const mapp = arkivMappAv(r.sokvag);
    const m = ut.get(mapp) ?? { mapp, amneId: r.amneId, kalla: r.tolk?.kalla ?? null, filer: [], nya: 0 };
    m.filer.push(r.sokvag.slice(mapp.length + 1));
    if (r.tolk !== null && r.amneId !== null && !r.importerad) m.nya += 1;
    ut.set(mapp, m);
  }
  return [...ut.values()].sort((a, b) => a.mapp.localeCompare(b.mapp, 'sv', { numeric: true }));
}

/** Mapparna som appen själv känner till (uppladdade filer i registret) — går att visa utan nätverk. */
export function kandaArkivMappar(s: Struktur): ArkivMapp[] {
  const uppladdade = (s.resultatArkiv ?? []).filter((x) => x.uppladdad !== '');
  return arkivMappar(uppladdade.map((x) => ({ sokvag: x.sokvag, tolk: tolkaArkivSokvag(x.sokvag), amneId: x.amneId, importerad: true })));
}
