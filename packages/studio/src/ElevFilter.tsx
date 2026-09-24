/**
 * Del 141/148 · ElevFilter — "Visas för:"-raden som styr hela dashboarden.
 *
 * Alltid synlig överst: Klassen · trendklustren (med antal) · 📈 Analys av
 * trendkluster · Elever. Väljer man ett kluster får man frågan om att aktivera
 * elevnamnen: då lyser klustrets elever upp i namnlistan och kan väljas till och
 * från. Avviker namnurvalet från klustret markeras klusterchippen med röd
 * streckad ram och etiketten "ändrat urval". Närvarofiltret ligger i elevpanelen.
 * Urvalet räknas i kernel (`elevUrval`) och begränsar sedan alla grafer.
 */
import React, { useState } from 'react';
import { KLUSTER_NAMN, klusterElevIds, urvalAvvikerFranKluster, type Elev, type ElevNarvaro, type ElevUrvalVal, type Kluster, type KlusterGrupp } from '@planner/kernel';

const KLUSTER_ORDNING: Kluster[] = ['stigande', 'stabil', 'riskzon', 'ojamn'];
const KLUSTER_FARG: Record<Kluster, string> = { stigande: '#1B5E20', stabil: '#2f5aa8', riskzon: '#B71C1C', ojamn: '#E65100' };

export function ElevFilter({ elever, kluster, narvaro, val, valda, etikett, onVal, onAnalys }: {
  /** Klassens alla elever (ofiltrerade). */
  elever: Elev[];
  kluster: KlusterGrupp[];
  narvaro: ElevNarvaro[];
  val: ElevUrvalVal;
  /** Elev-id:n som urvalet pekar ut (null = alla). */
  valda: string[] | null;
  etikett: string;
  onVal: (v: ElevUrvalVal) => void;
  /** Öppnar trendklustergrafen. */
  onAnalys?: () => void;
}) {
  const [sok, setSok] = useState('');
  const [panel, setPanel] = useState(false);
  /** Kluster som just valts och väntar på svar om elevnamnen ska aktiveras. */
  const [fraga, setFraga] = useState<Kluster[] | null>(null);
  const narvGrans = val.typ === 'narvaro' ? val.grans : 80;
  const narvRiktning = val.typ === 'narvaro' ? val.riktning : 'under';
  const aktivaKluster: Kluster[] = val.typ === 'kluster' ? val.kluster : val.typ === 'elever' ? (val.franKluster ?? []) : [];
  const avviker = urvalAvvikerFranKluster(val, kluster);
  const valdaSet = new Set(valda ?? elever.map((e) => e.id));
  const antal = valda === null ? elever.length : valda.length;
  const filtrerat = valda !== null;
  const narvFor = (id: string) => narvaro.find((n) => n.elev.id === id)?.narvaroProcent ?? null;
  const klusterFor = (id: string) => kluster.find((g) => g.elever.some((e) => e.id === id))?.kluster ?? null;
  const franKluster = val.typ === 'elever' ? val.franKluster : undefined;
  const vaxlaElev = (id: string) => {
    const ids = valdaSet.has(id) ? [...valdaSet].filter((x) => x !== id) : [...valdaSet, id];
    onVal({ typ: 'elever', elevIds: ids, ...(franKluster !== undefined ? { franKluster } : {}) });
  };
  const valjKluster = (k: Kluster, pa: boolean) => {
    const nya = pa ? aktivaKluster.filter((x) => x !== k) : [...aktivaKluster, k];
    setFraga(nya.length > 0 ? nya : null);
    onVal(nya.length > 0 ? { typ: 'kluster', kluster: nya } : { typ: 'alla' });
  };
  const aktiveraNamn = (k: Kluster[]) => {
    onVal({ typ: 'elever', elevIds: klusterElevIds(kluster, k), franKluster: k });
    setFraga(null); setPanel(true);
  };
  const traff = elever.filter((e) => sok.trim() === '' || e.namn.toLowerCase().includes(sok.trim().toLowerCase()));
  const klassChip = filtrerat ? `${antal} av ${elever.length}` : `${elever.length}`;

  return (
    <div className={`st-elevfilter${filtrerat ? ' aktiv' : ''}`} role="group" aria-label="Elevfilter">
      <div className="st-urvalsbar">
        <span className="st-urvalsbar-etikett">👥 Visas för:</span>
        <button type="button" className={`chipbtn st-klasschip${!filtrerat ? ' act' : ''}`} aria-pressed={!filtrerat} title="Alla elever i klassen"
          onClick={() => { onVal({ typ: 'alla' }); setFraga(null); }}>Klassen <small>{klassChip}</small></button>
        <span className="st-urvalsbar-sep" aria-hidden="true">·</span>
        <span className="st-urvalsbar-etikett">✨ Trendkluster</span>
        {KLUSTER_ORDNING.map((k) => {
          const g = kluster.find((x) => x.kluster === k);
          const n = g?.elever.length ?? 0;
          const pa = aktivaKluster.includes(k);
          return (
            <button key={k} type="button" className={`chipbtn st-klusterchip${pa ? ' act' : ''}${pa && avviker ? ' avviker' : ''}`} aria-pressed={pa} disabled={n === 0}
              style={{ '--kluster': KLUSTER_FARG[k] } as React.CSSProperties}
              title={n === 0 ? 'Inga elever i klustret' : pa && avviker ? 'Urvalet är ändrat namn för namn — klicka för att återgå till klustret' : `${n} elever — klicka för att välja dem`}
              onClick={() => (pa && avviker ? onVal({ typ: 'kluster', kluster: aktivaKluster }) : valjKluster(k, pa))}>
              <i aria-hidden="true" /> {KLUSTER_NAMN[k]} <small>{n}</small>{pa && avviker && <span className="st-avviker-mark" aria-label="ändrat urval">✎</span>}
            </button>
          );
        })}
        {onAnalys !== undefined && <button type="button" className="btn sec sm" onClick={onAnalys} title="Öppna grafen med trendklustren">📈 Analys av trendkluster</button>}
        <span className="st-urvalsbar-sep" aria-hidden="true">·</span>
        <button type="button" className={`chipbtn st-eleverchip${val.typ === 'elever' ? ' act' : ''}${panel ? ' oppen' : ''}`} aria-expanded={panel} aria-controls="st-elevpanel"
          onClick={() => setPanel(!panel)}>🧑‍🎓 Elever{val.typ === 'elever' ? <small>{antal} valda</small> : null} {panel ? '▴' : '▾'}</button>
        {val.typ === 'narvaro' && <span className="chipbtn act st-narvchip">🙋 {etikett}</span>}
        {filtrerat && <span className="st-urvalsbar-status" role="status">Alla grafer visar <b>{antal}</b> av {elever.length} elever · {etikett}.</span>}
        {filtrerat && <button type="button" className="icon-btn st-elevfilter-rensa" aria-label="Visa alla elever" title="Visa alla elever" onClick={() => { onVal({ typ: 'alla' }); setFraga(null); }}>✕</button>}
      </div>

      {fraga !== null && val.typ === 'kluster' && (
        <div className="st-klusterfraga" role="status">
          ✨ <b>{fraga.map((k) => KLUSTER_NAMN[k]).join(' + ')}</b>: {klusterElevIds(kluster, fraga).length} elever valda. Aktivera elevnamnen för att justera urvalet namn för namn?
          <button type="button" className="btn sm" onClick={() => aktiveraNamn(fraga)}>✓ Aktivera elevnamn</button>
          <button type="button" className="btn sec sm" onClick={() => setFraga(null)}>Behåll klustret</button>
        </div>
      )}

      {panel && (
        <div className="st-elevfilter-panel" id="st-elevpanel">
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
                {franKluster !== undefined && <small className="muted">Urvalet började i <b>{franKluster.map((k) => KLUSTER_NAMN[k]).join(' + ')}</b>{avviker ? ' — ändrat' : ''}. Klustrets elever lyser.</small>}
              </div>
              <div className="st-elevfilter-elever">
                {traff.map((e) => {
                  const n = narvFor(e.id); const k = klusterFor(e.id);
                  const iKluster = franKluster !== undefined && k !== null && franKluster.includes(k);
                  return (
                    <label key={e.id} className={`st-elevfilter-elev${valdaSet.has(e.id) && filtrerat ? ' vald' : ''}${iKluster ? ' lyst' : ''}`}
                      style={k !== null ? { '--kluster': KLUSTER_FARG[k] } as React.CSSProperties : undefined}>
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
      )}
    </div>
  );
}
