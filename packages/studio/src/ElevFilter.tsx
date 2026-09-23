/**
 * Del 141 · ElevFilter — ett elevurval som styr hela dashboarden.
 *
 * Ligger i filterraden överst. Tre sätt att välja: trendkluster (Riskzon …),
 * närvaro (⬇ under / ⬆ minst en gräns i procent) eller bocka i elever. Urvalet
 * räknas i kernel (`elevUrval`) på den ofiltrerade klassen och begränsar sedan
 * alla grafer via `begransaTillElever`.
 */
import React, { useState } from 'react';
import { KLUSTER_NAMN, type Elev, type ElevNarvaro, type ElevUrvalVal, type Kluster, type KlusterGrupp } from '@planner/kernel';

const KLUSTER_ORDNING: Kluster[] = ['stigande', 'stabil', 'riskzon', 'ojamn'];
const KLUSTER_FARG: Record<Kluster, string> = { stigande: '#1B5E20', stabil: '#2f5aa8', riskzon: '#B71C1C', ojamn: '#E65100' };

export function ElevFilter({ elever, kluster, narvaro, val, valda, etikett, onVal }: {
  /** Klassens alla elever (ofiltrerade). */
  elever: Elev[];
  kluster: KlusterGrupp[];
  narvaro: ElevNarvaro[];
  val: ElevUrvalVal;
  /** Elev-id:n som urvalet pekar ut (null = alla). */
  valda: string[] | null;
  etikett: string;
  onVal: (v: ElevUrvalVal) => void;
}) {
  const [sok, setSok] = useState('');
  const [oppen, setOppen] = useState(false);
  const narvGrans = val.typ === 'narvaro' ? val.grans : 80;
  const narvRiktning = val.typ === 'narvaro' ? val.riktning : 'under';
  const aktivaKluster = val.typ === 'kluster' ? val.kluster : [];
  const valdaSet = new Set(valda ?? elever.map((e) => e.id));
  const antal = valda === null ? elever.length : valda.length;
  const filtrerat = valda !== null;
  const narvFor = (id: string) => narvaro.find((n) => n.elev.id === id)?.narvaroProcent ?? null;
  const klusterFor = (id: string) => kluster.find((g) => g.elever.some((e) => e.id === id))?.kluster ?? null;
  const vaxlaElev = (id: string) => {
    const ids = valdaSet.has(id) ? [...valdaSet].filter((x) => x !== id) : [...valdaSet, id];
    onVal({ typ: 'elever', elevIds: ids });
  };
  const traff = elever.filter((e) => sok.trim() === '' || e.namn.toLowerCase().includes(sok.trim().toLowerCase()));
  return (
    <details className={`st-elevfilter${filtrerat ? ' aktiv' : ''}`} open={oppen} onToggle={(e) => setOppen((e.target as HTMLDetailsElement).open)}>
      <summary aria-label="Elevfilter" title="Välj vilka elever alla grafer ska räknas på">
        <span className="st-elevfilter-ikon" aria-hidden="true">👥</span>
        <span className="st-elevfilter-text">{filtrerat ? <><b>{antal}</b> av {elever.length} elever · {etikett}</> : <>Alla elever <small className="muted">({elever.length})</small></>}</span>
        {filtrerat && <button type="button" className="icon-btn st-elevfilter-rensa" aria-label="Visa alla elever" title="Visa alla elever"
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onVal({ typ: 'alla' }); }}>✕</button>}
      </summary>
      <div className="st-elevfilter-panel">
        <p className="small muted st-elevfilter-hjalp">Urvalet gäller alla grafer och tabeller på sidan — kort, frågematris, trendkoll, kluster och närvaro.</p>

        <div className="st-elevfilter-rad">
          <span className="st-elevfilter-etikett">✨ Trendkluster</span>
          <div className="st-chips">
            {KLUSTER_ORDNING.map((k) => {
              const g = kluster.find((x) => x.kluster === k);
              const n = g?.elever.length ?? 0;
              const pa = aktivaKluster.includes(k);
              return (
                <button key={k} type="button" className={`chipbtn st-klusterchip${pa ? ' act' : ''}`} aria-pressed={pa} disabled={n === 0}
                  style={{ '--kluster': KLUSTER_FARG[k] } as React.CSSProperties}
                  title={n === 0 ? 'Inga elever i klustret' : `${n} elever — klicka för att välja dem`}
                  onClick={() => onVal({ typ: 'kluster', kluster: pa ? aktivaKluster.filter((x) => x !== k) : [...aktivaKluster, k] })}>
                  <i aria-hidden="true" /> {KLUSTER_NAMN[k]} <small>{n}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="st-elevfilter-rad">
          <span className="st-elevfilter-etikett">🙋 Närvaro</span>
          <label className="small">
            <select aria-label="Närvaro under eller minst" value={narvRiktning}
              onChange={(e) => onVal({ typ: 'narvaro', grans: narvGrans, riktning: e.target.value as 'under' | 'over' })}>
              <option value="under">⬇ under</option>
              <option value="over">⬆ minst</option>
            </select>
          </label>
          <label className="small">
            <input type="number" aria-label="Närvarogräns i procent" min={0} max={100} step={5} value={narvGrans} style={{ width: 64 }}
              onChange={(e) => onVal({ typ: 'narvaro', grans: Number(e.target.value), riktning: narvRiktning })} /> %
          </label>
          <button type="button" className={`chipbtn${val.typ === 'narvaro' ? ' act' : ''}`} aria-pressed={val.typ === 'narvaro'}
            onClick={() => onVal({ typ: 'narvaro', grans: narvGrans, riktning: narvRiktning })}>
            {narvRiktning === 'under' ? '⬇' : '⬆'} välj elever med närvaro {narvRiktning === 'under' ? 'under' : 'minst'} {narvGrans} %
          </button>
        </div>

        <div className="st-elevfilter-rad st-elevfilter-lista">
          <span className="st-elevfilter-etikett">🧑‍🎓 Elever</span>
          <div className="st-elevfilter-listkropp">
            <div className="rad" style={{ gap: 6 }}>
              <input aria-label="Sök elev i filtret" placeholder="sök…" value={sok} onChange={(e) => setSok(e.target.value)} />
              <button type="button" className="chipbtn" onClick={() => onVal({ typ: 'elever', elevIds: traff.map((e) => e.id), etikett: sok.trim() === '' ? undefined : `"${sok.trim()}"` })}>alla {traff.length}</button>
              <button type="button" className="chipbtn" onClick={() => onVal({ typ: 'elever', elevIds: [] })}>inga</button>
              <button type="button" className={`chipbtn${!filtrerat ? ' act' : ''}`} onClick={() => onVal({ typ: 'alla' })}>✕ visa alla elever</button>
            </div>
            <div className="st-elevfilter-elever">
              {traff.map((e) => {
                const n = narvFor(e.id); const k = klusterFor(e.id);
                return (
                  <label key={e.id} className={`st-elevfilter-elev${valdaSet.has(e.id) ? ' vald' : ''}`}>
                    <input type="checkbox" aria-label={`Elev ${e.namn}`} checked={valdaSet.has(e.id)} onChange={() => vaxlaElev(e.id)} />
                    <span className="st-elevfilter-namn">{e.namn}</span>
                    {k !== null && <i className="st-elevfilter-prick" style={{ background: KLUSTER_FARG[k] }} title={KLUSTER_NAMN[k]} />}
                    {n !== null && <small className={`muted${n < 80 ? ' st-narv-lag' : ''}`}>{n} %</small>}
                  </label>
                );
              })}
              {traff.length === 0 && <span className="small muted">Ingen elev matchar.</span>}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
