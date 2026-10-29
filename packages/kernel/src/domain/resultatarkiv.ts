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
  if ((s.filregister ?? []).some((f) => f.amneId === amneId && f.filnamn === filnamn)) return true;
  return (s.resultatArkiv ?? []).some((x) => x.amneId === amneId && x.kalla === kalla && x.filnamn === filnamn && x.importerad);
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
