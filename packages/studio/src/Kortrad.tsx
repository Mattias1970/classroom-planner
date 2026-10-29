/**
 * Del 202 · Kortraden — alla lektionsplanskort i en rad (horisontell eller vertikal) med veckor och
 * dagar som ram. Klick på ett kort öppnar lektionssidan (Detaljplanering). Korten kan dras för att byta
 * ordning, ➕ lägger in en ny lektion efter ett kort och 🗑 tar bort det — de följande flyttas, fasta kort
 * (prov, diagnoser, laborationer) ligger kvar på sina datum. Kartan överst visar hela terminen i
 * miniatyr med det synliga fönstret markerat; klick i kartan hoppar dit.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  flyttaLektionEfter, hamtaLektionsplan, laggTillLektionEfter, lektionsNamn, taBortLektion,
  type Bok, type PlaneradLektion, type Struktur,
} from '@planner/kernel';
import { lasInstallning, lasStruktur, sparaInstallning } from './store.js';

const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const dagText = (d: string) => `${DAG[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${Number(d.slice(8, 10))} ${MAN[Number(d.slice(5, 7)) - 1]}`;
const arFast = (n: string | undefined) => n === undefined || n.startsWith('lab:') || n.startsWith('pass:');

type Lage = 'horisontell' | 'vertikal';

export function Kortrad({ s, amneId, bok, plan, idag, kor, oppnaLektion }: {
  s: Struktur; amneId: string; bok: Bok; plan: PlaneradLektion[]; idag: string;
  kor: (fn: () => Struktur, m: string) => void; oppnaLektion: (i: number) => void;
}) {
  const [lage, setLageRaw] = useState<Lage>(() => lasInstallning<Lage>('cp.kortrad.lage', 'horisontell'));
  const setLage = (l: Lage) => { setLageRaw(l); sparaInstallning('cp.kortrad.lage', l); };
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [synliga, setSynliga] = useState<[number, number]>([0, 0]);
  const rullRef = useRef<HTMLDivElement>(null);
  const kortRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const rader = useMemo(() => plan.map((r, i) => ({ r, i })).filter((x) => x.r.datum !== null), [plan]);
  const veckor = useMemo(() => {
    const ut: Array<{ vecka: number; fran: string; till: string; rader: typeof rader }> = [];
    for (const x of rader) {
      const v = x.r.vecka ?? 0; const sista = ut[ut.length - 1];
      if (sista !== undefined && sista.vecka === v) { sista.rader.push(x); sista.till = x.r.datum!; } else ut.push({ vecka: v, fran: x.r.datum!, till: x.r.datum!, rader: [x] });
    }
    return ut;
  }, [rader]);
  const farg = (kapitel: number) => bok.kapitel.find((k) => k.nr === kapitel)?.farg ?? '#5c6b7a';
  const aktuell = rader.find((x) => x.r.datum! >= idag)?.i ?? rader[rader.length - 1]?.i ?? 0;

  // Synligt fönster för kartan
  useEffect(() => {
    const el = rullRef.current; if (el === null) return;
    const rakna = () => {
      const box = el.getBoundingClientRect();
      let forsta = Infinity; let sista = -Infinity;
      for (const [i, k] of kortRef.current) {
        const r = k.getBoundingClientRect();
        const syns = lage === 'horisontell' ? r.right > box.left && r.left < box.right : r.bottom > box.top && r.top < box.bottom;
        if (syns) { forsta = Math.min(forsta, i); sista = Math.max(sista, i); }
      }
      if (Number.isFinite(forsta)) setSynliga([forsta, sista]);
    };
    rakna();
    let t = 0;
    const h = () => { cancelAnimationFrame(t); t = requestAnimationFrame(rakna); };
    el.addEventListener('scroll', h); window.addEventListener('resize', h);
    return () => { el.removeEventListener('scroll', h); window.removeEventListener('resize', h); cancelAnimationFrame(t); };
  }, [lage, rader.length]);
  useEffect(() => { kortRef.current.get(aktuell)?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hoppa = (i: number) => { kortRef.current.get(i)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); };

  const medBekraftelse = (f: (tillat: boolean) => Struktur, fraga: string, m: string) => {
    try { kor(() => f(false), m); }
    catch (e) {
      const text = (e as Error).message;
      if (!/har varit/.test(text)) { kor(() => { throw e; }, ''); return; }
      if (!window.confirm(`${fraga}\n\n⚠ Det berör pass som har varit — passen skrivs om, även genomförda. Det går att ångra med ↩ Ångra.`)) return;
      try { kor(() => f(true), m); } catch (e2) { kor(() => { throw e2; }, ''); }
    }
  };
  const flytta = (nyckel: string, efter: string | null) => {
    const namn = plan.find((r) => r.nyckel === nyckel)?.lektion.avsnitt ?? nyckel;
    medBekraftelse((t) => flyttaLektionEfter(lasStruktur(), amneId, nyckel, efter, idag, t).s, `Flytta ${namn}?`, `${namn} flyttad — de andra lektionerna har fått nya pass, fasta kort ligger kvar.`);
  };
  const laggTill = (efterNyckel: string, efterNamn: string) => {
    const rubrik = window.prompt(`Rubrik på lektionen som läggs in efter ${efterNamn}:`, 'Övning');
    if (rubrik === null || rubrik.trim() === '') return;
    const typ = /\bprov\b|kapiteltest|slutprov/i.test(rubrik) ? 'prov' as const : /diagnos/i.test(rubrik) ? 'diagnos' as const : /övning|repetition|träna/i.test(rubrik) ? 'ovning' as const : 'lektion' as const;
    medBekraftelse((t) => laggTillLektionEfter(lasStruktur(), amneId, efterNyckel, { rubrik: rubrik.trim(), typ }, idag, t).s, `Lägga in "${rubrik.trim()}" efter ${efterNamn}?`, `"${rubrik.trim()}" inlagd efter ${efterNamn}.`);
  };
  const taBort = (x: { r: PlaneradLektion; i: number }) => {
    const namn = lektionsNamn(x.r.lektion, hamtaLektionsplan(s, amneId, x.i));
    const harVarit = x.r.datum! < idag;
    if (!window.confirm(`Ta bort ${namn} (${x.r.datum})?\n\nDe följande lektionerna flyttas ett pass tidigare; prov, diagnoser och laborationer ligger kvar.${harVarit ? '\n\n⚠ Lektionen har varit — gör det bara om den inte blev av.' : ''}\n\nDet går att ångra med ↩ Ångra.`)) return;
    try { const b = taBortLektion(lasStruktur(), amneId, x.r.nyckel!, idag, harVarit); kor(() => b.s, `${b.rubrik} borttagen — ${b.framflyttade} lektioner flyttade ett pass tidigare.`); }
    catch (e) { kor(() => { throw e; }, ''); }
  };

  // Drag & drop
  const onDragStart = (e: DragEvent, nyckel: string) => { setDrag(nyckel); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', nyckel); };
  const onDrop = (e: DragEvent, mal: string | null) => {
    e.preventDefault();
    const nyckel = drag ?? e.dataTransfer.getData('text/plain');
    setDrag(null); setOver(null);
    if (nyckel === '' || nyckel === mal) return;
    flytta(nyckel, mal);
  };

  return (
    <div className={`kortrad kortrad-${lage}`} aria-label="Kortraden">
      <div className="rad no-print" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <b>🃏 Kortraden</b>
        <button className={`btn sm ${lage === 'horisontell' ? '' : 'sec'}`} aria-pressed={lage === 'horisontell'} onClick={() => setLage('horisontell')}>↔ Horisontell</button>
        <button className={`btn sm ${lage === 'vertikal' ? '' : 'sec'}`} aria-pressed={lage === 'vertikal'} onClick={() => setLage('vertikal')}>↕ Vertikal</button>
        <button className="btn sec sm" onClick={() => hoppa(aktuell)}>📍 Till idag</button>
        <small className="muted">Klicka på ett kort för lektionssidan · dra ett kort för att flytta det · ➕ lägger in efter · 🗑 tar bort. Allt går att ångra.</small>
      </div>

      {/* Kartan */}
      <div className="kortrad-karta no-print" role="navigation" aria-label="Karta över lektionerna">
        {veckor.map((v) => (
          <div key={v.vecka} className="kortrad-karta-vecka" title={`v.${v.vecka} · ${dagText(v.fran)}–${dagText(v.till)}`}>
            <span className="kortrad-karta-v">{v.vecka}</span>
            <span className="kortrad-karta-block">
              {v.rader.map((x) => (
                <button key={x.i} className={`kortrad-karta-kort${x.i >= synliga[0] && x.i <= synliga[1] ? ' syns' : ''}${x.i === aktuell ? ' idag' : ''}${x.r.datum! < idag ? ' varit' : ''}`}
                  style={{ background: farg(x.r.kapitel) }} aria-label={`Hoppa till lektion ${x.i + 1}`} title={`${x.i + 1}. ${x.r.lektion.avsnitt} · ${dagText(x.r.datum!)}`} onClick={() => hoppa(x.i)} />
              ))}
            </span>
          </div>
        ))}
      </div>

      {/* Raden */}
      <div className="kortrad-rull" ref={rullRef}>
        <div className={`kortrad-slapp forst${over === '__forst__' ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver('__forst__'); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, null)} title="Släpp här för att lägga lektionen först">⇤ först</div>
        {veckor.map((v) => (
          <section key={v.vecka} className="kortrad-vecka">
            <header className="kortrad-vecka-rubrik"><b>v.{v.vecka}</b> <span className="muted small">{dagText(v.fran)}{v.fran !== v.till ? ` – ${dagText(v.till)}` : ''}</span></header>
            <div className="kortrad-vecka-kort">
              {v.rader.map((x) => {
                const lp = hamtaLektionsplan(s, amneId, x.i);
                const namn = lektionsNamn(x.r.lektion, lp);
                const fast = arFast(x.r.nyckel);
                const varit = x.r.datum! < idag;
                const genomgang = (lp?.genomgang ?? x.r.lektion.genomgang ?? '').trim();
                return (
                  <div key={x.i} className="kortrad-post">
                    <div ref={(el) => { if (el) kortRef.current.set(x.i, el); else kortRef.current.delete(x.i); }}
                      className={`kortrad-kort${varit ? ' varit' : ''}${lp?.klar === true ? ' klar' : ''}${x.i === aktuell ? ' aktuell' : ''}${drag === x.r.nyckel ? ' dras' : ''}${over === x.r.nyckel ? ' over' : ''}${fast ? ' fast' : ''}`}
                      style={{ borderTopColor: farg(x.r.kapitel) }} role="button" tabIndex={0} aria-label={`Lektion ${x.i + 1}: ${namn}`}
                      draggable={!fast} onDragStart={(e) => !fast && x.r.nyckel !== undefined && onDragStart(e, x.r.nyckel)} onDragEnd={() => { setDrag(null); setOver(null); }}
                      onDragOver={(e) => { if (fast || x.r.nyckel === undefined) return; e.preventDefault(); setOver(x.r.nyckel); }} onDragLeave={() => setOver(null)} onDrop={(e) => !fast && x.r.nyckel !== undefined && onDrop(e, x.r.nyckel)}
                      onClick={() => oppnaLektion(x.i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oppnaLektion(x.i); } }}>
                      <div className="kortrad-kort-dag"><span>{dagText(x.r.datum!)}</span><span className="muted">{x.r.start !== null ? `${x.r.start}–${x.r.slutTid}` : ''}</span></div>
                      <div className="kortrad-kort-nr muted small">{x.i + 1} · kap {x.r.kapitel}{varit ? ' · genomförd' : ''}{lp?.klar === true ? ' ✓' : ''}</div>
                      <div className="kortrad-kort-rubrik">{namn}</div>
                      {genomgang !== '' && genomgang !== '—' && <div className="kortrad-kort-text muted small">{genomgang.length > 90 ? `${genomgang.slice(0, 90)}…` : genomgang}</div>}
                      {!fast && (
                        <div className="kortrad-kort-knappar no-print" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" aria-label={`Ta bort lektion ${x.i + 1}`} title="Ta bort lektionen" onClick={() => taBort(x)}>🗑</button>
                        </div>
                      )}
                    </div>
                    {!fast && x.r.nyckel !== undefined && (
                      <button className="kortrad-plus no-print" aria-label={`Lägg till lektion efter ${x.i + 1}`} title={`Lägg in en ny lektion efter ${namn}`} onClick={() => laggTill(x.r.nyckel!, namn)}>＋</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {rader.length === 0 && <p className="muted">Inga lektioner i planeringen.</p>}
      </div>
    </div>
  );
}
