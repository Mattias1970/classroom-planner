/**
 * Årsöversikt (kravspec del 1, FR-YR-001…010 + FR-GEN-005):
 * kapitelkort med nyckeltal och resursräknare, klassval för datum,
 * markering + historikpopup vid förflyttade datum, provvarningsbanner,
 * viktiga datum-tabeller och gemensamma lektionsregler.
 */
import { useMemo, useState } from 'react';
import {
  byggExternaPoster, diffKeyDates, examWarnings, extractKeyDates, isoWeek, normaliseraRegler,
  raknaLektioner, reglerForAmne, svDateLabel, unikaAmnen,
  weeksLabel, KAP_COLORS,
  type KeyDate, type KeyDateChange, type Lektionsregel, type LessonRecord, type LokalBok,
  type LokalPlanering, type PlacedLesson, type SubjectFile,
} from '@planner/core';
import type { LoadedLibrary } from '../state/store.js';
import {
  countMagmaForKap, effectiveField, getAmnesregler, getBetygsdatum, getLinks,
  getLokalaBocker, getLokalaPlaneringar, setAmnesregler,
} from '../state/store.js';
import { resolveBegrepp } from '@planner/core';
import PROTO_FILMER from '../data/prototyp-filmer.json';

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
  // Del 14: en översikt per ämne — datakällans + lokala planeringars
  const [tick, bump] = useState(0);
  void tick;
  const planeringar = getLokalaPlaneringar();
  const bocker = getLokalaBocker();
  const amnen = unikaAmnen([lib.subject.meta.ämne, ...planeringar.map((p) => p.amne)]);
  const [amne, setAmne] = useState(lib.subject.meta.ämne);
  const aktivtAmne = amnen.includes(amne) ? amne : lib.subject.meta.ämne;
  const arDatakalla = aktivtAmne === lib.subject.meta.ämne;
  const betygsdatum = getBetygsdatum();

  const placed = placedByClass[classId] ?? [];
  const baseline = baselineByClass[classId] ?? [];
  const keys = useMemo(() => extractKeyDates(placed), [placed]);
  const baseKeys = useMemo(() => extractKeyDates(baseline), [baseline]);
  const changes = useMemo(() => diffKeyDates(baseKeys, keys), [baseKeys, keys]);
  const warnings = useMemo(() => examWarnings(changes), [changes]);
  const changeByIdx = useMemo(() => new Map(changes.map((c) => [c.globalIdx, c])), [changes]);

  const chapters = Object.keys(lib.subject.kapitelMeta).map(Number).sort((a, b) => a - b);
  const passes = (lib.subject.schema[classId] ?? []).length;

  const countBegrepp = (kap: number): number => { // effektiva värden: redigeringar slår igenom
    const seen = new Set<string>();
    for (const l of lib.lessons[kap] ?? []) {
      for (const b of resolveBegrepp(
        effectiveField(kap, l, 'begrepp'), effectiveField(kap, l, 'avsnitt'), l.del, lib.begrepp.perDelkapitel,
      )) seen.add(b.toLowerCase());
    }
    return seen.size;
  };
  const seedFilms = PROTO_FILMER as Record<string, Array<{ url: string }>>;
  const countFilms = (kap: number): number => {
    let n = 0;
    for (const l of lib.lessons[kap] ?? []) {
      const data = (lib.lankar[`${kap}-${l.id}`] ?? []).filter((b) => b.typ === 'film');
      const dataUrls = new Set(data.map((b) => b.url));
      n += data.length + (seedFilms[`${kap}-${l.id}`] ?? []).filter((f) => !dataUrls.has(f.url)).length;
      n += (lib.flip[kap]?.[l.id]?.blocks ?? []).filter((b) => b.typ === 'film').length;
      n += getLinks(kap, l.id).filter((x) => x.typ === 'film').length;
    }
    return n;
  };
  const countMagma = (kap: number): number =>
    countMagmaForKap(kap, (lib.lessons[kap] ?? []).map((l) => l.id));

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

  const amnesPlaneringar = planeringar.filter((p) => p.amne === aktivtAmne);

  return (
    <main className="main wide">
      <div className="head-row">
        <h2>Årsöversikt — {arDatakalla ? lib.subject.meta.lärobok.split(',')[0] : aktivtAmne}</h2>
        <div className="cal-controls">
          {amnen.length > 1 && (<>
            <span className="muted">Ämne:</span>
            {amnen.map((a) => (
              <button key={a} className={`btn sec ${aktivtAmne === a ? 'active' : ''}`}
                onClick={() => setAmne(a)}>{a}</button>
            ))}
            <span className="sep" />
          </>)}
          {arDatakalla && (<>
            <span className="muted">Visa datum för:</span>
            {classes.map((c) => (
              <button key={c.id} className={`btn sec ${classId === c.id ? 'active' : ''}`}
                onClick={() => setClassId(c.id)}>{c.namn}</button>
            ))}
          </>)}
        </div>
      </div>

      {!arDatakalla && ( /* Del 14: ämnesöversikt för lokala planeringar */
        <div className="yr-dates">
          {amnesPlaneringar.map((p) => {
            const poster = byggExternaPoster(p, lib.subject.läsår);
            const bok = bocker.find((b: LokalBok) => b.bok.titel === p.bokTitel);
            const forsta = poster[0];
            const sista = poster[poster.length - 1];
            return (
              <div key={p.id} className="yr-datecol">
                <h4 style={{ background: p.farg }}>{p.amne} · {p.klassNamn}</h4>
                <div className="yr-keyrow"><span>Bok</span><b>{p.bokTitel}</b></div>
                <div className="yr-keyrow"><span>Pass/vecka</span><b>{p.schema.length}</b></div>
                <div className="yr-keyrow"><span>Pass under läsåret</span><b>{poster.length}</b></div>
                {forsta && <div className="yr-keyrow"><span>Första pass</span><b>v.{forsta.week} · {svDateLabel(forsta.date)}</b></div>}
                {sista && <div className="yr-keyrow"><span>Sista pass</span><b>v.{sista.week} · {svDateLabel(sista.date)}</b></div>}
                {bok && (<>
                  <div className="yr-keyrow"><span>Kapitel i boken</span><b>{Object.keys(bok.bok.kapitelMeta).length}</b></div>
                  <div className="yr-keyrow"><span>Lektioner i boken</span><b>{raknaLektioner(bok.lektioner)}</b></div>
                </>)}
                {!bok && <p className="muted">Ingen matchande bok i biblioteket — importera boken för kapitel och lektioner.</p>}
              </div>
            );
          })}
          {amnesPlaneringar.length === 0 && <p className="muted">Inga planeringar för ämnet ännu.</p>}
        </div>
      )}

      {arDatakalla && warnings.length > 0 && ( /* FR-YR-007 */
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

      {arDatakalla && <div className="yr-grid">{/* FR-YR-001 */}
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
                <button onClick={() => onGoTo(kap, 'begrepp')}>💡 {countBegrepp(kap)} begrepp</button>
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
      </div>}

      <h3 className="yr-h">Viktiga datum{arDatakalla ? ' — repetition, diagnoser och prov' : ''}</h3>{/* FR-YR-008 + del 14 */}
      <div className="yr-dates">
        <div className="yr-datecol">{/* Del 14: betygssättning som egen rubrik, alla ämnen */}
          <h4 style={{ background: '#7f1d1d' }}>🎓 Betygssättning</h4>
          {betygsdatum.map((b) => (
            <div key={b.id} className="yr-keyrow exam">
              <span>{b.label}</span>
              <b>v.{isoWeek(new Date(b.datum + 'T00:00:00Z'))} · {svDateLabel(b.datum)}</b>
            </div>
          ))}
          {betygsdatum.length === 0 && (
            <p className="muted">Inga betygssättningsdatum ännu — lägg till under kugghjulet → Viktiga datum.</p>
          )}
        </div>
        {arDatakalla && chapters.map((kap) => (
          <div key={kap} className="yr-datecol">
            <h4 style={{ background: KAP_COLORS[kap] ?? '#555' }}>Kap {kap} – {lib.subject.kapitelMeta[String(kap)].name}</h4>
            {keys.filter((k) => k.kapitel === kap).map(keyRow)}
            {keys.filter((k) => k.kapitel === kap).length === 0 && <p className="muted">Inga nyckeldatum.</p>}
          </div>
        ))}
      </div>

      <AmnesreglerSektion amne={aktivtAmne} onChange={() => bump((t) => t + 1)} />

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


// ── Del 14: lektionsregler per ämne (gemensam grund + anpassning) ──
function AmnesreglerSektion(props: { amne: string; onChange: () => void }) {
  const { amne, onChange } = props;
  const [edit, setEdit] = useState<Lektionsregel[] | null>(null);
  const { regler, anpassade } = reglerForAmne(getAmnesregler(), amne);

  const spara = () => {
    if (edit === null) return;
    setAmnesregler(amne, normaliseraRegler(edit));
    setEdit(null); onChange();
  };
  const aterstall = () => {
    if (!window.confirm(`Återgå till de gemensamma reglerna för ${amne}?`)) return;
    setAmnesregler(amne, null); setEdit(null); onChange();
  };

  return (
    <>
      <h3 className="yr-h">Lektionsregler — {amne}{anpassade ? ' (anpassade)' : ' (gemensam grund)'}
        {' '}
        {edit === null
          ? <button className="icon-btn" title="Anpassa reglerna för ämnet"
              onClick={() => setEdit(regler.map((r) => ({ ...r })))}>✎</button>
          : null}
      </h3>{/* FR-YR-010 + del 14 */}
      {edit === null ? (
        <div className="yr-rules">
          {regler.map((r, i) => (
            <div key={i} className="card">
              <div className="title">{r.rubrik}</div>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="yr-rules">
          {edit.map((r, i) => (
            <div key={i} className="card">
              <input value={r.rubrik} placeholder="Rubrik"
                onChange={(e) => setEdit(edit.map((x, xi) => (xi === i ? { ...x, rubrik: e.target.value } : x)))} />
              <textarea rows={4} value={r.text} placeholder="Regeltext"
                onChange={(e) => setEdit(edit.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))} />
              <button className="icon-btn" title="Ta bort regel"
                onClick={() => setEdit(edit.filter((_, xi) => xi !== i))}>🗑</button>
            </div>
          ))}
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn sec" onClick={() => setEdit([...edit, { rubrik: '', text: '' }])}>➕ Lägg till regel</button>
            <button className="btn sec" onClick={() => setEdit(null)}>Avbryt</button>
            {anpassade && <button className="btn warn" onClick={aterstall}>↺ Återgå till gemensamma</button>}
            <button className="btn" onClick={spara}>Spara för {amne}</button>
          </div>
        </div>
      )}
    </>
  );
}
