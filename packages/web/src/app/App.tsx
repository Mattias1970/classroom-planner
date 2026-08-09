import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  computeTimes, defaultBamTimeline, diffMinutes, generateSlots, placeLessons,
  type LessonRecord, type PlacedLesson, type ScheduledSlot, type SubjectFile,
} from '@planner/core';
import Kalender from '../views/Kalender.js';
import {
  addCustomLesson, composeChapter, demoLibrary, effectiveField, exportBackup, getSettings,
  importBackup, loadFromGithub, nextCustomId, removeLesson, restoreAllRemoved, saveSettings,
  setField, undo, type InsertMode, type LoadedLibrary,
  addLink, getCalOverrides, getLinks, removeLink, setCalOverride, type LessonLink,
} from '../state/store.js';
import { Docx } from './wordExport.js';
import './styles.css';

const SuperTeachPanel = lazy(() => import('../features/superteach/SuperTeachPanel.js'));
const FLAG = 'classroom-planner.superteach.enabled';

type Tab = 'planering' | 'kalender' | 'klasser' | 'bibliotek' | 'superteach' | 'installningar';
const TABS: Array<[Tab, string]> = [
  ['planering', 'Planering'], ['kalender', 'Kalender'], ['klasser', 'Klasser'],
  ['bibliotek', 'Bibliotek'], ['superteach', 'SuperTeach'], ['installningar', 'Inställningar'],
];

export default function App() {
  const [lib, setLib] = useState<LoadedLibrary>(demoLibrary);
  const [tab, setTab] = useState<Tab>('planering');
  const [classId, setClassId] = useState('8B');
  const [kapitel, setKapitel] = useState(1);
  const [tick, bump] = useState(0);
  const refresh = () => bump((t) => t + 1);
  const stOn = localStorage.getItem(FLAG) === 'true';

  const chapters = Object.keys(lib.subject.kapitelMeta).map(Number).sort((a, b) => a - b);
  const lessons = useMemo(
    () => composeChapter(kapitel, lib.lessons[kapitel] ?? []),
    [lib, kapitel, tick],
  );
  const sequence = useMemo(
    () => chapters.flatMap((k) => composeChapter(k, lib.lessons[k] ?? []).map((lesson) => ({ kapitel: k, lesson }))),
    [lib, tick],
  );
  const placedByClass = useMemo(() => {
    const out: Record<string, PlacedLesson<LessonRecord>[]> = {};
    for (const c of lib.subject.meta.klasser.filter((x) => !x.arkiverad)) {
      const slots = generateSlots(lib.subject, c.id, sequence.length + 20);
      out[c.id] = placeLessons(sequence, slots, getCalOverrides(c.id));
    }
    return out;
  }, [lib, sequence, tick]);
  const placed = placedByClass[classId] ?? [];
  const slotFor = (kap: number, idx: number): ScheduledSlot | null => {
    let before = 0;
    for (const k of chapters) { if (k === kap) break; before += composeChapter(k, lib.lessons[k] ?? []).length; }
    return placed[before + idx]?.slot ?? null;
  };
  const globalIdxFor = (kap: number, idx: number): number => {
    let before = 0;
    for (const k of chapters) { if (k === kap) break; before += composeChapter(k, lib.lessons[k] ?? []).length; }
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
        <span className="badge">{lib.subject.meta.lärobok.split(',')[0]}</span>
        <span className={`src ${lib.source}`}>{lib.source === 'github' ? '● GitHub' : '○ Demo'}</span>
      </header>

      {tab === 'planering' && (
        <div className="wrap">
          <nav className="side">
            <h4>Kapitel</h4>
            {chapters.map((k) => (
              <button key={k} className={`chap ${k === kapitel ? 'active' : ''}`} onClick={() => setKapitel(k)}>
                {k}. {lib.subject.kapitelMeta[String(k)].name}
                <small>{composeChapter(k, lib.lessons[k] ?? []).length}</small>
              </button>
            ))}
            <h4>Klass</h4>
            {lib.subject.meta.klasser.filter((c) => !c.arkiverad).map((c) => (
              <button key={c.id} className={`chap ${c.id === classId ? 'active' : ''}`} onClick={() => setClassId(c.id)}>{c.namn}</button>
            ))}
          </nav>
          <PlaneringView lib={lib} kapitel={kapitel} lessons={lessons} slotFor={slotFor}
            globalIdxFor={globalIdxFor} placed={placed} classId={classId} onChange={refresh} />
        </div>
      )}

      {tab === 'kalender' && <Kalender subject={lib.subject} placedByClass={placedByClass} onChanged={refresh} />}
      {tab === 'klasser' && <KlasserView subject={lib.subject} />}
      {tab === 'bibliotek' && <BibliotekView lib={lib} onLoaded={(l) => { setLib(l); refresh(); }} />}
      {tab === 'superteach' && stOn && (
        <Suspense fallback={<main className="main"><p>Laddar SuperTeach…</p></main>}>
          <SuperTeachPanel
            students={['elev-8B-01', 'elev-8B-02', 'elev-8B-03', 'elev-8B-04']}
            subject={lib.subject.meta.ämne.toLowerCase()}
          />
        </Suspense>
      )}
      {tab === 'installningar' && <InstallningarView onChange={refresh} />}
    </div>
  );
}

// ── Planering: lektionskort, inline edit, BAM, add/remove ─────
function PlaneringView(props: {
  lib: LoadedLibrary; kapitel: number; lessons: LessonRecord[]; classId: string;
  slotFor: (kap: number, idx: number) => ScheduledSlot | null;
  globalIdxFor: (kap: number, idx: number) => number;
  placed: PlacedLesson<LessonRecord>[]; onChange: () => void;
}) {
  const { lib, kapitel, lessons, slotFor, globalIdxFor, placed, classId, onChange } = props;
  const meta = lib.subject.kapitelMeta[String(kapitel)];
  const [adding, setAdding] = useState(false);

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
      <div className="head-row">
        <div>
          <h2>Kapitel {kapitel} — {meta.name}</h2>
          <p className="sub">{lessons.length} lektioner · {meta.term} · prov: {meta.prov} · klass {classId}</p>
        </div>
        <div>
          <button className="btn sec" onClick={() => { undo() && onChange(); }}>↶ Ångra</button>{' '}
          <button className="btn sec" onClick={() => void exportWord('vecka')}>📄 Vecka → Word</button>{' '}
          <button className="btn sec" onClick={() => void exportWord('kapitel')}>📄 Kapitel → Word</button>{' '}
          <button className="btn" onClick={() => setAdding(true)}>+ Lägg till lektion</button>
        </div>
      </div>

      {lessons.map((l, i) => (
        <LessonCard key={`${l.id}-${i}`} kapitel={kapitel} lesson={l} slot={slotFor(kapitel, i)}
          globalIdx={globalIdxFor(kapitel, i)} classId={classId}
          override={placed[globalIdxFor(kapitel, i)]?.override}
          flip={lib.flip[kapitel]?.[l.id]} onChange={onChange} />
      ))}

      {adding && <AddLessonDialog kapitel={kapitel} lessons={lessons} onClose={() => { setAdding(false); onChange(); }} />}
    </main>
  );
}

function Editable(props: { kapitel: number; lesson: LessonRecord; field: keyof LessonRecord; multiline?: boolean; onChange: () => void }) {
  const { kapitel, lesson, field, multiline, onChange } = props;
  const value = effectiveField(kapitel, lesson, field);
  const commit = (v: string) => { if (v !== value) { setField(kapitel, lesson.id, field, v); onChange(); } };
  return multiline
    ? <textarea className="inline-edit" defaultValue={value} rows={2} onBlur={(e) => commit(e.target.value)} />
    : <input className="inline-edit" defaultValue={value} onBlur={(e) => commit(e.target.value)} />;
}

function LessonCard(props: {
  kapitel: number; lesson: LessonRecord; slot: ScheduledSlot | null;
  globalIdx: number; classId: string;
  override?: import('@planner/core').LessonOverride;
  flip?: import('@planner/core').FlipDoc; onChange: () => void;
}) {
  const { kapitel, lesson, slot, globalIdx, classId, override, flip, onChange } = props;
  const [cancelDlg, setCancelDlg] = useState(false);
  const rows = flip?.bamTimeline?.length
    ? flip.bamTimeline
    : slot ? defaultBamTimeline(lesson, diffMinutes(slot.start, slot.end)) : null;
  const timeline = rows && slot ? computeTimes(rows, slot.start) : null;
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
          {lesson.exit !== '—' && <span className="pill quiz">Exit</span>}
          {lesson.type !== 'regular' && <span className="pill">{lesson.type}</span>}
          {override && <span className="pill ov">{override.type === 'cancelled' ? '⛔ Inställd' : override.type === 'shifted' ? '⏭ Framflyttad' : '📍 Flyttad'}</span>}
        </span>
        <span className="when">{slot ? `v.${slot.week} · ${slot.date} · ${slot.start}` : override?.type === 'cancelled' ? 'inställd' : 'ej schemalagd'}</span>
        <button className="icon-btn" title={override ? 'Återställ' : 'Ställ in / flytta'} onClick={() => setCancelDlg(true)}>{override ? '↩' : '⛔'}</button>
        <button className="icon-btn" title="Ta bort lektion" onClick={() => { removeLesson(kapitel, lesson.id); onChange(); }}>🗑</button>
      </div>
      {timeline && (
        <div className="bam" aria-label="BAM-tidslinje">
          {timeline.map((seg) => (
            <div key={seg.label} className={`seg ${seg.kind}`} style={{ flexGrow: seg.minutes }}>
              <b>{seg.label}</b><span>{seg.from}–{seg.to}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rows">
        <label>Genomgång</label><Editable kapitel={kapitel} lesson={lesson} field="genomgang" multiline onChange={onChange} />
        <label>Begrepp</label><Editable kapitel={kapitel} lesson={lesson} field="begrepp" onChange={onChange} />
        <label>Uppgifter</label>
        <div className="ranges">
          <span className="rg grön">Grön {effectiveField(kapitel, lesson, 'grön')}</span>
          <span className="rg blå">Blå {effectiveField(kapitel, lesson, 'blå')}</span>
          <span className="rg röd">Röd {effectiveField(kapitel, lesson, 'röd')}</span>
          <span className="rg teori">Teori {lesson.sidor_teori}</span>
        </div>
        <label>Läxa</label><Editable kapitel={kapitel} lesson={lesson} field="laxa" onChange={onChange} />
      </div>
      <ResourceRow kapitel={kapitel} lesson={lesson} links={links} flipCount={flipCount} onChange={onChange} />
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
  const ICON: Record<LessonLink['typ'], string> = { film: '🎬', magma: '🧮', quiz: '❓', verktyg: '🔧' };
  return (
    <div className="resources">
      <label>Resurser</label>
      <div className="reslist">
        {links.length === 0 && <span className="muted">Inga länkar ännu.</span>}
        {links.map((l, i) => (
          <span key={`${l.url}-${i}`} className={`reslink ${l.typ}`}>
            <a href={l.url} target="_blank" rel="noreferrer">{ICON[l.typ]} {l.titel || l.typ}</a>
            {i >= flipCount && (
              <button className="icon-btn" title="Ta bort" onClick={() => { removeLink(kapitel, lesson.id, i - flipCount); onChange(); }}>×</button>
            )}
          </span>
        ))}
        <button className="icon-btn addres" onClick={() => setAdding(!adding)}>+ länk</button>
      </div>
      {adding && (
        <div className="resform">
          <select value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value as LessonLink['typ'] })}>
            <option value="film">Film</option><option value="magma">Magma</option>
            <option value="quiz">Quiz</option><option value="verktyg">Verktyg</option>
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

function AddLessonDialog(props: { kapitel: number; lessons: LessonRecord[]; onClose: () => void }) {
  const { kapitel, lessons, onClose } = props;
  const [titel, setTitel] = useState('Extra: repetition');
  const [mode, setMode] = useState<InsertMode>('skjut-fram');
  const [afterId, setAfterId] = useState<number | null>(lessons[lessons.length - 1]?.id ?? null);
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
