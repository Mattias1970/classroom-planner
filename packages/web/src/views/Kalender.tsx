/**
 * Fullständig kalender (B14–B22-paritet med HTML-prototypen):
 * Läsår · Termin · Månad · Vecka — tidsaxel 07–17, helger på/av, Idag,
 * lovbanner, drag & drop med flytta-modal, inställd/flyttad-markeringar.
 */
import { useMemo, useState, type DragEvent } from 'react';
import {
  KAP_COLORS, byggExternaPoster, fargForKlass, isoWeek, unikaAmnen,
  type ExternPost, type LessonOverride, type LessonRecord,
  type LokalPlanering, type PlacedLesson, type SubjectFile,
} from '@planner/core';
import { getBetygsdatum, setCalOverride } from '../state/store.js';

const DAY_START = 7, DAY_END = 17;
const DAY_NAMES = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
type CalMode = 'vecka' | 'månad' | 'termin' | 'läsår';

type Placed = PlacedLesson<LessonRecord>;

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function startOfWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
  return addDays(x, 1 - dow);
}
function toMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

function breakLabelFor(dateIso: string, subject: SubjectFile): string | null {
  for (const p of subject.läsår.lov) {
    const s = iso(new Date(Date.UTC(p.start[0], p.start[1], p.start[2])));
    const e = iso(new Date(Date.UTC(p.end[0], p.end[1], p.end[2])));
    if (dateIso >= s && dateIso <= e) return p.label;
  }
  return null;
}

export interface KalenderProps {
  subject: SubjectFile;
  placedByClass: Record<string, Placed[]>;
  onChanged: () => void;
  /** FR-CAL-009: öppna lektionskortet i planeringen. */
  onOpenLesson: (kapitel: number, globalIdx: number) => void;
  /** Del 13: lokala planeringar (andra ämnen) som visas bredvid datakällans. */
  planeringar: LokalPlanering[];
  onTaBortPlanering: (id: string) => void;
}

export const ALLA = '__alla__';
type PlacedX = Placed & { cid: string };

/** FR-CAL-005: händelsetypernas färger — paritet med prototypens CAL_COLORS. */
const TYPE_COLORS: Record<string, string> = {
  regular: '#3b82f6', test: '#eab308', repetition: '#a855f7', review: '#a855f7',
  ovaformagor: '#f97316', exam: '#dc2626',
};
const TYPE_LABELS: Array<[string, string]> = [
  ['regular', 'Lektion'], ['test', 'Diagnos'], ['repetition', 'Repetition'],
  ['ovaformagor', 'Öva förmågor'], ['exam', 'PROV'],
];

export default function Kalender({ subject, placedByClass, onChanged, onOpenLesson, planeringar, onTaBortPlanering }: KalenderProps) {
  const [mode, setMode] = useState<CalMode>('vecka');
  const [classId, setClassId] = useState<string>(Object.keys(placedByClass)[0] ?? '8B');
  const [amneFilter, setAmneFilter] = useState<string>(ALLA);
  const enKlass = classId !== ALLA && Object.keys(placedByClass).includes(classId);
  const [anchor, setAnchor] = useState(() => new Date());
  const [weekends, setWeekends] = useState(false);
  const [moveModal, setMoveModal] = useState<{ globalIdx: number; date: string; start: string; end: string; reason: string } | null>(null);
  const [editModal, setEditModal] = useState<{ p: Placed; reason: string; choice: 'remove' | 'shift' | 'restore' | null } | null>(null); // FR-CAL-011/012/015 (fig 5)

  const placed = enKlass ? (placedByClass[classId] ?? []) : [];
  const datakallaSynlig = amneFilter === ALLA || amneFilter === subject.meta.ämne;
  const byDate = useMemo(() => {
    const m = new Map<string, PlacedX[]>();
    if (!datakallaSynlig) return m;
    const kallor: Array<[string, Placed[]]> = classId === ALLA
      ? Object.entries(placedByClass)
      : enKlass ? [[classId, placedByClass[classId] ?? []]] : [];
    for (const [cid, list] of kallor) for (const p of list) if (p.slot) {
      const arr = m.get(p.slot.date) ?? [];
      arr.push({ ...p, cid }); m.set(p.slot.date, arr);
    }
    return m;
  }, [placedByClass, classId, enKlass, datakallaSynlig]);
  // Del 13: lokala planeringars poster (skrivskyddade), filtrerade på klass + ämne
  const externByDate = useMemo(() => {
    const m = new Map<string, ExternPost[]>();
    for (const pl of planeringar) {
      if (classId !== ALLA && pl.klassNamn !== classId) continue;
      if (amneFilter !== ALLA && pl.amne !== amneFilter) continue;
      for (const post of byggExternaPoster(pl, subject.läsår)) {
        const arr = m.get(post.date) ?? [];
        arr.push(post); m.set(post.date, arr);
      }
    }
    return m;
  }, [planeringar, classId, amneFilter, subject]);
  const klassVal = useMemo(() => {
    const ids = new Set(Object.keys(placedByClass));
    for (const pl of planeringar) ids.add(pl.klassNamn);
    return [...ids].sort((a, b) => a.localeCompare(b, 'sv'));
  }, [placedByClass, planeringar]);
  const amnesVal = unikaAmnen([subject.meta.ämne, ...planeringar.map((pl) => pl.amne)]);
  // Del 15: betygssättningsdatum syns i kalendern oavsett klass- och ämnesfilter
  const betygsByDate = useMemo(() => {
    const m = new Map<string, { id: string; label: string }[]>();
    for (const b of getBetygsdatum()) {
      const arr = m.get(b.datum) ?? [];
      arr.push({ id: b.id, label: b.label }); m.set(b.datum, arr);
    }
    return m;
  }, []);

  const startYear = subject.läsår.startdatum[0];
  const nav = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (mode === 'vecka') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const onDropDay = (e: DragEvent, dateIso: string) => {
    e.preventDefault();
    if (!enKlass) return; // flytt kräver en vald klass
    const gi = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(gi)) return;
    const target = placed.find((p) => p.globalIdx === gi);
    if (!target || target.slot?.date === dateIso) return;
    // Föreslå tid från klassens ordinarie pass den veckodagen
    const d = new Date(dateIso + 'T00:00:00Z');
    const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const pass = (subject.schema[classId] ?? []).find((p) => p.day === weekday);
    setMoveModal({ globalIdx: gi, date: dateIso, start: pass?.start ?? '08:00', end: pass?.end ?? '09:00', reason: '' });
  };

  const chip = (p: PlacedX, withTime = true) => (
    <div key={`${p.cid}-${p.globalIdx}`} draggable={enKlass} className={`cal-chip ${p.override ? 'ov' : ''}`}
      style={{ borderLeft: `4px solid ${KAP_COLORS[p.kapitel] ?? '#888'}` }}
      title={`${subject.meta.ämne} ${p.cid} · Kap ${p.kapitel} · ${p.lesson.avsnitt}${p.override ? ` (${p.override.type}: ${p.override.reason})` : ''} — klicka för att öppna`}
      onClick={() => onOpenLesson(p.kapitel, p.globalIdx)}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.globalIdx))}>
      <span className="tdot" style={{ background: TYPE_COLORS[p.lesson.type] ?? '#3b82f6' }} />
      {classId === ALLA && <b style={{ color: fargForKlass(p.cid) }}>{p.cid}</b>} {withTime && <small>{p.slot!.start}</small>} {p.kapitel}.{p.lesson.id} {p.lesson.avsnitt.replace(/^\d+\.\d+\s*/, '').slice(0, 20)}
      {p.override?.type === 'moved' && ' 📍'}
      {enKlass && <button className="chip-x" title="Ändra lektion (ställ in / flytta / återställ)"
        onClick={(e) => { e.stopPropagation(); setEditModal({ p, reason: p.override?.reason ?? '', choice: null }); }}>×</button>}
    </div>
  );
  const externChip = (post: ExternPost, withTime = true) => (
    <div key={`x-${post.planeringId}-${post.date}-${post.start}`} className="cal-chip"
      style={{ borderLeft: `4px solid ${post.farg}` }}
      title={`${post.amne} ${post.klassNamn} · ${post.bokTitel} · ${post.start}–${post.end}`}>
      <span className="tdot" style={{ background: post.farg }} />
      {withTime && <small>{post.start}</small>} {post.amne} {post.klassNamn}
    </div>
  );

  // ── Vecka: tidsaxel + positionerade block ───────────────────
  const week = () => {
    const ws = startOfWeek(anchor);
    const days = (weekends ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]).map((i) => addDays(ws, i));
    const lov = breakLabelFor(iso(days[0]), subject);
    const H = 46; // px per timme
    return (
      <>
        <h3 className="cal-sub">Vecka {isoWeek(ws)} · {ws.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}</h3>
        {lov && <div className="cal-break">🏖 {lov} — inga lektioner schemaläggs</div>}
        <div className="cal-timegrid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div key={iso(d)} className={`cal-dayhead ${iso(d) === iso(new Date()) ? 'today' : ''}`}>
              {DAY_NAMES[(d.getUTCDay() + 6) % 7]} {d.getUTCDate()}/{d.getUTCMonth() + 1}
            </div>
          ))}
          <div className="cal-hours">
            {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
              <div key={i} style={{ height: H }}>{String(DAY_START + i).padStart(2, '0')}:00</div>
            ))}
          </div>
          {days.map((d) => {
            const di = iso(d);
            const dayLov = breakLabelFor(di, subject);
            return (
              <div key={di} className={`cal-daycol ${dayLov ? 'lov' : ''}`}
                style={{ height: (DAY_END - DAY_START) * H }}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropDay(e, di)}>
                {(byDate.get(di) ?? []).map((p) => {
                  const top = ((toMin(p.slot!.start) - DAY_START * 60) / 60) * H;
                  const h = Math.max(22, ((toMin(p.slot!.end) - toMin(p.slot!.start)) / 60) * H);
                  return (
                    <div key={`${p.cid}-${p.globalIdx}`} draggable={enKlass} className="cal-block"
                      style={{ top, height: h, background: KAP_COLORS[p.kapitel] ?? '#555' }}
                      title={`${subject.meta.ämne} ${p.cid} · ${p.lesson.avsnitt} · ${p.slot!.start}–${p.slot!.end} — klicka för att öppna`}
                      onClick={() => onOpenLesson(p.kapitel, p.globalIdx)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.globalIdx))}>
                      <span className="tdot" style={{ background: TYPE_COLORS[p.lesson.type] ?? '#3b82f6' }} />
                      <b>{classId === ALLA && <span style={{ color: fargForKlass(p.cid), filter: 'brightness(1.8)' }}>{p.cid} · </span>}{p.kapitel}.{p.lesson.id}</b> {p.lesson.avsnitt.replace(/^\d+\.\d+\s*/, '')}
                      <small>{p.slot!.start}–{p.slot!.end}{p.override?.type === 'moved' ? ' 📍' : ''}</small>
                      {enKlass && <button className="chip-x" title="Ändra lektion"
                        onClick={(e) => { e.stopPropagation(); setEditModal({ p, reason: p.override?.reason ?? '', choice: null }); }}>×</button>}
                    </div>
                  );
                })}
                {(betygsByDate.get(di) ?? []).map((b) => (
                  <div key={b.id} className="cal-block" style={{ top: 0, height: 20, background: '#7f1d1d', zIndex: 2 }}
                    title={`${b.label} · ${di}`}>
                    <b>🎓 {b.label}</b>
                  </div>
                ))}
                {(externByDate.get(di) ?? []).map((post) => {
                  const top = ((toMin(post.start) - DAY_START * 60) / 60) * H;
                  const h = Math.max(22, ((toMin(post.end) - toMin(post.start)) / 60) * H);
                  return (
                    <div key={`x-${post.planeringId}-${post.start}`} className="cal-block"
                      style={{ top, height: h, background: post.farg, opacity: 0.92 }}
                      title={`${post.amne} ${post.klassNamn} · ${post.bokTitel} · ${post.start}–${post.end}`}>
                      <b>{post.amne}</b> {post.klassNamn}
                      <small>{post.start}–{post.end}</small>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  // ── Månad ───────────────────────────────────────────────────
  const month = () => {
    const first = new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1));
    const start = startOfWeek(first);
    const weeks: Date[][] = [];
    let cur = start;
    while (cur.getUTCMonth() === first.getUTCMonth() || weeks.length === 0 || cur.getUTCDay() !== 1) {
      if (cur.getUTCDay() === 1) weeks.push([]);
      weeks[weeks.length - 1].push(cur);
      cur = addDays(cur, 1);
      if (weeks.length > 6 && cur.getUTCDay() === 1) break;
      if (cur.getUTCMonth() !== first.getUTCMonth() && cur.getUTCDay() === 1 && weeks.length >= 4) break;
    }
    const cols = weekends ? 7 : 5;
    return (
      <>
        <h3 className="cal-sub">{first.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}</h3>
        <div className="cal-month" style={{ gridTemplateColumns: `34px repeat(${cols}, 1fr)` }}>
          <div />
          {DAY_NAMES.slice(0, cols).map((n) => <div key={n} className="cal-dayhead">{n}</div>)}
          {weeks.map((days) => (
            <FragmentRow key={iso(days[0])} weekNo={isoWeek(days[0])}>
              {days.slice(0, cols).map((d) => {
                const di = iso(d);
                const lov = breakLabelFor(di, subject);
                const inMonth = d.getUTCMonth() === first.getUTCMonth();
                return (
                  <div key={di}
                    className={`cal-cell ${inMonth ? '' : 'dim'} ${lov ? 'lov' : ''} ${di === iso(new Date()) ? 'today' : ''}`}
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropDay(e, di)}>
                    <span className="d">{d.getUTCDate()}</span>
                    {lov && <span className="lovlabel">{lov.split(' ')[0]}</span>}
                    {(betygsByDate.get(di) ?? []).map((b) => (
                      <div key={b.id} className="cal-chip" style={{ borderLeft: '4px solid #7f1d1d' }} title={b.label}>
                        <span className="tdot" style={{ background: '#7f1d1d' }} />🎓 {b.label}
                      </div>
                    ))}
                    {(byDate.get(di) ?? []).map((p) => chip(p))}
                    {(externByDate.get(di) ?? []).map((post) => externChip(post))}
                  </div>
                );
              })}
            </FragmentRow>
          ))}
        </div>
      </>
    );
  };

  // ── Termin: mini-månader, klick → månad ─────────────────────
  const term = () => {
    const months: Date[] = [];
    for (let m = 7; m <= 11; m++) months.push(new Date(Date.UTC(startYear, m, 1)));
    for (let m = 0; m <= 5; m++) months.push(new Date(Date.UTC(startYear + 1, m, 1)));
    return (
      <div className="cal-term">
        {months.map((ms) => {
          const cells: Date[] = [];
          let c = startOfWeek(ms);
          while (c.getUTCMonth() === ms.getUTCMonth() || cells.length === 0 || cells.length % 7 !== 0) {
            cells.push(c); c = addDays(c, 1);
            if (cells.length > 42) break;
          }
          return (
            <div key={iso(ms)} className="cal-mini"
              onClick={() => { setAnchor(new Date(ms.getUTCFullYear(), ms.getUTCMonth(), 1)); setMode('månad'); }}>
              <h4>{ms.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}</h4>
              <div className="cal-minigrid" style={{ gridTemplateColumns: `repeat(${weekends ? 7 : 5}, 1fr)` }}>
                {cells.filter((d) => weekends || ((d.getUTCDay() + 6) % 7) < 5).map((d) => {
                  const di = iso(d);
                  const egna = byDate.get(di) ?? [];
                  const externa = externByDate.get(di) ?? [];
                  const betyg = betygsByDate.get(di) ?? [];
                  const n = egna.length + externa.length + betyg.length;
                  const lov = !!breakLabelFor(di, subject);
                  return (
                    <span key={di}
                      className={`mini-d ${d.getUTCMonth() !== ms.getUTCMonth() ? 'dim' : ''} ${lov ? 'lov' : ''} ${n ? 'has' : ''}`}
                      style={n ? { background: betyg.length > 0 ? '#7f1d1d' : egna[0] ? KAP_COLORS[egna[0].kapitel] : externa[0]?.farg } : undefined}>
                      {d.getUTCDate()}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Läsår: kapitelöversikt med nyckeldatum ──────────────────
  const year = () => {
    const perKap = new Map<number, Placed[]>();
    for (const p of placed) {
      const arr = perKap.get(p.kapitel) ?? []; arr.push(p); perKap.set(p.kapitel, arr);
    }
    return (
      <div className="cal-year">
        {[...perKap.entries()].map(([kap, items]) => {
          const meta = subject.kapitelMeta[String(kap)];
          const first = items.find((p) => p.slot)?.slot;
          const last = [...items].reverse().find((p) => p.slot)?.slot;
          const key = items.filter((p) => p.lesson.type === 'test' || p.lesson.type === 'exam');
          return (
            <div key={kap} className="cal-kap" style={{ borderTop: `4px solid ${KAP_COLORS[kap]}` }}>
              <h4>Kap {kap} — {meta?.name ?? ''}</h4>
              <p className="muted">{items.length} lektioner · v.{first?.week}–v.{last?.week} · {meta?.term}</p>
              {key.map((p) => (
                <div key={p.globalIdx} className={`cal-keydate ${p.lesson.type}`}>
                  {p.lesson.type === 'exam' ? '📝 PROV' : '✓ ' + p.lesson.avsnitt}
                  <b>{p.slot ? `${p.slot.date} (v.${p.slot.week})` : 'inställd'}</b>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const confirmMove = (shift: boolean) => {
    if (!moveModal) return;
    const reason = moveModal.reason.trim() || 'Flyttad via kalendern';
    const ov: LessonOverride = shift
      ? { type: 'shifted', reason }
      : { type: 'moved', reason, targetDate: moveModal.date, targetStart: moveModal.start, targetEnd: moveModal.end };
    setCalOverride(classId, moveModal.globalIdx, ov);
    setMoveModal(null); onChanged();
  };

  return (
    <main className="main wide">
      <div className="head-row">
        <h2>Kalender</h2>
        <div className="cal-controls">
          {(['läsår', 'termin', 'månad', 'vecka'] as CalMode[]).map((m) => (
            <button key={m} className={`btn sec ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
          ))}
          <span className="sep" />
          <button className={`btn sec ${classId === ALLA ? 'active' : ''}`} onClick={() => setClassId(ALLA)}>Alla klasser</button>
          {klassVal.map((c) => (
            <button key={c} className={`btn sec ${classId === c ? 'active' : ''}`}
              style={{ color: fargForKlass(c), fontWeight: 600 }} onClick={() => setClassId(c)}>{c}</button>
          ))}
          <span className="sep" />
          {amnesVal.length > 1 && (<>
            <button className={`btn sec ${amneFilter === ALLA ? 'active' : ''}`} onClick={() => setAmneFilter(ALLA)}>Alla ämnen</button>
            {amnesVal.map((a) => (
              <button key={a} className={`btn sec ${amneFilter === a ? 'active' : ''}`} onClick={() => setAmneFilter(amneFilter === a ? ALLA : a)}>{a}</button>
            ))}
            <span className="sep" />
          </>)}
          {(mode === 'vecka' || mode === 'månad') && (<>
            <button className="btn sec" onClick={() => nav(-1)}>←</button>
            <button className="btn sec" onClick={() => setAnchor(new Date())}>Idag</button>
            <button className="btn sec" onClick={() => nav(1)}>→</button>
          </>)}
          {(mode === 'vecka' || mode === 'månad' || mode === 'termin') && (
            <button className={`btn sec ${weekends ? 'active' : ''}`} onClick={() => setWeekends(!weekends)}>Helger</button>
          )}
        </div>
      </div>

      {(planeringar.length > 0 || classId === ALLA) && (
        <div className="cal-legend">{/* Del 13: planeringar i kalendern */}
          <span className="muted">Planeringar:</span>
          <span className="leg"><span className="tdot" style={{ background: '#3b82f6' }} /> {subject.meta.ämne} · {Object.keys(placedByClass).map((c, i) => (
            <b key={c} style={{ color: fargForKlass(c) }}>{i > 0 ? ' & ' : ''}{c}</b>
          ))} (datakälla)</span>
          {planeringar.map((pl) => (
            <span key={pl.id} className="leg">
              <span className="tdot" style={{ background: pl.farg }} /> {pl.amne} · {pl.klassNamn} ({pl.bokTitel})
              <button className="chip-x" title="Ta bort planeringen ur kalendern"
                onClick={() => { if (window.confirm(`Ta bort ${pl.amne} · ${pl.klassNamn} ur kalendern?`)) onTaBortPlanering(pl.id); }}>×</button>
            </span>
          ))}
          {!enKlass && <span className="muted">— flytt och inställning av lektioner kräver att en klass är vald</span>}
        </div>
      )}
      <div className="cal-legend">{/* FR-CAL-005 */}
        {TYPE_LABELS.map(([t, label]) => (
          <span key={t}><i className="tdot" style={{ background: TYPE_COLORS[t] }} />{label}</span>
        ))}
        <span className="sep" />
        {Object.keys(subject.kapitelMeta).map(Number).sort((a, b) => a - b).map((k) => (
          <span key={k}><i className="kdot" style={{ background: KAP_COLORS[k] ?? '#555' }} />Kap {k}</span>
        ))}
      </div>

      {mode === 'vecka' && week()}
      {mode === 'månad' && month()}
      {mode === 'termin' && term()}
      {mode === 'läsår' && year()}

      <p className="note">Dra en lektion till en annan dag för att flytta den. 📍 = fäst på datum. Ställ in/återställ lektioner gör du på lektionskortet.</p>

      {moveModal && (
        <div className="overlay" role="dialog">
          <div className="modal">
            <h3>Flytta lektion till {moveModal.date}?</h3>
            <div className="pair">{/* FR-CAL-013: redigerbar tid */}
              <label>Start <input type="time" value={moveModal.start}
                onChange={(e) => setMoveModal({ ...moveModal, start: e.target.value })} /></label>
              <label>Slut <input type="time" value={moveModal.end}
                onChange={(e) => setMoveModal({ ...moveModal, end: e.target.value })} /></label>
            </div>
            <label>Anledning (valfritt)</label>{/* FR-CAL-014 */}
            <input placeholder="t.ex. Studiedag, NP, friluftsdag…" value={moveModal.reason}
              onChange={(e) => setMoveModal({ ...moveModal, reason: e.target.value })} />
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => confirmMove(false)}>📍 Fäst på detta datum</button>
              <button className="btn sec" onClick={() => confirmMove(true)}>⏭ Skjut till nästa ordinarie pass</button>
              <button className="btn sec" onClick={() => setMoveModal(null)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
      {editModal && ( /* Fig 5: välj åtgärd + anledning + Bekräfta */
        <div className="overlay" role="dialog" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>⛔ Ändra lektion</h3>
            <p className="muted">Välj vad du vill göra med "Kap {editModal.p.kapitel} L{editModal.p.globalIdx + 1}: {editModal.p.lesson.avsnitt}"
              {editModal.p.override && <> · nuvarande: {editModal.p.override.type} ({editModal.p.override.reason})</>}:</p>
            <div className="ins-modes edit-choices">
              <button className={`ins-mode ${editModal.choice === 'remove' ? 'sel' : ''}`}
                onClick={() => setEditModal({ ...editModal, choice: 'remove' })}>
                <b>🗑 Ta bort lektion</b>
                <span>Lektionen tas bort. Alla efterföljande lektioner kliver ett steg framåt.</span>
              </button>
              <button className={`ins-mode ${editModal.choice === 'shift' ? 'sel' : ''}`}
                onClick={() => setEditModal({ ...editModal, choice: 'shift' })}>
                <b>⏭ Flytta till nästa tillfälle</b>
                <span>Lektionen hoppas över nu och läggs på nästa ordinarie lektionstillfälle. Alla efterföljande följer med.</span>
              </button>
              {editModal.p.override && (
                <button className={`ins-mode ${editModal.choice === 'restore' ? 'sel' : ''}`}
                  onClick={() => setEditModal({ ...editModal, choice: 'restore' })}>
                  <b>↩ Återställ till ordinarie</b>
                  <span>Tar bort ändringen och lägger tillbaka lektionen på sin ordinarie plats.</span>
                </button>
              )}{/* FR-CAL-015 */}
            </div>
            <label>Anteckning / anledning:</label>{/* FR-CAL-014 */}
            <textarea rows={3} placeholder="T.ex. Studiedag, sjukdom, schemabrytning, friluftsliv…"
              value={editModal.reason} onChange={(e) => setEditModal({ ...editModal, reason: e.target.value })} />
            <div className="modal-actions">
              <button className="btn sec" onClick={() => setEditModal(null)}>Avbryt</button>
              <button className="btn" disabled={editModal.choice === null} onClick={() => {
                const reason = editModal.reason.trim();
                if (editModal.choice === 'restore') setCalOverride(classId, editModal.p.globalIdx, null);
                else if (editModal.choice === 'shift') setCalOverride(classId, editModal.p.globalIdx, { type: 'shifted', reason: reason || 'Flyttad till nästa tillfälle' });
                else setCalOverride(classId, editModal.p.globalIdx, { type: 'cancelled', reason: reason || 'Utgår' });
                setEditModal(null); onChanged();
              }}>Bekräfta</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function FragmentRow({ weekNo, children }: { weekNo: number; children: React.ReactNode }) {
  return (<><div className="cal-wk">v{weekNo}</div>{children}</>);
}
