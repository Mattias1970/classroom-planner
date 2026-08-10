import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  applyClassEdits, applySchemaEdits, buildBegreppTabell, computeTimes, defaultBamTimeline, diffMinutes,
  distinctEditedFields, generateSlots, normalizeUrl, placeLessons, summarizeEdits,
  weeksLabel, KAP_COLORS,
  type LessonRecord, type PlacedLesson, type ScheduledSlot, type SubjectFile,
} from '@planner/core';
import { SchedulePanel, TimeBand } from '../views/SchemaOchTidsband.js';
import { KlassHanterare } from '../views/KlassHanterare.js';
import { BottomNav, ScreenSizeModal, useMobile, useScreenSize, useScrollToNextChapter } from '../views/Mobil.js';
import Kalender from '../views/Kalender.js';
import Arsoversikt, { type InnerTab } from '../views/Arsoversikt.js';
import {
  addCustomLesson, clearField, composeChapter, demoLibrary, effectiveField, exportBackup,
  getOverrides, getSchemaEdits, getSettings, importBackup, isEdited, loadFromGithub,
  nextCustomId, removeLesson, restoreAllRemoved, saveSettings,
  setField, undo, type InsertMode, type LoadedLibrary,
  addLink, getCalOverrides, getLinks, removeLink, setCalOverride, shiftAllCalOverrides,
  clearMagma, countMagmaForKap, getMagma, setMagma,
  getPrio, setPrio, PRIO_ALL,
  getClassEdits, getClassNote, setClassNote,
  type LessonLink, type ToolTyp,
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

  // FR-SCH + FR-CM: lokala schema- och klassändringar appliceras ovanpå datakällan
  const libEff = useMemo<LoadedLibrary>(
    () => ({ ...lib, subject: applyClassEdits(applySchemaEdits(lib.subject, getSchemaEdits()), getClassEdits()) }),
    [lib, tick],
  );
  const mobile = useMobile(); // FR-MOB-001/010
  const [screenSize, setScreenSize] = useScreenSize(); // FR-MOB-005…007
  const [sizeModal, setSizeModal] = useState(false);
  const [classMgr, setClassMgr] = useState(false); // FR-CM-001
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
  const activeIds = libEff.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => c.id);
  const safeClassId = activeIds.includes(classId) ? classId : (activeIds[0] ?? classId);
  if (safeClassId !== classId) setTimeout(() => setClassId(safeClassId), 0);
  const placed = placedByClass[safeClassId] ?? [];
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
            inner={inner} setInner={setInner} focus={focus} onOpenLesson={openLesson}
            mobile={mobile} onNextChapter={(k) => { setKapitel(k); }} allChapters={chapters}
            onOpenClassMgr={() => setClassMgr(true)} />
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

      {mobile && (
        <BottomNav tab={tab} kapitel={kapitel} chapters={chapters}
          onTab={(t) => setTab(t)} onKapitel={(k) => { setKapitel(k); setInner('lektionsplan'); setTab('planering'); }}
          extra={[['planering', '📋 Planering'], ['klasser', '🏫 Klasser'], ['bibliotek', '📚 Bibliotek'], ['installningar', '⚙ Inställningar']]}
          onExtra={(t) => setTab(t as Tab)} />
      )}{/* FR-MOB-003/004 */}
      {mobile && (
        <button className="fab-size" title="Skärmstorlek" onClick={() => setSizeModal(true)}>📱</button>
      )}
      {sizeModal && <ScreenSizeModal size={screenSize} onPick={setScreenSize} onClose={() => setSizeModal(false)} />}
      {classMgr && <KlassHanterare subject={libEff.subject} onClose={() => setClassMgr(false)} onChange={refresh} />}

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
  mobile: boolean; allChapters: number[]; onNextChapter: (k: number) => void;
  onOpenClassMgr: () => void;
}) {
  const { lib, kapitel, lessons, slotFor, globalIdxFor, placed, classId, onChange, inner, setInner, focus, onOpenLesson, mobile, allChapters, onNextChapter, onOpenClassMgr } = props;
  const pullHint = useScrollToNextChapter(mobile && inner === 'lektionsplan', allChapters, kapitel, onNextChapter); // FR-MOB-008/009
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
      <div className="plan-sticky">
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
        <div className="lesson-nav no-print">{/* FR-GEN-007 */}
          <label>Välj lektion:</label>
          <select value={clampSel} onChange={(e) => gotoLesson(Number(e.target.value))}>
            {lessons.map((l, i) => <option key={`${l.id}-${i}`} value={i}>Lektion {i + 1} — {l.avsnitt}</option>)}
          </select>
          <button className="btn sec" onClick={() => gotoLesson(clampSel - 1)} aria-label="Föregående lektion">◀</button>
          <button className="btn sec" onClick={() => gotoLesson(clampSel + 1)} aria-label="Nästa lektion">▶</button>
          <span className="badge" style={{ background: accent }}>Lektion {clampSel + 1} / {lessons.length}</span>
          <button className="btn sec" onClick={onOpenClassMgr}>⚙ Klasser</button>{/* FR-CM-001 */}
        </div>
        {(() => { /* FR-LES-002: dag, vecka, månad, år + tider för vald lektion/klass */
          const s0 = slotFor(kapitel, clampSel);
          if (!s0) return null;
          const DL = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
          const d = new Date(s0.date + 'T00:00:00Z');
          return <p className="sub les-info no-print">{DL[d.getUTCDay()]} v.{s0.week} · {d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })} · {s0.start}–{s0.end} · klass {classId}</p>;
        })()}
      </>)}
      </div>{/* /plan-sticky */}

      {inner === 'lektionsplan' && (<>
        <SchedulePanel subject={lib.subject} onChange={onChange} />{/* FR-SCH-001…006 */}
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
        {pullHint !== null && ( /* FR-MOB-008 */
          <div className="pull-hint" style={{ opacity: pullHint / 140 }}>
            ⬇ Fortsätt dra för Kapitel {allChapters[allChapters.indexOf(kapitel) + 1]} …
          </div>
        )}
      </>)}

      {inner === 'oversikt' && <OversiktTab kapitel={kapitel} lessons={lessons} slotFor={slotFor}
        onOpenRow={(i) => { setInner('lektionsplan'); setTimeout(() => gotoLesson(i), 60); }} />}
      {inner === 'uppgifter' && <UppgifterTab kapitel={kapitel} lessons={lessons} />}
      {inner === 'begrepp' && <BegreppTab lib={lib} kapitel={kapitel} lessons={lessons} />}
      {inner === 'filmer' && <FilmerTab lib={lib} kapitel={kapitel} lessons={lessons} onChange={onChange}
        onOpenRow={(i) => { setInner('lektionsplan'); setTimeout(() => gotoLesson(i), 60); }} />}
      {inner === 'magma' && <MagmaTab kapitel={kapitel} lessons={lessons} onChange={onChange}
        onOpenRow={(i) => { setInner('lektionsplan'); setTimeout(() => gotoLesson(i), 60); }} />}
      {inner === 'klasser' && <KlasserTab lib={lib} kapitel={kapitel} placed={placed} />}

      {adding && <AddLessonDialog kapitel={kapitel} lessons={lessons}
        insertGlobalIdx={globalIdxFor(kapitel, lessons.length - 1)}
        onClose={() => { setAdding(false); onChange(); }} />}
      {addAfter !== null && <AddLessonDialog kapitel={kapitel} lessons={lessons} initialAfterId={addAfter}
        insertGlobalIdx={globalIdxFor(kapitel, lessons.findIndex((l) => l.id === addAfter))}
        onClose={() => { setAddAfter(null); onChange(); }} />}
    </main>
  );
}

// ── Inre kapitelflikar (FR-GEN-004) ───────────────────────────
function OversiktTab(props: {
  kapitel: number; lessons: LessonRecord[];
  slotFor: (k: number, i: number) => ScheduledSlot | null;
  onOpenRow: (idx: number) => void;
}) {
  const { kapitel, lessons, slotFor, onOpenRow } = props;
  return (
    <table className="tbl clickable">
      <thead><tr><th>Lek.</th><th>Vecka</th><th>Datum</th><th>Tid</th><th>Avsnitt</th><th>Typ</th>
        <th>🟢 Grön</th><th>🔵 Blå</th><th>🔴 Röd</th></tr></thead>
      <tbody>
        {lessons.map((l, i) => {
          const sl = slotFor(kapitel, i);
          return (
            <tr key={`${l.id}-${i}`} onClick={() => onOpenRow(i)} title="Öppna i lektionsplanen">
              <td>{i + 1}</td>
              <td>{sl ? `v.${sl.week}` : '—'}</td>
              <td>{sl?.date ?? '—'}</td>
              <td>{sl ? `${sl.start}–${sl.end}` : '—'}</td>
              <td>{effectiveField(kapitel, l, 'avsnitt')}</td>
              <td><span className={`typebadge t-${l.type}`}>{l.type === 'regular' ? 'LEKTION' : l.type === 'test' ? 'DIAGNOS' : l.type === 'exam' ? 'PROV' : l.type === 'ovaformagor' ? 'ÖVA FÖRMÅGOR' : 'REPETITION'}</span></td>
              <td className="rg grön">{effectiveField(kapitel, l, 'grön')}</td>
              <td className="rg blå">{effectiveField(kapitel, l, 'blå')}</td>
              <td className="rg röd">{effectiveField(kapitel, l, 'röd')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function UppgifterTab(props: { kapitel: number; lessons: LessonRecord[] }) {
  const { kapitel, lessons } = props;
  const har = (v: string) => !!v && v !== '—';
  return (<>
    <div className="card">{/* FR-UPP-002 + FR-EXT-002 */}
      <div className="title">📌 Inlämning</div>
      <ul className="rules-ul">
        <li>Foto på beräkningar laddas upp i <b>Google Classroom</b></li>
        <li><span className="rg grön">Grön</span> + <span className="rg blå">Blå</span> är <b>obligatoriska</b></li>
        <li><span className="rg röd">Röd</span> — görs och lämnas in om lektionstid finns, annars frivillig fördjupning</li>
      </ul>
    </div>
    {lessons.map((l, i) => {
      if (l.type !== 'regular' && l.type !== 'repetition') return null;
      const g = effectiveField(kapitel, l, 'grön'), b = effectiveField(kapitel, l, 'blå'), r = effectiveField(kapitel, l, 'röd');
      if (!har(g) && !har(b) && !har(r)) return null;
      return (
        <div key={`${l.id}-${i}`} className="upp-card">
          <div className="upp-head">
            <b>Lektion {i + 1} — {effectiveField(kapitel, l, 'avsnitt')}</b>
            {l.del === 1 && <span className="pill min">Lek 1: min. Grön</span>}
            {l.del === 2 && <span className="pill min">Lek 2: min. Blå</span>}
            {har(l.sidor_teori) && <span className="muted">📖 {l.sidor_teori}</span>}
          </div>
          <div className="upp-levels">
            {har(g) && <div className="upp-lv grön"><h6>🟢 GRÖN – INTRODUKTION</h6><p>Uppg. {g}</p><span className="pill min">Obligatorisk</span></div>}
            {har(b) && <div className="upp-lv blå"><h6>🔵 BLÅ – E-NIVÅ</h6><p>Uppg. {b}</p><span className="pill min">Obligatorisk</span></div>}
            {har(r) && <div className="upp-lv röd"><h6>🔴 RÖD – C/A-NIVÅ</h6><p>Uppg. {r}</p><span className="pill">Frivillig / vid lektionstid</span></div>}
          </div>
        </div>
      );
    })}
  </>);
}

function BegreppTab(props: { lib: LoadedLibrary; kapitel: number; lessons: LessonRecord[] }) {
  const { lib, kapitel, lessons } = props;
  const rows = buildBegreppTabell(lessons, lib.begrepp.definitioner);
  const chips = [...new Map(rows.map((r) => [r.begrepp.toLowerCase(), r])).values()];
  if (rows.length === 0) return <p className="muted">Inga begrepp registrerade för kapitlet.</p>;
  return (<>
    <table className="tbl">{/* FR-BEG-001 */}
      <thead><tr><th>Lektion</th><th>Begrepp</th><th>Avsnitt</th><th>Förklaring</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.lektionNr}</td><td><b>{r.begrepp}</b></td><td>{r.avsnitt}</td>
            <td><Forklaring text={r.forklaring} /></td></tr>
        ))}
      </tbody>
    </table>
    <h3 className="yr-h">Alla begrepp i kapitlet</h3>{/* FR-BEG-003 */}
    <div className="reslist">
      {chips.map((r) => <span key={r.begrepp} className="chip" title={r.forklaring}>{r.begrepp}</span>)}
    </div>
  </>);
}

function Forklaring({ text }: { text: string }) { /* FR-BEG-002 */
  const [open, setOpen] = useState(false);
  const LIMIT = 90;
  if (text.length <= LIMIT || open) return <>{text}</>;
  return <>{text.slice(0, LIMIT)}… <button className="icon-btn addres" onClick={() => setOpen(true)}>Visa mer</button></>;
}

function FilmerTab(props: {
  lib: LoadedLibrary; kapitel: number; lessons: LessonRecord[];
  onChange: () => void; onOpenRow: (idx: number) => void;
}) {
  const { lib, kapitel, lessons, onChange, onOpenRow } = props;
  const [form, setForm] = useState<{ id: number; titel: string; url: string } | null>(null);
  const filmsFor = (l: LessonRecord) => {
    const flip = lib.flip[kapitel]?.[l.id];
    const fromFlip = (flip?.blocks ?? []).flatMap((b) => (b.typ === 'film' ? [{ titel: b.ref.titel, url: b.ref.url, fixed: true }] : []));
    const own = getLinks(kapitel, l.id).map((x, i) => ({ ...x, i })).filter((x) => x.typ === 'film')
      .map((x) => ({ titel: x.titel, url: x.url, fixed: false, idx: x.i }));
    return [...fromFlip, ...own] as Array<{ titel: string; url: string; fixed: boolean; idx?: number }>;
  };
  const total = lessons.reduce((n, l) => n + filmsFor(l).length, 0);
  return (<>
    <div className="card">
      <div className="title">🎬 Filmlänkar per lektion</div>
      <p className="note">Alla filmlänkar (t.ex. Binogi) som lagts till på enskilda lektioner samlas här. Lägg till eller ta bort en länk direkt — det uppdaterar automatiskt motsvarande lektionskort.</p>
    </div>
    <p className="muted">{total} filmer totalt i kapitlet</p>
    {lessons.map((l, i) => (
      <div key={`${l.id}-${i}`} className="upp-card">
        <div className="upp-head">
          <b>🎬 Lektion {i + 1} — {effectiveField(kapitel, l, 'avsnitt')}</b>
          <button className="btn sec" onClick={() => onOpenRow(i)}>Öppna lektion →</button>{/* FR-FILM-004 */}
        </div>
        {filmsFor(l).map((f, j) => (
          <div key={j} className="film-row">
            <a href={normalizeUrl(f.url)} target="_blank" rel="noopener noreferrer">▶ {f.titel || f.url}</a>
            {!f.fixed && f.idx !== undefined && (
              <button className="icon-btn" title="Ta bort" onClick={() => { removeLink(kapitel, l.id, f.idx!); onChange(); }}>×</button>
            )}{/* FR-FILM-003 */}
          </div>
        ))}
        {form?.id === l.id ? (
          <div className="resform">{/* FR-FILM-002 */}
            <input placeholder="Titel (valfri)" value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
            <input placeholder="https://youtube.com/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <button className="btn" disabled={form.url.trim() === ''}
              onClick={() => { addLink(kapitel, l.id, { typ: 'film', platform: 'Annat', titel: form.titel, url: form.url }); setForm(null); onChange(); }}>+ Lägg till film</button>
            <button className="btn sec" onClick={() => setForm(null)}>Avbryt</button>
          </div>
        ) : (
          <button className="icon-btn addres" onClick={() => setForm({ id: l.id, titel: '', url: '' })}>+ Lägg till film</button>
        )}
      </div>
    ))}
  </>);
}

function MagmaTab(props: {
  kapitel: number; lessons: LessonRecord[];
  onChange: () => void; onOpenRow: (idx: number) => void;
}) {
  const { kapitel, lessons, onChange, onOpenRow } = props;
  const [form, setForm] = useState<{ id: number; label: string; url: string } | null>(null);
  const withAct = lessons.filter((l) => getMagma(kapitel, l.id)).length;
  return (<>
    <div className="card">
      <div className="title">🧮 Magma-aktiviteter per lektion</div>
      <p className="note">Magma är en app med övningsuppgifter och test som du väljer åt eleverna. Länkarna som lagts till på enskilda lektioner samlas här. Lägg till eller ta bort en länk direkt — det uppdaterar automatiskt motsvarande lektionskort.</p>
    </div>
    <p className="muted">{withAct} av {lessons.length} lektioner har en Magma-aktivitet</p>
    {lessons.map((l, i) => {
      const act = getMagma(kapitel, l.id); /* FR-MAG-001: en aktivitet per lektion */
      return (
        <div key={`${l.id}-${i}`} className="upp-card magma">
          <div className="upp-head">
            <b>🧮 Lektion {i + 1} — {effectiveField(kapitel, l, 'avsnitt')}</b>
            <button className="btn sec" onClick={() => onOpenRow(i)}>Öppna lektion →</button>{/* FR-MAG-004 */}
          </div>
          {form?.id === l.id ? (
            <div className="resform">{/* FR-MAG-002 */}
              <input placeholder="Etikett" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <input placeholder="https://magma.se/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <button className="btn" disabled={form.url.trim() === ''}
                onClick={() => { setMagma(kapitel, l.id, { label: form.label, url: form.url }); setForm(null); onChange(); }}>Spara</button>
              <button className="btn sec" onClick={() => setForm(null)}>Avbryt</button>
            </div>
          ) : act ? (
            <div className="film-row">
              <a href={normalizeUrl(act.url)} target="_blank" rel="noopener noreferrer">🔥 {act.label || act.url}</a>
              <button className="btn sec" onClick={() => setForm({ id: l.id, label: act.label, url: act.url })}>✏️ Ändra</button>
              <button className="icon-btn" title="Ta bort" onClick={() => { clearMagma(kapitel, l.id); onChange(); }}>×</button>{/* FR-MAG-003 */}
            </div>
          ) : (
            <span className="muted">Ingen Magma-länk tillagd. <button className="icon-btn addres" onClick={() => setForm({ id: l.id, label: '', url: '' })}>+ Lägg till Magma-länk</button></span>
          )}
        </div>
      );
    })}
  </>);
}

function KlasserTab(props: { lib: LoadedLibrary; kapitel: number; placed: PlacedLesson<LessonRecord>[] }) {
  const { lib, kapitel } = props;
  const active = lib.subject.meta.klasser.filter((c) => !c.arkiverad); // FR-CLS-004: dynamiskt
  const [selected, setSelected] = useState(active[0]?.id ?? '');
  const sel = active.find((c) => c.id === selected) ?? active[0];
  const lessons = composeChapter(kapitel, lib.lessons[kapitel] ?? []);
  const dayName = ['', 'mån', 'tis', 'ons', 'tor', 'fre'];
  const [savedAt, setSavedAt] = useState(0);
  if (!sel) return <p className="muted">Inga aktiva klasser.</p>;
  return (<>
    <div className="cls-cards">{/* FR-CLS-001 */}
      {active.map((c) => (
        <button key={c.id} className={`cls-card ${sel.id === c.id ? 'active' : ''}`} onClick={() => setSelected(c.id)}>
          <b>{c.namn}</b><small>Klass {c.namn} · {c.läsår}</small>
        </button>
      ))}
    </div>
    <p className="muted">Schema {sel.namn}: {(lib.subject.schema[sel.id] ?? []).map((p) => `${dayName[p.day]} ${p.start}–${p.end}`).join(' · ')} · Socrative: {sel.socrative}</p>

    <div className="card">
      <div className="title">🗒 Anteckningar för klass {sel.namn} — Kapitel {kapitel}</div>
      {lessons.map((l, i) => (
        <div key={`${l.id}-${i}`} className="cls-note">
          <label>Lek. {i + 1}: {effectiveField(kapitel, l, 'avsnitt')}</label>
          <textarea key={`${sel.id}-${l.id}`} placeholder={`Anteckningar om ${sel.namn}…`} rows={2}
            defaultValue={getClassNote(sel.id, kapitel, l.id)}
            onBlur={(e) => { setClassNote(sel.id, kapitel, l.id, e.target.value); setSavedAt(Date.now()); }} />{/* FR-CLS-002/003 */}
        </div>
      ))}
      {savedAt > 0 && <p className="status">✓ Anteckningar sparas automatiskt (kvar efter omladdning).</p>}
    </div>
  </>);
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
