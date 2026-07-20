/**
 * SuperTeach-dashboard (Ring 3) — helt fristående panel.
 *
 * Integration i App.tsx = EN rad plus en flik/route:
 *
 *   const SuperTeachPanel = React.lazy(() => import('./features/superteach/SuperTeachPanel'));
 *   ...
 *   {isSuperTeachEnabled() && <SuperTeachPanel students={klassensElever} subject="matematik" />}
 *
 * Lazy-load + feature-flagga → panelen laddas inte ens om flaggan är av,
 * och en bugg här kan inte dra med sig resten av appen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalStorageEvidenceStore } from './localStorageEvidenceStore.js';
import {
  SuperTeachService,
  type EvidenceSource,
  type EvidenceStatus,
  type StudentSummary,
  type SuperTeachEvidence,
} from './superteachCore.js';

const FLAG_KEY = 'classroom-planner.superteach.enabled';
export function isSuperTeachEnabled(): boolean {
  return globalThis.localStorage?.getItem(FLAG_KEY) === 'true';
}
export function setSuperTeachEnabled(on: boolean): void {
  globalThis.localStorage?.setItem(FLAG_KEY, String(on));
}

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  secure: 'Säker',
  developing: 'Utvecklas',
  gap: 'Lucka',
  'not-assessed': 'Ej bedömd',
};
const STATUS_COLOR: Record<EvidenceStatus, string> = {
  secure: '#1a7f37',
  developing: '#b58a00',
  gap: '#c62828',
  'not-assessed': '#757575',
};
const TREND_ICON = { improving: '↗', stable: '→', declining: '↘', unknown: '·' } as const;

const SOURCES: EvidenceSource[] = [
  'teacher-observation', 'manual', 'google-forms', 'google-classroom-submission',
  'google-classroom-image', 'socrative-homework', 'socrative-exit-ticket', 'magma',
];
const DIMENSIONS = ['begrepp', 'procedur', 'problemlösning', 'resonemang', 'kommunikation'];

interface Props {
  students: string[];
  subject: string;
}

export default function SuperTeachPanel({ students, subject }: Props) {
  const service = useMemo(
    () => new SuperTeachService(new LocalStorageEvidenceStore()),
    [],
  );
  const [selected, setSelected] = useState(students[0] ?? '');
  const [summary, setSummary] = useState<StudentSummary | null>(null);
  const [pending, setPending] = useState(0);
  const [form, setForm] = useState({
    dimension: DIMENSIONS[0], status: 'developing' as EvidenceStatus,
    source: 'teacher-observation' as EvidenceSource, text: '',
  });

  const refresh = useCallback(async () => {
    if (!selected) return;
    setSummary(await service.summarize(selected, subject));
    setPending(await service.pendingReviewCount());
  }, [service, selected, subject]);

  useEffect(() => { void refresh(); }, [refresh]);

  const addEvidence = async () => {
    const e: SuperTeachEvidence = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studentKey: selected,
      subject,
      source: form.source,
      dimensions: [{ dimension: form.dimension, status: form.status, confidence: 'high', evidenceText: form.text }],
      aiAssisted: false,
      teacherReviewed: true,
      collectedAt: new Date().toISOString(),
    };
    await service.record(e);
    setForm((f) => ({ ...f, text: '' }));
    await refresh();
  };

  const exportJson = async () => {
    const blob = new Blob([await service.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `superteach-evidence-${subject}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    await service.importJson(await file.text());
    await refresh();
  };

  return (
    <section style={{ padding: 16, fontFamily: 'inherit' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>SuperTeach — kunskapsöversikt</h2>
        <span style={{ color: '#666' }}>{subject}</span>
        {pending > 0 && (
          <span style={{ background: '#fff3cd', padding: '2px 8px', borderRadius: 8 }}>
            {pending} AI-poster att granska
          </span>
        )}
      </header>

      <div style={{ margin: '12px 0' }}>
        <label>
          Elev:{' '}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {students.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>{' '}
        <button onClick={exportJson}>Exportera JSON</button>{' '}
        <label style={{ cursor: 'pointer', textDecoration: 'underline' }}>
          Importera JSON
          <input type="file" accept="application/json" hidden
            onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        </label>
      </div>

      {summary && (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 720 }}>
          <thead>
            <tr>
              {['Dimension', 'Status', 'Trend', 'Evidens', 'Senast'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 6 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.dimensions.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 6, color: '#777' }}>Ingen evidens ännu.</td></tr>
            )}
            {summary.dimensions.map((d) => (
              <tr key={d.dimension}>
                <td style={{ padding: 6 }}>{d.dimension}</td>
                <td style={{ padding: 6, color: STATUS_COLOR[d.status], fontWeight: 600 }}>
                  {STATUS_LABEL[d.status]}
                </td>
                <td style={{ padding: 6 }}>{TREND_ICON[d.trend]}</td>
                <td style={{ padding: 6 }}>{d.evidenceCount}</td>
                <td style={{ padding: 6 }}>
                  {d.latestCollectedAt ? d.latestCollectedAt.slice(0, 10) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary && summary.gaps.length > 0 && (
        <p style={{ color: STATUS_COLOR.gap }}>
          Luckor att arbeta med: {summary.gaps.join(', ')}
        </p>
      )}

      <fieldset style={{ marginTop: 16, maxWidth: 720 }}>
        <legend>Lägg till evidens (lärarobservation/manuell)</legend>
        <select value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
          {DIMENSIONS.map((d) => <option key={d}>{d}</option>)}
        </select>{' '}
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EvidenceStatus })}>
          {(['secure', 'developing', 'gap'] as const).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>{' '}
        <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as EvidenceSource })}>
          {SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div style={{ marginTop: 8 }}>
          <input style={{ width: '60%' }} placeholder="Evidenstext, t.ex. 'Löste ekvationssystem självständigt'"
            value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />{' '}
          <button onClick={() => void addEvidence()} disabled={!selected}>Spara</button>
        </div>
      </fieldset>
    </section>
  );
}
