/**
 * Klasshanteraren (FR-CM-001…011) — modal enligt Figur 28/29.
 * Alla operationer lagras som overlay (ClassEdits) och appliceras
 * via applyClassEdits i core; datakällan muteras aldrig.
 */
import { useState } from 'react';
import {
  DATAKALLA_BOK_ID, STANDARD_AMNEN, applyClassEdits, klassBokVal, uniqueClassId, validateClassBackup,
  type ClassMeta, type SubjectFile,
} from '@planner/core';
import { getClassEdits, getLokalaBocker, saveClassEdits } from '../state/store.js';
import { EleverPanel } from './Elever.js';

/** Del 27: bokalternativ i klasshanteraren (datakällans + importerade). */
interface BokAlt { id: string; titel: string; amne: string; }

export function KlassHanterare(props: {
  subject: SubjectFile; onClose: () => void; onChange: () => void;
  /** Datakällans bok (för raden "Datakällans bok" i bokväljaren). */
  datakallansBok?: { titel: string; amne: string };
}) {
  const { subject, onClose, onChange, datakallansBok } = props;
  // Del 27: ämnen och böcker att välja bland
  const bokAlt: BokAlt[] = [
    { id: DATAKALLA_BOK_ID, titel: `${datakallansBok?.titel ?? subject.meta.lärobok} (datakälla)`, amne: datakallansBok?.amne ?? subject.meta.ämne },
    ...getLokalaBocker().map((b) => ({ id: b.bok.id, titel: b.bok.förlag ? `${b.bok.titel}, ${b.bok.förlag}` : b.bok.titel, amne: b.bok.ämne })),
  ];
  const amnen = [...new Set([subject.meta.ämne, ...STANDARD_AMNEN, ...bokAlt.map((b) => b.amne), ...subject.meta.klasser.map((c) => c.ämne ?? '').filter(Boolean)])];
  const bokLabel = (c: ClassMeta): string => {
    const v = klassBokVal(c);
    if (v.typ === 'arv') return 'gemensamt bokval';
    if (v.typ === 'datakalla') return bokAlt[0].titel;
    return bokAlt.find((b) => b.id === v.bokId)?.titel ?? `${v.bokId} (saknas i biblioteket)`;
  };
  const [nyAmne, setNyAmne] = useState(subject.meta.ämne);
  const [nyBok, setNyBok] = useState<string>('');
  const active = subject.meta.klasser.filter((c) => !c.arkiverad);
  const archivedList = subject.meta.klasser.filter((c) => c.arkiverad);
  const [namn, setNamn] = useState('');
  const [lasar, setLasar] = useState(active[0]?.läsår ?? '2026/27');
  const [inheritFrom, setInheritFrom] = useState(active[0]?.id ?? '');
  const [msg, setMsg] = useState('');
  const [eleverFor, setEleverFor] = useState<string | null>(null); // del 10

  const edits = getClassEdits();
  const save = (e: typeof edits) => { saveClassEdits(e); onChange(); };

  const addClass = (srcId: string, newNamn: string, newLasar: string, amne?: string, bokId?: string) => { /* FR-CM-002/004 + del 27 */
    const id = uniqueClassId(newNamn, subject.meta.klasser.map((c) => c.id));
    const schema = (subject.schema[srcId] ?? []).map((p) => ({ ...p })); // djupkopia
    const src = subject.meta.klasser.find((c) => c.id === srcId);
    const klass: ClassMeta = {
      id, namn: newNamn, läsår: newLasar, socrative: `Matte${newNamn.replace(/\s+/g, '')}`, arkiverad: false,
      ...(amne !== undefined ? (amne.trim() !== '' ? { ämne: amne.trim() } : {}) : (src?.ämne ? { ämne: src.ämne } : {})),
      ...(bokId !== undefined ? (bokId !== '' ? { bokId } : {}) : (src?.bokId ? { bokId: src.bokId } : {})),
    };
    save({ ...edits, added: [...(edits.added ?? []), { klass, schema }] });
    const bok = bokAlt.find((b) => b.id === klass.bokId)?.titel ?? 'gemensamt bokval';
    setMsg(`✓ Klass ${newNamn} skapad — ${klass.ämne ?? subject.meta.ämne}, ${bok} (schema ärvt från ${srcId}).`);
  };

  /** Del 27: sätt ämne/bok för befintlig klass ('' ⇒ följ gemensamt bokval). */
  const setKlassVal = (id: string, patch: { ämne?: string; bokId?: string }) => {
    const c = subject.meta.klasser.find((x) => x.id === id);
    if (!c) return;
    save({
      ...edits,
      renamed: {
        ...(edits.renamed ?? {}),
        [id]: {
          ...(edits.renamed?.[id] ?? {}),
          ...(patch.ämne !== undefined ? { ämne: patch.ämne } : {}),
          ...(patch.bokId !== undefined ? { bokId: patch.bokId } : {}),
        },
      },
    });
    setMsg(patch.bokId !== undefined
      ? `✓ ${c.namn} planeras nu efter ${bokAlt.find((b) => b.id === patch.bokId)?.titel ?? 'gemensamt bokval'} — årsöversikt, kalender och lektionsplaner för klassen bygger på den boken.`
      : `✓ ${c.namn}: ämne ${patch.ämne}.`);
  };

  const rename = (id: string) => { /* FR-CM-003 */
    const c = subject.meta.klasser.find((x) => x.id === id)!;
    const nyttNamn = window.prompt('Klassens namn:', c.namn);
    if (nyttNamn === null) return;
    const nyttLasar = window.prompt('Läsår:', c.läsår);
    if (nyttLasar === null) return;
    const nyttRum = window.prompt('Socrative-rum:', c.socrative);
    if (nyttRum === null) return;
    save({
      ...edits,
      renamed: {
        ...(edits.renamed ?? {}),
        [id]: { namn: nyttNamn.trim() || c.namn, läsår: nyttLasar.trim() || c.läsår, socrative: nyttRum.trim() || c.socrative },
      },
    });
  };

  const setArchived = (id: string, value: boolean) => { /* FR-CM-005/006 */
    if (value && active.length <= 1) { setMsg('✗ Den sista aktiva klassen kan inte arkiveras.'); return; }
    if (value && !window.confirm(`Arkivera klass ${id}? Den döljs från alla klassval men kan återaktiveras.`)) return;
    save({ ...edits, archived: { ...(edits.archived ?? {}), [id]: value } });
  };

  const deleteClass = (id: string) => { /* FR-CM-007 */
    if (!window.confirm(`Ta bort klass ${id} PERMANENT? Schema och klassval försvinner. Detta kan inte ångras.`)) return;
    save({ ...edits, deleted: [...(edits.deleted ?? []), id] });
  };

  const exportBackup = () => { /* FR-CM-009 */
    const payload = JSON.stringify({
      klasser: subject.meta.klasser, schema: subject.schema,
      exportedAt: new Date().toISOString(),
    }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = `klasser_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    setMsg('✓ Klassbackup nedladdad.');
  };

  const importBackupFile = async (file: File) => { /* FR-CM-010 */
    try {
      const parsed = validateClassBackup(JSON.parse(await file.text()));
      if (!window.confirm(`Ersätt klassregistret med ${parsed.klasser.length} klasser från filen?`)) return;
      // Overlay som ersätter allt: radera nuvarande, lägg till filens.
      save({
        deleted: subject.meta.klasser.map((c) => c.id),
        added: parsed.klasser.map((k) => ({ klass: k, schema: parsed.schema[k.id] ?? [] })),
      });
      setMsg('✓ Klassbackup importerad.');
    } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
  };

  return (
    <div className="overlay" role="dialog" onClick={onClose}>
      <div className="modal cm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="head-row"><h3>⚙ Hantera klasser</h3>
          <button className="icon-btn" onClick={onClose}>✕</button></div>
        <p className="muted">Lägg till, byt namn, arkivera eller kopiera klasser. Varje klass kan knytas till ett eget ämne och en egen bok — då får klassen sin egen planering (årsöversikt, kalender, lektionsplaner) ur den bokens lektionsblad. Ändringar sparas automatiskt i webbläsaren.</p>

        {active.map((c) => (
          <div key={c.id} className="cm-card">
            <div><b>{c.namn}</b><br />
              <small className="muted">Läsår {c.läsår} · Socrative: {c.socrative}{active.length === 1 ? ' · (enda klassen)' : ''}</small><br />
              <small className="muted">📗 {c.ämne ?? subject.meta.ämne} · {bokLabel(c)}</small>
              <div className="cm-klassval">
                <select aria-label={`Ämne för ${c.namn}`} value={c.ämne ?? ''} onChange={(e) => setKlassVal(c.id, { ämne: e.target.value })}>
                  <option value="">Ämne: {subject.meta.ämne} (planeringens)</option>
                  {amnen.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select aria-label={`Bok för ${c.namn}`} value={c.bokId ?? ''} onChange={(e) => setKlassVal(c.id, { bokId: e.target.value })}>
                  <option value="">Bok: gemensamt bokval</option>
                  {bokAlt.filter((b) => !c.ämne || b.amne === c.ämne || b.id === c.bokId).map((b) => (
                    <option key={b.id} value={b.id}>{b.titel} · {b.amne}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="cm-actions">
              <button className="icon-btn" title="Byt namn/metadata" onClick={() => rename(c.id)}>✎</button>
              <button className="icon-btn" title="Kopiera planering till ny klass" onClick={() => {
                const n = window.prompt('Namn på den nya klassen:', `${c.namn}-kopia`);
                if (n) addClass(c.id, n.trim(), c.läsår);
              }}>⧉</button>
              <button className="icon-btn" title="Arkivera" disabled={active.length <= 1}
                onClick={() => setArchived(c.id, true)}>🗄</button>
              <button className="icon-btn" title="Elevregister"
                onClick={() => setEleverFor(eleverFor === c.id ? null : c.id)}>👥</button>
            </div>
          </div>
        ))}
        {eleverFor !== null && active.some((c) => c.id === eleverFor) && (
          <EleverPanel classId={eleverFor}
            klassNamn={active.find((c) => c.id === eleverFor)?.namn ?? eleverFor}
            onChange={onChange} />
        )}

        <h4 className="cm-h">LÄGG TILL NY KLASS</h4>{/* FR-CM-002 */}
        <div className="cm-add">
          <input placeholder="Namn, t.ex. 8A" value={namn} onChange={(e) => setNamn(e.target.value)} />
          <input placeholder="Läsår, t.ex. 2026/27" value={lasar} onChange={(e) => setLasar(e.target.value)} />
          <select value={inheritFrom} onChange={(e) => setInheritFrom(e.target.value)}>
            {active.map((c) => <option key={c.id} value={c.id}>Ärv schema från {c.namn}</option>)}
          </select>
          <select aria-label="Ämne för ny klass" value={nyAmne} onChange={(e) => { setNyAmne(e.target.value); setNyBok(''); }}>
            {amnen.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Bok för ny klass" value={nyBok} onChange={(e) => setNyBok(e.target.value)}>
            <option value="">Bok: gemensamt bokval</option>
            {bokAlt.filter((b) => b.amne === nyAmne).map((b) => <option key={b.id} value={b.id}>{b.titel}</option>)}
          </select>
          <button className="btn" disabled={namn.trim() === ''}
            onClick={() => { addClass(inheritFrom, namn.trim(), lasar.trim() || '2026/27', nyAmne, nyBok); setNamn(''); }}>➕ Lägg till</button>
        </div>
        <p className="note">Den nya klassen ärver schema från vald klass och planeras efter valt ämne och bok. Böcker importeras under Bibliotek → Böcker.</p>

        {archivedList.length > 0 && (<>
          <h4 className="cm-h">ARKIVERADE KLASSER</h4>
          {archivedList.map((c) => (
            <div key={c.id} className="cm-card archived">
              <div><b>{c.namn}</b><br /><small className="muted">Läsår {c.läsår} · Arkiverad</small></div>
              <div className="cm-actions">
                <button className="btn sec" onClick={() => setArchived(c.id, false)}>♻ Återaktivera</button>{/* FR-CM-006 */}
                <button className="icon-btn" title="Ta bort permanent" onClick={() => deleteClass(c.id)}>🗑</button>
              </div>
            </div>
          ))}
        </>)}

        <div className="modal-actions cm-foot">
          <button className="btn sec" onClick={exportBackup}>⬇ Exportera backup (JSON)</button>
          <label className="btn sec file-btn">⬆ Importera backup
            <input type="file" accept="application/json" hidden
              onChange={(e) => e.target.files?.[0] && void importBackupFile(e.target.files[0])} />
          </label>
        </div>
        {msg && <p className="status">{msg}</p>}
        <p className="note">Fullständig produktbackup (redigeringar, verktyg, filmer/Magma, anteckningar, kalenderändringar m.m.) finns under Inställningar.</p>
      </div>
    </div>
  );
}

export { applyClassEdits };
