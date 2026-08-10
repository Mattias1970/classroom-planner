import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  applySchemaEdits, computeTimes, defaultBamTimeline, diffMinutes, distinctEditedFields,
  generateSlots, placeLessons, summarizeEdits, weeksLabel, KAP_COLORS,
  type LessonRecord, type PlacedLesson, type ScheduledSlot, type SubjectFile,
} from '@planner/core';
import { SchedulePanel, TimeBand } from '../views/SchemaOchTidsband.js';
import Kalender from '../views/Kalender.js';
import Arsoversikt, { type InnerTab } from '../views/Arsoversikt.js';
import {
  addCustomLesson, clearField, composeChapter, demoLibrary, effectiveField, exportBackup,
  getOverrides, getSchemaEdits, getSettings, importBackup, isEdited, loadFromGithub,
  nextCustomId, removeLesson, restoreAllRemoved, saveSettings,
  setField, undo, type InsertMode, type LoadedLibrary,
  addLink, getCalOverrides, getLinks, removeLink, setCalOverride, type LessonLink,
} from '../state/store.js';
import { Docx } from './wordExport.js';
import './styles.css';

const SuperTeachPanel = lazy(() => import('../features/superteach/SuperTeachPanel.js'));
const FLAG = 'classroom-planner.superteach.enabled';

type Tab = 'arsoversikt' | 'planering' | 'kalender' | 'klasser' | 'bibliotek' | 'superteach' | 'installningar';
const TABS: Array<[Tab, string]> = [
  ['arsoversikt', 'Årsöversikt'], ['planering', 'Planering'], ['kalender', 'Kalender'],
  ['klasser', 'Klasser'], ['bibliotek', 'Bibliotek'], ['superteach', 'SuperTeach'], ['installningar', 'Inställningar'],
];

export default function App() {
  const [lib, setLib] = useState<LoadedLibrary>(demoLibrary);
  const [tab, setTab] = useState<Tab>('arsoversikt');
  const [inner, setInner] = useState<InnerTab>('lektionsplan');
  const [classId, setClassId] = useState('8B');
  const [kapitel, setKapitel] = useState(1);
  const [tick, bump] = useState(0);
  const refresh = () => bump((t) => t + 1);
  const stOn = localStorage.getItem(FLAG) === 'true';
  const [showEdits, setShowEdits] = useState(false); // FR-EDIT-008

  // FR-SCH-002…005: lokala schemaändringar appliceras ovanpå datakällan
  const libEff = useMemo<LoadedLibrary>(
    () => ({ ...lib, subject: applySchemaEdits(lib.subject, getSchemaEdits()) }),
    [lib, tick],
  );
  const editCount = useMemo(() => distinctEditedFields(getOverrides()), [tick]); // FR-EDIT-007

  const chapters = Object.keys(libEff.subject.kapitelMeta).map(Number).sort((a, b) => a - b);
  const lessons = useMemo(
    () => composeChapter(kapitel, libEff.lessons[kapitel] ?? []),
    [libEff, kapitel, tick],
  );
  const sequence = useMemo(
    () => chapters.flatMap((k) => composeChapter(k, libEff.lessons[k] ?? []).map((lesson) => ({ kapitel: k, lesson }))),
    [libEff, tick],
  );
  const placedByClass = useMemo(() => {
    const out: Record<string, PlacedLesson<LessonRecord>[]> = {};
    for (const c of libEff.subject.meta.klasser.filter((x) => !x.arkiverad)) {
      const slots = generateSlots(libEff.subject, c.id, sequence.length + 20);
      out[c.id] = placeLessons(sequence, slots, getCalOverrides(c.id));
    }
    return out;
  }, [libEff, sequence, tick]);
  // FR-YR-005/007: baslinje = samma sekvens utan kalenderöverstyrningar
  const baselineByClass = useMemo(() => {
    const out: Record<string, PlacedLesson<LessonRecord>[]> = {};
    for (const c of libEff.subject.meta.klasser.filter((x) => !x.arkiverad)) {
      const slots = generateSlots(libEff.subject, c.id, sequence.length + 20);
      out[c.id] = placeLessons(sequence, slots);
    }
    return out;
  }, [libEff, sequence, tick]);
  const goTo = (kap: number, section: InnerTab) => { setKapitel(kap); setInner(section); setTab('planering'); }; // FR-GEN-005
  const [focus, setFocus] = useState<{ idx: number; token: number } | null>(null); // FR-CAL-009
  const openLesson = (kap: number, globalIdx: number) => {
    let before = 0;
    for (const k of chapters) { if (k === kap) break; before += composeChapter(k, libEff.lessons[k] ?? []).length; }
    setKapitel(kap); setInner('lektionsplan'); setTab('planering');
    setFocus({ idx: globalIdx - before, token: Date.now() });
  };
  const placed = placedByClass[classId] ?? [];
  const slotFor = (kap: number, idx: number): ScheduledSlot | null => {
    let before = 0;
    for (const k of chapters) { if (k === kap) break; before += composeChapter(k, libEff.lessons[k] ?? []).length; }
    return placed[before + idx]?.slot ?? null;
  };
  const globalIdxFor = (kap: number, idx: number): number => {
    let before = 0;
    for (const k of chapters) { if (k === kap) break; before += composeChapter(k, libEff.lessons[k] ?? []).length; }
    return before + idx;
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">📘 Classroom Planner</span>
        {TABS.filter(([t]) => t !== 'superteach' || stOn).map(([t, label]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
        <span className="spacer" />
        <span className="stat"><b>{sequence.length}</b><small>LEKTIONER</small></span>
        <span className="stat"><b>{weeksLabel(sequence.length, (libEff.subject.schema[classId] ?? []).length)}</b><small>VECKOR</small></span>
        <span className="stat"><b>{chapters.length}</b><small>KAPITEL</small></span>
        {editCount > 0 && (
          <button className="stat edit-stat" title="Visa redigerade fält" onClick={() => setShowEdits(true)}>
            <b>{editCount}</b><small>REDIGERAT</small>
          </button>
        )}
        <span className="badge">{libEff.subject.meta.lärobok.split(',')[0]}</span>
        <span className={`src ${lib.source}`}>{lib.source === 'github' ? '● GitHub' : '○ Demo'}</span>
      </header>

      {tab === 'arsoversikt' && (
        <Arsoversikt lib={libEff} placedByClass={placedByClass} baselineByClass={baselineByClass} onGoTo={goTo} />
      )}

      {tab === 'planering' && (
        <div className="wrap">
          <nav className="side">
            <h4>Kapitel</h4>
            {chapters.map((k) => (
              <button key={k} className={`chap ${k === kapitel ? 'active' : ''}`} onClick={() => setKapitel(k)}>
                {k}. {libEff.subject.kapitelMeta[String(k)].name}
                <small>{composeChapter(k, libEff.lessons[k] ?? []).length}</small>
              </button>
            ))}
            <h4>Klass</h4>
            {libEff.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => (
              <button key={c.id} className={`chap ${c.id === classId ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{c.namn}</button>
            ))}
          </nav>
          <PlaneringView lib={libEff} kapitel={kapitel} lessons={lessons} slotFor={slotFor}
            globalIdxFor={globalIdxFor} placed={placed} classId={classId} onChange={refresh}
            inner={inner} setInner={setInner} focus={focus} onOpenLesson={openLesson} />
        </div>
      )}

      {tab === 'kalender' && <Kalender subject={libEff.subject} placedByClass={placedByClass} onChanged={refresh} onOpenLesson={openLesson} />}
      {tab === 'klasser' && <KlasserView subject={libEff.subject} />}
      {tab === 'bibliotek' && <BibliotekView lib={lib} onLoaded={(l) => { setLib(l); refresh(); }} />}
      {tab === 'superteach' && stOn && (
        <Suspense fallback={<main className="main"><p>Laddar SuperTeach…</p></main>}>
          <SuperTeachPanel
            students={['elev-8B-01', 'elev-8B-02', 'elev-8B-03', 'elev-8B-04']}
            subject={libEff.subject.meta.ämne.toLowerCase()}
          />
        </Suspense>
      )}
      {tab === 'installningar' && <InstallningarView onChange={refresh} />}

      {showEdits && ( /* FR-EDIT-008 */
        <div className="overlay" role="dialog" onClick={() => setShowEdits(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="head-row"><h3>Lokalt redigerade fält</h3>
              <button className="icon-btn" onClick={() => setShowEdits(false)}>✕</button></div>
            <table className="tbl">
              <thead><tr><th>Kapitel</th><th>Lektion</th><th>Fält</th><th>Värde</th></tr></thead>
              <tbody>
                {summarizeEdits(getOverrides()).map((r, i) => (
                  <tr key={i}><td>{r.kapitel}</td><td>{r.lektionId}</td><td>{r.field}</td>
                    <td>{r.value.slice(0, 60)}{r.value.length > 60 ? '…' : ''}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="note">Återställ ett enskilt fält med ↩ vid fältet, eller stegvis via ↶ Ångra i planeringen.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Planering: lektionskort, inline edit, BAM, add/remove ─────
const INNER_TABS: Array<[import('../views/Arsoversikt.js').InnerTab, string]> = [
  ['lektionsplan', '📋 Lektionsplan'], ['oversikt', '🗓 Översikt'], ['uppgifter', '✏️ Uppgifter'],
  ['begrepp', '💡 Begrepp'], ['filmer', '🎬 Filmer'], ['magma', '🧮 Magma'], ['klasser', '🏫 Klasser'],
];

function PlaneringView(props: {
  lib: LoadedLibrary; kapitel: number; lessons: LessonRecord[]; classId: string;
  slotFor: (kap: number, idx: number) => ScheduledSlot | null;
  globalIdxFor: (kap: number, idx: number) => number;
  placed: PlacedLesson<LessonRecord>[]; onChange: () => void;
  inner: import('../views/Arsoversikt.js').InnerTab;
  setInner: (t: import('../views/Arsoversikt.js').InnerTab) => void;
  focus: { idx: number; token: number } | null;
  onOpenLesson: (kapitel: number, globalIdx: number) => void;
}) {
  const { lib, kapitel, lessons, slotFor, globalIdxFor, placed, classId, onChange, inner, setInner, focus, onOpenLesson } = props;
  const meta = lib.subject.kapitelMeta[String(kapitel)];
  const accent = KAP_COLORS[kapitel] ?? '#555'; // FR-GEN-003
  const [adding, setAdding] = useState(false);
  const [addAfter, setAddAfter] = useState<number | null>(null); // FR-CARD-016
  const [sel, setSel] = useState(0); // FR-GEN-007: vald lektion
  const clampSel = Math.min(sel, Math.max(0, lessons.length - 1));
  const gotoLesson = (i: number) => {
    const n = Math.max(0, Math.min(lessons.length - 1, i));
    setSel(n);
    document.getElementById(`lesson-card-${kapitel}-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  useEffect(() => { // FR-CAL-009: fokusera lektion vald i kalendern
    if (focus === null) return;
    const t = setTimeout(() => gotoLesson(focus.idx), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token, kapitel]);
  useEffect(() => { // FR-GEN-007: piltangenter, ej när formulärfält är i fokus
    const onKey = (e: KeyboardEvent) => {
      if (inner !== 'lektionsplan') return;
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); gotoLesson(clampSel + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); gotoLesson(clampSel - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportWord = async (scope: 'kapitel' | 'vecka') => {
    const rows = lessons.map((l, i) => ({ lesson: l, slot: slotFor(kapitel, i) }));
    const wk = rows.find((r) => r.slot)?.slot?.week;
    const chosen = scope === 'kapitel' ? rows : rows.filter((r) => r.slot?.week === wk);
    await Docx.exportLessons(
      scope === 'kapitel' ? `kapitel-${kapitel}-${classId}` : `vecka-${wk}-${classId}`,
      `${scope === 'kapitel' ? `Kapitel ${kapitel} — ${meta.name}` : `Vecka ${wk}`} (${classId})`,
      chosen.map((r) => ({ ...r.lesson, avsnitt: effectiveField(kapitel, r.lesson, 'avsnitt'), genomgang: effectiveField(kapitel, r.lesson, 'genomgang'), laxa: effectiveField(kapitel, r.lesson, 'laxa'), date: r.slot?.date ?? '' })),
    );
  };

  return (
    <main className="main">
      <div className="head-row kap-head" style={{ borderLeft: `6px solid ${accent}` }}>
        <div>
          <h2 style={{ color: accent }}>Kapitel {kapitel} — {meta.name}</h2>
          <p className="sub">
            {lessons.length} lektioner · {weeksLabel(lessons.length, (lib.subject.schema[classId] ?? []).length)} veckor · {meta.term}
          </p>
          <p className="sub kap-pills">
            <span className="kpill">📖 Sammanfattning: {meta.sidor_samm}</span>
            <span className="kpill">🏆 {meta.prov}</span>
            <span className="kpill">📱 Socrative: {lib.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => c.socrative).join(' / ')}</span>
            <span className="kpill">🏫 Klasser: {lib.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => c.namn).join(' & ')}</span>
          </p>
        </div>
        <div className="no-print">
          <button className="btn sec" onClick={() => { undo() && onChange(); }}>↶ Ångra</button>{' '}
          <button className="btn sec" onClick={() => window.print()}>🖨 Skriv ut</button>{' '}
          <button className="btn sec" onClick={() => void exportWord('vecka')}>📄 Vecka → Word</button>{' '}
          <button className="btn sec" onClick={() => void exportWord('kapitel')}>📄 Kapitel → Word</button>{' '}
          <button className="btn" onClick={() => setAdding(true)}>+ Lägg till lektion</button>
        </div>
      </div>

      <div className="inner-tabs no-print">{/* FR-GEN-004 */}
        {INNER_TABS.map(([t, label]) => (
          <button key={t} className={`itab ${inner === t ? 'active' : ''}`}
            style={inner === t ? { borderBottomColor: accent, color: accent } : undefined}
            onClick={() => setInner(t)}>{label}</button>
        ))}
      </div>

      {inner === 'lektionsplan' && (<>
        <SchedulePanel subject={lib.subject} onChange={onChange} />{/* FR-SCH-001…006 */}
        <div className="lesson-nav no-print">{/* FR-GEN-007 */}
          <label>Välj lektion:</label>
          <select value={clampSel} onChange={(e) => gotoLesson(Number(e.target.value))}>
            {lessons.map((l, i) => <option key={`${l.id}-${i}`} value={i}>Lektion {i + 1} — {l.avsnitt}</option>)}
          </select>
          <button className="btn sec" onClick={() => gotoLesson(clampSel - 1)} aria-label="Föregående lektion">◀</button>
          <button className="btn sec" onClick={() => gotoLesson(clampSel + 1)} aria-label="Nästa lektion">▶</button>
          <span className="badge" style={{ background: accent }}>Lektion {clampSel + 1} / {lessons.length}</span>
        </div>
        {(() => { /* FR-LES-002: dag, vecka, månad, år + tider för vald lektion/klass */
          const s0 = slotFor(kapitel, clampSel);
          if (!s0) return null;
          const DL = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
          const d = new Date(s0.date + 'T00:00:00Z');
          return <p className="sub les-info no-print">{DL[d.getUTCDay()]} v.{s0.week} · {d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })} · {s0.start}–{s0.end} · klass {classId}</p>;
        })()}
        <div className="plan-flex">
          <TimeBand subject={lib.subject} classId={classId} placed={placed}
            selectedSlotDate={slotFor(kapitel, clampSel)?.date ?? null}
            onOpenLesson={onOpenLesson} />{/* FR-TB-001…006 */}
          <div className="plan-cards">
            {lessons.map((l, i) => (
              <div key={`${l.id}-${i}`} id={`lesson-card-${kapitel}-${i}`}
                className={i === clampSel ? 'sel-lesson' : undefined} onClick={() => setSel(i)}>
                <LessonCard kapitel={kapitel} lesson={l} slot={slotFor(kapitel, i)}
                  globalIdx={globalIdxFor(kapitel, i)} classId={classId}
                  socRoom={lib.subject.meta.klasser.find((c) => c.id === classId)?.socrative ?? 'Matte8B'}
                  defs={lib.begrepp.definitioner}
                  override={placed[globalIdxFor(kapitel, i)]?.override}
                  flip={lib.flip[kapitel]?.[l.id]} onChange={onChange}
                  onAddAfter={() => setAddAfter(l.id)} />
              </div>
            ))}
          </div>
        </div>
      </>)}

      {inner === 'oversikt' && <OversiktTab kapitel={kapitel} lessons={lessons} slotFor={slotFor} />}
      {inner === 'uppgifter' && <UppgifterTab kapitel={kapitel} lessons={lessons} />}
      {inner === 'begrepp' && <BegreppTab lib={lib} kapitel={kapitel} />}
      {inner === 'filmer' && <LinkTab lib={lib} kapitel={kapitel} lessons={lessons} typ="film" tom="Inga filmer i kapitlet ännu — lägg till via + länk på lektionskortet." />}
      {inner === 'magma' && <LinkTab lib={lib} kapitel={kapitel} lessons={lessons} typ="magma" tom="Inga Magma-aktiviteter ännu — lägg till via + länk på lektionskortet." />}
      {inner === 'klasser' && <KlasserTab lib={lib} kapitel={kapitel} placed={placed} />}

      {adding && <AddLessonDialog kapitel={kapitel} lessons={lessons} onClose={() => { setAdding(false); onChange(); }} />}
      {addAfter !== null && <AddLessonDialog kapitel={kapitel} lessons={lessons} initialAfterId={addAfter}
        onClose={() => { setAddAfter(null); onChange(); }} />}
    </main>
  );
}

// ── Inre kapitelflikar (FR-GEN-004) ───────────────────────────
function OversiktTab(props: { kapitel: number; lessons: LessonRecord[]; slotFor: (k: number, i: number) => ScheduledSlot | null }) {
  const { kapitel, lessons, slotFor } = props;
  return (
    <table className="tbl">
      <thead><tr><th>#</th><th>Datum</th><th>Avsnitt</th><th>Typ</th><th>Del</th><th>Exit ticket</th></tr></thead>
      <tbody>
        {lessons.map((l, i) => {
          const s = slotFor(kapitel, i);
          return (
            <tr key={`${l.id}-${i}`}>
              <td>{i + 1}</td>
              <td>{s ? `v.${s.week} · ${s.date} ${s.start}` : '—'}</td>
              <td>{effectiveField(kapitel, l, 'avsnitt')}</td>
              <td>{l.type}</td><td>{l.del || '—'}</td><td>{l.exit}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function UppgifterTab(props: { kapitel: number; lessons: LessonRecord[] }) {
  const { kapitel, lessons } = props;
  return (<>
    <p className="note">Grön = introduktion · Blå = E-nivå · Röd = C/A-nivå. Del 1: Grön/Blå (minimum grönt). Del 2: Blå/Röd (minimum blått). Grönt + blått lämnas in som foto i Google Classroom.</p>
    <table className="tbl">
      <thead><tr><th>Avsnitt</th><th>Del</th><th>Grön</th><th>Blå</th><th>Röd</th><th>Teori</th></tr></thead>
      <tbody>
        {lessons.filter((l) => l.type === 'regular').map((l, i) => (
          <tr key={`${l.id}-${i}`}>
            <td>{effectiveField(kapitel, l, 'avsnitt')}</td><td>{l.del || '—'}</td>
            <td className="rg grön">{effectiveField(kapitel, l, 'grön')}</td>
            <td className="rg blå">{effectiveField(kapitel, l, 'blå')}</td>
            <td className="rg röd">{effectiveField(kapitel, l, 'röd')}</td>
            <td>{l.sidor_teori}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>);
}

function BegreppTab(props: { lib: LoadedLibrary; kapitel: number }) {
  const { lib, kapitel } = props;
  const entries = Object.entries(lib.begrepp.perDelkapitel)
    .filter(([k]) => k.split('.')[0] === String(kapitel))
    .sort(([a], [b]) => a.localeCompare(b, 'sv', { numeric: true }));
  if (entries.length === 0) return <p className="muted">Inga begrepp registrerade för kapitlet.</p>;
  return (<>
    {entries.map(([delkap, list]) => (
      <div key={delkap} className="card">
        <div className="title">{delkap}</div>
        <div className="reslist">
          {list.map((b) => (
            <span key={b} className="chip" title={lib.begrepp.definitioner[b] ?? 'Definition saknas'}>{b}</span>
          ))}
        </div>
      </div>
    ))}
  </>);
}

function LinkTab(props: { lib: LoadedLibrary; kapitel: number; lessons: LessonRecord[]; typ: 'film' | 'magma'; tom: string }) {
  const { lib, kapitel, lessons, typ, tom } = props;
  const rows = lessons.flatMap((l) => {
    const flip = lib.flip[kapitel]?.[l.id];
    const fromFlip = typ === 'film'
      ? (flip?.blocks ?? []).flatMap((b) => (b.typ === 'film' ? [{ titel: b.ref.titel, url: b.ref.url }] : []))
      : [];
    const fromLinks = getLinks(kapitel, l.id).filter((x) => x.typ === typ);
    return [...fromFlip, ...fromLinks].map((x) => ({ lesson: l, ...x }));
  });
  if (rows.length === 0) return <p className="muted">{tom}</p>;
  return (
    <table className="tbl">
      <thead><tr><th>Lektion</th><th>{typ === 'film' ? 'Film' : 'Magma-aktivitet'}</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.lesson.avsnitt}</td>
            <td><a href={r.url} target="_blank" rel="noreferrer">{typ === 'film' ? '🎬' : '🧮'} {r.titel || r.url}</a></td></tr>
        ))}
      </tbody>
    </table>
  );
}

function KlasserTab(props: { lib: LoadedLibrary; kapitel: number; placed: PlacedLesson<LessonRecord>[] }) {
  const { lib, kapitel } = props;
  const dayName = ['', 'mån', 'tis', 'ons', 'tor', 'fre'];
  return (
    <table className="tbl">
      <thead><tr><th>Klass</th><th>Socrative</th><th>Lektionspass</th><th>Kapitlets period</th></tr></thead>
      <tbody>
        {lib.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => {
          const seq = Object.keys(lib.subject.kapitelMeta).map(Number).sort((a, b) => a - b)
            .flatMap((k) => composeChapter(k, lib.lessons[k] ?? []).map((lesson) => ({ kapitel: k, lesson })));
          const slots = generateSlots(lib.subject, c.id, seq.length + 20);
          const mine = placeLessons(seq, slots, getCalOverrides(c.id)).filter((p) => p.kapitel === kapitel && p.slot);
          const first = mine[0]?.slot, last = mine[mine.length - 1]?.slot;
          return (
            <tr key={c.id}>
              <td><b>{c.namn}</b></td><td>{c.socrative}</td>
              <td>{(lib.subject.schema[c.id] ?? []).map((p) => `${dayName[p.day]} ${p.start}–${p.end}`).join(' · ')}</td>
              <td>{first && last ? `v.${first.week} (${first.date}) – v.${last.week} (${last.date})` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Editable(props: { kapitel: number; lesson: LessonRecord; field: keyof LessonRecord; multiline?: boolean; rows?: number; onChange: () => void }) {
  const { kapitel, lesson, field, multiline, rows, onChange } = props;
  const value = effectiveField(kapitel, lesson, field);
  const edited = isEdited(kapitel, lesson.id, field); // FR-EDIT-004
  const [flash, setFlash] = useState(false); // FR-EDIT-006
  const commit = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const v = el.value;
    if (v.trim() === '') { el.value = value; return; } // FR-EDIT-003: tomt sparas inte
    if (v !== value) {
      setField(kapitel, lesson.id, field, v);
      setFlash(true); setTimeout(() => setFlash(false), 1500);
      onChange();
    }
  };
  return (
    <span className={`edit-wrap ${edited ? 'has-edit' : ''}`}>
      {multiline
        ? <textarea key={value} className="inline-edit" defaultValue={value} rows={rows ?? 2} onBlur={(e) => commit(e.target)} />
        : <input key={value} className="inline-edit" defaultValue={value} onBlur={(e) => commit(e.target)} />}
      {flash && <span className="saved-flash">✓ Sparat</span>}
      {edited && !flash && (
        <button className="restore-btn" title="Återställ original"
          onClick={() => { clearField(kapitel, lesson.id, field); onChange(); }}>↩ Återställ original</button>
      )}{/* FR-EDIT-005 */}
    </span>
  );
}

function LessonCard(props: {
  kapitel: number; lesson: LessonRecord; slot: ScheduledSlot | null;
  globalIdx: number; classId: string; socRoom: string; defs: Record<string, string>;
  override?: import('@planner/core').LessonOverride;
  flip?: import('@planner/core').FlipDoc; onChange: () => void; onAddAfter: () => void;
}) {
  const { kapitel, lesson, slot, globalIdx, classId, socRoom, defs, override, flip, onChange, onAddAfter } = props;
  const har = (v: string) => !!v && v !== '—';
  const begreppList = har(effectiveField(kapitel, lesson, 'begrepp'))
    ? effectiveField(kapitel, lesson, 'begrepp').split(',').map((b) => b.trim()).filter(Boolean) : [];
  const [cancelDlg, setCancelDlg] = useState(false);
  const rows = flip?.bamTimeline?.length
    ? flip.bamTimeline
    : slot ? defaultBamTimeline(lesson, diffMinutes(slot.start, slot.end)) : null;
  const timeline = rows && slot ? computeTimes(rows, slot.start) : null;
  const segFor = (kind: string) => timeline?.find((t) => t.kind === kind);
  const links: LessonLink[] = [
    ...(flip?.blocks ?? []).flatMap((b) => b.typ === 'film' || b.typ === 'quiz'
      ? [{ typ: b.typ, titel: b.ref.titel, url: b.ref.url } as LessonLink] : []),
    ...getLinks(kapitel, lesson.id),
  ];
  const flipCount = (flip?.blocks ?? []).filter((b) => b.typ !== 'text').length;
  return (
    <article className={`card type-${lesson.type} ${override ? 'ov-' + override.type : ''}`}>
      <div className="card-head">
        <span className="title">
          Lektion {lesson.id} · {effectiveField(kapitel, lesson, 'avsnitt')}
          {flip && <span className="pill flip">Flippat</span>}
          {har(lesson.sidor_teori) && <span className="pill teori">📖 Teorisidor: {lesson.sidor_teori}</span>}
          {begreppList.length > 0 && <span className="pill beg">💡 {begreppList.length} begrepp introduceras</span>}
          {lesson.exit !== '—' && <span className="pill quiz">Exit</span>}
          {lesson.type !== 'regular' && <span className="pill">{lesson.type}</span>}
          {override && <span className="pill ov">{override.type === 'cancelled' ? '⛔ Inställd' : override.type === 'shifted' ? '⏭ Framflyttad' : '📍 Flyttad'}</span>}
        </span>
        <span className="when">{slot ? `v.${slot.week} · ${slot.date} · ${slot.start}` : override?.type === 'cancelled' ? 'inställd' : 'ej schemalagd'}</span>
        <button className="icon-btn" title={override ? 'Återställ' : 'Ställ in / flytta'} onClick={() => setCancelDlg(true)}>{override ? '↩' : '⛔'}</button>
        <button className="icon-btn" title="Ta bort lektion" onClick={() => { removeLesson(kapitel, lesson.id); onChange(); }}>🗑</button>
      </div>
      {override && <p className="ov-reason">📝 {override.reason}</p>}

      {slot && ( /* FR-CARD-003: Tavlan */
        <div className="tavlan">
          <div className="tavlan-top">🗓 TAVLAN</div>
          <div className="tavlan-bar">
            <b>Ma</b>
            <span className="t">{slot.start} – {slot.end}</span>
            <small>{['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][new Date(slot.date + 'T00:00:00Z').getUTCDay()]} · v.{slot.week}</small>
          </div>
          {timeline && (
            <div className="bam" aria-label="BAM-tidslinje">{/* FR-CARD-004 */}
              {timeline.map((seg) => (
                <div key={seg.label} className={`seg ${seg.kind}`} style={{ flexGrow: seg.minutes }}>
                  <b>{seg.label}</b><span>{seg.from}–{seg.to}</span>
                </div>
              ))}
            </div>
          )}
          {har(lesson.soc_start) && segFor('quiz') && ( /* FR-CARD-005 */
            <div className="soc-block start">
              <span className="soc-time">⏱ {segFor('quiz')!.from}–{segFor('quiz')!.to} · LÄXFÖRHÖR</span>
              <span className="soc-room">Socrative.com · Roomname: <b>{socRoom}</b></span>
              <Editable kapitel={kapitel} lesson={lesson} field="soc_start" onChange={onChange} />
            </div>
          )}
          <div className="bam-cols">{/* göra / lära / exempel — redigerbara (FR-EDIT-001) */}
            <div className="bam-col gora"><h5>VAD SKA VI GÖRA</h5>
              <Editable kapitel={kapitel} lesson={lesson} field="bam_gora" multiline rows={3} onChange={onChange} /></div>
            <div className="bam-col lara"><h5>VAD SKA VI LÄRA OSS</h5>
              <Editable kapitel={kapitel} lesson={lesson} field="bam_lara" multiline rows={3} onChange={onChange} /></div>
            <div className="bam-col ex"><h5>EXEMPEL VI RÄKNAR</h5>
              <Editable kapitel={kapitel} lesson={lesson} field="bam_ex" multiline rows={3} onChange={onChange} /></div>
          </div>
        </div>
      )}

      <div className="rows">
        <label>Genomgång{segFor('lecture') && <small className="tspan"> {segFor('lecture')!.from}–{segFor('lecture')!.to}</small>}</label>
        <Editable kapitel={kapitel} lesson={lesson} field="genomgang" multiline onChange={onChange} />{/* FR-CARD-006 */}

        {har(lesson.ex) && (<> {/* FR-CARD-007 */}
          <label>Bokens exempel</label>
          <div className="ex-box"><Editable kapitel={kapitel} lesson={lesson} field="ex" multiline onChange={onChange} /></div>
        </>)}

        {begreppList.length > 0 && (<> {/* FR-CARD-008 */}
          <label>Begrepp</label>
          <div className="reslist">
            {begreppList.map((b) => (
              <span key={b} className="chip" title={defs[b.toLowerCase()] ?? defs[b] ?? 'Definition saknas'}>{b}</span>
            ))}
          </div>
        </>)}

        {(har(effectiveField(kapitel, lesson, 'grön')) || har(effectiveField(kapitel, lesson, 'blå')) || har(effectiveField(kapitel, lesson, 'röd'))) && (<>
          <label>Arbete{segFor('work') && <small className="tspan"> {segFor('work')!.from}–{segFor('work')!.to}</small>}</label>
          <div>{/* FR-CARD-009/010/011 */}
            {lesson.del === 1 && <span className="pill min">Minimum lektion 1: Grönt klart</span>}
            {lesson.del === 2 && <span className="pill min">Minimum lektion 2: Blått klart</span>}
            <div className="ranges">
              {har(effectiveField(kapitel, lesson, 'grön')) && <span className="rg grön">Grön {effectiveField(kapitel, lesson, 'grön')} · Introduktion · obligatorisk</span>}
              {har(effectiveField(kapitel, lesson, 'blå')) && <span className="rg blå">Blå {effectiveField(kapitel, lesson, 'blå')} · E-nivå · obligatorisk</span>}
              {har(effectiveField(kapitel, lesson, 'röd')) && <span className="rg röd">Röd {effectiveField(kapitel, lesson, 'röd')} · C/A-nivå · frivillig</span>}
            </div>
            <p className="note">📷 Fotografera dina beräkningar och ladda upp i Google Classroom. Grön + blå är obligatoriska att lämna in; det som inte hinns med görs klart hemma eller på stödtid.</p>
          </div>
        </>)}

        <label>Läxa</label>{/* FR-CARD-013 */}
        <div>
          {begreppList.length > 0 && <p className="note">💡 Nya begrepp att kunna: {begreppList.join(', ')}</p>}
          <Editable kapitel={kapitel} lesson={lesson} field="laxa" onChange={onChange} />
          <p className="note">Kom ihåg: gröna och blå uppgifter ska vara inlämnade i Classroom.</p>
        </div>
      </div>

      {har(lesson.exit) && segFor('exit') && ( /* FR-CARD-014 */
        <div className="soc-block exit">
          <span className="soc-time">⏱ {segFor('exit')!.from}–{segFor('exit')!.to} · EXIT TICKET</span>
          <span className="soc-room">Socrative.com · Roomname: <b>{socRoom}</b></span>
          <Editable kapitel={kapitel} lesson={lesson} field="exit" onChange={onChange} />
          <p className="note">5 minuter. Visa att du förstår lektionens grundläggande uppgifter. Exit ticket från denna lektion används som läxförhör nästa lektion.</p>
        </div>
      )}

      <ResourceRow kapitel={kapitel} lesson={lesson} links={links} flipCount={flipCount} onChange={onChange} />
      <div className="card-foot no-print">{/* FR-CARD-016 */}
        <button className="btn sec" onClick={onAddAfter}>+ Lägg till lektion efter denna</button>
      </div>
      {cancelDlg && (
        <div className="overlay" role="dialog">
          <div className="modal">
            <h3>{override ? 'Återställ lektion?' : `Ställ in lektion ${lesson.id}?`}</h3>
            {!override && <p className="muted">Gäller klass {classId}.</p>}
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              {override ? (
                <button className="btn" onClick={() => { setCalOverride(classId, globalIdx, null); setCancelDlg(false); onChange(); }}>↩ Återställ till ordinarie</button>
              ) : (<>
                <button className="btn" onClick={() => { setCalOverride(classId, globalIdx, { type: 'shifted', reason: 'Inställd — tas nästa pass' }); setCancelDlg(false); onChange(); }}>⏭ Flytta till nästa pass (allt förskjuts)</button>
                <button className="btn warn" onClick={() => { setCalOverride(classId, globalIdx, { type: 'cancelled', reason: 'Utgår' }); setCancelDlg(false); onChange(); }}>⛔ Lektionen utgår helt</button>
              </>)}
              <button className="btn sec" onClick={() => setCancelDlg(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function ResourceRow(props: { kapitel: number; lesson: LessonRecord; links: LessonLink[]; flipCount: number; onChange: () => void }) {
  const { kapitel, lesson, links, flipCount, onChange } = props;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<LessonLink>({ typ: 'film', titel: '', url: '' });
  const ICON: Record<LessonLink['typ'], string> = { film: '🎬', magma: '🧮', quiz: '❓', verktyg: '🔧', aktivitet: '🤝', ovrigt: '📎' };
  const CATS: Array<[LessonLink['typ'], string]> = [
    ['film', 'Filmer (Binogi m.m.)'], ['magma', 'Magma'], ['quiz', 'Quiz/Socrative'],
    ['verktyg', 'Verktyg'], ['aktivitet', 'Aktiviteter (EPA m.m.)'], ['ovrigt', 'Övrigt'],
  ];
  return (
    <div className="resources">
      <label>Pedagogiska verktyg</label>
      <div className="toolgroups">{/* FR-CARD-012: sex kategorier, alltid synliga */}
        {CATS.map(([typ, label]) => (
          <div key={typ} className="toolgroup">
            <h6>{ICON[typ]} {label}</h6>
            <div className="reslist">
              {links.filter((l) => l.typ === typ).length === 0 && <span className="muted">—</span>}
              {links.map((l, i) => l.typ === typ && (
                <span key={`${l.url}-${i}`} className={`reslink ${l.typ}`}>
                  <a href={l.url} target="_blank" rel="noreferrer">{l.titel || l.typ}</a>
                  {i >= flipCount && (
                    <button className="icon-btn" title="Ta bort" onClick={() => { removeLink(kapitel, lesson.id, i - flipCount); onChange(); }}>×</button>
                  )}
                </span>
              ))}
              <button className="icon-btn addres" onClick={() => { setForm({ typ, titel: '', url: '' }); setAdding(true); }}>+</button>
            </div>
          </div>
        ))}
      </div>
      {adding && (
        <div className="resform">
          <select value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value as LessonLink['typ'] })}>
            <option value="film">Film</option><option value="magma">Magma</option>
            <option value="quiz">Quiz</option><option value="verktyg">Verktyg</option>
            <option value="aktivitet">Aktivitet</option><option value="ovrigt">Övrigt</option>
          </select>
          <input placeholder="Titel" value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
          <input placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <button className="btn" disabled={!form.url.startsWith('http')}
            onClick={() => { addLink(kapitel, lesson.id, form); setForm({ typ: form.typ, titel: '', url: '' }); setAdding(false); onChange(); }}>Spara</button>
        </div>
      )}
    </div>
  );
}

function AddLessonDialog(props: { kapitel: number; lessons: LessonRecord[]; onClose: () => void; initialAfterId?: number }) {
  const { kapitel, lessons, onClose, initialAfterId } = props;
  const [titel, setTitel] = useState('Extra: repetition');
  const [mode, setMode] = useState<InsertMode>('skjut-fram');
  const [afterId, setAfterId] = useState<number | null>(initialAfterId ?? lessons[lessons.length - 1]?.id ?? null);
  const save = () => {
    addCustomLesson({
      kapitel, afterId: mode === 'sist' ? null : afterId, mode,
      lesson: {
        id: nextCustomId(lessons), type: 'repetition', avsnitt: titel, del: 0,
        grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—',
        genomgang: '', bam_gora: '', bam_lara: '', bam_ex: '', ex: '', laxa: '—',
      },
    });
    onClose();
  };
  return (
    <div className="overlay" role="dialog" aria-label="Lägg till lektion">
      <div className="modal">
        <h3>Lägg till lektion i kapitel {kapitel}</h3>
        <label>Titel</label>
        <input value={titel} onChange={(e) => setTitel(e.target.value)} />
        <label>Infogningsläge</label>
        {(['skjut-fram', 'ersätt', 'sist'] as InsertMode[]).map((m) => (
          <label key={m} className="radio">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'skjut-fram' ? 'Skjut fram efterföljande lektioner' : m === 'ersätt' ? 'Ersätt en befintlig lektion' : 'Lägg sist i kapitlet'}
          </label>
        ))}
        {mode !== 'sist' && (
          <>
            <label>{mode === 'ersätt' ? 'Ersätter' : 'Efter'} lektion</label>
            <select value={afterId ?? ''} onChange={(e) => setAfterId(Number(e.target.value))}>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.id} · {l.avsnitt}</option>)}
            </select>
          </>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={save}>Lägg till</button>
          <button className="btn sec" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

// ── Klasser (sprint 17-om) ────────────────────────────────────
function KlasserView(props: { subject: SubjectFile }) {
  const { subject } = props;
  const dayName = ['', 'mån', 'tis', 'ons', 'tor', 'fre'];
  return (
    <main className="main">
      <h2>Klasshantering</h2>
      <p className="sub">Lektionspass per klass (läses från subject.json — redigeras i datakällan)</p>
      <table className="tbl">
        <thead><tr><th>Klass</th><th>Läsår</th><th>Socrative-rum</th><th>Lektionspass</th></tr></thead>
        <tbody>
          {subject.meta.klasser.map((c) => (
            <tr key={c.id}>
              <td><b>{c.namn}</b></td><td>{c.läsår}</td><td>{c.socrative}</td>
              <td>{(subject.schema[c.id] ?? []).map((p) => `${dayName[p.day]} ${p.start}–${p.end}`).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

// ── Bibliotek: datakällor + wizard (sprint 20/22/24-om) ───────
function BibliotekView(props: { lib: LoadedLibrary; onLoaded: (l: LoadedLibrary) => void }) {
  const [s, setS] = useState(getSettings());
  const [status, setStatus] = useState('');
  const connect = async () => {
    saveSettings(s);
    setStatus('Hämtar…');
    try {
      const lib = await loadFromGithub();
      const n = Object.values(lib.lessons).reduce((a, b) => a + b.length, 0);
      setStatus(`✓ ${n} lektioner lästa från ${s.githubOwner}/${s.githubRepo} (${s.slug})`);
      props.onLoaded(lib);
    } catch (e) { setStatus(`✗ ${(e as Error).message}`); }
  };
  return (
    <main className="main">
      <h2>Bibliotek — datakällor</h2>
      <div className="card">
        <div className="card-head"><span className="title">GitHub: {s.githubRepo}</span>
          <span className={props.lib.source === 'github' ? 'ok' : 'muted'}>{props.lib.source === 'github' ? '● Ansluten' : '○ Demo-läge'}</span></div>
        <label>Repository (ägare/namn)</label>
        <div className="pair">
          <input value={s.githubOwner} onChange={(e) => setS({ ...s, githubOwner: e.target.value })} />
          <input value={s.githubRepo} onChange={(e) => setS({ ...s, githubRepo: e.target.value })} />
        </div>
        <label>Ämnes-slug</label>
        <input value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value })} />
        <label>Fine-grained PAT (Contents: Read)</label>
        <input type="password" value={s.githubToken} onChange={(e) => setS({ ...s, githubToken: e.target.value })} placeholder="github_pat_…" />
        <div className="modal-actions">
          <button className="btn" onClick={() => void connect()}>Anslut och hämta</button>
        </div>
        {status && <p className="status">{status}</p>}
        <p className="note">Tokenen sparas endast i din webbläsare och skickas bara till GitHubs API.</p>
      </div>
    </main>
  );
}

// ── Inställningar: backup (sprint 19-om) ──────────────────────
function InstallningarView(props: { onChange: () => void }) {
  const [msg, setMsg] = useState('');
  const doExport = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `classroom-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    setMsg('✓ Backup nedladdad.');
  };
  const doImport = async (file: File) => {
    try { importBackup(await file.text()); props.onChange(); setMsg('✓ Backup importerad.'); }
    catch (e) { setMsg(`✗ ${(e as Error).message}`); }
  };
  const stOn = localStorage.getItem(FLAG) === 'true';
  return (
    <main className="main">
      <h2>Inställningar</h2>
      <div className="card">
        <div className="title">Säkerhetskopiering</div>
        <p className="note">Fältändringar, egna lektioner, borttagningar och SuperTeach-evidens.</p>
        <div className="modal-actions">
          <button className="btn" onClick={doExport}>⬇ Exportera backup</button>
          <label className="btn sec file-btn">⬆ Importera backup
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          </label>
          <button className="btn warn" onClick={() => { restoreAllRemoved(); props.onChange(); setMsg('✓ Borttagna lektioner återställda.'); }}>Återställ borttagna lektioner</button>
        </div>
        {msg && <p className="status">{msg}</p>}
      </div>
      <div className="card">
        <div className="title">SuperTeach</div>
        <label className="radio">
          <input type="checkbox" checked={stOn}
            onChange={(e) => { localStorage.setItem(FLAG, String(e.target.checked)); props.onChange(); }} />
          Aktivera SuperTeach-fliken (kunskapsöversikt per elev)
        </label>
      </div>
    </main>
  );
}
