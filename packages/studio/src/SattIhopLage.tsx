/**
 * Del 157 · Sätt ihop planering — två källor sida vid sida, ny planering i mitten.
 *
 * Vänster och höger: vilken planering som helst (alla klasser) eller en bok ur
 * biblioteket, som små lektionskort (kapitelfärg, datum, vecka, detaljplan). Läraren
 * väljer kort (klick, eller "de första N") och lägger till dem i mitten. Följden
 * sparas som en namngiven sammansatt planering med versioner och kan läggas på ett
 * ämnes kommande lektioner. (kernel: sammansatt.ts)
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  forstaKommandePass, kallLektioner, kallNyckel, kallaUrNyckel, kallor, kopplaLossSammansatt, kopplaSammansatt, sparaSammansatt, tillSammansatt,
  type KallLektion, type SammansattLektion, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const DAGAR = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
function kortDag(d: string): string {
  const x = new Date(`${d}T12:00:00Z`);
  return `${DAGAR[x.getUTCDay()]} ${x.getUTCDate()}/${x.getUTCMonth() + 1}`;
}
const typIkon = (typ: string) => (typ === 'exam' ? '🏆' : typ === 'laboration' ? '🧪' : typ === 'repetition' || typ === 'test' ? '🔁' : typ === 'review' ? '📋' : '📖');

/** Ett förminskat lektionskort (samma formspråk som boxarna i "Vägen till provet"). */
function MiniKort({ titel, farg, rad2, vecka, ikon, fot, nr, vald, gjord, onKlick, etikett }: {
  titel: string; farg: string; rad2?: string; vecka?: number | null; ikon: string; fot?: string; nr?: number; vald?: boolean; gjord?: boolean;
  onKlick?: () => void; etikett: string;
}) {
  return (
    <button type="button" className={`si-kort${vald === true ? ' vald' : ''}${gjord === true ? ' gjord' : ''}`} style={{ '--kap': farg } as React.CSSProperties}
      aria-pressed={onKlick !== undefined ? vald === true : undefined} aria-label={etikett} onClick={onKlick}>
      {nr !== undefined && <span className="si-nr">{nr}</span>}
      <b className="si-titel"><span aria-hidden="true">{ikon}</span> {titel}</b>
      {rad2 !== undefined && <small className="si-rad2">{rad2}</small>}
      {vecka !== undefined && vecka !== null && <span className="si-vecka">📅 v.{vecka}</span>}
      {fot !== undefined && <small className="si-fot">{fot}</small>}
    </button>
  );
}

function KallKolumn({ s, sida, kallaN, setKallaN, valda, setValda, onLaggTill, idag }: {
  s: Struktur; sida: 'vänster' | 'höger'; kallaN: string; setKallaN: (n: string) => void;
  valda: number[]; setValda: (v: number[]) => void; onLaggTill: (k: KallLektion[]) => void; idag: string;
}) {
  const alla = kallor(s);
  const kalla = kallaUrNyckel(kallaN);
  const kort = useMemo(() => (kalla === null ? [] : kallLektioner(s, kalla, idag)), [s, kallaN, idag]); // eslint-disable-line react-hooks/exhaustive-deps
  const kapitel = [...new Map(kort.map((k) => [k.kapitel, k.kapitelNamn] as const)).entries()];
  const [kap, setKap] = useState<number | 'alla'>('alla');
  const [antal, setAntal] = useState(5);
  useEffect(() => { setKap('alla'); setValda([]); }, [kallaN]); // eslint-disable-line react-hooks/exhaustive-deps
  const synliga = kort.filter((k) => kap === 'alla' || k.kapitel === kap);
  const vaxla = (i: number) => setValda(valda.includes(i) ? valda.filter((x) => x !== i) : [...valda, i]);
  const valdaKort = valda.map((i) => kort[i]).filter((k): k is KallLektion => k !== undefined);
  const Sida = sida === 'vänster' ? 'Vänster' : 'Höger';
  return (
    <section className="si-kolumn" aria-label={`${Sida} källa`}>
      <div className="si-kolhuvud">
        <select aria-label={`${Sida} källa`} value={kallaN} onChange={(e) => setKallaN(e.target.value)}>
          <option value="">— välj planering eller bok —</option>
          {(['Planeringar', 'Böcker'] as const).map((g) => (
            <optgroup key={g} label={g}>{alla.filter((x) => x.grupp === g).map((x) => <option key={kallNyckel(x.kalla)} value={kallNyckel(x.kalla)}>{x.namn}</option>)}</optgroup>
          ))}
        </select>
        {kapitel.length > 1 && (
          <select aria-label={`${Sida} kapitel`} value={String(kap)} onChange={(e) => setKap(e.target.value === 'alla' ? 'alla' : Number(e.target.value))}>
            <option value="alla">Alla kapitel</option>
            {kapitel.map(([nr, namn]) => <option key={nr} value={nr}>Kap {nr} {namn}</option>)}
          </select>
        )}
      </div>
      {kalla !== null && (
        <div className="si-snabbval">
          <label>Välj de första <input type="number" min={1} max={40} aria-label={`${Sida} antal`} value={antal} onChange={(e) => setAntal(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} /></label>
          <button type="button" className="btn sec sm" onClick={() => setValda(synliga.slice(0, antal).map((k) => k.index))}>✓ Välj</button>
          {valda.length > 0 && <button type="button" className="linkbtn" onClick={() => setValda([])}>rensa</button>}
        </div>
      )}
      <div className="si-rutnat">
        {synliga.map((k) => (
          <MiniKort key={k.index} titel={k.lektion.avsnitt} farg={k.farg} ikon={typIkon(k.lektion.typ)}
            rad2={k.datum !== null ? kortDag(k.datum) : `Kap ${k.kapitel}${k.lektion.del > 1 ? ` · del ${k.lektion.del}` : ''}`}
            vecka={k.vecka} fot={k.plan !== null ? '📝 detaljplan' : undefined}
            nr={valda.includes(k.index) ? valda.indexOf(k.index) + 1 : undefined} vald={valda.includes(k.index)} gjord={k.datum !== null && k.datum < idag}
            etikett={`${Sida}: ${k.lektion.avsnitt}${k.datum !== null ? ` ${k.datum}` : ''}`} onKlick={() => vaxla(k.index)} />
        ))}
        {kalla !== null && synliga.length === 0 && <p className="muted">Inga lektioner.</p>}
      </div>
      <button type="button" className="btn si-lagg" disabled={valdaKort.length === 0} onClick={() => { onLaggTill(valdaKort); setValda([]); }}>
        {sida === 'vänster' ? `➕ Lägg till ${valdaKort.length} valda →` : `← Lägg till ${valdaKort.length} valda ➕`}
      </button>
    </section>
  );
}

export interface SattIhopLageProps {
  s: Struktur;
  /** Ämnet som är öppet i planeringen (förval för vänster källa och för "lägg på ämne"). */
  amneId: string;
  kor: (fn: () => Struktur, m: string) => void;
  onStang: () => void;
  idag?: string;
}

export function SattIhopLage({ s, amneId, kor, onStang, idag: idagIn }: SattIhopLageProps) {
  const idag = idagIn ?? new Date().toISOString().slice(0, 10);
  const alla = kallor(s);
  const [vanster, setVanster] = useState(() => (alla.some((k) => kallNyckel(k.kalla) === `amne:${amneId}`) ? `amne:${amneId}` : alla[0] !== undefined ? kallNyckel(alla[0].kalla) : ''));
  const [hoger, setHoger] = useState(() => { const x = alla.find((k) => kallNyckel(k.kalla) !== `amne:${amneId}`); return x !== undefined ? kallNyckel(x.kalla) : ''; });
  const [valdaV, setValdaV] = useState<number[]>([]);
  const [valdaH, setValdaH] = useState<number[]>([]);
  const [lektioner, setLektioner] = useState<SammansattLektion[]>([]);
  const [namn, setNamn] = useState('');
  const [sparadId, setSparadId] = useState('');
  const [mal, setMal] = useState(amneId);
  const [fran, setFran] = useState(() => forstaKommandePass(s, amneId, idag) ?? idag);
  const [info, setInfo] = useState('');
  const sparade = s.sammansattaPlaneringar ?? [];
  const laddad = sparade.find((x) => x.id === sparadId);
  const namnFinns = sparade.some((x) => x.namn.trim().toLowerCase() === namn.trim().toLowerCase());
  const andrad = laddad === undefined || JSON.stringify(laddad.lektioner) !== JSON.stringify(lektioner);
  const malAmne = s.amnen.find((a) => a.id === mal);
  const malPlan = s.planeringar.find((p) => p.amneId === mal);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onStang(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onStang]);
  useEffect(() => { setFran(forstaKommandePass(s, mal, idag) ?? idag); }, [mal]); // eslint-disable-line react-hooks/exhaustive-deps

  const laggTill = (k: KallLektion[]) => { setLektioner([...lektioner, ...k.map(tillSammansatt)]); setInfo(''); };
  const flytta = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= lektioner.length) return;
    const ny = [...lektioner]; [ny[i], ny[j]] = [ny[j], ny[i]]; setLektioner(ny);
  };
  const spara = (lage: 'nytt' | 'ny-version' | 'ersatt') => {
    let id = '';
    kor(() => {
      const r = sparaSammansatt(lasStruktur(), lektioner, lage === 'ersatt' ? { typ: 'ersatt', id: sparadId } : { typ: lage, namn }, new Date().toISOString());
      id = r.id; return r.s;
    }, lage === 'ersatt' ? `"${laddad?.namn}" v${laddad?.version} uppdaterad.` : `"${namn.trim()}" sparad${lage === 'ny-version' ? ' som ny version' : ''}.`);
    const post = (lasStruktur().sammansattaPlaneringar ?? []).find((x) => x.id === id);
    if (post !== undefined) { setSparadId(post.id); setInfo(`Sparad som ${post.namn} v${post.version}.`); }
  };
  const oppna = (id: string) => {
    const post = sparade.find((x) => x.id === id);
    setSparadId(id);
    if (post !== undefined) { setLektioner(JSON.parse(JSON.stringify(post.lektioner)) as SammansattLektion[]); setNamn(post.namn); }
  };
  const laggPa = () => {
    if (laddad === undefined) return;
    let franUt = fran;
    kor(() => { const r = kopplaSammansatt(lasStruktur(), laddad.id, mal, fran, idag, new Date().toISOString()); franUt = r.fran; return r.s; },
      `${laddad.namn} v${laddad.version} lagd på ${s.klasser.find((k) => k.id === malAmne?.klassId)?.namn ?? ''} ${malAmne?.namn ?? ''} från ${kortDag(fran)} — den tidigare planeringen ligger i arkivet.`);
    setInfo(`Lagd på ämnet från ${kortDag(franUt)}. Öppna planeringen för att se lektionerna.`);
  };

  const antalKallor = new Set(lektioner.map((l) => l.kalla)).size;
  const medPlan = lektioner.filter((l) => l.plan !== undefined).length;
  const amnen = s.amnen.map((a) => ({ a, k: s.klasser.find((k) => k.id === a.klassId)?.namn ?? '' }))
    .filter((x) => x.a.bokId !== undefined).sort((x, y) => x.k.localeCompare(y.k, 'sv') || x.a.namn.localeCompare(y.a.namn, 'sv'));

  return (
    <div className="si-bak" onClick={(e) => { if (e.target === e.currentTarget) onStang(); }}>
      <div className="si" role="dialog" aria-modal="true" aria-label="Sätt ihop planering">
        <div className="si-band">
          <span className="si-lage">🧩 Sätt ihop planering</span>
          <small>Välj lektionskort ur två planeringar eller böcker och bygg en ny följd i mitten.</small>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Stäng sätt ihop planering" onClick={onStang}>✕</button>
        </div>
        <div className="si-kropp">
          <KallKolumn s={s} sida="vänster" kallaN={vanster} setKallaN={setVanster} valda={valdaV} setValda={setValdaV} onLaggTill={laggTill} idag={idag} />

          <section className="si-mitt" aria-label="Ny planering">
            <div className="si-mitthuvud">
              <b>Ny planering</b>
              {sparade.length > 0 && (
                <select aria-label="Öppna sparad sammansatt planering" value={sparadId} onChange={(e) => oppna(e.target.value)}>
                  <option value="">— öppna sparad —</option>
                  {sparade.map((x) => <option key={x.id} value={x.id}>{x.namn} v{x.version} ({x.lektioner.length})</option>)}
                </select>
              )}
            </div>
            <input className="si-namn" aria-label="Namn på planeringen" placeholder="Namn, t.ex. Kroppen + kemins grunder" value={namn} onChange={(e) => setNamn(e.target.value)} />
            <p className="small muted">{lektioner.length} lektioner · {antalKallor} {antalKallor === 1 ? 'källa' : 'källor'} · {medPlan} med detaljplan</p>
            <ol className="si-lista">
              {lektioner.map((l, i) => (
                <li key={`${i}-${l.bokId}-${l.nyckel}`} className="si-rad" style={{ '--kap': s.bocker.find((b) => b.id === l.bokId)?.kapitel.find((k) => k.nr === l.kapitel)?.farg ?? '#5c6b7a' } as React.CSSProperties}>
                  <span className="si-radnr">{i + 1}</span>
                  <span className="si-radtext"><b>{l.lektion.avsnitt}</b><small>{l.kalla}{l.plan !== undefined ? ' · 📝' : ''}</small></span>
                  <span className="si-radknappar">
                    <button type="button" className="icon-btn" aria-label={`Flytta upp ${i + 1}`} disabled={i === 0} onClick={() => flytta(i, -1)}>↑</button>
                    <button type="button" className="icon-btn" aria-label={`Flytta ned ${i + 1}`} disabled={i === lektioner.length - 1} onClick={() => flytta(i, 1)}>↓</button>
                    <button type="button" className="icon-btn" aria-label={`Ta bort ${i + 1}`} onClick={() => setLektioner(lektioner.filter((_, j) => j !== i))}>✕</button>
                  </span>
                </li>
              ))}
              {lektioner.length === 0 && <li className="si-tom">Välj kort till vänster och höger och lägg till dem här.</li>}
            </ol>
            <div className="si-spara">
              {!namnFinns && <button type="button" className="btn" disabled={lektioner.length === 0 || namn.trim() === ''} onClick={() => spara('nytt')}>💾 Spara</button>}
              {namnFinns && <button type="button" className="btn" disabled={lektioner.length === 0 || !andrad} onClick={() => spara('ny-version')}>💾 Spara som ny version</button>}
              {laddad !== undefined && andrad && <button type="button" className="btn sec" disabled={lektioner.length === 0} onClick={() => spara('ersatt')}>Ersätt v{laddad.version}</button>}
              {laddad !== undefined && !andrad && <span className="si-ok">✓ {laddad.namn} v{laddad.version}</span>}
            </div>

            <div className="si-koppla">
              <b>📌 Lägg på ett ämne</b>
              <div className="si-kopplarad">
                <select aria-label="Ämne att lägga planeringen på" value={mal} onChange={(e) => setMal(e.target.value)}>
                  {amnen.map(({ a, k }) => <option key={a.id} value={a.id}>{k} · {a.namn}</option>)}
                </select>
                <label>från <input type="date" aria-label="Från datum" value={fran} min={idag} onChange={(e) => { if (e.target.value !== '') setFran(e.target.value); }} /></label>
              </div>
              <button type="button" className="btn si-koppla-knapp" disabled={laddad === undefined || andrad} onClick={laggPa}
                title={laddad === undefined || andrad ? 'Spara planeringen först' : undefined}>📌 Lägg på kommande lektioner</button>
              <p className="small muted">Genomförda lektioner rörs inte. Efter korten fortsätter ämnets bok med nästa lektion som inte redan finns bland korten. Den nuvarande planeringen arkiveras och kan återställas.</p>
              {malPlan?.sammansatt !== undefined && (
                <p className="small">Ämnet har nu <b>{malPlan.sammansatt.namn} v{malPlan.sammansatt.version}</b> från {kortDag(malPlan.sammansatt.fran)}.{' '}
                  <button type="button" className="linkbtn" onClick={() => kor(() => kopplaLossSammansatt(lasStruktur(), mal, idag, new Date().toISOString()), 'Den sammansatta följden borttagen — ämnets bok gäller igen för kommande lektioner.')}>Ta bort från ämnet</button></p>
              )}
            </div>
            {info !== '' && <p className="status" role="status">{info}</p>}
          </section>

          <KallKolumn s={s} sida="höger" kallaN={hoger} setKallaN={setHoger} valda={valdaH} setValda={setValdaH} onLaggTill={laggTill} idag={idag} />
        </div>
      </div>
    </div>
  );
}
