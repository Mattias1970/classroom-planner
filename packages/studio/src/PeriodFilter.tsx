/**
 * Del 212 · PeriodFilter — perioden i SuperTeach väljs som veckor ELLER kapitel.
 *
 * Samma meny-mönster som ElevFilter: en knapp i filterraden ("📅 v.38–44 · Kap 6"),
 * en panel med kapitelchips (ur planeringen: kapitlets veckor), snabbval (denna vecka,
 * senaste fyra, terminen, hela läsåret) och fritextfältet v.35–43. Resultatet är alltid
 * en periodtext — samma fält som topplisten och alla grafer redan använder — så ett
 * kapitelval är bara ett bekvämt sätt att sätta veckorna.
 */
import { useEffect, useRef, useState } from 'react';
import { isoVecka, periodTextForKapitel, tolkaVeckor, type KapitelVeckor } from '@planner/kernel';

export function PeriodFilter({ periodText, setPeriodText, kapitel, idag }: {
  periodText: string; setPeriodText: (v: string) => void;
  /** Ämnets kapitel med veckospann (tomt = inget ämne/bok). */
  kapitel: KapitelVeckor[];
  idag: string;
}) {
  const [oppen, setOppen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!oppen) return;
    const klick = (ev: MouseEvent) => { if (ref.current !== null && !ref.current.contains(ev.target as Node)) setOppen(false); };
    const tangent = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOppen(false); };
    document.addEventListener('mousedown', klick); document.addEventListener('keydown', tangent);
    return () => { document.removeEventListener('mousedown', klick); document.removeEventListener('keydown', tangent); };
  }, [oppen]);
  const period = tolkaVeckor(periodText);
  const fel = periodText.trim() !== '' && period === null;
  // Vilka kapitel täcks exakt av den nuvarande texten? (så att chippen lyser när veckorna matchar)
  const valdaKap = kapitel.filter((k) => period !== null && k.veckaFran >= period.veckaFran && k.veckaTill <= period.veckaTill && period.veckaFran <= period.veckaTill).map((k) => k.nr);
  const valjKapitel = (nr: number) => {
    const ny = valdaKap.includes(nr) ? valdaKap.filter((x) => x !== nr) : [...valdaKap, nr].sort((a, b) => a - b);
    const text = periodTextForKapitel(kapitel, ny);
    setPeriodText(text ?? ''); setOppen(false);
  };
  const valj = (v: string) => { setPeriodText(v); setOppen(false); };
  const v = isoVecka(idag);
  const etikett = period === null
    ? (fel ? `⚠ ${periodText}` : 'Alla veckor')
    : `v.${period.veckaFran}${period.veckaTill !== period.veckaFran ? `–${period.veckaTill}` : ''}${valdaKap.length > 0 ? ` · Kap ${valdaKap.join(', ')}` : ''}`;
  return (
    <details ref={ref} className={`st-elevfilter st-periodfilter${period !== null ? ' aktiv' : ''}`} open={oppen} onToggle={(e) => setOppen((e.target as HTMLDetailsElement).open)}>
      <summary aria-label="Periodfilter" title="Välj period — veckor eller kapitel">
        <span className="st-elevfilter-ikon" aria-hidden="true">📅</span>
        <span className="st-elevfilter-text">{etikett}</span>
        {period !== null && <button type="button" className="icon-btn st-elevfilter-rensa" aria-label="Visa alla veckor" title="Alla veckor"
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setPeriodText(''); }}>✕</button>}
      </summary>
      <div className="st-elevfilter-panel">
        <div className="rad" style={{ gap: 8, alignItems: 'flex-start' }}>
          <p className="small muted st-elevfilter-hjalp" style={{ flex: 1 }}>Perioden gäller alla kort och grafer på sidan. Välj kapitel ur planeringen eller skriv veckor själv.</p>
          <button type="button" className="icon-btn" aria-label="Stäng periodfiltret" title="Stäng (Esc)" onClick={() => setOppen(false)}>✕</button>
        </div>
        <div className="st-elevfilter-rad">
          <span className="st-elevfilter-etikett">📖 Kapitel</span>
          <div className="st-chips">
            {kapitel.length === 0 && <span className="small muted">Inget ämne med planering valt.</span>}
            {kapitel.map((k) => {
              const pa = valdaKap.includes(k.nr);
              return (
                <button key={k.nr} type="button" className={`chipbtn${pa ? ' act' : ''}`} aria-pressed={pa} title={`${k.namn} · ${k.lektioner} lektioner · v.${k.veckaFran}–${k.veckaTill}`}
                  onClick={() => valjKapitel(k.nr)}>Kap {k.nr} <small>v.{k.veckaFran}–{k.veckaTill}</small></button>
              );
            })}
          </div>
        </div>
        <div className="st-elevfilter-rad">
          <span className="st-elevfilter-etikett">🗓 Veckor</span>
          <div className="st-chips">
            <button type="button" className="chipbtn" onClick={() => valj(`v.${v}`)}>denna vecka</button>
            <button type="button" className="chipbtn" onClick={() => valj(`v.${((v - 4 + 52) % 52) + 1}–${v}`)}>senaste 4 veckorna</button>
            <button type="button" className="chipbtn" onClick={() => valj(Number(idag.slice(5, 7)) >= 7 ? 'v.34–51' : 'v.2–24')}>terminen</button>
            <button type="button" className={`chipbtn${period === null && !fel ? ' act' : ''}`} onClick={() => valj('')}>✕ alla veckor</button>
          </div>
        </div>
        <div className="st-elevfilter-rad">
          <span className="st-elevfilter-etikett">✏ Egna</span>
          <label className="small">
            <input aria-label="Period (veckor)" placeholder="v.35–43" value={periodText} size={10} className={fel ? 'fel' : undefined}
              onChange={(e) => setPeriodText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setOppen(false); }} />
            {fel && <span className="status warn small" style={{ marginLeft: 6 }}>⚠ skriv t.ex. v.35–43</span>}
          </label>
        </div>
      </div>
    </details>
  );
}
