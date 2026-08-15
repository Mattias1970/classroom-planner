import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  applyClassEdits, applySchemaEdits, buildBegreppTabell, computeTimes, defaultBamTimeline, diffMinutes,
  grupperaPerAmne,
  mergePromptSources, parseFilmState, parsePrototypeLinks, parseTokenExpiry, promptIdFromName,
  resolveBegrepp,
  summarizePrototypeLinks,
  type FilmStateLink, type PromptTemplate, type PrototypeLink,
  distinctEditedFields, generateSlots, normalizeUrl, placeLessons, summarizeEdits,
  weeksLabel, KAP_COLORS,
  deriveSetup, type SchemaPass,
  type LessonRecord, type PlacedLesson, type ScheduledSlot, type SubjectFile,
} from '@planner/core';
import { SchedulePanel, TimeBand } from '../views/SchemaOchTidsband.js';
import { KlassHanterare } from '../views/KlassHanterare.js';
import { SettingsButton } from '../components/SettingsButton.js';
import { SettingsPanel } from '../components/SettingsPanel.js';
import { SetupGate } from '../components/SetupGate.js';
import { useSetup } from '../state/useSetup.js';
import PROTO_FILMER from '../data/prototyp-filmer.json';
import PROMPT_LEKTIONSGEN from '../data/prompter/lektionsgenerator.md?raw';
import PROMPT_BOKIMPORT from '../data/prompter/bokimport.md?raw';
import { BokBibliotek } from '../views/BokBibliotek.js';
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
  getClassEdits, getClassNote, setClassNote, lsGet, lsSet,
  deleteCustomPrompt, getCustomPrompts, saveCustomPrompt,
  deleteVariant, getCacheInfo, getTokenExpiryHeader, getVariants,
  saveAsVariant, setActiveVariant, setVariantField,
  type LessonLink, type ToolTyp,
} from '../state/store.js';
import { Docx } from './wordExport.js';
import './styles.css';

const SuperTeachPanel = lazy(() => import('../features/superteach/SuperTeachPanel.js'));
const FLAG = 'classroom-planner.superteach.enabled';

type Tab = 'arsoversikt' | 'planering' | 'kalender' | 'klasser' | 'bibliotek' | 'superteach';
const TABS: Array<[Tab, string]> = [
  ['arsoversikt', 'Årsöversikt'], ['planering', 'Planering'], ['kalender', 'Kalender'],
  ['klasser', 'Klasser'], ['bibliotek', 'Bibliotek'], ['superteach', 'SuperTeach'],
];

export default function App() {
  const [lib, setLib] = useState<LoadedLibrary>(demoLibrary);
  const [tab, setTab] = useState<Tab>('arsoversikt');
  const [inner, setInner] = useState<InnerTab>('lektionsplan');
  const [classId, setClassId] = useState('8B');
  const [kapitel, setKapitel] = useState(1);
  const [tick, bump] = useState(0);
  const refresh = () => bump((t) => t + 1);
  const stOn = lsGet(FLAG) === 'true';
  const [showEdits, setShowEdits] = useState(false); // FR-EDIT-008

  // FR-SCH + FR-CM: lokala schema- och klassändringar appliceras ovanpå datakällan
  const libEff = useMemo<LoadedLibrary>(
    () => ({ ...lib, subject: applyClassEdits(applySchemaEdits(lib.subject, getSchemaEdits()), getClassEdits()) }),
    [lib, tick],
  );
  useEffect(() => { // Krav 4: token används automatiskt vid start; krav 3 gör starten snabb
    if (getSettings().githubToken === '') return;
    let cancelled = false;
    void loadFromGithub().then(
      (l) => { if (!cancelled) setLib(l); },
      () => { /* behåll demo; Bibliotek visar fel/tokenstatus */ },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mobile = useMobile(); // FR-MOB-001/010
  const [screenSize, setScreenSize] = useScreenSize(); // FR-MOB-005…007
  const [sizeModal, setSizeModal] = useState(false);
  const [classMgr, setClassMgr] = useState(false); // FR-CM-001
  const [settingsOpen, setSettingsOpen] = useState(false); // Del 9: kugghjulspanel
  // Del 9: initieringstillstånd per planering (slug), spärr via canCreateOverview
  const { setup, validation, uppdatera } = useSetup(`cp.setup.v1.${getSettings().slug}`);
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
  // Del 9/11: befintlig komplett data (t.ex. Prio 8) häver spärren automatiskt —
  // men bara i ett ORÖRT setup. Så fort användaren själv ändrat något (t.ex.
  // bytt ämne) skriver härledningen aldrig över; wizarden gäller.
  const deriveFromSource = useMemo(() => () => {
    const klassNamn = libEff.subject.meta.klasser.find((c) => c.id === safeClassId)?.namn ?? safeClassId;
    return deriveSetup({
      lasarStart: libEff.subject.läsår.startdatum[0],
      klass: klassNamn,
      amne: libEff.subject.meta.ämne,
      amnesschema: (libEff.subject.schema[safeClassId] ?? []).map((p) => ({
        veckodag: p.day as SchemaPass['veckodag'], start: p.start, slut: p.end,
      })),
      bokTitel: libEff.subject.meta.lärobok,
    });
  }, [libEff, safeClassId]);
  useEffect(() => {
    if (Object.keys(setup).length > 0) return; // orört setup krävs — rör aldrig användarens val
    const derived = deriveFromSource();
    if (derived) uppdatera(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deriveFromSource, setup]);
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
        <SettingsButton isOpen={settingsOpen} onClick={() => setSettingsOpen(true)} />{/* Del 9 */}
      </header>

      <SetupGate setup={setup} onOppnaInitiering={() => setSettingsOpen(true)}>{/* Del 9: spärren */}
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
      </SetupGate>
      {tab === 'klasser' && <KlasserView subject={libEff.subject} />}
      {tab === 'bibliotek' && <BibliotekView lib={libEff} onLoaded={(l) => { setLib(l); refresh(); }} onChange={refresh} />}
      {tab === 'superteach' && stOn && (
        <Suspense fallback={<main className="main"><p>Laddar SuperTeach…</p></main>}>
          <SuperTeachPanel
            students={['elev-8B-01', 'elev-8B-02', 'elev-8B-03', 'elev-8B-04']}
            subject={libEff.subject.meta.ämne.toLowerCase()}
          />
        </Suspense>
      )}
      {settingsOpen && (/* Del 9: samlad inställningspanel från kugghjulet */
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          setup={setup}
          validation={validation}
          uppdateraSetup={uppdatera}
          onHamtaFranDatakallan={() => { const d = deriveFromSource(); if (d) uppdatera(d); }}
          version="utveckling · del 11"
          renderDatakalla={() => <DatakallaSektion onOppnaBibliotek={() => { setTab('bibliotek'); setSettingsOpen(false); }} />}
          renderKlasser={() => (
            <div className="modal-actions">
              <button className="btn" onClick={() => { setClassMgr(true); setSettingsOpen(false); }}>⚙ Hantera klasser</button>
              <button className="btn sec" onClick={() => { setTab('klasser'); setSettingsOpen(false); }}>Öppna klassvyn</button>
            </div>
          )}
          renderUtseende={() => (
            <div>
              <div className="modal-actions">
                <button className="btn" onClick={() => { setSizeModal(true); setSettingsOpen(false); }}>📱 Skärmstorlek</button>
              </div>
              <p className="note">Teman kommer i en senare del.</p>
            </div>
          )}
          renderBackup={() => <InstallningarInnehall onChange={refresh} />}
        />
      )}

      {mobile && (
        <BottomNav tab={tab} kapitel={kapitel} chapters={chapters}
          onTab={(t) => setTab(t)} onKapitel={(k) => { setKapitel(k); setInner('lektionsplan'); setTab('planering'); }}
          extra={[['planering', '📋 Planering'], ['klasser', '🏫 Klasser'], ['bibliotek', '📚 Bibliotek'], ['installningar', '⚙ Inställningar']]}
          onExtra={(t) => { if (t === 'installningar') { setSettingsOpen(true); } else { setTab(t as Tab); } }} />
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
/** Begrepp för lektionen: redigerat fält → eget fält → delkapitlets lista. */
function effBegrepp(kapitel: number, lesson: LessonRecord, perDelkapitel: Record<string, string[]>): string[] {
  return resolveBegrepp(
    effectiveField(kapitel, lesson, 'begrepp'),
    effectiveField(kapitel, lesson, 'avsnitt'),
    lesson.del, perDelkapitel,
  );
}

/** Bokens länkar med inbyggd filmfallback (prototypens 55) — dedupe på url. */
const SEED_LINKS: Record<string, Array<{ titel: string; url: string }>> = PROTO_FILMER as never;
function bookLinksFor(lib: LoadedLibrary, kapitel: number, lektionId: number): import('@planner/core').BookLink[] {
  const fromData = lib.lankar[`${kapitel}-${lektionId}`] ?? [];
  const urls = new Set(fromData.map((l) => l.url));
  const fromSeed = (SEED_LINKS[`${kapitel}-${lektionId}`] ?? [])
    .filter((f) => !urls.has(f.url))
    .map((f) => ({ typ: 'film' as const, platform: 'Binogi', titel: f.titel, url: f.url }));
  return [...fromData, ...fromSeed];
}

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
                  perDelkapitel={lib.begrepp.perDelkapitel}
                  bookLinks={bookLinksFor(lib, kapitel, l.id)}
                  override={placed[globalIdxFor(kapitel, i)]?.override}
                  flip={lib.flip[kapitel]?.[l.id]} onChange={onChange}
                  onAddAfter={() => setAddAfter(l.id)} />
              </div>
            ))}
          </div>
        </div>
        {pullHint !== null && ( /* Fig 36 · FR-MOB-008 */
          <div className="pull-hint" style={{ opacity: pullHint / 140 }}>
            <span className="pull-pill">⬇ Fortsätt för Kapitel {allChapters[allChapters.indexOf(kapitel) + 1]}: {lib.subject.kapitelMeta[String(allChapters[allChapters.indexOf(kapitel) + 1])]?.name ?? ''}</span>
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
  const rows = buildBegreppTabell(
    lessons.map((l) => ({ ...l, begrepp: effBegrepp(kapitel, l, lib.begrepp.perDelkapitel).join(', ') || '—' })),
    lib.begrepp.definitioner,
  );
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
    const fromBook = bookLinksFor(lib, kapitel, l.id)
      .filter((b) => b.typ === 'film')
      .map((b) => ({ titel: b.titel, url: b.url, fixed: true }));
    const fromFlip = [...fromBook, ...(flip?.blocks ?? []).flatMap((b) => (b.typ === 'film' ? [{ titel: b.ref.titel, url: b.ref.url, fixed: true }] : []))];
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


function LessonCard(props: {
  kapitel: number; lesson: LessonRecord; slot: ScheduledSlot | null;
  globalIdx: number; classId: string; socRoom: string; defs: Record<string, string>;
  perDelkapitel: Record<string, string[]>;
  bookLinks: import('@planner/core').BookLink[];
  override?: import('@planner/core').LessonOverride;
  flip?: import('@planner/core').FlipDoc; onChange: () => void; onAddAfter: () => void;
}) {
  const { kapitel, lesson, slot, globalIdx, classId, socRoom, defs, perDelkapitel, bookLinks, override, flip, onChange, onAddAfter } = props;
  const har = (v: string) => !!v && v !== '—';
  const begreppList = effBegrepp(kapitel, lesson, perDelkapitel);
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
          Lektion {lesson.id} ·{' '}
          <span className="inline-wrap"><Editable kapitel={kapitel} lesson={lesson} field="avsnitt" onChange={onChange} /></span>
          {flip && <span className="pill flip">Flippat</span>}
          <span className="pill teori">📖 Teorisidor:{' '}
            <span className="inline-wrap sm"><Editable kapitel={kapitel} lesson={lesson} field="sidor_teori" onChange={onChange} /></span></span>
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

      {(() => { /* Krav 2: original eller namngiven variant av samma lektionsnummer */
        const v = getVariants(kapitel, lesson.id);
        const names = Object.keys(v.varianter);
        const baseEdited = isEdited(kapitel, lesson.id, 'genomgang') || getOverrides().some((o) => o.kapitel === kapitel && o.lektionId === lesson.id);
        return (
          <div className="variant-row no-print">
            <label>Version:</label>
            <select value={v.active ?? ''} onChange={(e) => { setActiveVariant(kapitel, lesson.id, e.target.value || null); onChange(); }}>
              <option value="">Original{baseEdited ? ' (redigerad)' : ''}</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="icon-btn addres" title="Spara aktuellt läge som ny variant"
              onClick={() => {
                const namn = window.prompt('Namn på varianten (t.ex. Stödgrupp, Snabbare tempo):', 'Variant');
                if (namn) { saveAsVariant(kapitel, lesson.id, namn.trim()); onChange(); }
              }}>💾 Spara som variant…</button>
            {v.active !== null && (
              <button className="icon-btn" title="Ta bort varianten"
                onClick={() => { if (window.confirm(`Ta bort varianten "${v.active}"?`)) { deleteVariant(kapitel, lesson.id, v.active!); onChange(); } }}>🗑</button>
            )}
            {v.active !== null && <span className="pill src-egen">Redigeringar sparas i varianten</span>}
          </div>
        );
      })()}

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
                  {seg.kind === 'work' && ( /* fig 11: nivåintervall i segmentet */
                    <i className="seg-levels">{[
                      har(effectiveField(kapitel, lesson, 'grön')) && `Grön ${effectiveField(kapitel, lesson, 'grön')}`,
                      har(effectiveField(kapitel, lesson, 'blå')) && `Blå ${effectiveField(kapitel, lesson, 'blå')}`,
                      har(effectiveField(kapitel, lesson, 'röd')) && `Röd ${effectiveField(kapitel, lesson, 'röd')}`,
                    ].filter(Boolean).join(' · ')}</i>
                  )}
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

        <label>Begrepp</label>{/* FR-CARD-008 — härledda + redigerbara */}
        <div>
          {begreppList.length > 0 && (
            <div className="reslist">
              {begreppList.map((b) => (
                <span key={b} className="chip" title={defs[b.toLowerCase()] ?? defs[b] ?? 'Definition saknas'}>{b}</span>
              ))}
            </div>
          )}
          <Editable kapitel={kapitel} lesson={lesson} field="begrepp" onChange={onChange} />
          <p className="note">Kommaseparerat. Tomt eller "—" hämtar delkapitlets begreppslista automatiskt; egna ändringar slår igenom i begreppsfliken, läxan och årsöversiktens räknare.</p>
        </div>

        {(har(effectiveField(kapitel, lesson, 'grön')) || har(effectiveField(kapitel, lesson, 'blå')) || har(effectiveField(kapitel, lesson, 'röd'))) && (
          <div className="work-block">{/* Fig 12 · FR-CARD-009/010/011 */}
            <div className="work-head">
              ✏️ {segFor('work') && <b>{segFor('work')!.from}–{segFor('work')!.to}</b>} · ARBETE
              {har(lesson.sidor_teori) && <> · 📖 SID {lesson.sidor_teori}</>}
            </div>
            {lesson.del > 0 && (
              <p className="work-intro">
                <b>Lektion {lesson.del} av 2 — {effectiveField(kapitel, lesson, 'avsnitt')}</b><br />
                {lesson.del === 1
                  ? <>Alla börjar med <span className="rg grön">Gröna</span> uppgifter (introduktion, obligatorisk). Fortsätt med <span className="rg blå">Blå</span> om du är klar med gröna.</>
                  : <>Minimum: gör klart <span className="rg blå">Blå</span> (E-nivå). Fortsätt med <span className="rg röd">Röda</span> för fördjupning mot C/A-nivå.</>}
              </p>
            )}
            <div className="upp-levels">
              {har(effectiveField(kapitel, lesson, 'grön')) && (
                <div className="upp-lv grön"><h6>🟢 GRÖN – INTRODUKTION</h6>
                  <p>Uppg. <span className="inline-wrap sm"><Editable kapitel={kapitel} lesson={lesson} field="grön" onChange={onChange} /></span></p>
                  <small>Alla elever · Obligatorisk</small>
                  {lesson.del === 1 && <span className="pill min">Minimum lektion 1</span>}</div>
              )}
              {har(effectiveField(kapitel, lesson, 'blå')) && (
                <div className="upp-lv blå"><h6>🔵 BLÅ – E-NIVÅ</h6>
                  <p>Uppg. <span className="inline-wrap sm"><Editable kapitel={kapitel} lesson={lesson} field="blå" onChange={onChange} /></span></p>
                  <small>{lesson.del === 1 ? 'När grön är klar · Obligatorisk' : 'Alla elever · Obligatorisk'}</small>
                  {lesson.del === 2 && <span className="pill min">Minimum lektion 2</span>}</div>
              )}
              {har(effectiveField(kapitel, lesson, 'röd')) && (
                <div className="upp-lv röd"><h6>🔴 RÖD – C/A-NIVÅ</h6>
                  <p>Uppg. <span className="inline-wrap sm"><Editable kapitel={kapitel} lesson={lesson} field="röd" onChange={onChange} /></span></p>
                  <small>Frivillig · görs om lektionstid finns</small></div>
              )}
            </div>
            <p className="note">📷 <b>Inlämning via Google Classroom.</b> Fotografera beräkningarna och ladda upp i Classroom. <b>Minst gröna och blå uppgifter</b> ska laddas upp — det är obligatoriskt. Röda uppgifter är frivilliga. Det som inte hinns med görs klart hemma eller på stödtid och lämnas sedan in.</p>
          </div>
        )}

        {/* Fig 14 · FR-CARD-013 */}
        <div className="laxa-block">
          <div className="laxa-head">📚 LÄXA</div>
          {begreppList.length > 0 && (<>
            <p><b>Begrepp att kunna inför nästa lektions läxförhör:</b></p>
            <div className="reslist">
              {begreppList.map((b) => <span key={b} className="chip" title={defs[b.toLowerCase()] ?? defs[b] ?? 'Definition saknas'}>{b}</span>)}
            </div>
          </>)}
          <Editable kapitel={kapitel} lesson={lesson} field="laxa" onChange={onChange} />
          <p className="note">Gröna och blå uppgifter ska vara klara och inlämnade via Google Classroom innan nästa lektion om de ej gjorts på lektionstid.</p>
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

      <ResourceRow kapitel={kapitel} lesson={lesson} links={links} flipCount={flipCount}
        bookLinks={bookLinks} onChange={onChange} />
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

function AddLessonDialog(props: {
  kapitel: number; lessons: LessonRecord[]; onClose: () => void; initialAfterId?: number;
  insertGlobalIdx?: number;
}) {
  const { kapitel, lessons, onClose, initialAfterId, insertGlobalIdx } = props;
  const afterId = initialAfterId ?? lessons[lessons.length - 1]?.id ?? null;
  const source = lessons.find((l) => l.id === afterId) ?? null;
  const srcIdx = source ? lessons.findIndex((l) => l.id === source.id) : -1;
  const next = srcIdx >= 0 ? lessons[srcIdx + 1] ?? null : null;

  const blank = (id: number): LessonRecord => ({
    id, type: source?.type ?? 'regular', avsnitt: 'Ny lektion', del: 0,
    grön: '—', blå: '—', röd: '—', sidor_teori: '—', begrepp: '—', soc_start: '—', exit: '—',
    genomgang: '', bam_gora: '', bam_lara: '', bam_ex: '', ex: '', laxa: '—',
  });

  const finish = () => { /* FR-STR-005: håll kalenderöverstyrningar i synk */
    if (insertGlobalIdx !== undefined) shiftAllCalOverrides(insertGlobalIdx + 1, 1);
    onClose();
  };

  const addBlank = () => { /* FR-STR-002 */
    addCustomLesson({ kapitel, afterId, mode: 'skjut-fram', lesson: blank(nextCustomId(lessons)) });
    finish();
  };
  const addCopy = () => { /* FR-STR-003: djupkopiera föregående */
    if (!source) return;
    addCustomLesson({ kapitel, afterId, mode: 'skjut-fram', lesson: { ...source, id: nextCustomId(lessons) } });
    finish();
  };
  const pullNext = () => { /* FR-STR-004: nästa lektions innehåll hit; donatorn blir tomt skal */
    if (!source || !next) return;
    const id1 = nextCustomId(lessons);
    addCustomLesson({ kapitel, afterId, mode: 'skjut-fram', lesson: { ...next, id: id1 } });
    addCustomLesson({ kapitel, afterId: next.id, mode: 'ersätt', lesson: { ...blank(id1 + 1), avsnitt: 'Tomt skal (flyttad)' } });
    finish();
  };

  return (
    <div className="overlay" role="dialog" aria-label="Lägg till lektion" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Lägg till lektion efter "Lektion {srcIdx + 1} — {source?.avsnitt ?? '—'}"</h3>
        {next && <p className="muted">Nästa lektion är just nu "Lektion {srcIdx + 2} — {next.avsnitt}".</p>}
        <div className="ins-modes">{/* FR-STR-001 */}
          <button className="ins-mode" onClick={addBlank}>
            <b>📄 Tomt innehåll</b>
            <span>Skapa en ny, tom lektion som du fyller i själv.</span>
          </button>
          <button className="ins-mode" onClick={addCopy} disabled={!source}>
            <b>📋 Samma som föregående</b>
            <span>Kopiera hela innehållet från lektionen du utgick ifrån, redigera sedan det som skiljer.</span>
          </button>
          {next && (
            <button className="ins-mode warn" onClick={pullNext}>
              <b>⏩ Flytta in nästa lektion hit</b>
              <span>Innehållet i lektionen som annars hade legat direkt efter flyttas in i den nya platsen. Den lektionen blir då ett tomt skal.</span>
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn sec" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}

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


/** Höjden följer innehållet så att all text alltid syns (även vid utskrift). */
function autoGrow(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
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
      if (getVariants(kapitel, lesson.id).active !== null) setVariantField(kapitel, lesson.id, field, v); // krav 2
      else setField(kapitel, lesson.id, field, v);
      setFlash(true); setTimeout(() => setFlash(false), 1500);
      onChange();
    }
  };
  return (
    <span className={`edit-wrap ${edited ? 'has-edit' : ''}`}>
      {multiline
        ? <textarea key={value} className="inline-edit grow" defaultValue={value} rows={rows ?? 2}
            ref={autoGrow} onInput={(e) => autoGrow(e.currentTarget)} onBlur={(e) => commit(e.target)} />
        : <input key={value} className="inline-edit" defaultValue={value} onBlur={(e) => commit(e.target)} />}
      {flash && <span className="saved-flash">✓ Sparat</span>}
      {edited && !flash && (
        <button className="restore-btn" title="Återställ original"
          onClick={() => { clearField(kapitel, lesson.id, field); onChange(); }}>↩ Återställ original</button>
      )}{/* FR-EDIT-005 */}
    </span>
  );
}

function ResourceRow(props: {
  kapitel: number; lesson: LessonRecord; links: LessonLink[]; flipCount: number;
  bookLinks: import('@planner/core').BookLink[]; onChange: () => void;
}) {
  const { kapitel, lesson, links, flipCount, bookLinks, onChange } = props;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<LessonLink>({ typ: 'film', platform: 'Binogi', titel: '', url: '' });
  const ICON: Record<ToolTyp, string> = { laxforhor: '📱', exit: '🎫', ovning: '✏️', film: '🎬', prov: '📝', flippat: '🏠' };
  const CATS: Array<[ToolTyp, string, string]> = [ /* FR-TOOL-001: specens sex typer */
    ['laxforhor', 'Läxförhör', 'Quiz som körs i början av lektionen (tidigare exit tickets + begrepp)'],
    ['exit', 'Exit ticket', 'Kort test i slutet: ca 5 frågor på lektionens koncept + nya begrepp'],
    ['ovning', 'Övningar', 'Extra övningar och interaktiva uppgifter'],
    ['film', 'Filmer', 'Genomgångsfilmer och stödmaterial'],
    ['prov', 'Prov', 'Prov och större bedömningar'],
    ['flippat', 'Flippat underlag', 'Text, video och quiz som skickas till elever inför lektionen'],
  ];
  return (
    <div className="resources">
      <label>Pedagogiska verktyg</label>
      <div className="toolgroups">{/* FR-TOOL-001: sex grupper, alltid synliga */}
        {CATS.map(([typ, label, desc]) => (
          <div key={typ} className="toolgroup">
            <div className="toolgroup-head">
              <h6>{ICON[typ]} {label}</h6>
              <button className="icon-btn addres" onClick={() => { setForm({ typ, platform: PLATFORMS[typ][0], titel: '', url: '' }); setAdding(true); }}>+ Lägg till</button>
            </div>
            <p className="tool-desc">{desc}</p>
            <div className="reslist">
              {bookLinks.map((b, i) => b.typ === typ && (
                <span key={`bok-${i}`} className={`reslink ${b.typ}`} title="Ur bokens datakälla">
                  <em className="plat">{(b.platform ?? 'BOK').toUpperCase()}</em>
                  <a href={normalizeUrl(b.url)} target="_blank" rel="noopener noreferrer">{b.titel || b.url}</a>
                </span>
              ))}
              {links.map((l, i) => l.typ === typ && (
                <span key={`${l.url}-${i}`} className={`reslink ${l.typ}`}>
                  {l.platform && <em className="plat">{l.platform.toUpperCase()}</em>}
                  {l.url
                    ? <a href={normalizeUrl(l.url)} target="_blank" rel="noopener noreferrer">{l.titel || l.url}</a>
                    : <span>{l.titel}</span>}{/* FR-TOOL-004/005 */}
                  {i >= flipCount && (
                    <button className="icon-btn" title="Ta bort" onClick={() => { removeLink(kapitel, lesson.id, i - flipCount); onChange(); }}>×</button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <MagmaRow kapitel={kapitel} lesson={lesson} onChange={onChange} />
      <PrioBlock kapitel={kapitel} lesson={lesson} onChange={onChange} />
      {adding && (
        <div className="overlay" role="dialog" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Lägg till: {ICON[form.typ]} {CATS.find(([t]) => t === form.typ)?.[1]}</h3>
            <label>Plattform</label>{/* FR-TOOL-002 */}
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {PLATFORMS[form.typ].map((pf) => <option key={pf} value={pf}>{pf}</option>)}
            </select>
            <label>Titel / beskrivning</label>
            <input placeholder="t.ex. Quiz 1.1a eller Negativa tal — genomgång" value={form.titel}
              onChange={(e) => setForm({ ...form, titel: e.target.value })} />
            <label>Länk (valfri)</label>
            <input placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <div className="modal-actions">
              <button className="btn sec" onClick={() => setAdding(false)}>Avbryt</button>
              <button className="btn" disabled={form.titel.trim() === '' && form.url.trim() === ''}
                onClick={() => { addLink(kapitel, lesson.id, form); setAdding(false); onChange(); }}>Lägg till</button>{/* FR-TOOL-003 */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MagmaRow(props: { kapitel: number; lesson: LessonRecord; onChange: () => void }) {
  const { kapitel, lesson, onChange } = props;
  const act = getMagma(kapitel, lesson.id);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(act?.label ?? '');
  const [url, setUrl] = useState(act?.url ?? '');
  return (
    <div className="magma-row">
      <label>🧮 Magma</label>
      {!editing && (act
        ? <span className="reslink ovning"><em className="plat">MAGMA</em>
            <a href={normalizeUrl(act.url)} target="_blank" rel="noopener noreferrer">{act.label || act.url}</a>
            <button className="icon-btn" title="Ändra" onClick={() => { setLabel(act.label); setUrl(act.url); setEditing(true); }}>✏️</button>
            <button className="icon-btn" title="Ta bort" onClick={() => { clearMagma(kapitel, lesson.id); onChange(); }}>×</button>
          </span>
        : <span className="muted">Ingen Magma-länk tillagd. <button className="icon-btn addres" onClick={() => setEditing(true)}>+ Lägg till Magma-länk</button></span>)}
      {editing && (
        <span className="resform">
          <input placeholder="Etikett, t.ex. Negativa tal — övning" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input placeholder="https://magma.se/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" disabled={url.trim() === ''} onClick={() => { setMagma(kapitel, lesson.id, { label, url }); setEditing(false); onChange(); }}>Spara</button>
          <button className="btn sec" onClick={() => setEditing(false)}>Avbryt</button>
        </span>
      )}
    </div>
  );
}

function PrioBlock(props: { kapitel: number; lesson: LessonRecord; onChange: () => void }) {
  const { kapitel, lesson, onChange } = props;
  const state = getPrio(kapitel, lesson.id);
  const toggle = (room: string) => {
    const cur = state[room] ?? { active: false, desc: '' };
    setPrio(kapitel, lesson.id, { ...state, [room]: { ...cur, active: !cur.active } });
    onChange();
  };
  const setDesc = (room: string, desc: string) => {
    const cur = state[room] ?? { active: true, desc: '' };
    setPrio(kapitel, lesson.id, { ...state, [room]: { ...cur, desc } });
    onChange();
  };
  return (
    <div className="prio-block">
      <label>🚪 Prio Övningsrum</label>
      <div className="prio-rooms">
        {PRIO_ALL.map((room) => {
          const r = state[room];
          return (
            <span key={room} className="prio-room">
              <button className={`prio-pill ${r?.active ? 'on' : ''}`} onClick={() => toggle(room)}>{room}</button>
              {r?.active && (
                <input className="prio-desc" placeholder="Vad innehåller rummet? (t.ex. Uppgifter 1.1–1.3 repetition)"
                  defaultValue={r.desc} onBlur={(e) => setDesc(room, e.target.value)} />
              )}
            </span>
          );
        })}
      </div>
      <p className="note">Klicka ett rum för att aktivera det och lägg till beskrivning.</p>
    </div>
  );
}

const PLATFORMS: Record<ToolTyp, string[]> = { /* FR-TOOL-002 */
  laxforhor: ['Socrative', 'Google Forms', 'Kunskapsmatrisen', 'Annat'],
  exit: ['Socrative', 'Google Forms', 'Annat'],
  ovning: ['Magma', 'Kunskapsmatrisen', 'NOMP', 'Annat'],
  film: ['Binogi', 'YouTube', 'Egen inspelning', 'Annat'],
  prov: ['Kunskapsmatrisen', 'Papper', 'Annat'],
  flippat: ['Google Classroom', 'YouTube', 'Socrative', 'Annat'],
};

// ── Bibliotek: datakällor + wizard (sprint 20/22/24-om) ───────
// ── Promptbibliotek (inbyggda + datakällans + egna varianter) ─
const INBYGGDA_PROMPTER: PromptTemplate[] = [{
  id: 'lektionsgenerator',
  namn: 'Lektionsgenerator (agentteam)',
  beskrivning: 'Skapar komplett lektionsplanering ur 10 boksidor åt gången: Binogi-filmer, genomgångsexempel, flippat underlag, Socrative-quiz (Excel) och NotebookLM-filmprompt. Utdata i appens fältformat.',
  innehall: PROMPT_LEKTIONSGEN,
  kalla: 'inbyggd',
  amne: 'Matematik',
}, {
  id: 'bokimport',
  namn: 'Bokimport (valfritt ämne)',
  beskrivning: 'Bygger en boks lektionsstruktur ur fotograferade boksidor och levererar JSON-filen som importeras under Böcker. Fungerar för alla ämnen.',
  innehall: PROMPT_BOKIMPORT,
  kalla: 'inbyggd',
}];

function PromptBibliotek(props: { lib: LoadedLibrary; onChange: () => void }) {
  const { lib, onChange } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<PromptTemplate | null>(null);
  const [msg, setMsg] = useState('');
  const all = mergePromptSources(INBYGGDA_PROMPTER, lib.prompter, getCustomPrompts());
  const KALLA_LABEL = { inbyggd: 'Inbyggd', datakalla: 'Datakälla', egen: 'Egen' } as const;

  const copyText = (t: string) => {
    void navigator.clipboard?.writeText(t).then(
      () => setMsg('✓ Prompten kopierad — klistra in i en ny chatt tillsammans med boksidorna.'),
      () => setMsg('✗ Kunde inte kopiera — markera texten och kopiera manuellt.'),
    );
  };
  const download = (p: PromptTemplate) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([p.innehall], { type: 'text/markdown' }));
    a.download = `${p.id}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const saveAsNew = (source: PromptTemplate) => {
    const namn = window.prompt('Namn på den nya prompten:', `${source.namn} (variant)`);
    if (!namn) return;
    const beskrivning = window.prompt('Beskrivning (vad ska den göra?):', source.beskrivning) ?? '';
    const id = promptIdFromName(namn, all.map((x) => x.id));
    saveCustomPrompt({ id, namn, beskrivning, innehall: source.innehall, kalla: 'egen' });
    setMsg(`✓ "${namn}" sparad som egen prompt.`); setOpenId(id); onChange();
  };

  return (
    <div className="card">
      <div className="title">📜 Promptbibliotek</div>
      <p className="note">Promptmallar för AI-genererat lektionsinnehåll, indelade per ämne. Inbyggda följer appen och kan inte försvinna; lägg en prompter/-katalog i datakällan för att uppdatera utan appsläpp; egna varianter sparas i webbläsaren och ingår i backupen.</p>
      {grupperaPerAmne(all).map(([amne, prompter]) => (<div key={amne}>
      <h4 className="cm-h">{amne.toUpperCase()}</h4>
      {prompter.map((p) => (
        <div key={`${p.kalla}-${p.id}`} className="prompt-row">
          <div className="prompt-head" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
            <b>{p.namn}</b>
            <span className={`pill src-${p.kalla}`}>{KALLA_LABEL[p.kalla]}</span>
            <span className="muted">{p.beskrivning}</span>
          </div>
          {openId === p.id && (
            <div className="prompt-body">
              {edit?.id === p.id ? (<>
                <input value={edit.namn} onChange={(e) => setEdit({ ...edit, namn: e.target.value })} />
                <input placeholder="Beskrivning" value={edit.beskrivning}
                  onChange={(e) => setEdit({ ...edit, beskrivning: e.target.value })} />
                <textarea rows={16} value={edit.innehall}
                  onChange={(e) => setEdit({ ...edit, innehall: e.target.value })} />
                <div className="modal-actions">
                  <button className="btn sec" onClick={() => setEdit(null)}>Avbryt</button>
                  <button className="btn" disabled={edit.namn.trim() === '' || edit.innehall.trim() === ''}
                    onClick={() => { saveCustomPrompt(edit); setEdit(null); setMsg('✓ Uppdaterad.'); onChange(); }}>Spara</button>
                </div>
              </>) : (<>
                <textarea rows={12} readOnly value={p.innehall} />
                <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn" onClick={() => copyText(p.innehall)}>⧉ Kopiera</button>
                  <button className="btn sec" onClick={() => download(p)}>⬇ Ladda ner .md</button>
                  <button className="btn sec" onClick={() => saveAsNew(p)}>💾 Spara som ny…</button>
                  {p.kalla === 'egen' && (<>
                    <button className="btn sec" onClick={() => setEdit(p)}>✎ Redigera</button>
                    <button className="btn warn" onClick={() => {
                      if (window.confirm(`Ta bort "${p.namn}"?`)) { deleteCustomPrompt(p.id); setMsg('✓ Borttagen.'); onChange(); }
                    }}>🗑 Ta bort</button>
                  </>)}
                </div>
                {p.uppdaterad && <p className="muted">Uppdaterad {p.uppdaterad.slice(0, 16).replace('T', ' ')}</p>}
              </>)}
            </div>
          )}
        </div>
      ))}
      </div>))}
      {msg && <p className="status">{msg}</p>}
    </div>
  );
}

// ── Import av filmlänkar ur HTML-prototypen ──────────────────
function PrototypImportCard(props: { lib: LoadedLibrary; onChange: () => void }) {
  const { lib, onChange } = props;
  const [parsed, setParsed] = useState<FilmStateLink[] | null>(null);
  const [msg, setMsg] = useState('');

  const importFilms = (films: FilmStateLink[], källa: string) => {
    let added = 0, skipped = 0, unmatched = 0;
    for (const f of films) {
      const exists = (lib.lessons[f.kapitel] ?? []).some((l) => l.id === f.lektionId);
      if (!exists) { unmatched++; continue; }
      const dup = getLinks(f.kapitel, f.lektionId).some((x) => x.url === f.url);
      const dupFlip = (lib.flip[f.kapitel]?.[f.lektionId]?.blocks ?? [])
        .some((b) => b.typ === 'film' && b.ref.url === f.url);
      const dupBook = bookLinksFor(lib, f.kapitel, f.lektionId).some((b) => b.url === f.url);
      if (dup || dupFlip || dupBook) { skipped++; continue; }
      addLink(f.kapitel, f.lektionId, {
        typ: 'film',
        platform: f.url.includes('binogi') ? 'Binogi' : f.url.includes('youtu') ? 'YouTube' : 'Annat',
        titel: f.titel, url: f.url,
      });
      added++;
    }
    setMsg(`✓ ${added} filmer importerade från ${källa}${skipped ? `, ${skipped} fanns redan` : ''}${unmatched ? `, ${unmatched} matchade ingen lektion i aktuell datakälla` : ''}. Socrative-quizzen (läxförhör/exit) finns redan i lektionsdatan och behöver inte importeras.`);
    setParsed(null);
    onChange();
  };

  const seed = PROTO_FILMER as Record<string, Array<{ titel: string; url: string }>>;
  const seedFilms: FilmStateLink[] = Object.entries(seed).flatMap(([key, list]) => {
    const [kap, id] = key.split('-').map(Number);
    return list.map((x) => ({ kapitel: kap, lektionId: id, titel: x.titel, url: x.url }));
  });

  return (
    <div className="card">
      <div className="title">🎬 Filmer från HTML-prototypen</div>
      <p className="note">Prototypens {seedFilms.length} bekräftade Binogi-filmer (32 lektioner, kap 1–5) finns inbyggda — importera med ett klick. Du kan också ladda upp en annan version av HTML-filen. Dubbletter hoppas alltid över, så importen är säker att köra om.</p>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" onClick={() => importFilms(seedFilms, 'inbyggda listan')}>
          ⬇ Importera prototypens {seedFilms.length} filmer
        </button>
        <label className="btn sec file-btn">⬆ …eller välj HTML-fil
          <input type="file" accept=".html,.htm,text/html" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then((t) => {
                const exact = parseFilmState(t); // verklig struktur: exakta lektionsadresser
                if (exact.length > 0) { setParsed(exact); setMsg(''); return; }
                // Fallback: länk-heuristik via delkapitelrubriker
                const rough = parsePrototypeLinks(t).filter((l) => l.typ === 'film');
                const mapped: FilmStateLink[] = rough.flatMap((l) => {
                  const kap = Number(l.delkapitel.split('.')[0]);
                  const lesson = (lib.lessons[kap] ?? []).find((x) => x.avsnitt.startsWith(l.delkapitel));
                  return lesson ? [{ kapitel: kap, lektionId: lesson.id, titel: l.titel, url: l.url }] : [];
                });
                setParsed(mapped);
                setMsg(mapped.length === 0 ? '✗ Inga filmlänkar hittades i filen.' : '');
              });
              e.target.value = '';
            }} />
        </label>
      </div>
      {parsed && (() => {
        const sum = summarizePrototypeLinks(parsed.map((f) => ({ delkapitel: `${f.kapitel}.0`, typ: 'film' as const, titel: f.titel, url: f.url })));
        return (
          <div className="proto-preview">
            <p><b>Hittade i filen:</b> {parsed.length} filmer</p>
            <p className="muted">{Object.entries(sum.perKapitel).map(([k, v]) => `Kap ${k}: ${v.filmer}`).join(' · ')}</p>
            <div className="modal-actions">
              <button className="btn sec" onClick={() => setParsed(null)}>Avbryt</button>
              <button className="btn" onClick={() => importFilms(parsed, 'filen')}>Importera {parsed.length} filmer</button>
            </div>
          </div>
        );
      })()}
      {msg && <p className="status">{msg}</p>}
    </div>
  );
}

function BibliotekView(props: { lib: LoadedLibrary; onLoaded: (l: LoadedLibrary) => void; onChange: () => void }) {
  const [s, setS] = useState(getSettings());
  const [status, setStatus] = useState('');
  const connect = async (forceRefresh = false) => {
    saveSettings(s);
    setStatus('Hämtar…');
    try {
      const lib = await loadFromGithub(forceRefresh);
      const n = Object.values(lib.lessons).reduce((a, b) => a + b.length, 0);
      setStatus(`✓ ${n} lektioner lästa från ${s.githubOwner}/${s.githubRepo} (${s.slug})`);
      props.onLoaded(lib);
    } catch (e) { setStatus(`✗ ${(e as Error).message}`); }
  };
  return (
    <main className="main">
      <PrototypImportCard lib={props.lib} onChange={props.onChange} />
      <BokBibliotek lib={props.lib} onChange={props.onChange} />
      <PromptBibliotek lib={props.lib} onChange={props.onChange} />
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
          <button className="btn sec" title="Ignorera cachen och hämta allt på nytt"
            onClick={() => void connect(true)}>⟳ Uppdatera från GitHub</button>
        </div>
        {status && <p className="status">{status}</p>}
        {(() => { /* Krav 3+4: cache- och tokenstatus */
          const cache = getCacheInfo();
          const exp = parseTokenExpiry(getTokenExpiryHeader());
          return (
            <div className="src-status">
              {cache && <p className="muted">🗃 Cache: commit <code>{cache.sha.slice(0, 7)}</code> · sparad {cache.sparad.slice(0, 16).replace('T', ' ')}. Oförändrat repo laddas härifrån (2 snabba anrop i stället för alla filer).</p>}
              {exp ? (
                <p className={exp.daysLeft < 0 ? 'status err' : exp.daysLeft <= 14 ? 'status warn' : 'muted'}>
                  🔑 Nyckeln {exp.daysLeft < 0
                    ? <>har <b>gått ut</b> ({exp.iso}) — skapa en ny fine-grained PAT och klistra in ovan.</>
                    : <>är giltig till <b>{exp.iso}</b> ({exp.daysLeft} dagar kvar{exp.daysLeft <= 14 ? ' — dags att förnya snart' : ''}).</>}
                </p>
              ) : (
                <p className="muted">🔑 Nyckelns giltighetstid visas här efter första anslutningen.</p>
              )}
            </div>
          );
        })()}
        <p className="note">Tokenen sparas endast i din webbläsare, används automatiskt vid appstart och skickas bara till GitHubs API.</p>
      </div>
    </main>
  );
}

// ── Inställningar: backup m.m. — nu innehåll i kugghjulspanelen (del 9) ──
function InstallningarInnehall(props: { onChange: () => void }) {
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
  const stOn = lsGet(FLAG) === 'true';
  return (
    <div>
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
        <div className="title">Datalagring (livslängd per datatyp)</div>{/* NFR-009 */}
        <table className="tbl">
          <thead><tr><th>Data</th><th>Lagring</th></tr></thead>
          <tbody>
            <tr><td>Bokinnehåll, klasser & schema (grunddata)</td><td>GitHub-datakällan — sanning, skrivskyddad härifrån</td></tr>
            <tr><td>Fältredigeringar, egna/borttagna lektioner</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>Kalenderändringar med anledningar</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>Schemaändringar (startdatum, dagar, tider)</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>Pedagogiska verktyg, filmer, Magma, Prio</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>Klassregister-ändringar & klassanteckningar</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>SuperTeach-evidens</td><td>Persistent i webbläsaren · ingår i backup</td></tr>
            <tr><td>Mobil skärmprofil</td><td>Persistent, endast denna enhet</td></tr>
            <tr><td>GitHub-token</td><td>Endast denna webbläsare — aldrig i backup</td></tr>
          </tbody>
        </table>
        <p className="note">Om webblagring är blockerad (t.ex. privat läge) fortsätter appen fungera under sessionen; ändringar sparas då inte mellan omladdningar.</p>
      </div>
      <div className="card">
        <div className="title">SuperTeach</div>
        <label className="radio">
          <input type="checkbox" checked={stOn}
            onChange={(e) => { lsSet(FLAG, String(e.target.checked)); props.onChange(); }} />
          Aktivera SuperTeach-fliken (kunskapsöversikt per elev)
        </label>
      </div>
    </div>
  );
}

// ── Datakälla-sektionen i kugghjulspanelen (del 9) ─────────────
function DatakallaSektion(props: { onOppnaBibliotek: () => void }) {
  const s = getSettings();
  return (
    <div>
      <table className="tbl">
        <tbody>
          <tr><td>Repo</td><td>{s.githubOwner}/{s.githubRepo}</td></tr>
          <tr><td>Planering (slug)</td><td>{s.slug}</td></tr>
          <tr><td>Token</td><td>{s.githubToken === '' ? '○ Ingen token sparad' : '● Sparad i denna webbläsare'}</td></tr>
        </tbody>
      </table>
      <p className="note">Datakällan är skrivskyddad från appen — alla ändringar lagras lokalt som overlays.</p>
      <div className="modal-actions">
        <button className="btn" onClick={props.onOppnaBibliotek}>Ändra i Bibliotek → Datakällor</button>
      </div>
    </div>
  );
}
