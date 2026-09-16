/**
 * v3 · Ämnessida (Matematik, Kemi, Biologi, Fysik, Teknik …)
 *
 * Överst kapitlets KPI-kort och delkapitelkedjan som i designen; under det
 * ligger v2:s Planering för ämnet — lektionsplan, detaljplanering, begrepp,
 * filmer, Word-export — oförändrad.
 */
import React, { useMemo } from 'react';
import { amnesKallor, frageKort, planForAmne, type Struktur } from '@planner/kernel';
import { Ikon, amnesIkon } from './ikoner.js';
import { DataSaknas, Kort, Kpi, type Filter, type V3Vy } from './Skal.js';

export function Amnessida({ s, amneNamn, filter, setVy, planering }: {
  s: Struktur; amneNamn: string; filter: Filter; setVy: (v: V3Vy) => void;
  /** v2:s PlaneringVy för valt ämne, renderad av App. */
  planering: (amneId: string) => React.ReactNode;
}) {
  const kandidater = s.amnen.filter((a) => a.namn === amneNamn && (filter.klassId === '' || a.klassId === filter.klassId));
  const amne = kandidater[0];
  const I = amnesIkon(amneNamn);
  const idag = new Date().toISOString().slice(0, 10);
  const plan = useMemo(() => (amne === undefined ? [] : planForAmne(s, amne.id)), [s, amne?.id]);
  const klass = amne === undefined ? undefined : s.klasser.find((k) => k.id === amne.klassId);

  if (amne === undefined || klass === undefined) {
    return <div className="v3-sida-innehall"><Kort rubrik={<><I storlek={18} /> {amnesNamn}</>}><DataSaknas text={`Inget ämne "${amnesNamn}" i vald klass.`} atgard={{ text: 'Öppna struktur', onKlick: () => setVy({ typ: 'oversikt' }) }} /></Kort></div>;
  }

  // Aktuellt kapitel = kapitlet för nästa lektion (eller det sista genomförda)
  const nasta = plan.find((p) => p.datum !== null && p.datum >= idag) ?? plan[plan.length - 1];
  const kapNr = nasta?.kapitel ?? null;
  const iKap = plan.filter((p) => p.kapitel === kapNr);
  const genomforda = iKap.filter((p) => p.datum !== null && p.datum < idag).length;
  const progression = iKap.length === 0 ? null : Math.round((genomforda / iKap.length) * 100);
  const bok = s.bocker.find((b) => b.id === amne.bokId);
  const kapitel = bok?.kapitel.find((k) => k.nr === kapNr);
  const kommandeProv = plan.find((p) => p.datum !== null && p.datum >= idag && (p.lektion.typ === 'exam' || /prov|diagnos/i.test(p.lektion.avsnitt)));
  const kort = frageKort(s, { klassId: klass.id, amneId: amne.id, kallor: amnesKallor(amne.namn) });
  const helhet = kort.find((k) => k.kalla === 'helhet')?.snittProcent ?? null;
  const lax = kort.find((k) => k.kalla === 'socrative-laxforhor')?.snittProcent ?? null;

  // Delkapitelkedja: status per delkapitel i aktuellt kapitel (klar / pågår / kommande)
  const delar = (kapitel?.delkapitel ?? []).map((d) => {
    const lekt = plan.filter((p) => p.kapitel === kapNr && p.lektion.avsnitt.startsWith(d.kod));
    const klara = lekt.filter((p) => p.datum !== null && p.datum < idag).length;
    const status = lekt.length === 0 ? 'kommande' : klara === lekt.length ? 'klar' : klara > 0 ? 'pagar' : 'kommande';
    return { d, lekt: lekt.length, klara, status };
  });

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.staplar} rubrik="Progression i kapitlet" varde={progression === null ? '—' : `${progression} %`} under={kapNr !== null ? `Kap ${kapNr}${kapitel !== undefined ? ` ${kapitel.namn}` : ''} · ${genomforda} av ${iKap.length} lektioner` : 'ingen planering'} ton="bla" />
        <Kpi ikon={Ikon.bok} rubrik="Aktivt delkapitel" varde={nasta !== undefined ? nasta.lektion.avsnitt : '—'} under={nasta?.datum !== null && nasta !== undefined ? `nästa lektion ${nasta.datum}` : ''} ton="bla" badge={nasta !== undefined ? { text: 'Pågår', ton: 'bla' } : undefined} />
        <Kpi ikon={Ikon.check} rubrik="Kommande prov/diagnos" varde={kommandeProv !== undefined ? kommandeProv.lektion.avsnitt : 'Inget planerat'} under={kommandeProv?.datum ?? ''} ton="gron" />
        <Kpi ikon={Ikon.elever} rubrik="Klassens medel" varde={helhet === null ? '—' : `${helhet} %`} under={lax !== null ? `läxförhör ${lax} %` : 'inga förhör än'} ton="lila" onKlick={() => setVy({ typ: 'resultat' })} />
      </div>

      {kapitel !== undefined && (
        <Kort rubrik={`Kap ${kapNr} ${kapitel.namn} – Översikt`} under={`${delar.length} delkapitel · ${iKap.length} lektioner`}>
          <div className="v3-kedja">{delar.map(({ d, lekt, klara, status }, i) => (
            <React.Fragment key={d.kod}>
              <div className={`v3-kedja-kort ${status}`}>
                <b>{d.kod} {d.namn}</b><small>{lekt} lektioner</small>
                <span className="v3-progress"><i style={{ width: `${lekt === 0 ? 0 : (klara / lekt) * 100}%` }} /></span>
                <small className={`v3-status ${status}`}>{status === 'klar' ? 'Klar' : status === 'pagar' ? 'Pågår' : 'Kommande'}</small>
              </div>
              {i < delar.length - 1 && <span className="v3-kedja-pil">→</span>}
            </React.Fragment>
          ))}
            {kommandeProv !== undefined && <><span className="v3-kedja-pil">→</span><div className="v3-kedja-kort prov"><b>{kommandeProv.lektion.avsnitt}</b><small>{kommandeProv.datum}</small></div></>}
          </div>
        </Kort>
      )}

      {planering(amne.id)}
    </div>
  );
}
