/**
 * Fullständig kalender (B14–B22-paritet med HTML-prototypen):
 * Läsår · Termin · Månad · Vecka — tidsaxel 07–17, helger på/av, Idag,
 * lovbanner, drag & drop med flytta-modal, inställd/flyttad-markeringar.
 */
import { useMemo, useState, type DragEvent } from 'react';
import {
  KAP_COLORS, isoWeek, type LessonOverride, type LessonRecord,
  type PlacedLesson, type SubjectFile,
} from '@planner/core';
import { setCalOverride } from '../state/store.js';

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
}

export default function Kalender({ subject, placedByClass, onChanged }: KalenderProps) {
  const [mode, setMode] = useState<CalMode>('vecka');
  const [classId, setClassId] = useState(Object.keys(placedByClass)[0] ?? '8B');
  const [anchor, setAnchor] = useState(() => new Date());
  const [weekends, setWeekends] = useState(false);
  const [moveModal, setMoveModal] = useState<{ globalIdx: number; date: string; start: string; end: string } | null>(null);

  const placed = placedByClass[classId] ?? [];
  const byDate = useMemo(() => {
    const m = new Map<string, Placed[]>();
    for (const p of placed) if (p.slot) {
      const arr = m.get(p.slot.date) ?? [];
      arr.push(p); m.set(p.slot.date, arr);
    }
    return m;
  }, [placed]);

  const startYear = subject.läsår.startdatum[0];
  const nav = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (mode === 'vecka') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const onDropDay = (e: DragEvent, dateIso: string) => {
    e.preventDefault();
    const gi = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(gi)) return;
    const target = placed.find((p) => p.globalIdx === gi);
    if (!target || target.slot?.date === dateIso) return;
    // Föreslå tid från klassens ordinarie pass den veckodagen
    const d = new Date(dateIso + 'T00:00:00Z');
    const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const pass = (subject.schema[classId] ?? []).find((p) => p.day === weekday);
    setMoveModal({ globalIdx: gi, date: dateIso, start: pass?.start ?? '08:00', end: pass?.end ?? '09:00' });
  };

  const chip = (p: Placed, withTime = true) => (
    <div key={p.globalIdx} draggable className={`cal-chip ${p.override ? 'ov' : ''}`}
      style={{ borderLeft: `4px solid ${KAP_COLORS[p.kapitel] ?? '#888'}` }}
      title={`Kap ${p.kapitel} · ${p.lesson.avsnitt}${p.override ? ` (${p.override.type}: ${p.override.reason})` : ''}`}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.globalIdx))}>
      {withTime && <small>{p.slot!.start}</small>} {p.kapitel}.{p.lesson.id} {p.lesson.avsnitt.replace(/^\d+\.\d+\s*/, '').slice(0, 20)}
      {p.override?.type === 'moved' && ' 📍'}
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
                    <div key={p.globalIdx} draggable className="cal-block"
                      style={{ top, height: h, background: KAP_COLORS[p.kapitel] ?? '#555' }}
                      title={`${p.lesson.avsnitt} · ${p.slot!.start}–${p.slot!.end}`}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.globalIdx))}>
                      <b>{p.kapitel}.{p.lesson.id}</b> {p.lesson.avsnitt.replace(/^\d+\.\d+\s*/, '')}
                      <small>{p.slot!.start}–{p.slot!.end}{p.override?.type === 'moved' ? ' 📍' : ''}</small>
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
                    {(byDate.get(di) ?? []).map((p) => chip(p))}
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
              <div className="cal-minigrid">
                {cells.map((d) => {
                  const di = iso(d);
                  const n = (byDate.get(di) ?? []).length;
                  const lov = !!breakLabelFor(di, subject);
                  return (
                    <span key={di}
                      className={`mini-d ${d.getUTCMonth() !== ms.getUTCMonth() ? 'dim' : ''} ${lov ? 'lov' : ''} ${n ? 'has' : ''}`}
                      style={n ? { background: KAP_COLORS[(byDate.get(di) ?? [])[0].kapitel] } : undefined}>
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
    const ov: LessonOverride = shift
      ? { type: 'shifted', reason: 'Flyttad via kalendern' }
      : { type: 'moved', reason: 'Flyttad via kalendern', targetDate: moveModal.date, targetStart: moveModal.start, targetEnd: moveModal.end };
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
          {Object.keys(placedByClass).map((c) => (
            <button key={c} className={`btn sec ${classId === c ? 'active' : ''}`} onClick={() => setClassId(c)}>{c}</button>
          ))}
          <span className="sep" />
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

      {mode === 'vecka' && week()}
      {mode === 'månad' && month()}
      {mode === 'termin' && term()}
      {mode === 'läsår' && year()}

      <p className="note">Dra en lektion till en annan dag för att flytta den. 📍 = fäst på datum. Ställ in/återställ lektioner gör du på lektionskortet.</p>

      {moveModal && (
        <div className="overlay" role="dialog">
          <div className="modal">
            <h3>Flytta lektion till {moveModal.date}?</h3>
            <p>Tid: {moveModal.start}–{moveModal.end}</p>
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => confirmMove(false)}>📍 Fäst på detta datum</button>
              <button className="btn sec" onClick={() => confirmMove(true)}>⏭ Skjut till nästa ordinarie pass</button>
              <button className="btn sec" onClick={() => setMoveModal(null)}>Avbryt</button>
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
