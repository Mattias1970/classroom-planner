/**
 * v3 · Classroom — "Synka, publicera och följ upp uppgifter i Google Classroom."
 *
 * Det som finns i datan i dag: Socrative-rummen per ämne och delkapitel (med
 * delningslänk och QR) och lektionernas publiceringsstatus i planeringen.
 * Google Classroom/Teams-synken är ännu inte kopplad — modulen visar det som
 * "Data saknas" med en väg vidare, precis som specen kräver.
 */
import React from 'react';
import { planForAmne, socrativeElevLank, socrativeLank, socrativeQr, socrativeRum, type Struktur } from '@planner/kernel';
import { Ikon, amnesIkon } from './ikoner.js';
import { DataSaknas, Kort, Kpi, type Filter, type V3Vy } from './Skal.js';

function rumUr(falt: string): string | null {
  const m = /^\s*([A-Za-zÅÄÖåäö]+\d+)/.exec(falt);
  return m === null ? null : m[1];
}

export function Classroom({ s, filter, setVy }: { s: Struktur; filter: Filter; setVy: (v: V3Vy) => void }) {
  const klasser = filter.klassId === '' ? s.klasser : s.klasser.filter((k) => k.id === filter.klassId);
  const amnen = s.amnen.filter((a) => klasser.some((k) => k.id === a.klassId) && (filter.amneId === '' || a.id === filter.amneId));
  const idag = new Date().toISOString().slice(0, 10);

  // Rum per ämne: klassrummet + varje unikt läxförhörs-/exit-rum i planen
  const perAmne = amnen.map((a) => {
    const klass = s.klasser.find((k) => k.id === a.klassId)!;
    const plan = planForAmne(s, a.id, idag);
    const rum = new Map<string, { typ: string; forsta: string | null }>();
    rum.set(socrativeRum(a.namn, klass.namn), { typ: 'klassrum', forsta: null });
    for (const p of plan) {
      for (const [falt, typ] of [[p.lektion.socStart, 'läxförhör'], [p.lektion.exit, 'exit ticket']] as const) {
        const r = rumUr(falt); if (r === null || rum.has(r)) continue;
        rum.set(r, { typ, forsta: p.datum });
      }
    }
    const kommande = plan.filter((p) => p.datum !== null && p.datum >= idag).slice(0, 3);
    return { a, klass, rum: [...rum.entries()], kommande };
  });
  const antalRum = perAmne.reduce((n, x) => n + x.rum.length, 0);
  const medLank = perAmne.reduce((n, x) => n + x.rum.filter(([r]) => socrativeLank(s, r) !== '').length, 0);
  const medQr = perAmne.reduce((n, x) => n + x.rum.filter(([r]) => socrativeQr(s, r) !== null).length, 0);

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.klassrum} rubrik="Synkstatus" varde="Ej kopplad" under="Google Classroom / Teams" ton="orange" badge={{ text: 'väntar på koppling', ton: 'gul' }} />
        <Kpi ikon={Ikon.bok} rubrik="Socrative-rum" varde={antalRum} under={`${medLank} med delningslänk · ${medQr} med QR`} ton="bla" />
        <Kpi ikon={Ikon.kalender} rubrik="Kommande lektioner" varde={perAmne.reduce((n, x) => n + x.kommande.length, 0)} under="med förhör att publicera" ton="lila" onKlick={() => setVy({ typ: 'planering' })} />
      </div>

      <Kort rubrik="Synkstatus" under="vad som är publicerat, vad som väntar och vad som saknas">
        <DataSaknas text="Ingen koppling till Google Classroom eller Teams är aktiv. Inlämningar och publiceringsstatus kan inte hämtas ännu — läxförhör, exit tickets och QR-koder nedan fungerar utan koppling."
          atgard={{ text: 'Gå till inställningar', onKlick: () => setVy({ typ: 'oversikt' }) }} />
      </Kort>

      {perAmne.length === 0 ? <Kort rubrik="Socrative-rum"><DataSaknas text="Inga ämnen i urvalet." /></Kort> : perAmne.map(({ a, klass, rum, kommande }) => {
        const I = amnesIkon(a.namn);
        return (
          <Kort key={a.id} rubrik={<><I storlek={18} /> {klass.namn} · {a.namn}</>} under={`${rum.length} rum`}
            hoger={<button className="v3-lank" onClick={() => setVy({ typ: 'amne', amneNamn: a.namn })}>Ämnessidan →</button>}>
            <div className="v3-rumrad">{rum.map(([r, info]) => {
              const qr = socrativeQr(s, r); const lank = socrativeLank(s, r);
              return (
                <div key={r} className="v3-rum">
                  {qr !== null ? <img src={qr} alt={`QR ${r}`} className="v3-rum-qr" /> : <div className="v3-rum-qr tom"><small>ingen QR</small></div>}
                  <b>{r}</b>
                  <small className="muted">{info.typ}{info.forsta !== null ? ` · ${info.forsta}` : ''}</small>
                  <div className="v3-rum-knappar">
                    <a className="v3-knapp sek" href={lank !== '' ? lank : socrativeElevLank(r)} target="_blank" rel="noreferrer">Öppna</a>
                    <button className="v3-knapp sek" onClick={() => { void navigator.clipboard?.writeText(r); }}>Kopiera</button>
                  </div>
                </div>
              );
            })}</div>
            {kommande.length > 0 && (
              <ul className="v3-lista v3-kompakt">{kommande.map((p, i) => (
                <li key={i}><span className="v3-lista-ikon"><Ikon.kalender storlek={14} /></span>
                  <span className="v3-lista-text"><b>{p.lektion.avsnitt}</b><small>{p.datum} {p.start ?? ''} · läxförhör {rumUr(p.lektion.socStart) ?? '—'} · exit {rumUr(p.lektion.exit) ?? '—'}</small></span></li>
              ))}</ul>
            )}
          </Kort>
        );
      })}
    </div>
  );
}
