/**
 * v3 · Översikt — "Snabb helhetsbild av klass, ämnen och kommande aktiviteter."
 *
 * Enligt specen: KPI-kort (närvaro, aktiva ämnen, kommande), resultat per
 * ämne, kommande aktiviteter, riskindikatorer och deadlines. Saknas data
 * visas tomma platshållare för ämnen och aktiviteter.
 *
 * Det som i v2 hette Struktur (skolår, tjänster, klasser, ämnen, böcker,
 * lärare, GitHub) ligger här längst ned under "Struktur & inställningar" —
 * samma träd och paneler som förut, så ingen funktion försvinner.
 */
import React, { useMemo, useState } from 'react';
import {
  amnesKallor, frageKort, kalenderHandelser, kortDatum, narvaroKort, rapportOversikt, tolkaVeckor, trendKluster,
  type Struktur,
} from '@planner/kernel';
import { Ikon, amnesIkon } from './ikoner.js';
import { DataSaknas, Kort, Kpi, type Filter, type V3Vy } from './Skal.js';

export function Oversikt({ s, filter, setVy, struktur }: {
  s: Struktur; filter: Filter; setVy: (v: V3Vy) => void;
  /** v2:s strukturträd + paneler, renderade av App. */
  struktur: React.ReactNode;
}) {
  const idag = new Date().toISOString().slice(0, 10);
  const klasser = filter.klassId === '' ? s.klasser : s.klasser.filter((k) => k.id === filter.klassId);
  const period = tolkaVeckor(filter.periodText) ?? {};
  const [visaStruktur, setVisaStruktur] = useState(s.klasser.length === 0);

  // KPI: närvaro (snitt över valda klasser), aktiva ämnen, kommande aktiviteter
  const narvaro = useMemo(() => {
    const v = klasser.map((k) => narvaroKort(s, { klassId: k.id, ...period }).narvaroProcent).filter((x): x is number => x !== null);
    return v.length === 0 ? null : Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  }, [s, filter.klassId, filter.periodText]); // eslint-disable-line react-hooks/exhaustive-deps
  const amnen = s.amnen.filter((a) => klasser.some((k) => k.id === a.klassId));
  const aktiva = amnen.filter((a) => s.planeringar.some((p) => p.amneId === a.id));

  // Kommande aktiviteter ur kalendern: lektioner de närmaste 14 dagarna, prov/diagnos markerade
  const kommande = useMemo(() => {
    const skolar = s.skolar.find((x) => x.id === filter.skolarId) ?? s.skolar[0];
    if (skolar === undefined) return [];
    const slut = new Date(`${idag}T12:00:00Z`); slut.setUTCDate(slut.getUTCDate() + 14);
    const till = slut.toISOString().slice(0, 10);
    return kalenderHandelser(s, skolar.id)
      .filter((h) => h.datum >= idag && h.datum <= till && klasser.some((k) => k.id === h.klassId))
      .sort((a, b) => a.datum.localeCompare(b.datum) || a.start.localeCompare(b.start))
      .slice(0, 12);
  }, [s, filter.klassId, filter.skolarId, idag]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resultat per ämne: läxförhörs- och exitsnitt
  const perAmne = useMemo(() => amnen.map((a) => {
    const kort = frageKort(s, { klassId: a.klassId, amneId: a.id, kallor: amnesKallor(a.namn), ...period });
    const lax = kort.find((k) => k.kalla === 'socrative-laxforhor')?.snittProcent ?? null;
    const exit = kort.find((k) => k.kalla === 'socrative-exit')?.snittProcent ?? null;
    const helhet = kort.find((k) => k.kalla === 'helhet')?.snittProcent ?? null;
    return { a, klass: s.klasser.find((k) => k.id === a.klassId)?.namn ?? '', lax, exit, helhet };
  }), [s, filter.klassId, filter.periodText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Riskindikatorer: elever i riskzon (trendkluster) och med saknade quizsvar
  const risk = useMemo(() => klasser.flatMap((k) => {
    const kluster = trendKluster(s, { klassId: k.id, ...period });
    const riskzon = kluster.find((x) => x.kluster === 'riskzon')?.elever ?? [];
    const rader = rapportOversikt(s, { klassId: k.id, ...period });
    const lagNarvaro = rader.filter((r) => r.antalProv > 0 && r.narvaroProcent !== null && r.narvaroProcent < 80);
    return [
      ...riskzon.map((e) => ({ klass: k.namn, elev: e.namn, text: 'i riskzon (snitt under godkänd nivå)' })),
      ...lagNarvaro.map((r) => ({ klass: k.namn, elev: r.elev.namn, text: `quizsvar saknas på ${100 - (r.narvaroProcent ?? 0)} % av lektionerna` })),
    ];
  }), [s, filter.klassId, filter.periodText]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.elever} rubrik="Närvaro" varde={narvaro === null ? '—' : `${narvaro} %`} under="registrerade quizsvar" ton="bla" onKlick={() => setVy({ typ: 'resultat' })} />
        <Kpi ikon={Ikon.bok} rubrik="Aktiva ämnen" varde={aktiva.length} under={`${amnen.length} ämnen totalt`} ton="gron" onKlick={() => setVy({ typ: 'planering' })} />
        <Kpi ikon={Ikon.kalender} rubrik="Kommande" varde={kommande.length} under="aktiviteter de närmaste 14 dagarna" ton="lila" onKlick={() => setVy({ typ: 'kalender' })} />
        <Kpi ikon={Ikon.varning} rubrik="Riskindikatorer" varde={risk.length} under="elever att titta närmare på" ton={risk.length > 0 ? 'orange' : 'gron'} onKlick={() => setVy({ typ: 'elever' })} />
      </div>

      <div className="v3-rutnat tva">
        <Kort rubrik="Resultat per ämne" under="snitt i perioden · läxförhör och exit tickets">
          {perAmne.length === 0 ? <DataSaknas text="Inga ämnen i urvalet. Lägg till klasser och ämnen under Struktur & inställningar." atgard={{ text: 'Öppna struktur', onKlick: () => setVisaStruktur(true) }} /> : (
            <div className="v3-amnesrad">{perAmne.map(({ a, klass, lax, exit, helhet }) => {
              const I = amnesIkon(a.namn);
              return (
                <button key={a.id} className="v3-amnesstapel" onClick={() => setVy({ typ: 'amne', amneNamn: a.namn })} title={`${klass} · ${a.namn}`}>
                  <span className="v3-staplar">
                    <i className="lax" style={{ height: `${lax ?? 0}%` }} title={`Läxförhör ${lax ?? '—'} %`} />
                    <i className="exit" style={{ height: `${exit ?? 0}%` }} title={`Exit tickets ${exit ?? '—'} %`} />
                  </span>
                  <I storlek={16} /><small>{a.namn.slice(0, 4)}</small>
                  <b>{helhet === null ? '—' : `${helhet} %`}</b>
                  {helhet === null && <span className="v3-mini-saknas">data saknas</span>}
                </button>
              );
            })}</div>
          )}
          <div className="v3-legend"><span><i className="lax" /> Läxförhör</span><span><i className="exit" /> Exit tickets</span></div>
        </Kort>

        <Kort rubrik="Kommande aktiviteter" under="de närmaste 14 dagarna" hoger={<button className="v3-lank" onClick={() => setVy({ typ: 'kalender' })}>Kalender →</button>}>
          {kommande.length === 0 ? <DataSaknas text="Inga planerade lektioner de närmaste två veckorna. Skapa en planering under Planering." atgard={{ text: 'Öppna planering', onKlick: () => setVy({ typ: 'planering' }) }} /> : (
            <ul className="v3-lista">{kommande.map((h, i) => {
              const I = amnesIkon(h.amnesNamn);
              const prov = /prov|diagnos/i.test(h.avsnitt);
              return (
                <li key={i} className={prov ? 'v3-prov' : ''}>
                  <span className="v3-lista-ikon" style={{ color: h.amnesFarg }}><I storlek={16} /></span>
                  <span className="v3-lista-text"><b>{h.amnesNamn} · {h.avsnitt}</b><small>{kortDatum(h.datum)} {h.start}–{h.slut} · {h.klassNamn}{h.grupp !== undefined ? ` grupp ${h.grupp}` : ''}</small></span>
                  {prov && <span className="v3-badge-text rod">prov</span>}
                </li>
              );
            })}</ul>
          )}
        </Kort>
      </div>

      <Kort rubrik="Riskindikatorer och deadlines" under="elever som behöver stöd nu, och prov som närmar sig">
        {risk.length === 0 ? <p className="muted small">Inga riskindikatorer i urvalet.</p> : (
          <ul className="v3-lista">{risk.slice(0, 10).map((r, i) => (
            <li key={i}><span className="v3-lista-ikon rod"><Ikon.varning storlek={16} /></span><span className="v3-lista-text"><b>{r.elev}</b><small>{r.klass} · {r.text}</small></span></li>
          ))}</ul>
        )}
        {risk.length > 10 && <button className="v3-lank" onClick={() => setVy({ typ: 'elever' })}>Visa alla {risk.length} →</button>}
      </Kort>

      <details className="v3-struktur" open={visaStruktur} onToggle={(e) => setVisaStruktur((e.target as HTMLDetailsElement).open)}>
        <summary><Ikon.kugg storlek={18} /> <b>Struktur & inställningar</b> <small className="muted">skolår, tjänster, klasser, ämnen, böcker, lärare, GitHub, schema-import</small></summary>
        <div className="v3-struktur-innehall">{struktur}</div>
      </details>
    </div>
  );
}
