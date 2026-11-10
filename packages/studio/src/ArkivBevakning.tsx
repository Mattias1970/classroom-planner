/**
 * Del 239 · Bevakning av resultatarkivet i datarepot.
 *
 * När appen startar — och när fönstret aktiveras igen — kontrolleras datarepot:
 *
 *   1. Resultatfiler som väntar på uppladdning (GitHub saknades eller nätet var nere vid importen)
 *      laddas upp automatiskt.
 *   2. Finns det resultatfiler i datarepot som inte är laddade i den här appen frågar appen om de
 *      ska laddas. "Ja" hämtar filerna och lägger dem framme under 📥 Importera; "Inte nu" tystar
 *      frågan tills det kommer fler filer.
 *
 * Frågan visar var filerna ligger (mappen i datarepot, med länk). Inget hämtas utan att läraren svarar.
 */
import { useEffect, useRef, useState } from 'react';
import { arArkivFilImporterad, ARKIV_KALLA_NAMN, arkivMappar, arkivMappAv, type ArkivKalla, type ArkivRad, type Struktur } from '@planner/kernel';
import { githubLank, konfigKomplett, lasGitHubConfig } from './github.js';
import { hamtaTillImport, kollaArkivet, koadeUppladdningar, useVantandeFiler } from './resultatarkiv.js';
import { lasInstallning, sparaInstallning } from './store.js';

const INTE_NU = 'cp.arkiv.inteNu';
/** Minsta tid mellan två kontroller när fönstret aktiveras (starten kontrollerar alltid). */
export const ARKIVKOLL_MELLANRUM_MS = 10 * 60 * 1000;

const filer = (n: number) => `${n} ${n === 1 ? 'fil' : 'filer'}`;

export function ArkivBevakning({ s, uppdatera, meddela, oppnaImport, oppnaDatarepo }: {
  s: Struktur;
  /** Läser om strukturen ur lagringen (uppladdningar registreras där). */
  uppdatera: () => void;
  meddela: (m: string) => void;
  /** Öppnar Resultat → 📥 Importera för klassen och ämnet. */
  oppnaImport: (klassId: string, amneId: string, kalla: ArkivKalla) => void;
  oppnaDatarepo: () => void;
}) {
  const [nya, setNya] = useState<ArkivRad[]>([]);
  const [inteNu, setInteNu] = useState<string[]>(() => lasInstallning<string[]>(INTE_NU, []));
  const [hamtade, setHamtade] = useState<string[]>([]);
  const [arbetar, setArbetar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const vantande = useVantandeFiler();
  const senast = useRef(0);
  const pagar = useRef(false);
  const props = useRef({ uppdatera, meddela });
  props.current = { uppdatera, meddela };

  useEffect(() => {
    const kolla = (tvinga: boolean) => {
      if (pagar.current) return;
      if (!konfigKomplett(lasGitHubConfig())) { void koadeUppladdningar(); return; }
      const nu = Date.now();
      if (!tvinga && nu - senast.current < ARKIVKOLL_MELLANRUM_MS) return;
      senast.current = nu; pagar.current = true;
      kollaArkivet().then((k) => {
        if (k === null) return;
        if (k.skickade.length > 0) {
          props.current.uppdatera();
          const mappar = [...new Set(k.skickade.map((sokvag) => `${arkivMappAv(sokvag)}/`))];
          props.current.meddela(`☁ ${filer(k.skickade.length)} som väntade laddades upp till datarepot: ${mappar.join(', ')}.`);
        }
        setNya(k.jamforelse.nya);
      }).catch((e: unknown) => {
        // Nästa aktivering försöker igen. Vid start sägs det en gång, så att en utgången nyckel inte går obemärkt förbi.
        if (tvinga) props.current.meddela(`☁ Datarepot kunde inte kontrolleras efter nya resultat: ${e instanceof Error ? e.message : 'okänt fel'} Se Datarepo.`);
      }).finally(() => { pagar.current = false; });
    };
    kolla(true);
    const vidAktivering = () => { if (document.visibilityState === 'visible') kolla(false); };
    document.addEventListener('visibilitychange', vidAktivering);
    window.addEventListener('focus', vidAktivering);
    return () => { document.removeEventListener('visibilitychange', vidAktivering); window.removeEventListener('focus', vidAktivering); };
  }, []);

  const amneNamn = (id: string | null) => { const a = s.amnen.find((x) => x.id === id); const k = s.klasser.find((x) => x.id === a?.klassId); return `${k?.namn ?? ''} ${a?.namn ?? '?'}`.trim(); };
  // Det som fortfarande är nytt: inte importerat sedan kontrollen och inte redan hämtat till importen
  const kvar = nya.filter((r) => r.tolk !== null && r.amneId !== null && !hamtade.includes(r.sokvag) && !arArkivFilImporterad(s, r.amneId, r.tolk.kalla, r.tolk.filnamn));
  const fraga = kvar.some((r) => !inteNu.includes(r.sokvag));
  const cfg = lasGitHubConfig();

  const ladda = () => {
    setArbetar(true); setFel(null);
    void hamtaTillImport(kvar).then((u) => {
      setHamtade((h) => [...h, ...u.hamtade]);
      if (u.fel.length > 0) setFel(`${u.fel.length} av ${kvar.length} kunde inte hämtas — ${u.fel[0]}`);
      if (u.grupper.length === 0) return;
      const g = u.grupper[0];
      oppnaImport(g.klassId, g.amneId, g.kalla);
      meddela(`${filer(u.antal)} hämtade från datarepot: ${u.grupper.map((x) => `${amneNamn(x.amneId)} · ${ARKIV_KALLA_NAMN[x.kalla]} (${x.antal})`).join(', ')}. De ligger framme under 📥 Importera — granska och tryck Importera.`);
    }).finally(() => setArbetar(false));
  };
  const avvakta = () => { const lista = kvar.map((r) => r.sokvag); setInteNu(lista); sparaInstallning(INTE_NU, lista); };

  if (!fraga && vantande.length === 0 && fel === null) return null;
  return (
    <div className="arkivbevakning no-print">
      {fraga && (
        <div className="arkivfraga" role="region" aria-label="Nya resultat i datarepot">
          <p><b>☁ Datarepot har {filer(kvar.length)} med resultat som inte är laddade i appen.</b> Ska de laddas?</p>
          <ul>
            {arkivMappar(kvar).map((m) => (
              <li key={m.mapp}>
                <b>{amneNamn(m.amneId)}{m.kalla !== null ? ` · ${ARKIV_KALLA_NAMN[m.kalla]}` : ''}</b> — {filer(m.filer.length)} i{' '}
                <a href={githubLank(cfg, m.mapp)} target="_blank" rel="noreferrer" title="Öppna mappen på github.com"><code>{m.mapp}/</code></a>
                <details><summary className="small">Visa filerna</summary><ul className="arkivfiler">{m.filer.map((f) => <li key={f}>{f}</li>)}</ul></details>
              </li>
            ))}
          </ul>
          <div className="arkivknappar">
            <button className="btn" disabled={arbetar} onClick={ladda}>{arbetar ? '⏳ Hämtar…' : `⬇ Ja, ladda ${kvar.length === 1 ? 'den' : 'dem'}`}</button>
            <button className="btn sec" disabled={arbetar} onClick={avvakta} title="Frågan kommer tillbaka när det finns fler nya filer; filerna går alltid att hämta under Datarepo">Inte nu</button>
            <button className="linkbtn" onClick={oppnaDatarepo}>Visa i Datarepo →</button>
          </div>
        </div>
      )}
      {fel !== null && <p className="status warn small">{fel} <button className="linkbtn" onClick={() => setFel(null)}>Stäng</button></p>}
      {vantande.length > 0 && (
        <p className="status small" role="status">
          📥 <b>Hämtat från datarepot, väntar på granskning och import:</b>{' '}
          {vantande.map((v, i) => (
            <span key={`${v.amneId}|${v.kalla}|${i}`}>{i > 0 ? ' · ' : ''}
              <button className="linkbtn" onClick={() => oppnaImport(v.klassId, v.amneId, v.kalla)}>{amneNamn(v.amneId)} · {ARKIV_KALLA_NAMN[v.kalla]} ({filer(v.filer.length)}) →</button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
