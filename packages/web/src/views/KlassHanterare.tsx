/**
 * Klasshanteraren (FR-CM-001…011) — modal enligt Figur 28/29.
 * Alla operationer lagras som overlay (ClassEdits) och appliceras
 * via applyClassEdits i core; datakällan muteras aldrig.
 */
import { useState } from 'react';
import {
  applyClassEdits, uniqueClassId, validateClassBackup,
  type SubjectFile,
} from '@planner/core';
import { getClassEdits, saveClassEdits } from '../state/store.js';

export function KlassHanterare(props: { subject: SubjectFile; onClose: () => void; onChange: () => void }) {
  const { subject, onClose, onChange } = props;
  const active = subject.meta.klasser.filter((c) => !c.arkiverad);
  const archivedList = subject.meta.klasser.filter((c) => c.arkiverad);
  const [namn, setNamn] = useState('');
  const [lasar, setLasar] = useState(active[0]?.läsår ?? '2026/27');
  const [inheritFrom, setInheritFrom] = useState(active[0]?.id ?? '');
  const [msg, setMsg] = useState('');

  const edits = getClassEdits();
  const save = (e: typeof edits) => { saveClassEdits(e); onChange(); };

  const addClass = (srcId: string, newNamn: string, newLasar: string) => { /* FR-CM-002/004 */
    const id = uniqueClassId(newNamn, subject.meta.klasser.map((c) => c.id));
    const schema = (subject.schema[srcId] ?? []).map((p) => ({ ...p })); // djupkopia
    save({
      ...edits,
      added: [...(edits.added ?? []), {
        klass: { id, namn: newNamn, läsår: newLasar, socrative: `Matte${newNamn.replace(/\s+/g, '')}`, arkiverad: false },
        schema,
      }],
    });
    setMsg(`✓ Klass ${newNamn} skapad (ärver schema från ${srcId}).`);
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
        <p className="muted">Lägg till, byt namn, arkivera eller kopiera klasser. Ändringar sparas automatiskt i webbläsaren.</p>

        {active.map((c) => (
          <div key={c.id} className="cm-card">
            <div><b>{c.namn}</b><br />
              <small className="muted">Läsår {c.läsår} · Socrative: {c.socrative}{active.length === 1 ? ' · (enda klassen)' : ''}</small></div>
            <div className="cm-actions">
              <button className="icon-btn" title="Byt namn/metadata" onClick={() => rename(c.id)}>✎</button>
              <button className="icon-btn" title="Kopiera planering till ny klass" onClick={() => {
                const n = window.prompt('Namn på den nya klassen:', `${c.namn}-kopia`);
                if (n) addClass(c.id, n.trim(), c.läsår);
              }}>⧉</button>
              <button className="icon-btn" title="Arkivera" disabled={active.length <= 1}
                onClick={() => setArchived(c.id, true)}>🗄</button>
            </div>
          </div>
        ))}

        <h4 className="cm-h">LÄGG TILL NY KLASS</h4>{/* FR-CM-002 */}
        <div className="cm-add">
          <input placeholder="Namn, t.ex. 8A" value={namn} onChange={(e) => setNamn(e.target.value)} />
          <input placeholder="Läsår, t.ex. 2026/27" value={lasar} onChange={(e) => setLasar(e.target.value)} />
          <select value={inheritFrom} onChange={(e) => setInheritFrom(e.target.value)}>
            {active.map((c) => <option key={c.id} value={c.id}>Ärv från {c.namn}</option>)}
          </select>
          <button className="btn" disabled={namn.trim() === ''}
            onClick={() => { addClass(inheritFrom, namn.trim(), lasar.trim() || '2026/27'); setNamn(''); }}>➕ Lägg till</button>
        </div>
        <p className="note">Den nya klassen ärver schema och planering från vald klass.</p>

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
