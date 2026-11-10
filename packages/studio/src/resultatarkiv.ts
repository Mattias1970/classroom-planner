/**
 * Del 203 · Resultatarkivet i UI-lagret: laddar upp importerade resultatfiler till datarepot
 * (resultat/ak8/8B/Biologi/socrative/…), listar och hämtar arkivets filer, och håller en kö av
 * hämtade filer som importsidorna plockar upp ("3 filer från datarepot — granska och importera").
 * Kernel (resultatarkiv.ts) äger sökvägskonventionen och registret.
 */
import { useSyncExternalStore } from 'react';
import { arkivMappAv, arkivSokvag, jamforArkiv, registreraArkivFil, type ArkivJamforelse, type ArkivKalla, type ArkivRad } from '@planner/kernel';
import { hamtaBinarFilFranGitHub, konfigKomplett, lasGitHubConfig, listaFilerIGitHub, sparaBinarFilTillGitHub } from './github.js';
import { lasStruktur, sparaStruktur } from './store.js';

export interface Uppladdning { sokvag: string; filnamn: string; fel: string | null }

// ── Del 239 · Kön av filer som väntar på uppladdning ─────────────────────────────────────
// En resultatfil som inte kunde laddas upp (GitHub inte ifyllt, nätet nere) sparas i webbläsarens
// IndexedDB och skickas automatiskt nästa gång appen når datarepot. Utan IndexedDB hålls kön i minnet.

export interface KoPost { sokvag: string; filnamn: string; amneId: string; kalla: ArkivKalla; bytes: ArrayBuffer }
const KO_DB = 'classroom-planner.studio.arkivko';
const KO_STORE = 'filer';
const koMinne = new Map<string, KoPost>();
let koAntal = 0;
const koLyssnare = new Set<() => void>();
const sattKoAntal = (n: number) => { if (n !== koAntal) { koAntal = n; for (const l of koLyssnare) l(); } };

function oppnaKo(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(KO_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(KO_STORE)) req.result.createObjectStore(KO_STORE, { keyPath: 'sokvag' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
function iKo(lage: IDBTransactionMode, gor: (lager: IDBObjectStore) => void): Promise<void> {
  return oppnaKo().then((db) => new Promise<void>((resolve) => {
    if (db === null) { resolve(); return; }
    const klar = () => { try { db.close(); } catch { /* redan stängd */ } resolve(); };
    try {
      const tx = db.transaction(KO_STORE, lage);
      tx.oncomplete = klar; tx.onerror = klar; tx.onabort = klar;
      gor(tx.objectStore(KO_STORE));
    } catch { klar(); }
  }));
}

/** Lägger en fil i kön för uppladdning. */
export async function koaUppladdning(post: KoPost): Promise<void> {
  koMinne.set(post.sokvag, post);
  await iKo('readwrite', (lager) => { lager.put(post); });
  sattKoAntal((await koadeUppladdningar()).length);
}

/** Filerna som väntar på uppladdning. */
export async function koadeUppladdningar(): Promise<KoPost[]> {
  let sparade: KoPost[] = [];
  await iKo('readonly', (lager) => { const req = lager.getAll(); req.onsuccess = () => { sparade = req.result as KoPost[]; }; });
  const sedda = new Set(sparade.map((x) => x.sokvag));
  const ut = [...sparade, ...[...koMinne.values()].filter((x) => !sedda.has(x.sokvag))];
  sattKoAntal(ut.length);
  return ut;
}

async function taUrKo(sokvag: string): Promise<void> {
  koMinne.delete(sokvag);
  await iKo('readwrite', (lager) => { lager.delete(sokvag); });
}

/** Antal filer som väntar på uppladdning (uppdateras när kön ändras). */
export function useUppladdningsko(): number {
  return useSyncExternalStore((cb) => { koLyssnare.add(cb); return () => koLyssnare.delete(cb); }, () => koAntal, () => koAntal);
}

export interface KoResultat { skickade: string[]; kvar: number; fel: string | null }
let koPagar: Promise<KoResultat> | null = null;

/** Laddar upp allt som väntar i kön. Avbryter vid första felet (nätet nere) och försöker igen nästa gång. */
export function skickaKoade(): Promise<KoResultat> {
  if (koPagar !== null) return koPagar;
  koPagar = (async (): Promise<KoResultat> => {
    const ko = await koadeUppladdningar();
    if (ko.length === 0) return { skickade: [], kvar: 0, fel: null };
    const cfg = lasGitHubConfig();
    if (!konfigKomplett(cfg)) return { skickade: [], kvar: ko.length, fel: 'ingen GitHub-konfiguration' };
    const skickade: string[] = [];
    let fel: string | null = null;
    for (const post of ko) {
      try {
        await sparaBinarFilTillGitHub(cfg, post.sokvag, post.bytes);
        sparaStruktur(registreraArkivFil(lasStruktur(), { sokvag: post.sokvag, filnamn: post.filnamn, amneId: post.amneId, kalla: post.kalla, uppladdad: new Date().toISOString(), importerad: true }));
        await taUrKo(post.sokvag);
        skickade.push(post.sokvag);
      } catch (e) { fel = e instanceof Error ? e.message : 'uppladdningen misslyckades'; break; }
    }
    sattKoAntal(ko.length - skickade.length);
    return { skickade, kvar: ko.length - skickade.length, fel };
  })().finally(() => { koPagar = null; });
  return koPagar;
}

/**
 * Laddar upp filerna till datarepot och registrerar dem (uppladdad + importerad). Går det inte (ingen
 * GitHub-konfiguration, nätet nere) registreras importen utan kopia (uppladdad = '') och filen läggs i kön
 * (Del 239) så att den laddas upp automatiskt senare. Fel per fil returneras — inget kastas.
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
      sparaStruktur(s);
      await koaUppladdning({ sokvag, filnamn: fil.name, amneId, kalla, bytes: await fil.arrayBuffer() });
      ut.push({ sokvag, filnamn: fil.name, fel: 'ingen GitHub-konfiguration — filen väntar här och laddas upp automatiskt när ☁ Datarepo är ifyllt' }); continue;
    }
    try {
      await sparaBinarFilTillGitHub(cfg, sokvag, await fil.arrayBuffer());
      s = registreraArkivFil(lasStruktur(), { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: new Date().toISOString(), importerad: true });
      sparaStruktur(s); ut.push({ sokvag, filnamn: fil.name, fel: null });
      if (koMinne.has(sokvag) || koAntal > 0) { await taUrKo(sokvag); await koadeUppladdningar(); }   // en äldre köad kopia behövs inte längre
    } catch (e) {
      s = registreraArkivFil(lasStruktur(), { sokvag, filnamn: fil.name, amneId, kalla, uppladdad: '', importerad: true });
      sparaStruktur(s);
      await koaUppladdning({ sokvag, filnamn: fil.name, amneId, kalla, bytes: await fil.arrayBuffer() });
      ut.push({ sokvag, filnamn: fil.name, fel: `${e instanceof Error ? e.message : 'uppladdningen misslyckades'} — filen väntar här och laddas upp automatiskt vid nästa försök` });
    }
  }
  return ut;
}

/** Kort text om hur uppladdningen gick, för statusraden. */
export function uppladdningsText(u: Uppladdning[]): string {
  const ok = u.filter((x) => x.fel === null).length;
  const fel = u.filter((x) => x.fel !== null);
  if (u.length === 0) return '';
  // Del 239: säg var filerna ligger
  const mappar = [...new Set(u.filter((x) => x.fel === null).map((x) => `${arkivMappAv(x.sokvag)}/`))];
  if (fel.length === 0) return ` ☁ ${ok} fil${ok === 1 ? '' : 'er'} i datarepot: ${mappar.join(', ')}.`;
  return ` ☁ ${ok} av ${u.length} i datarepot${mappar.length > 0 ? ` (${mappar.join(', ')})` : ''} — ${fel[0].fel}.`;
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

// ── Del 239 · Bevakning: vad finns i datarepot som inte är laddat här? ────────────────────

export interface ArkivKoll {
  jamforelse: ArkivJamforelse;
  /** Filer ur kön som laddades upp vid kontrollen. */
  skickade: string[];
  /** Filer som fortfarande väntar på uppladdning. */
  kvarIKo: number;
}

/**
 * Kontrollerar datarepot: laddar först upp det som väntar i kön, läser sedan arkivets filträd och jämför
 * med det som är importerat i appen. null när GitHub-konfigurationen saknas (då finns inget att fråga).
 */
export async function kollaArkivet(): Promise<ArkivKoll | null> {
  if (!konfigKomplett(lasGitHubConfig())) { await koadeUppladdningar(); return null; }
  const ko = await skickaKoade();
  const lista = await listaArkiv();
  return { jamforelse: jamforArkiv(lasStruktur(), lista), skickade: ko.skickade, kvarIKo: ko.kvar };
}

export interface HamtadGrupp { amneId: string; klassId: string; kalla: ArkivKalla; antal: number }

/** Hämtar arkivfilerna och lägger dem framme för import (per ämne och källa). Fel per fil samlas — inget kastas. */
export async function hamtaTillImport(rader: ArkivRad[]): Promise<{ grupper: HamtadGrupp[]; antal: number; hamtade: string[]; fel: string[] }> {
  const s = lasStruktur();
  const grupper = new Map<string, VantandeFiler>();
  const fel: string[] = [];
  const hamtade: string[] = [];
  for (const r of rader) {
    const amne = s.amnen.find((a) => a.id === r.amneId);
    if (r.tolk === null || amne === undefined) continue;
    try {
      const fil = await hamtaArkivFil(r.sokvag);
      const nyckel = `${amne.id}|${r.tolk.kalla}`;
      const g = grupper.get(nyckel) ?? { amneId: amne.id, klassId: amne.klassId, kalla: r.tolk.kalla, filer: [] };
      g.filer.push(fil); grupper.set(nyckel, g); hamtade.push(r.sokvag);
    } catch (e) { fel.push(`${r.sokvag}: ${e instanceof Error ? e.message : 'kunde inte hämtas'}`); }
  }
  for (const g of grupper.values()) laggVantandeFiler(g);
  const ut = [...grupper.values()].map((g) => ({ amneId: g.amneId, klassId: g.klassId, kalla: g.kalla, antal: g.filer.length }));
  return { grupper: ut, antal: hamtade.length, hamtade, fel };
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
