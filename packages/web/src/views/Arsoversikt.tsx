/**
 * Årsöversikt (kravspec del 1, FR-YR-001…010 + FR-GEN-005):
 * kapitelkort med nyckeltal och resursräknare, klassval för datum,
 * markering + historikpopup vid förflyttade datum, provvarningsbanner,
 * viktiga datum-tabeller och gemensamma lektionsregler.
 */
import { useMemo, useState } from 'react';
import {
  countBegreppForKap, diffKeyDates, examWarnings, extractKeyDates, svDateLabel,
  weeksLabel, KAP_COLORS,
  type KeyDate, type KeyDateChange, type LessonRecord, type PlacedLesson, type SubjectFile,
} from '@planner/core';
import type { LoadedLibrary } from '../state/store.js';
import { getLinks } from '../state/store.js';

type Placed = PlacedLesson<LessonRecord>;
export type InnerTab = 'lektionsplan' | 'oversikt' | 'uppgifter' | 'begrepp' | 'filmer' | 'magma' | 'klasser';

export interface ArsoversiktProps {
  lib: LoadedLibrary;
  placedByClass: Record<string, Placed[]>;
  baselineByClass: Record<string, Placed[]>;
  onGoTo: (kapitel: number, inner: InnerTab) => void; // FR-GEN-005
}

const TYPE_LABEL: Record<string, string> = {
  repetition: 'Repetition', review: 'Repetition', ovaformagor: 'Öva förmågor',
  test: 'Diagnos/Kapiteltest', exam: 'PROV',
};

function isDiagnos(k: { type: string; avsnitt: string }): boolean {
  return k.type === 'test' && /diagnos/i.test(k.avsnitt);
}
function isKapiteltest(k: { type: string; avsnitt: string }): boolean {
  return k.type === 'test' && !/diagnos/i.test(k.avsnitt);
}

export default function Arsoversikt({ lib, placedByClass, baselineByClass, onGoTo }: ArsoversiktProps) {
  const classes = lib.subject.meta.klasser.filter((c) => !c.arkiverad);
  const [classId, setClassId] = useState(classes[0]?.id ?? '8B'); // FR-YR-002
  const [popup, setPopup] = useState<KeyDateChange | null>(null);  // FR-YR-006

  const placed = placedByClass[classId] ?? [];
  const baseline = baselineByClass[classId] ?? [];
  const keys = useMemo(() => extractKeyDates(placed), [placed]);
  const baseKeys = useMemo(() => extractKeyDates(baseline), [baseline]);
  const changes = useMemo(() => diffKeyDates(baseKeys, keys), [baseKeys, keys]);
  const warnings = useMemo(() => examWarnings(changes), [changes]);
  const changeByIdx = useMemo(() => new Map(changes.map((c) => [c.globalIdx, c])), [changes]);

  const chapters = Object.keys(lib.subject.kapitelMeta).map(Number).sort((a, b) => a - b);
  const passes = (lib.subject.schema[classId] ?? []).length;

  const countFilms = (kap: number): number => {
    let n = 0;
    for (const l of lib.lessons[kap] ?? []) {
      n += (lib.flip[kap]?.[l.id]?.blocks ?? []).filter((b) => b.typ === 'film').length;
      n += getLinks(kap, l.id).filter((x) => x.typ === 'film').length;
    }
    return n;
  };
  const countMagma = (kap: number): number => {
    let n = 0;
    for (const l of lib.lessons[kap] ?? []) n += getLinks(kap, l.id).filter((x) => x.typ === 'magma').length;
    return n;
  };

  const keyRow = (k: KeyDate) => {
    const ch = changeByIdx.get(k.globalIdx);
    return (
      <div key={k.globalIdx} className={`yr-key ${k.type}`}>
        <span>{TYPE_LABEL[k.type] ?? k.type} · {k.avsnitt}</span>
        <b>
          {k.date ? `v.${k.week} · ${svDateLabel(k.date)}` : 'inställd'}
          {ch && (
            <button className="yr-star" title="Datumet har ändrats — visa historik"
              onClick={() => setPopup(ch)}>★</button>
          )}
        </b>
      </div>
    );
  };

  return (
    <main className="main wide">
      <div className="head-row">
        <h2>Årsöversikt — {lib.subject.meta.lärobok.split(',')[0]}</h2>
        <div className="cal-controls">
          <span className="muted">Visa datum för:</span>
          {classes.map((c) => (
            <button key={c.id} className={`btn sec ${classId === c.id ? 'active' : ''}`}
              onClick={() => setClassId(c.id)}>{c.namn}</button>
          ))}
        </div>
      </div>

      {warnings.length > 0 && ( /* FR-YR-007 */
        <div className="yr-warn" role="alert">
          <b>⚠ Provdatum har förändrats</b>
          {warnings.map((w) => (
            <div key={w.globalIdx}>
              Kap {w.kapitel} – {w.avsnitt}: {w.cancelled
                ? <>har <b>ställts in</b> (var {w.from ? `${svDateLabel(w.from.date)} (v.${w.from.week})` : '—'})</>
                : <>{w.from ? `${svDateLabel(w.from.date)} (v.${w.from.week})` : '—'} → <b>{w.to ? `${svDateLabel(w.to.date)} (v.${w.to.week})` : '—'}</b>
                  {w.deltaWeeks !== null && <span className="delta"> {w.deltaWeeks > 0 ? '+' : ''}{w.deltaWeeks} v</span>}</>}
            </div>
          ))}
        </div>
      )}

      <div className="yr-grid">{/* FR-YR-001 */}
        {chapters.map((kap) => {
          const meta = lib.subject.kapitelMeta[String(kap)];
          const items = placed.filter((p) => p.kapitel === kap);
          const nLek = items.length;
          const kapKeys = keys.filter((k) => k.kapitel === kap);
          return (
            <div key={kap} className="yr-card" style={{ background: KAP_COLORS[kap] ?? '#555' }}>
              <small>KAPITEL {kap} · {meta.term}</small>
              <h3>{meta.name}</h3>
              <p>{nLek} lek · {weeksLabel(nLek, passes)} v</p>
              <div className="yr-pills">{/* FR-YR-003 + FR-GEN-005 */}
                <button onClick={() => onGoTo(kap, 'begrepp')}>💡 {countBegreppForKap(lib.begrepp.perDelkapitel, kap)} begrepp</button>
                <button onClick={() => onGoTo(kap, 'filmer')}>🎬 {countFilms(kap)} filmer</button>
                <button onClick={() => onGoTo(kap, 'magma')}>🧮 {countMagma(kap)} Magma</button>
              </div>
              <div className="yr-keys">{/* FR-YR-004/005 */}
                {kapKeys.filter((k) => isDiagnos(k)).map(keyRow)}
                {kapKeys.filter((k) => isKapiteltest(k)).map(keyRow)}
                {kapKeys.filter((k) => k.type === 'exam').map(keyRow)}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="yr-h">Viktiga datum — repetition, diagnoser och prov</h3>{/* FR-YR-008 */}
      <div className="yr-dates">
        {chapters.map((kap) => (
          <div key={kap} className="yr-datecol">
            <h4 style={{ background: KAP_COLORS[kap] ?? '#555' }}>Kap {kap} – {lib.subject.kapitelMeta[String(kap)].name}</h4>
            {keys.filter((k) => k.kapitel === kap).map(keyRow)}
            {keys.filter((k) => k.kapitel === kap).length === 0 && <p className="muted">Inga nyckeldatum.</p>}
          </div>
        ))}
      </div>

      <h3 className="yr-h">Gemensamma lektionsregler</h3>{/* FR-YR-010 */}
      <div className="yr-rules">
        <div className="card">
          <div className="title">Lektionsstruktur (BAM)</div>
          <p>Tavlan högst upp: <b>Ma [starttid]–[sluttid]</b>. Läxförhör via Socrative
            ({classes.map((c) => `${c.namn}: ${c.socrative}`).join(' · ')}) → Genomgång →
            Arbete → <b>Exit ticket</b> i slutet av lektionen (Socrative, samma rum).</p>
        </div>
        <div className="card">
          <div className="title">Uppgiftsnivåer</div>
          <p><span className="rg grön">Grön</span> = introduktion · <span className="rg blå">Blå</span> = E-nivå ·
            <span className="rg röd"> Röd</span> = C/A-nivå. Varje delkapitel har två lektioner:
            del 1 arbetar <b>Grön/Blå</b> (minimum grönt klart), del 2 arbetar <b>Blå/Röd</b> (minimum blått klart).</p>
        </div>
        <div className="card">
          <div className="title">Inlämning</div>
          <p>Gröna och blå uppgifter är <b>obligatoriska</b>: fotografera beräkningarna och ladda upp i
            Google Classroom. Röda uppgifter är frivilliga och görs om lektionstid finns.
            Det som inte hinns med görs klart hemma eller på stödtid.</p>
        </div>
        <div className="card">
          <div className="title">Läxor</div>
          <p>Läxa till varje delkapitel: <b>alla begrepp</b> som hör till delkapitlet.
            Läxförhör sker i början av nästa lektion via Socrative.</p>
        </div>
      </div>

      {popup && ( /* FR-YR-006 */
        <div className="overlay" role="dialog" onClick={() => setPopup(null)}>
          <div className="modal yr-pop" onClick={(e) => e.stopPropagation()}>
            <div className="head-row"><h3>{popup.avsnitt}</h3>
              <button className="icon-btn" onClick={() => setPopup(null)}>✕</button></div>
            <div className="yr-poprow"><span>Ursprungligt datum</span>
              <s>{popup.from ? `${svDateLabel(popup.from.date)} (v.${popup.from.week})` : '—'}</s></div>
            <div className="yr-poprow new"><span>Nytt datum</span>
              <b>{popup.cancelled ? 'INSTÄLLT' : popup.to ? `${svDateLabel(popup.to.date)} (v.${popup.to.week})` : '—'}</b></div>
            <div className="yr-poprow"><span>Förflyttning</span>
              <b>{popup.cancelled ? '—' : popup.deltaWeeks !== null ? `${popup.deltaWeeks > 0 ? '+' : ''}${popup.deltaWeeks} v` : '—'}</b></div>
            <p className="muted">Klass: <b>{classId}</b> · Klicka utanför för att stänga</p>
          </div>
        </div>
      )}
    </main>
  );
}
