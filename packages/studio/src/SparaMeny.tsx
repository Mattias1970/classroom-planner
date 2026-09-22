/**
 * Del 138 · 💾 Spara / 📂 Hämta — samma meny för planeringar och SuperTeach-data.
 *
 *   💾 Spara ▾                        📂 Hämta ▾
 *   ┌────────────────────────────┐    ┌──────────────────────────────────┐
 *   │ Namn  [Biologi 8B · Höst ] │    │ ● Biologi 8B · Höst  v2  22 sep  │
 *   │ ○ Spara som nytt namn → v1 │    │   Spektrum Biologi · 3 lektions… │
 *   │ ● Ny version        → v3   │    │   [Öppna] [☁] [🗑]               │
 *   │ ○ Ersätt version [v2 ▾]    │    │ ○ Biologi 8B · Höst  v1  …       │
 *   │             [Spara]        │    │ ─ Andra ämnen ─                  │
 *   └────────────────────────────┘    │ ☁ Hämta sparade från datarepot   │
 *                                     └──────────────────────────────────┘
 *
 * SuperTeach-data sparas separat från planeringen men bär en koppling
 * (planeringens namn + version) så att man ser vilken lektionsföljd
 * resultaten hör ihop med. Allt ligger i strukturen (localStorage) och kan
 * dessutom skickas till/hämtas från datarepot som en fil per sparning.
 */
import { useEffect, useRef, useState } from 'react';
import {
  forslagPlaneringsNamn, forslagSuperTeachNamn, kopplingFor, laggInSparfiler, oppnaSparadPlanering, oppnaSparadSuperTeach,
  serialiseraSparfil, sparaPlanering, sparaSuperTeach, sparfilSokvag, taBortSparadPlanering, taBortSparadSuperTeach, tolkaSparfil,
  type SparLage, type SparadPlanering, type SparadSuperTeach, type Struktur,
} from '@planner/kernel';
import { hamtaFilerFranGitHub, konfigKomplett, lasGitHubConfig, sparaFilTillGitHub } from './github.js';
import { lasStruktur } from './store.js';

type Typ = 'planering' | 'superteach';
type Post = SparadPlanering | SparadSuperTeach;

const ORD: Record<Typ, { vad: string; sparaRubrik: string; hamtaRubrik: string; tomt: string }> = {
  planering: { vad: 'planering', sparaRubrik: 'Spara planeringen', hamtaRubrik: 'Sparade planeringar', tomt: 'Inga sparade planeringar än — spara den aktiva med 💾 Spara.' },
  superteach: { vad: 'SuperTeach-data', sparaRubrik: 'Spara SuperTeach-data', hamtaRubrik: 'Sparade SuperTeach-data', tomt: 'Inga sparade SuperTeach-data än — spara ämnets resultat med 💾 Spara.' },
};

function kortTid(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function lista(s: Struktur, typ: Typ): Post[] {
  return typ === 'planering' ? (s.sparadePlaneringar ?? []) : (s.sparadSuperTeach ?? []);
}

/** Vad posten innehåller, på en rad. */
function innehall(p: Post): string {
  if (p.schema === 'classroom-planner-planering') {
    return `${p.bokTitel} · ${p.lektionsplaner.length} lektionsplaner${p.val.egnaRader?.length ? ` · ${p.val.egnaRader.length} egna rader` : ''}`;
  }
  const prov = new Set(p.resultat.map((r) => `${r.prov}|${r.datum}`)).size;
  return `${p.resultat.length} resultat · ${prov} prov · ${p.filregister.length} filer${p.koppling ? ` · ↔ ${p.koppling.planeringsNamn} v${p.koppling.planeringsVersion}` : ''}`;
}

export function SparaMeny({ typ, s, amneId, kor, meddela }: {
  typ: Typ; s: Struktur; amneId: string;
  kor: (fn: () => Struktur, m: string) => void;
  meddela?: (m: string) => void;
}) {
  const [oppen, setOppen] = useState<'ingen' | 'spara' | 'hamta'>('ingen');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (oppen === 'ingen') return;
    const stang = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOppen('ingen'); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOppen('ingen'); };
    document.addEventListener('mousedown', stang); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', stang); window.removeEventListener('keydown', esc); };
  }, [oppen]);

  const ord = ORD[typ];
  const alla = lista(s, typ);
  const egna = alla.filter((p) => p.amneId === amneId).sort((a, b) => b.sparad.localeCompare(a.sparad));
  const andra = alla.filter((p) => p.amneId !== amneId).sort((a, b) => b.sparad.localeCompare(a.sparad));
  const cfg = lasGitHubConfig();
  const moln = konfigKomplett(cfg);
  const saga = (m: string) => meddela?.(m);

  return (
    <div className="sparameny" ref={ref}>
      <button className="btn sec" aria-haspopup="dialog" aria-expanded={oppen === 'spara'} onClick={() => setOppen(oppen === 'spara' ? 'ingen' : 'spara')}>💾 Spara ▾</button>
      <button className="btn sec" aria-haspopup="dialog" aria-expanded={oppen === 'hamta'} onClick={() => setOppen(oppen === 'hamta' ? 'ingen' : 'hamta')}>
        📂 Hämta ▾{alla.length > 0 && <span className="sparameny-antal">{alla.length}</span>}
      </button>
      {oppen === 'spara' && (
        <SparaPanel typ={typ} s={s} amneId={amneId} egna={egna} rubrik={ord.sparaRubrik} vad={ord.vad} stang={() => setOppen('ingen')}
          spara={(lage) => {
            const nu = new Date().toISOString();
            try {
              kor(() => (typ === 'planering' ? sparaPlanering(lasStruktur(), amneId, lage, nu) : sparaSuperTeach(lasStruktur(), amneId, lage, nu)),
                `${typ === 'planering' ? 'Planeringen' : 'SuperTeach-data'} sparad${typ === 'planering' ? '' : 'e'}: ${lage.typ === 'ersatt' ? 'versionen ersatt' : lage.namn}.`);
              setOppen('ingen');
            } catch (e) { saga(`✗ ${(e as Error).message}`); }
          }} />
      )}
      {oppen === 'hamta' && (
        <div className="sparameny-panel bred" role="dialog" aria-label={ord.hamtaRubrik}>
          <b>📂 {ord.hamtaRubrik}</b>
          {alla.length === 0 && <p className="muted small">{ord.tomt}</p>}
          {egna.map((p) => <PostRad key={p.id} p={p} typ={typ} moln={moln} saga={saga} kor={kor} stang={() => setOppen('ingen')} />)}
          {andra.length > 0 && (
            <details className="sparameny-andra">
              <summary className="muted small">Andra ämnen ({andra.length})</summary>
              {andra.map((p) => <PostRad key={p.id} p={p} typ={typ} moln={moln} saga={saga} kor={kor} stang={() => setOppen('ingen')} frammande />)}
            </details>
          )}
          <div className="rad" style={{ gap: 6, marginTop: 6 }}>
            <button className="btn sec sm" disabled={!moln} title={moln ? `Läser sparat/${typ}… i ${cfg.owner}/${cfg.repo}` : 'Fyll i ☁ Datarepo (GitHub) först'} onClick={() => {
              const monster = typ === 'planering' ? /^sparat\/planeringar\/.+\.json$/ : /^sparat\/superteach\/.+\.json$/;
              void hamtaFilerFranGitHub(cfg, monster).then((filer) => {
                const poster: Post[] = [];
                for (const f of filer) { try { poster.push(tolkaSparfil(f.json)); } catch { /* hoppa över */ } }
                kor(() => laggInSparfiler(lasStruktur(), poster), `${poster.length} sparade ${ord.vad}${typ === 'planering' ? 'ar' : ''} hämtade från datarepot.`);
              }).catch((e: unknown) => saga(`✗ ${e instanceof Error ? e.message : String(e)}`));
            }}>☁ Hämta sparade från datarepot</button>
            {!moln && <small className="muted">datarepot är inte inställt</small>}
          </div>
        </div>
      )}
    </div>
  );
}

function SparaPanel({ typ, s, amneId, egna, rubrik, vad, spara, stang }: {
  typ: Typ; s: Struktur; amneId: string; egna: Post[]; rubrik: string; vad: string;
  spara: (lage: SparLage) => void; stang: () => void;
}) {
  const idag = new Date().toISOString().slice(0, 10);
  const senaste = egna[0];
  const [namn, setNamn] = useState<string>(() => senaste?.namn ?? (typ === 'planering' ? forslagPlaneringsNamn(s, amneId) : forslagSuperTeachNamn(s, amneId, idag)));
  const medNamn = egna.filter((p) => p.namn.trim().toLowerCase() === namn.trim().toLowerCase()).sort((a, b) => b.version - a.version);
  const finns = medNamn.length > 0;
  const [lage, setLage] = useState<SparLage['typ']>(finns ? 'ny-version' : 'nytt');
  const [ersattId, setErsattId] = useState<string>(medNamn[0]?.id ?? '');
  // Namnet styr vilka val som finns: nytt namn → bara "Spara som nytt"; känt namn → ny version / ersätt
  useEffect(() => { setLage(finns ? 'ny-version' : 'nytt'); setErsattId(medNamn[0]?.id ?? ''); }, [finns, namn]);
  const koppling = typ === 'superteach' ? kopplingFor(s, amneId) : null;
  const nasta = (medNamn[0]?.version ?? 0) + 1;
  const kan = namn.trim() !== '' && (lage !== 'ersatt' || ersattId !== '');
  const skicka = () => {
    if (!kan) return;
    spara(lage === 'ersatt' ? { typ: 'ersatt', id: ersattId } : { typ: lage, namn: namn.trim() });
  };
  return (
    <div className="sparameny-panel" role="dialog" aria-label={rubrik}>
      <b>💾 {rubrik}</b>
      <label className="sparameny-falt">Namn
        <input aria-label={`Namn på ${vad}`} value={namn} onChange={(e) => setNamn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') skicka(); }} autoFocus />
      </label>
      <div role="radiogroup" aria-label="Hur" className="sparameny-val">
        {!finns && <label><input type="radio" name="sparlage" checked={lage === 'nytt'} onChange={() => setLage('nytt')} /> Spara som nytt namn <span className="muted">→ v1</span></label>}
        {finns && <label><input type="radio" name="sparlage" checked={lage === 'ny-version'} onChange={() => setLage('ny-version')} /> Ny version <span className="muted">→ v{nasta}</span></label>}
        {finns && (
          <label><input type="radio" name="sparlage" checked={lage === 'ersatt'} onChange={() => setLage('ersatt')} /> Ersätt version{' '}
            <select aria-label="Version att ersätta" value={ersattId} onChange={(e) => { setErsattId(e.target.value); setLage('ersatt'); }}>
              {medNamn.map((p) => <option key={p.id} value={p.id}>v{p.version} ({kortTid(p.sparad)})</option>)}
            </select>
          </label>
        )}
      </div>
      {typ === 'superteach' && (
        <p className="muted small sparameny-koppling">↔ Kopplas till planeringen: {koppling ? <b>{koppling.planeringsNamn} v{koppling.planeringsVersion}</b> : <i>ingen planering på ämnet</i>}</p>
      )}
      <div className="rad" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn sec sm" onClick={stang}>Avbryt</button>
        <button className="btn sm" disabled={!kan} onClick={skicka}>{lage === 'ersatt' ? 'Ersätt' : 'Spara'}</button>
      </div>
    </div>
  );
}

function PostRad({ p, typ, moln, saga, kor, stang, frammande }: {
  p: Post; typ: Typ; moln: boolean; saga: (m: string) => void; kor: (fn: () => Struktur, m: string) => void; stang: () => void; frammande?: boolean;
}) {
  const etikett = `${p.namn} v${p.version}`;
  const oppnaPlanering = () => {
    if (!window.confirm(`Öppna "${etikett}" som aktiv planering för ${p.amneNamn} ${p.klassNamn}? Den nuvarande arkiveras och kan återställas under Planeringsversioner.`)) return;
    try { kor(() => oppnaSparadPlanering(lasStruktur(), p.id, new Date().toISOString()), `Planeringen "${etikett}" är nu aktiv.`); stang(); }
    catch (e) { saga(`✗ ${(e as Error).message}`); }
  };
  const oppnaSt = (lage: 'ersatt' | 'laggTill') => {
    if (lage === 'ersatt' && !window.confirm(`Ersätta ämnets nuvarande resultat med "${etikett}"? Resultat som inte finns i den sparade filen försvinner (Ångra finns).`)) return;
    try { kor(() => oppnaSparadSuperTeach(lasStruktur(), p.id, lage), `${lage === 'ersatt' ? 'Resultaten ersatta med' : 'Resultat tillagda från'} "${etikett}".`); stang(); }
    catch (e) { saga(`✗ ${(e as Error).message}`); }
  };
  const taBort = () => {
    if (!window.confirm(`Ta bort den sparade filen "${etikett}"? (Det som är aktivt i appen påverkas inte.)`)) return;
    kor(() => (typ === 'planering' ? taBortSparadPlanering(lasStruktur(), p.id) : taBortSparadSuperTeach(lasStruktur(), p.id)), `"${etikett}" borttagen.`);
  };
  const tillMoln = () => {
    const cfg = lasGitHubConfig();
    void sparaFilTillGitHub(cfg, sparfilSokvag(p), serialiseraSparfil(p))
      .then(() => saga(`☁ "${etikett}" skickad till datarepot (${sparfilSokvag(p)}).`))
      .catch((e: unknown) => saga(`✗ ${e instanceof Error ? e.message : String(e)}`));
  };
  return (
    <div className="sparameny-post">
      <div className="sparameny-post-text">
        <b>{p.namn} <span className="sparameny-version">v{p.version}</span></b>
        <small className="muted">{frammande === true ? `${p.amneNamn} ${p.klassNamn} · ` : ''}{kortTid(p.sparad)} · {innehall(p)}</small>
      </div>
      <div className="sparameny-post-knappar">
        {typ === 'planering'
          ? <button className="btn sm" disabled={frammande === true} title={frammande === true ? 'Hör till ett annat ämne' : 'Gör den här till aktiv planering'} onClick={oppnaPlanering}>Öppna</button>
          : (
            <>
              <button className="btn sm" disabled={frammande === true} title="Byt ut ämnets resultat mot de sparade" onClick={() => oppnaSt('ersatt')}>Ersätt</button>
              <button className="btn sec sm" disabled={frammande === true} title="Lägg till de sparade resultaten som saknas" onClick={() => oppnaSt('laggTill')}>Lägg till</button>
            </>
          )}
        <button className="btn sec sm" disabled={!moln} title={moln ? 'Skicka som fil till datarepot' : 'Fyll i ☁ Datarepo (GitHub) först'} onClick={tillMoln} aria-label={`Skicka ${etikett} till datarepot`}>☁</button>
        <button className="btn sec sm" title="Ta bort sparfilen" onClick={taBort} aria-label={`Ta bort ${etikett}`}>🗑</button>
      </div>
    </div>
  );
}
