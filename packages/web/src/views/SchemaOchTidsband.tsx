/**
 * Schemapanel (FR-SCH-001…006) + Tidsband (FR-TB-001…006).
 * Schemapanelen redigerar startdatum, veckodag (fritext sv/eng) och tider
 * per klass — persistent i localStorage, applicerat via applySchemaEdits.
 * Tidsbandet visar vald lektions vecka vertikalt med klickbara lektionsslots.
 */
import { useMemo, useState } from 'react';
import {
  isValidPass, parseIcsEvents, parseWeekday, suggestSchedulePasses, svDateLabel,
  type LessonRecord, type PlacedLesson, type SchedulePass, type SubjectFile, type YmdTuple,
} from '@planner/core';
import { getSchemaEdits, saveSchemaEdits } from '../state/store.js';

const DAY_SHORT = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
const DAY_LONG = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];

// ── Schemapanel ───────────────────────────────────────────────
export function SchedulePanel(props: { subject: SubjectFile; onChange: () => void }) {
  const { subject, onChange } = props;
  const [open, setOpen] = useState(false); // FR-SCH-001
  const classes = subject.meta.klasser.filter((c) => !c.arkiverad);
  const [classId, setClassId] = useState(classes[0]?.id ?? '8B');
  const [saved, setSaved] = useState(false);
  const [ical, setIcal] = useState('');
  const [icalFilter, setIcalFilter] = useState('Ma');
  const [icalMsg, setIcalMsg] = useState('');

  const applyIcs = (text: string, källa: string) => {
    const passes = suggestSchedulePasses(parseIcsEvents(text), icalFilter);
    if (passes.length === 0) {
      setIcalMsg(`✗ Inga återkommande mån–fre-pass hittades i ${källa}${icalFilter ? ` (filter: "${icalFilter}")` : ''}. Prova att ändra eller tömma titelfiltret.`);
      return;
    }
    setRows(passes.map((p) => ({ dayText: DAY_LONG[p.day], start: p.start, end: p.end })));
    setIcalMsg(`✓ ${passes.length} lektionspass hämtade från ${källa} — kontrollera raderna och klicka Spara schema.`);
  };
  const importFromUrl = async () => {
    try {
      const res = await fetch(ical);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyIcs(await res.text(), 'kalenderlänken');
    } catch {
      setIcalMsg('✗ Direkthämtning blockerades (Googles kalenderlänkar tillåter oftast inte hämtning från webbläsare). Exportera kalendern som .ics-fil och ladda upp den här i stället.');
    }
  };

  const sd = subject.läsår.startdatum;
  const [startIso, setStartIso] = useState(
    `${sd[0]}-${String(sd[1] + 1).padStart(2, '0')}-${String(sd[2]).padStart(2, '0')}`,
  );
  const [rows, setRows] = useState<Array<{ dayText: string; start: string; end: string }>>(
    () => (subject.schema[classId] ?? []).map((p) => ({ dayText: DAY_LONG[p.day], start: p.start, end: p.end })),
  );
  const pickClass = (id: string) => {
    setClassId(id);
    setRows((subject.schema[id] ?? []).map((p) => ({ dayText: DAY_LONG[p.day], start: p.start, end: p.end })));
  };

  const save = () => { // FR-SCH-002…005
    const prev = subject.schema[classId] ?? [];
    const passes: SchedulePass[] = rows.map((r, i) => {
      const parsed = parseWeekday(r.dayText); // FR-SCH-003: ogiltigt → behåll tidigare dag
      return { day: parsed ?? prev[i]?.day ?? 1, start: r.start, end: r.end };
    }).filter(isValidPass);
    const [y, m, d] = startIso.split('-').map(Number);
    const startdatum: YmdTuple = [y, m - 1, d];
    const edits = getSchemaEdits();
    saveSchemaEdits({ startdatum, schema: { ...(edits.schema ?? {}), [classId]: passes } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    onChange();
  };

  return (
    <div className="sched-panel no-print">
      <button className="sched-head" onClick={() => setOpen(!open)}>
        <span>🗓 <b>Schemavy & inställningar</b> <small className="muted">· Startdatum, lektionstider per klass</small></span>
        <span>{open ? '▲ Dölj' : '▼ Visa'}</span>
      </button>
      {open && (
        <div className="sched-body">
          <label>Startdatum (Kap 1, Lek 1):{' '}
            <input type="date" value={startIso} onChange={(e) => setStartIso(e.target.value)} /></label>
          <div className="cal-controls">
            {classes.map((c) => (
              <button key={c.id} className={`btn sec ${classId === c.id ? 'active' : ''}`}
                onClick={() => pickClass(c.id)}>{c.namn}</button>
            ))}
          </div>
          <div className="sched-grid">
            <span className="muted">DAG</span><span className="muted">TID (START – SLUT)</span>
            {rows.map((r, i) => (
              <div key={i} className="sched-row">
                <span>Lektion {i + 1}</span>
                <input value={r.dayText} placeholder="t.ex. Måndag"
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dayText: e.target.value } : x)))} />
                <input type="time" value={r.start}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <span>–</span>
                <input type="time" value={r.end}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <div className="sched-gcal">{/* FR-SCH-006 + del 6 P2: fungerande iCal-import */}
            <label>📅 Google Kalender:</label>
            <input placeholder="https://calendar.google.com/calendar/ical/…" value={ical}
              onChange={(e) => setIcal(e.target.value)} />
            <button className="btn sec" disabled={!ical.startsWith('http')} onClick={() => void importFromUrl()}>Importera från länk</button>
            <label className="btn sec file-btn">⬆ Ladda upp .ics-fil
              <input type="file" accept=".ics,text/calendar" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => applyIcs(t, 'filen')); e.target.value = ''; }} />
            </label>
            <label>Filtrera på titel:
              <input className="ical-filter" placeholder="t.ex. Ma" value={icalFilter} onChange={(e) => setIcalFilter(e.target.value)} /></label>
          </div>
          {icalMsg && <p className="status">{icalMsg}</p>}
          <p className="note">Exportera schemat från Google Kalender (Inställningar → Importera och exportera → Exportera) och ladda upp .ics-filen. Passen fylls i ovan — inget sparas förrän du klickar Spara schema.</p>
          <button className="btn" onClick={save}>{saved ? '✓ Sparat!' : 'Spara schema'}</button>
          <p className="note">Ändringarna sparas i webbläsaren och ligger ovanpå datakällan — de följer med i backupen.</p>
        </div>
      )}
    </div>
  );
}

// ── Tidsband ──────────────────────────────────────────────────
type Placed = PlacedLesson<LessonRecord>;

function mondayOf(dateIso: string): Date {
  const d = new Date(dateIso + 'T00:00:00Z');
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 1 - dow);
  return d;
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function isoWeekNo(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAJ', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];

export function TimeBand(props: {
  subject: SubjectFile; classId: string; placed: Placed[];
  selectedSlotDate: string | null;
  onOpenLesson: (kapitel: number, globalIdx: number) => void; // FR-TB-005
}) {
  const { subject, classId, placed, selectedSlotDate, onOpenLesson } = props;
  const [weekOffset, setWeekOffset] = useState(0); // FR-TB-002
  const [showDates, setShowDates] = useState(false); // FR-TB-003
  const [twoWeeks, setTwoWeeks] = useState(false); // FR-TB-004

  const byDate = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const p of placed) if (p.slot) m.set(p.slot.date, p);
    return m;
  }, [placed]);

  const anchorIso = selectedSlotDate ?? placed.find((p) => p.slot)?.slot?.date;
  if (!anchorIso) return null;
  const base = mondayOf(anchorIso);
  base.setUTCDate(base.getUTCDate() + weekOffset * 7);

  const lovLabel = (dateIso: string): string | null => {
    for (const p of subject.läsår.lov) {
      const s = iso(new Date(Date.UTC(p.start[0], p.start[1], p.start[2])));
      const e = iso(new Date(Date.UTC(p.end[0], p.end[1], p.end[2])));
      if (dateIso >= s && dateIso <= e) return p.label;
    }
    return null;
  };
  const passDays = new Set((subject.schema[classId] ?? []).map((p) => p.day));
  const passByDay = new Map((subject.schema[classId] ?? []).map((p) => [p.day, p]));

  const weekBlock = (monday: Date, dim: boolean) => {
    const wk = isoWeekNo(monday);
    const days = [1, 2, 3, 4, 5].filter((d) => passDays.has(d));
    return (
      <div key={iso(monday)} className={`tb-week ${dim ? 'dim' : ''}`}>
        <div className="tb-wkhead"><small>VECKA</small><b>{wk}</b></div>
        {days.map((wd) => {
          const d = new Date(monday); d.setUTCDate(d.getUTCDate() + wd - 1);
          const di = iso(d);
          const lov = lovLabel(di); // FR-TB-006
          const p = byDate.get(di);
          const isSel = di === selectedSlotDate;
          const pass = passByDay.get(wd);
          return (
            <button key={di}
              className={`tb-day ${lov ? 'break' : ''} ${p ? 'has' : ''} ${isSel ? 'sel' : ''}`}
              disabled={!p || !!lov}
              title={lov ?? (p ? `${p.lesson.avsnitt} — klicka för att öppna` : 'Ingen lektion')}
              onClick={() => p && onOpenLesson(p.kapitel, p.globalIdx)}>
              <small>{DAY_SHORT[wd].toUpperCase()}</small>
              <span>{showDates ? svDateLabel(di) : pass?.start ?? ''}</span>
              {lov ? <i>LOV</i> : p ? <b>L{p.globalIdx + 1}</b> : null}
            </button>
          );
        })}
      </div>
    );
  };

  const next = new Date(base); next.setUTCDate(next.getUTCDate() + 7);
  return (
    <aside className="tb no-print" aria-label="Tidsband">
      <button className="tb-btn" title="Visa/dölj datum" onClick={() => setShowDates(!showDates)}>📅</button>
      <button className={`tb-btn ${twoWeeks ? 'on' : ''}`} title="Två veckor" onClick={() => setTwoWeeks(!twoWeeks)}>2v</button>
      <button className="tb-btn" title="Föregående vecka" onClick={() => setWeekOffset(weekOffset - 1)}>▲</button>
      <div className="tb-month">{MONTH_SHORT[base.getUTCMonth()]}</div>
      {weekBlock(base, false)}
      {twoWeeks && weekBlock(next, true)}
      <button className="tb-btn" title="Nästa vecka" onClick={() => setWeekOffset(weekOffset + 1)}>▼</button>
      {weekOffset !== 0 && (
        <button className="tb-btn" title="Tillbaka till vald lektion" onClick={() => setWeekOffset(0)}>●</button>
      )}
      <div className="tb-class">{classId}</div>
    </aside>
  );
}
