/**
 * Del 203 · Resultatarkivet i UI-lagret: laddar upp importerade resultatfiler till datarepot
 * (resultat/ak8/8B/Biologi/socrative/…), listar och hämtar arkivets filer, och håller en kö av
 * hämtade filer som importsidorna plockar upp ("3 filer från datarepot — granska och importera").
 * Kernel (resultatarkiv.ts) äger sökvägskonventionen och registret.
 */
import { useSyncExternalStore } from 'react';
import { arkivSokvag, registreraArkivFil, type ArkivKalla, type Struktur } from '@planner/kernel';
import { hamtaBinarFilFranGitHub, konfigKomplett, lasGitHubConfig, listaFilerIGitHub, sparaBinarFilTillGitHub } from './github.js';
import { lasStruktur, sparaStruktur } from './store.js';

export interface Uppladdning { sokvag: string; filnamn: string; fel: string | null }

/**
 * Laddar upp filerna till datarepot och registrerar dem (uppladdad + importerad). Utan GitHub-konfiguration
 * registreras bara importen (uppladdad = '') så att "saknar kopia" syns. Fel per fil returneras — inget kastas.
 */
export async function arkiveraFiler(amneId: string, kalla: ArkivKalla, filer: File[], franArkiv = false): Promise<Uppladdning[]> {
  const cfg = lasGitHubConfig();
  const ut: Uppladdning[] = [];
  for (const fil of filer) {
    let s = lasStruktur();
    const sokvag = arkivSokvag(s, amneId, kalla, fil.name);
    const redan = (s.resultatArkiv ?? []).find((x) => x.sokvag === sokvag);
    if (franArkiv || (redan !== undefined && redan.uppladdad !== '')) {
      s = registreraArkivFil(s, { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: redan?.uppladdad ?? (franArkiv ? new Date().toISOString() : ''), importerad: true });
      sparaStruktur(s); ut.push({ sokvag, filnamn: fil.name, fel: null }); continue;
    }
    if (!konfigKomplett(cfg)) {
      s = registreraArkivFil(s, { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: '', importerad: true });
      sparaStruktur(s); ut.push({ sokvag, filnamn: fil.name, fel: 'ingen GitHub-konfiguration — fyll i ☁ Datarepo så laddas nästa import upp' }); continue;
    }
    try {
      await sparaBinarFilTillGitHub(cfg, sokvag, await fil.arrayBuffer());
      s = registreraArkivFil(lasStruktur(), { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: new Date().toISOString(), importerad: true });
      sparaStruktur(s); ut.push({ sokvag, filnamn: fil.name, fel: null });
    } catch (e) {
      s = registreraArkivFil(lasStruktur(), { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: '', importerad: true });
      sparaStruktur(s); ut.push({ sokvag, filnamn: fil.name, fel: e instanceof Error ? e.message : 'uppladdningen misslyckades' });
    }
  }
  return ut;
}

/** Kort text om hur uppladdningen gick, för statusraden. */
export function uppladdningsText(u: Uppladdning[]): string {
  const ok = u.filter((x) => x.fel === null).length;
  const fel = u.filter((x) => x.fel !== null);
  if (u.length === 0) return '';
  if (fel.length === 0) return ` ☁ ${ok} fil${ok === 1 ? '' : 'er'} i datarepot.`;
  return ` ☁ ${ok} av ${u.length} i datarepot — ${fel[0].fel}.`;
}

/** Alla resultatfiler i datarepot (sökvägar under resultat/). */
export async function listaArkiv(): Promise<string[]> {
  const cfg = lasGitHubConfig();
  if (!konfigKomplett(cfg)) throw new Error('GitHub-konfigurationen är ofullständig — fyll i ☁ Datarepo först.');
  return (await listaFilerIGitHub(cfg, /^resultat\//)).filter((p) => !p.endsWith('/.keep'));
}

/** Hämtar en arkivfil som en File (för importsidorna). */
export async function hamtaArkivFil(sokvag: string): Promise<File> {
  const cfg = lasGitHubConfig();
  const bytes = await hamtaBinarFilFranGitHub(cfg, sokvag);
  const namn = sokvag.split('/').pop() ?? 'fil';
  return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], namn);
}

// ── Kön av hämtade filer som importsidorna plockar upp ──────────────────────────

export interface VantandeFiler { amneId: string; klassId: string; kalla: ArkivKalla; filer: File[] }
let vantande: VantandeFiler[] = [];
const lyssnare = new Set<() => void>();
const meddela = () => { for (const l of lyssnare) l(); };

export function laggVantandeFiler(v: VantandeFiler): void { vantande = [...vantande, v]; meddela(); }
/** Tar (och tömmer) väntande filer för ämnet och källan. */
export function tagVantandeFiler(amneId: string, kalla: ArkivKalla): File[] {
  const mina = vantande.filter((v) => v.amneId === amneId && v.kalla === kalla);
  if (mina.length === 0) return [];
  vantande = vantande.filter((v) => !(v.amneId === amneId && v.kalla === kalla)); meddela();
  return mina.flatMap((v) => v.filer);
}
export function useVantandeFiler(): VantandeFiler[] {
  return useSyncExternalStore((cb) => { lyssnare.add(cb); return () => lyssnare.delete(cb); }, () => vantande, () => vantande);
}
