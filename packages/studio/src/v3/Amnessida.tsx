/**
 * v3 · Ämnessida (Matematik, Kemi, Biologi, Fysik, Teknik …)
 *
 * Överst kapitlets KPI-kort och vägen till provet (Del 144): kapitlets alla
 * avsnitt som boxar i planeringsordning — delkapitel, Blandade uppgifter,
 * Träna/Utveckla, Förmågorna i fokus, Sammanfattning (Matematik Y), PERSPEKTIV
 * och FINALEN (Spektrum), laborationer, diagnoser — fram till provet. Varje box
 * är gjord, pågår eller kommer; ett klick öppnar en infopanel med sidor,
 * uppgifter per nivå, mål, begrepp, genomgång och exempel, samt hopp till
 * lektionens detaljplanering. Under det ligger v2:s Planering för ämnet.
 */
import React, { useMemo, useState } from 'react';
import { amnesKallor, frageKort, planForAmne, vagTillProvet, vagTypNamn, type Struktur, type VagBox, type VagLektion } from '@planner/kernel';
import { Ikon, amnesIkon } from './ikoner.js';
import { DataSaknas, Kort, Kpi, type Filter, type V3Vy } from './Skal.js';

const STATUS_TEXT = { klar: 'Gjord', pagar: 'Pågår', kommande: 'Kommande', oplanerad: 'Ej planerad' } as const;
const LEKT_STATUS = { klar: '✔ gjord', idag: '● idag', kommande: '○ kommer', oplanerad: '— ej planerad' } as const;
const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
function dagText(datum: string | null): string {
  if (datum === null) return 'ej planerad';
  const d = new Date(`${datum}T00:00:00Z`);
  return `${DAG[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
function har(v: string): boolean { return v.trim() !== '' && v.trim() !== '—'; }

export function Amnessida({ s, amneNamn, filter, setVy, planering, oppnaLektion }: {
  s: Struktur; amneNamn: string; filter: Filter; setVy: (v: V3Vy) => void;
  /** v2:s PlaneringVy för valt ämne, renderad av App. */
  planering: (amneId: string) => React.ReactNode;
  /** Hoppa till lektionens detaljplanering (position i ämnets planering). */
  oppnaLektion?: (amneId: string, index: number) => void;
}) {
  const kandidater = s.amnen.filter((a) => a.namn === amneNamn && (filter.klassId === '' || a.klassId === filter.klassId));
  const amne = kandidater[0];
  const I = amnesIkon(amneNamn);
  const idag = new Date().toISOString().slice(0, 10);
  const plan = useMemo(() => (amne === undefined ? [] : planForAmne(s, amne.id, idag)), [s, amne?.id, idag]);
  const klass = amne === undefined ? undefined : s.klasser.find((k) => k.id === amne.klassId);
  const [kapVal, setKapVal] = useState<number | null>(null);
  const [valdBox, setValdBox] = useState<string | null>(null);

  if (amne === undefined || klass === undefined) {
    return <div className="v3-sida-innehall"><Kort rubrik={<><I storlek={18} /> {amneNamn}</>}><DataSaknas text={`Inget ämne "${amneNamn}" i vald klass.`} atgard={{ text: 'Öppna struktur', onKlick: () => setVy({ typ: 'oversikt' }) }} /></Kort></div>;
  }

  // Aktuellt kapitel = kapitlet för nästa lektion (eller det sista genomförda), om läraren inte valt ett annat
  const nasta = plan.find((p) => p.datum !== null && p.datum >= idag) ?? plan[plan.length - 1];
  const bok = s.bocker.find((b) => b.id === amne.bokId);
  const kapNr = kapVal ?? nasta?.kapitel ?? null;
  const iKap = plan.filter((p) => p.kapitel === kapNr);
  const genomforda = iKap.filter((p) => p.datum !== null && p.datum < idag).length;
  const progression = iKap.length === 0 ? null : Math.round((genomforda / iKap.length) * 100);
  const kapitel = bok?.kapitel.find((k) => k.nr === kapNr);
  const kommandeProv = plan.find((p) => p.datum !== null && p.datum >= idag && (p.lektion.typ === 'exam' || /prov|diagnos/i.test(p.lektion.avsnitt)));
  const kort = frageKort(s, { klassId: klass.id, amneId: amne.id, kallor: amnesKallor(amne.namn) });
  const helhet = kort.find((k) => k.kalla === 'helhet')?.snittProcent ?? null;
  const lax = kort.find((k) => k.kalla === 'socrative-laxforhor')?.snittProcent ?? null;

  const vag = kapNr === null ? null : vagTillProvet(s, amne.id, kapNr, idag);
  const allaBoxar = vag === null ? [] : [...vag.boxar, ...(vag.prov !== null ? [vag.prov] : [])];
  const vald = allaBoxar.find((b) => b.id === valdBox) ?? null;

  return (
    <div className="v3-sida-innehall">
      <div className="v3-kpi-rad">
        <Kpi ikon={Ikon.staplar} rubrik="Progression i kapitlet" varde={progression === null ? '—' : `${progression} %`} under={kapNr !== null ? `Kap ${kapNr}${kapitel !== undefined ? ` ${kapitel.namn}` : ''} · ${genomforda} av ${iKap.length} lektioner` : 'ingen planering'} ton="bla" />
        <Kpi ikon={Ikon.bok} rubrik="Aktivt delkapitel" varde={nasta !== undefined ? nasta.lektion.avsnitt : '—'} under={nasta?.datum !== null && nasta !== undefined ? `nästa lektion ${nasta.datum}` : ''} ton="bla" badge={nasta !== undefined ? { text: 'Pågår', ton: 'bla' } : undefined} />
        <Kpi ikon={Ikon.check} rubrik="Kommande prov/diagnos" varde={kommandeProv !== undefined ? kommandeProv.lektion.avsnitt : 'Inget planerat'} under={kommandeProv?.datum ?? ''} ton="gron" />
        <Kpi ikon={Ikon.elever} rubrik="Klassens medel" varde={helhet === null ? '—' : `${helhet} %`} under={lax !== null ? `läxförhör ${lax} %` : 'inga förhör än'} ton="lila" onKlick={() => setVy({ typ: 'resultat' })} />
      </div>

      {vag !== null && bok !== undefined && (
        <Kort className="v3-vag" rubrik={`Kap ${vag.kapitelNr} ${vag.kapitelNamn} – Vägen till provet`}
          under={`${vag.boxar.length} avsnitt · ${vag.klara} av ${vag.totalt} lektioner gjorda${vag.prov !== null && vag.prov.fran !== null ? ` · prov ${vag.prov.fran}` : ''}`}
          hoger={bok.kapitel.length > 1 && (
            <label className="small muted">Kapitel{' '}
              <select aria-label="Kapitel på vägen" value={vag.kapitelNr} onChange={(e) => { setKapVal(Number(e.target.value)); setValdBox(null); }}>
                {bok.kapitel.map((k) => <option key={k.nr} value={k.nr}>{k.nr} {k.namn}</option>)}
              </select>
            </label>
          )}>
          <div className="v3-kedja" role="list" aria-label="Vägen till provet">
            {vag.boxar.map((b, i) => (
              <React.Fragment key={b.id}>
                <VagKort box={b} vald={vald?.id === b.id} onKlick={() => setValdBox(vald?.id === b.id ? null : b.id)} />
                {(i < vag.boxar.length - 1 || vag.prov !== null) && <span className="v3-kedja-pil" aria-hidden="true">→</span>}
              </React.Fragment>
            ))}
            {vag.prov !== null
              ? <VagKort box={vag.prov} vald={vald?.id === vag.prov.id} onKlick={() => setValdBox(vald?.id === vag.prov!.id ? null : vag.prov!.id)} />
              : <div className="v3-kedja-kort prov saknas" role="listitem"><b>🏆 Prov</b><small>inte planerat än — lägg till en egen rad i planeringen</small></div>}
          </div>
          {vald !== null && <VagInfo box={vald} nivaer={vag.nivaer} onStang={() => setValdBox(null)} oppna={oppnaLektion === undefined ? undefined : (i) => oppnaLektion(amne.id, i)} />}
        </Kort>
      )}

      {planering(amne.id)}
    </div>
  );
}

function VagKort({ box, vald, onKlick }: { box: VagBox; vald: boolean; onKlick: () => void }) {
  const n = box.lektioner.length;
  const andel = n === 0 ? 0 : (box.klara / n) * 100;
  const datum = box.fran === null ? 'ej planerad' : box.fran === box.till || box.till === null ? dagText(box.fran) : `${dagText(box.fran)} – ${dagText(box.till)}`;
  return (
    <button type="button" role="listitem" className={`v3-kedja-kort v3-vagbox ${box.status}${box.typ === 'prov' ? ' prov' : ''}${vald ? ' vald' : ''}`}
      aria-pressed={vald} aria-label={`${box.rubrik}: ${STATUS_TEXT[box.status]}`} title={`${vagTypNamn(box.typ)} · ${datum} — klicka för uppgifter, mål och begrepp`} onClick={onKlick}>
      <b><span aria-hidden="true">{box.ikon}</span> {box.rubrik}</b>
      <small>{n === 0 ? 'ingen lektion' : n === 1 ? datum : `${n} lektioner · ${datum}`}</small>
      <span className="v3-progress"><i style={{ width: `${andel}%` }} /></span>
      <small className={`v3-status ${box.status}`}>{STATUS_TEXT[box.status]}{n > 1 ? ` · ${box.klara}/${n}` : ''}</small>
    </button>
  );
}

function VagInfo({ box, nivaer, onStang, oppna }: { box: VagBox; nivaer: { niva1: string; niva2: string; niva3: string }; onStang: () => void; oppna?: (index: number) => void }) {
  const nivaRad = (l: VagLektion) => ([['niva1', 'introduktion'], ['niva2', 'E-nivå'], ['niva3', 'C–A-nivå']] as const)
    .filter(([k]) => har(l.uppgifter[k]))
    .map(([k, under]) => <span key={k} className={`v3-vag-niva ${k}`} title={under}><b>{nivaer[k]}</b> {l.uppgifter[k]}</span>);
  return (
    <div className="v3-vag-info" role="region" aria-label={`Om ${box.rubrik}`}>
      <div className="v3-vag-info-huvud">
        <b><span aria-hidden="true">{box.ikon}</span> {box.rubrik}</b>
        <small className="muted"> {vagTypNamn(box.typ)}{box.kod !== null ? ` ${box.kod}` : ''}{har(box.sidor) ? ` · ${box.sidor}` : ''} · <span className={`v3-status ${box.status}`}>{STATUS_TEXT[box.status]}</span></small>
        <span className="spacer" />
        <button type="button" className="v3-lank" onClick={onStang} aria-label="Stäng infopanelen">✕ stäng</button>
      </div>
      {box.lektioner.length === 0 && <p className="small muted">Avsnittet finns i boken men har ingen lektion i planeringen.</p>}
      <div className="v3-vag-lektioner">
        {box.lektioner.map((l) => (
          <div key={`${l.index}-${l.grupp ?? ''}`} className={`v3-vag-lektion ${l.status}`}>
            <div className="v3-vag-lektion-huvud">
              <b>{box.typ === 'delkapitel' ? `Del ${l.del}` : l.namn}{l.grupp !== undefined ? ` · grupp ${l.grupp}` : ''}</b>
              <small className="muted"> {dagText(l.datum)}{l.vecka !== null ? ` · v.${l.vecka}` : ''} · {LEKT_STATUS[l.status]}{har(l.sidor) && l.sidor !== box.sidor ? ` · ${l.sidor}` : ''}</small>
              {oppna !== undefined && <button type="button" className="v3-lank" onClick={() => oppna(l.index)}>Öppna lektionen →</button>}
            </div>
            {nivaRad(l).length > 0 && <div className="v3-vag-nivaer">Uppgifter: {nivaRad(l)}</div>}
            {har(l.genomgang) && <p className="small"><b>Genomgång:</b> {l.genomgang}</p>}
            {har(l.exempel) && <p className="small"><b>Exempel:</b> {l.exempel}</p>}
            {har(l.laxa) && <p className="small"><b>Läxa:</b> {l.laxa}</p>}
          </div>
        ))}
      </div>
      {box.mal.length > 0 && <div className="v3-vag-mal"><b>Mål</b><ul>{box.mal.map((m) => <li key={m}>{m}</li>)}</ul></div>}
      {box.begrepp.length > 0 && <div className="v3-vag-begrepp"><b>Begrepp</b> {box.begrepp.map((b) => <span key={b} className="v3-chip">{b}</span>)}</div>}
    </div>
  );
}
