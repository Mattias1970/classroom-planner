/**
 * Del 156 · Återskapa-läge: återskapa genomförd planering ur quizzarna.
 *
 * Varje pass före valt datum får ett förslag ur exit tickets, läxförhör, övningar och
 * DigiExam (kernel: aterskapaPlanering). Läraren går igenom tidslinjen, byter det som
 * inte stämmer och godkänner. Då blir tidslinjen facit på en ny planeringsversion —
 * den gamla arkiveras och kan återställas — och från datumet fortsätter boken med
 * raden efter den sista som gicks igenom.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  aterskapaPlanering, godkannAterskapad, TYPNAMN, TYPNAMN_GENOMFORD, VALNAMN,
  type AterskapaVal, type AterskapaValTyp, type AterskapadLektion, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const DAGAR = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function passDatum(d: string): string {
  const x = new Date(`${d}T12:00:00Z`);
  return `${DAGAR[x.getUTCDay()]} ${x.getUTCDate()} ${MANADER[x.getUTCMonth()]}`;
}

const VAL_ORDNING: AterskapaValTyp[] = ['auto', 'nasta', 'extra', 'laboration', 'prov', 'installd', 'annat'];

export interface AterskapaLageProps {
  s: Struktur;
  amneId: string;
  kor: (fn: () => Struktur, m: string) => void;
  onStang: () => void;
  /** Dagens datum (injiceras i test). */
  idag?: string;
}

export function AterskapaLage({ s, amneId: amneIdIn, kor, onStang, idag: idagIn }: AterskapaLageProps) {
  const idag = idagIn ?? new Date().toISOString().slice(0, 10);
  const [amneId, setAmneId] = useState(amneIdIn);
  const [till, setTill] = useState(idag);
  const [val, setVal] = useState<AterskapaVal>({});
  const [grupp, setGrupp] = useState(0);
  // Filtret håller kvar passen som var osäkra när det slogs på — de försvinner inte medan läraren ändrar dem
  const [baraKontrollera, setBaraKontrollera] = useState<Set<string> | null>(null);
  const [bekrafta, setBekrafta] = useState(false);

  const amne = s.amnen.find((a) => a.id === amneId);
  const klass = s.klasser.find((k) => k.id === amne?.klassId);
  const aktiv = s.planeringar.find((p) => p.amneId === amneId);
  const amnen = s.amnen.filter((a) => a.bokId !== undefined)
    .map((a) => ({ a, k: s.klasser.find((k) => k.id === a.klassId)?.namn ?? '' }))
    .sort((x, y) => x.k.localeCompare(y.k, 'sv') || x.a.namn.localeCompare(y.a.namn, 'sv'));

  const utfall = useMemo(() => {
    try { return { a: aterskapaPlanering(s, amneId, till, val), fel: '' }; } catch (e) { return { a: null, fel: (e as Error).message }; }
  }, [s, amneId, till, val]);
  const a = utfall.a;
  const g = a?.grupper[Math.min(grupp, (a?.grupper.length ?? 1) - 1)];
  const kontrollera = a === null ? 0 : a.grupper.reduce((n, x) => n + x.lektioner.filter((l) => !l.saker).length, 0);
  const antalPass = a === null ? 0 : a.grupper.reduce((n, x) => n + x.lektioner.length, 0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onStang(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onStang]);

  const sattVal = (l: AterskapadLektion, typ: AterskapaValTyp, rubrik?: string) => {
    setBekrafta(false);
    const nytt = { ...val };
    if (typ === 'auto') delete nytt[l.nyckel]; else nytt[l.nyckel] = { typ, ...(rubrik !== undefined ? { rubrik } : {}) };
    setVal(nytt);
  };

  const godkann = () => {
    kor(() => godkannAterskapad(lasStruktur(), aterskapaPlanering(lasStruktur(), amneId, till, val), new Date().toISOString()),
      `${amne?.namn ?? 'Ämnet'} ${klass?.namn ?? ''}: genomförd planering återskapad t.o.m. ${passDatum(till)} — den tidigare versionen ligger i arkivet.`);
    onStang();
  };

  const rader = (g?.lektioner ?? []).filter((l) => baraKontrollera === null || baraKontrollera.has(l.nyckel));

  return (
    <div className="ak-bak" onClick={(e) => { if (e.target === e.currentTarget) onStang(); }}>
      <div className="ak" role="dialog" aria-modal="true" aria-label="Återskapa genomförd planering">
        <div className="ak-band">
          <span className="ak-lage">🕰 Återskapa-läge</span>
          <b>{amne?.namn ?? '—'} {klass?.namn ?? ''}</b>
          <small>pass före {passDatum(till)} läses ur quizzarna</small>
          <span className="spacer" />
          <button type="button" className="icon-btn ak-stang" aria-label="Lämna återskapa-läget" onClick={onStang}>✕</button>
        </div>

        <div className="ak-kropp">
          <div className="ak-kontroller">
            <label>Ämne{' '}
              <select aria-label="Ämne att återskapa" value={amneId} onChange={(e) => { setAmneId(e.target.value); setVal({}); setGrupp(0); setBekrafta(false); setBaraKontrollera(null); }}>
                {amnen.map(({ a: x, k }) => <option key={x.id} value={x.id}>{k} · {x.namn}</option>)}
              </select>
            </label>
            <label>Pass före{' '}
              <input type="date" aria-label="Återskapa pass före" value={till} max={idag} onChange={(e) => { if (e.target.value !== '') { setTill(e.target.value); setBekrafta(false); } }} />
            </label>
            {aktiv?.genomfort !== undefined && <span className="ak-chip ak-chip-ok">✓ Facit finns t.o.m. {passDatum(aktiv.genomfort.till)} — dina val är ifyllda</span>}
          </div>

          <details className="ak-regler">
            <summary>Så läses quizzarna</summary>
            <ul>
              <li><b>Exit ticket</b> med ett nytt delkapitel = genomgång av det avsnittet. Samma exit igen = bokens nästa del av avsnittet (eller en extra lektion).</li>
              <li><b>Läxförhöret</b> nästa lektion innehåller exit ticketen. Körs <b>samma läxförhör eller övning igen</b> = en extra lektion med <i>Testa dig själv</i>-frågor.</li>
              <li>Läxförhör utan exit: finns ett nytt delkapitel i <i>nästa</i> läxförhör som ingen exit introducerat föreslås en genomgång utan exit — annars arbete på avsnittet. ⚠ kontrollera.</li>
              <li><b>DigiExam</b> = prov. Pass utan quiz: laboration på halvklasspass, annars "Lektion utan quiz". ⚠ kontrollera.</li>
            </ul>
          </details>

          {utfall.fel !== '' && <p className="status warn">⚠ {utfall.fel}</p>}
          {a !== null && (<>
            <div className="ak-summa" aria-label="Sammanfattning">
              <span className="ak-chip">{antalPass} pass · {a.antalQuiz} quiz</span>
              {(['avsnitt', 'extra', 'laboration', 'prov', 'annat', 'installd'] as const).filter((t) => a.summa[t] > 0).map((t) => (
                <span key={t} className={`ak-chip ak-typ-${t}`}>{a.summa[t]} {TYPNAMN_GENOMFORD[t].toLowerCase()}</span>
              ))}
              <button type="button" className={`ak-chip ak-kontroll${baraKontrollera !== null ? ' act' : ''}`} aria-pressed={baraKontrollera !== null}
                disabled={kontrollera === 0 && baraKontrollera === null}
                onClick={() => setBaraKontrollera(baraKontrollera !== null ? null : new Set(a.grupper.flatMap((x) => x.lektioner.filter((l) => !l.saker).map((l) => l.nyckel))))}>
                ⚠ {kontrollera} att kontrollera{baraKontrollera !== null ? ' · visa alla' : ''}</button>
            </div>

            {a.grupper.length > 1 && (
              <div className="ak-flikar" role="tablist" aria-label="Grupp">
                {a.grupper.map((x, i) => (
                  <button key={x.grupp ?? 'hel'} type="button" role="tab" aria-selected={i === grupp} className={`ak-flik${i === grupp ? ' act' : ''}`} onClick={() => setGrupp(i)}>
                    Grupp {x.grupp} <small>{x.lektioner.filter((l) => !l.saker).length > 0 ? `⚠ ${x.lektioner.filter((l) => !l.saker).length}` : '✓'}</small>
                  </button>
                ))}
              </div>
            )}

            {antalPass === 0 ? <p className="muted">Inga schemalagda pass före {passDatum(till)}.</p> : (
              <table className="tbl ak-tabell">
                <thead><tr><th>V</th><th>Pass</th><th>Quiz på passet</th><th>Vad gjordes</th><th>Blir i planeringen</th></tr></thead>
                <tbody>{rader.map((l) => (
                  <tr key={l.nyckel} className={`${l.saker ? 'ak-saker' : 'ak-osaker'}${l.typ === 'installd' ? ' ak-installd' : ''}`}>
                    <td className="ak-v">{l.vecka}</td>
                    <td className="ak-pass">{passDatum(l.datum)}<small>{l.start}{l.halvklasspass ? ' · halvklass' : ''}</small></td>
                    <td className="ak-quiz">{l.quiz.length === 0 ? <span className="muted">—</span> : l.quiz.map((q) => (
                      <span key={`${q.kalla}${q.prov}${q.rum ?? ''}`} className={`ak-q ak-q-${q.kalla.replace('socrative-', '')}`} title={`${q.prov} · ${q.antal} elever${q.koder.length > 0 ? ` · ${q.koder.join(', ')}` : ''}`}>
                        {TYPNAMN[q.kalla]} {q.rum ?? q.prov}{q.upprepat ? ' ↻ igen' : ''}
                      </span>
                    ))}</td>
                    <td className="ak-valcell">
                      <select aria-label={`Vad gjordes ${l.datum} ${l.start}`} value={l.val} onChange={(e) => sattVal(l, e.target.value as AterskapaValTyp, e.target.value === 'annat' ? (l.typ === 'annat' ? l.rubrik : '') : undefined)}>
                        {VAL_ORDNING.map((t) => <option key={t} value={t}>{t === 'auto' ? `Förslag: ${TYPNAMN_GENOMFORD[l.forslag]}` : VALNAMN[t]}</option>)}
                      </select>
                      {l.val === 'annat' && (
                        <input aria-label={`Rubrik ${l.datum} ${l.start}`} placeholder="Vad gjordes?" value={val[l.nyckel]?.rubrik ?? ''} onChange={(e) => sattVal(l, 'annat', e.target.value)} />
                      )}
                    </td>
                    <td className="ak-blir">
                      <span className={`ak-typ ak-typ-${l.typ}`}>{TYPNAMN_GENOMFORD[l.typ]}</span> <b>{l.rubrik}</b>
                      <small className={l.saker ? 'ak-skal' : 'ak-skal ak-varna'}>{l.saker ? '✓' : '⚠'} {l.skal}</small>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}

            {g !== undefined && (
              <div className="ak-efter">
                {g.hoppade.length > 0 && <p><b>Hoppades över i boken{a.grupper.length > 1 ? ` (grupp ${g.grupp})` : ''}:</b> {g.hoppade.join(' · ')} <small className="muted">— kan läggas tillbaka i planeringen efteråt (ersätt en kommande lektion).</small></p>}
                <p><b>Från {passDatum(till)} fortsätter planeringen med:</b> {g.fortsatter ?? <span className="muted">boken är slut</span>}</p>
                {a.utanforSchema.length > 0 && (
                  <p className="small muted">Quiz som inte hör till något pass i schemat (räknas inte som lektion): {a.utanforSchema.map((q) => `${TYPNAMN[q.kalla]} ${q.prov} (${passDatum(q.datum)})`).join(' · ')}</p>
                )}
              </div>
            )}
          </>)}
        </div>

        <div className="ak-fot">
          <button type="button" className="btn sec" onClick={onStang}>Avbryt</button>
          <span className="spacer" />
          {a !== null && antalPass > 0 && (bekrafta ? (<>
            <span className="small">Den nuvarande planeringen{aktiv?.version !== undefined ? ` (v${aktiv.version})` : ''} arkiveras och kan återställas.</span>
            <button type="button" className="btn sec" onClick={() => setBekrafta(false)}>Ångra</button>
            <button type="button" className="btn ak-godkann" onClick={godkann}>✔ Bekräfta</button>
          </>) : (
            <button type="button" className="btn ak-godkann" onClick={() => setBekrafta(true)}>
              ✔ Godkänn som genomförd planering{kontrollera > 0 ? ` (${kontrollera} ⚠)` : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
