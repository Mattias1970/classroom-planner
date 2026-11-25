/**
 * Del 264 · Spara till och hämta från GitHub — två knappar bredvid varandra i toppraden, på alla sidor.
 *
 *  ⬆ Spara till GitHub   lägger upp allt som finns i den här webbläsaren (skolår, klasser, elever, resultat,
 *                         planeringar) som en ny version i datarepot, och skickar resultatfiler som väntar.
 *  ⬇ Hämta från GitHub   hämtar den senaste versionen hit — så fylls appen på en ny dator.
 *  🕘 Versioner          varje sparning finns kvar med datum; en äldre version kan återställas.
 *
 * Under knapparna står när den senaste versionen på GitHub sparades och om det som finns här är detsamma.
 * Inget skrivs över utan fråga: har en annan dator sparat sedan sist frågar appen först, och en hämtning
 * går att ångra med ↩.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Struktur } from '@planner/kernel';
import {
  bekraftaHamtning, hamtaVersioner, konfigKomplett, laddaVersion, lasGitHubConfig, lasOsparat, lasSynk, noteraAndring, prenumereraSynk,
  sparaTillGitHub, synkLage, tagHamtningsmarke, type GitHubSynk, type GitHubVersion,
} from './github.js';
import { exportJson, importJson, lasStruktur } from './store.js';
import { skickaKoade } from './resultatarkiv.js';

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const tva = (n: number) => String(n).padStart(2, '0');

/** '2026-11-25T06:21:00Z' → 'i dag 07:21', 'i går 16:24' eller '23 nov 16:24' (lokal tid; året när det inte är i år). */
export function datumText(iso: string, nu: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const klocka = `${tva(d.getHours())}:${tva(d.getMinutes())}`;
  const dag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const skillnad = Math.round((dag(nu) - dag(d)) / 86400000);
  if (skillnad === 0) return `i dag ${klocka}`;
  if (skillnad === 1) return `i går ${klocka}`;
  return `${d.getDate()} ${MANADER[d.getMonth()]}${d.getFullYear() !== nu.getFullYear() ? ` ${d.getFullYear()}` : ''} ${klocka}`;
}

/** Tom app: inget att spara — och ingenting går förlorat när den fylls från GitHub. */
export const arTom = (s: Struktur): boolean => s.klasser.length === 0 && s.amnen.length === 0 && s.elever.length === 0;

/** Vad en version innehåller — står i versionslistan. Bara antal, inga namn. */
export const versionsbeskrivning = (s: Struktur): string =>
  `${s.klasser.length} klasser · ${s.elever.length} elever · ${(s.resultat ?? []).length} resultat · ${s.planeringar.length} planeringar`;

export interface Synkstatus { ton: 'ok' | 'varning' | 'osparat' | 'neutral'; text: string; framhav: 'spara' | 'hamta' | null }

/** Raden under knapparna: när GitHubs senaste version sparades, och om det som finns här är detsamma. */
export function synkstatus(p: { klar: boolean; tom: boolean; versioner: GitHubVersion[] | null; fel: string | null; synk: GitHubSynk | null; osparat: string | null; nu?: Date }): Synkstatus {
  const { klar, tom, versioner, fel, synk, osparat, nu } = p;
  const d = (iso: string) => datumText(iso, nu);
  if (!klar) return { ton: 'neutral', text: 'Inte kopplat till GitHub — fyll i nyckeln under Datarepo', framhav: null };
  if (versioner === null) {
    if (fel !== null) return { ton: 'varning', text: `GitHub svarar inte: ${fel}`, framhav: null };
    if (synk !== null) return { ton: osparat !== null ? 'osparat' : 'neutral', text: `Senast ${synk.riktning === 'sparat' ? 'sparat' : 'hämtat'} här ${d(synk.tid)}${osparat !== null ? ' · ● ändrat sedan dess' : ''}`, framhav: osparat !== null ? 'spara' : null };
    return { ton: 'neutral', text: 'Läser versionerna på GitHub…', framhav: null };
  }
  const senaste = versioner[0];
  if (senaste === undefined) return { ton: 'neutral', text: tom ? 'Inget sparat på GitHub än' : 'Inget sparat på GitHub än — tryck Spara', framhav: tom ? null : 'spara' };
  const gh = `GitHub: ${d(senaste.datum)}`;
  if (tom) return { ton: 'varning', text: `${gh} — tryck Hämta för att fylla appen`, framhav: 'hamta' };
  if (synk?.aterstalld !== undefined && osparat !== null) return { ton: 'osparat', text: `Här: återställd version från ${d(synk.aterstalld)} — inte sparad som senaste`, framhav: 'spara' };
  const samma = synk?.sha === senaste.sha;
  if (osparat !== null) {
    return samma
      ? { ton: 'osparat', text: `${gh} · ● ändrat här sedan ${d(osparat)} — inte sparat`, framhav: 'spara' }
      : { ton: 'varning', text: `${gh} från en annan dator · ● och ändrat här — inte sparat`, framhav: null };
  }
  if (samma) return { ton: 'ok', text: `${gh} · ✓ samma här`, framhav: null };
  return { ton: 'varning', text: synk === null ? `${gh} — inte hämtad hit` : `${gh} — nyare än det som finns här`, framhav: 'hamta' };
}

export function GitHubKnappar({ s, kor, meddela, oppnaDatarepo }: {
  s: Struktur;
  kor: (fn: () => Struktur, m: string) => void;
  meddela: (m: string) => void;
  oppnaDatarepo: () => void;
}) {
  useSyncExternalStore(prenumereraSynk, synkLage, synkLage);
  const cfg = lasGitHubConfig();
  const klar = konfigKomplett(cfg);
  const adress = `${cfg.owner}/${cfg.repo}/${cfg.branch}/${cfg.path}/${cfg.token === '' ? '' : 'nyckel'}`;
  const [arbetar, setArbetar] = useState<'' | 'spara' | 'hamta'>('');
  const [versioner, setVersioner] = useState<GitHubVersion[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [oppen, setOppen] = useState(false);
  const tom = arTom(s);

  // Varje ändring i appen som inte är en hämtning från GitHub är en osparad ändring
  const forsta = useRef(true);
  useEffect(() => {
    if (forsta.current) { forsta.current = false; return; }
    if (tagHamtningsmarke()) return;
    noteraAndring();
  }, [s]);

  const lasVersioner = async (): Promise<GitHubVersion[]> => {
    try { const lista = await hamtaVersioner(lasGitHubConfig()); setVersioner(lista); setFel(null); return lista; }
    catch (e) { setFel(e instanceof Error ? e.message : String(e)); throw e; }
  };
  // När appen öppnas (och när kopplingen ändras): läs vad som ligger på GitHub, så att datumet syns direkt
  useEffect(() => {
    setVersioner(null); setFel(null);
    if (klar) void lasVersioner().catch(() => undefined);
  }, [adress]); // eslint-disable-line react-hooks/exhaustive-deps

  const saknarKoppling = (): boolean => {
    if (klar) return false;
    meddela('GitHub är inte kopplat i den här webbläsaren — fyll i ägare och nyckel under Datarepo, så fungerar Spara och Hämta.');
    oppnaDatarepo();
    return true;
  };

  const sparaNu = async () => {
    if (saknarKoppling()) return;
    if (tom) { meddela('Appen är tom här, så det finns inget att spara. Tryck Hämta från GitHub för att fylla den.'); return; }
    setArbetar('spara');
    try {
      const lista = await lasVersioner();
      const senaste = lista[0];
      const synk = lasSynk();
      if (senaste !== undefined && senaste.sha !== synk?.sha) {
        const vad = synk === null
          ? `På GitHub finns redan en version, sparad ${datumText(senaste.datum)}. Den är inte hämtad till den här webbläsaren.`
          : `På GitHub finns en nyare version, sparad ${datumText(senaste.datum)} — från en annan dator eller webbläsare.`;
        if (!window.confirm(`${vad}\n\nSparar du nu blir det som finns HÄR den senaste versionen. Den andra finns kvar under Versioner och kan återställas.\n\nHar du arbetat på en annan dator: välj Avbryt och tryck Hämta från GitHub först.\n\nSpara ändå?`)) return;
      }
      await sparaTillGitHub(lasGitHubConfig(), exportJson(s), versionsbeskrivning(s));
      const ko = await skickaKoade().catch(() => null);
      const filer = ko === null ? '' : `${ko.skickade.length > 0 ? ` · ${ko.skickade.length} resultatfiler uppladdade` : ''}${ko.kvar > 0 ? ` · ${ko.kvar} resultatfiler väntar` : ''}`;
      meddela(`✓ Sparat till GitHub ${datumText(new Date().toISOString())}${filer}. Tidigare versioner finns kvar under Versioner.`);
      void lasVersioner().catch(() => undefined);
    } catch (e) { meddela(`✗ Det gick inte att spara till GitHub: ${e instanceof Error ? e.message : String(e)}`); } finally { setArbetar(''); }
  };

  /** Hämtar en version hit: utan argument den senaste, annars en äldre (återställning). */
  const hamtaNu = async (vald?: GitHubVersion) => {
    if (saknarKoppling()) return;
    setArbetar('hamta');
    try {
      const lista = await lasVersioner();
      const senaste = lista[0];
      if (senaste === undefined) { meddela('Det finns inget sparat på GitHub än — tryck Spara till GitHub på datorn som har allt.'); return; }
      const v = vald ?? senaste;
      const aldre = v.sha !== senaste.sha;
      const osparat = lasOsparat() !== null;
      const synk = lasSynk();
      if (!aldre && !osparat && !tom && synk?.sha === senaste.sha && synk.aterstalld === undefined) { meddela(`Du har redan den senaste versionen från GitHub (sparad ${datumText(senaste.datum)}).`); return; }
      if (!tom) {
        const varning = osparat ? '\n\n⚠ Här finns ändringar som inte är sparade till GitHub — de försvinner.' : '';
        const fraga = aldre
          ? `Återställa versionen från ${datumText(v.datum)}?\n\nDet som finns i den här webbläsaren ersätts med den versionen.${varning}\n\nDu kan ångra direkt efteråt med ↩. På GitHub ändras inget förrän du trycker Spara till GitHub — då blir den här versionen den senaste, och de nyare finns kvar i listan.`
          : `Hämta den senaste versionen från GitHub (sparad ${datumText(v.datum)})?\n\nDet som finns i den här webbläsaren ersätts.${varning}\n\nDu kan ångra direkt efteråt med ↩.`;
        if (!window.confirm(fraga)) return;
      }
      const ny = importJson(await laddaVersion(lasGitHubConfig(), v));
      const fore = lasStruktur();
      bekraftaHamtning(v, senaste);
      kor(() => ny, aldre
        ? `Versionen från ${datumText(v.datum)} är återställd här (↩ ångrar). Tryck Spara till GitHub för att göra den till den senaste.`
        : `Hämtat från GitHub — versionen sparad ${datumText(v.datum)} (↩ ångrar).`);
      if (lasStruktur() === fore) tagHamtningsmarke();      // ingenting lades in — nästa ändring är en vanlig ändring
      setOppen(false);
    } catch (e) { meddela(`✗ Det gick inte att hämta från GitHub: ${e instanceof Error ? e.message : String(e)}`); } finally { setArbetar(''); }
  };

  const synk = lasSynk();
  const osparat = lasOsparat();
  const status = synkstatus({ klar, tom, versioner, fel, synk, osparat });
  return (
    <div className="gh-synk" role="group" aria-label="GitHub – spara och hämta">
      <div className="gh-knappar">
        <button type="button" className={`gh-knapp${status.framhav === 'spara' ? ' viktig' : ''}`} disabled={arbetar !== ''} onClick={() => { void sparaNu(); }}
          title="Lägger upp allt som finns i den här webbläsaren — klasser, elever, resultat och planeringar — som en ny version på GitHub. Tidigare versioner finns kvar.">
          {arbetar === 'spara' ? '⏳ Sparar…' : '⬆ Spara till GitHub'}</button>
        <button type="button" className={`gh-knapp${status.framhav === 'hamta' ? ' viktig' : ''}`} disabled={arbetar !== ''} onClick={() => { void hamtaNu(); }}
          title="Hämtar den senaste versionen från GitHub till den här webbläsaren — så fylls appen på en ny dator. Går att ångra med ↩.">
          {arbetar === 'hamta' ? '⏳ Hämtar…' : '⬇ Hämta från GitHub'}</button>
        <button type="button" className="gh-knapp gh-versioner" aria-haspopup="dialog" aria-expanded={oppen} disabled={arbetar !== ''}
          onClick={() => { if (saknarKoppling()) return; setOppen(!oppen); if (!oppen) void lasVersioner().catch(() => undefined); }}
          title="Alla sparade versioner med datum — en äldre version kan återställas.">🕘 Versioner</button>
      </div>
      <small className={`gh-status ${status.ton}`} role="status" aria-label="Läget mot GitHub">{status.text}</small>
      {oppen && (
        <div className="gh-meny" role="dialog" aria-label="Versioner på GitHub">
          <div className="gh-meny-topp"><b>Versioner på GitHub</b><button type="button" className="gh-stang" aria-label="Stäng versioner" onClick={() => setOppen(false)}>✕</button></div>
          <p className="gh-meny-hjalp">Varje gång du sparar blir det en ny version, och de äldre finns kvar. Återställ hämtar en version hit — på GitHub ändras inget förrän du sparar.</p>
          {versioner === null
            ? <p className="gh-meny-hjalp">{fel !== null ? `GitHub svarar inte: ${fel}` : 'Läser versionerna…'}</p>
            : versioner.length === 0
              ? <p className="gh-meny-hjalp">Inget är sparat på GitHub än.</p>
              : (
                <ol className="gh-lista">
                  {versioner.map((v, i) => {
                    const finnsHar = i === 0 && synk?.sha === v.sha && osparat === null;
                    const aterstalld = synk?.aterstalld === v.datum && osparat !== null && i > 0;
                    return (
                      <li key={v.sha} className={finnsHar || aterstalld ? 'har' : undefined}>
                        <span className="gh-datum">{datumText(v.datum)}</span>
                        <span className="gh-text">
                          {i === 0 && <span className="gh-marke">senaste</span>}
                          {finnsHar && <span className="gh-marke har">finns här</span>}
                          {aterstalld && <span className="gh-marke har">återställd här — inte sparad</span>}
                          {v.text !== '' ? v.text : <span className="gh-utan">utan beskrivning</span>}
                        </span>
                        <button type="button" className="gh-knapp" disabled={arbetar !== '' || finnsHar} onClick={() => { void hamtaNu(v); }}
                          aria-label={`${i === 0 ? 'Hämta' : 'Återställ'} versionen från ${datumText(v.datum)}`}>{i === 0 ? 'Hämta' : 'Återställ'}</button>
                      </li>
                    );
                  })}
                </ol>
              )}
        </div>
      )}
    </div>
  );
}
