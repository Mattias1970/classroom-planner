/**
 * Del 194 · Veckorapporter.
 *
 *  - VeckorapportLarm: visas överst i appen från fredag 16:00 tills veckans rapport är skapad
 *    och att-göra-listan (Teams, Magma, Socrative) är bockad.
 *  - Veckorapporter: listan med alla veckor — veckonummer, en text per ämne, att-göra-listan,
 *    Till Word och Ta bort.
 */
import { useState } from 'react';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import {
  sattVeckorapportTodo, skapaVeckorapport, svenskTid, taBortVeckorapport, veckaFor, veckaText, veckorapportLarm, veckorapportText, veckorapporter, VECKORAPPORT_TID,
  type Struktur, type Tidpunkt, type Vecka, type Veckorapport,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

type Kor = (fn: () => Struktur, m: string) => void;

/** Nu i svensk tid. */
export function nuSvensk(): Tidpunkt { return svenskTid(new Date().toISOString()); }

async function tillWord(r: Veckorapport): Promise<void> {
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      children: [
        new Paragraph({ text: `Veckorapport ${veckaText(r)}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `Skapad ${r.skapad}`, italics: true })] }),
        ...r.amnen.flatMap((a) => [
          new Paragraph({ text: `${a.klassNamn} · ${a.amne}`, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }),
          ...a.text.split('\n').map((rad) => {
            const i = rad.indexOf(': ');
            return new Paragraph({ spacing: { after: 120, line: 300 }, children: i > 0 ? [new TextRun({ text: `${rad.slice(0, i)}: `, bold: true }), new TextRun({ text: rad.slice(i + 2) })] : [new TextRun({ text: rad })] });
          }),
        ]),
        new Paragraph({ text: 'Att göra', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }),
        ...r.todo.map((t) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${t.klar ? '☑' : '☐'} ${t.text}` })] })),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Veckorapport v${r.vecka} ${r.ar}.docx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function TodoLista({ r, kor }: { r: Veckorapport; kor: Kor }) {
  return (
    <ul className="st-vecko-todo" aria-label={`Att göra v.${r.vecka}`}>
      {r.todo.map((t) => (
        <li key={t.id} className={t.klar ? 'klar' : ''}>
          <label><input type="checkbox" checked={t.klar} onChange={(e) => kor(() => sattVeckorapportTodo(lasStruktur(), r.id, t.id, e.target.checked), e.target.checked ? `✓ ${t.text}` : `${t.text} — inte klar`)} /> {t.text}</label>
        </li>
      ))}
    </ul>
  );
}

function skapa(kor: Kor, v: Vecka, nu: Tidpunkt): void {
  kor(() => skapaVeckorapport(lasStruktur(), v, nu).s, `Veckorapport ${veckaText(v)} skapad — bocka av att-göra-listan.`);
}

/**
 * Larmet: veckor som är dags (fredag 16:00) utan rapport, och rapporter med obockade punkter.
 * Visas överst i appen; `onOppna` går till listan.
 */
export function VeckorapportLarm({ s, kor, nu, onOppna }: { s: Struktur; kor: Kor; nu?: Tidpunkt; onOppna?: () => void }) {
  const tid = nu ?? nuSvensk();
  const larm = veckorapportLarm(s, tid);
  if (larm.saknade.length === 0 && larm.oklara.length === 0) return null;
  return (
    <div className="st-vecko-larm" role="alert" aria-label="Veckorapport">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b>🔔 Veckorapport</b>
        {larm.saknade.map((v) => (
          <span key={`${v.ar}-${v.vecka}`} className="rad" style={{ gap: 6, alignItems: 'center' }}>
            <span>{veckaText(v)} är dags (fredag {VECKORAPPORT_TID})</span>
            <button className="btn sm" onClick={() => skapa(kor, v, tid)}>✍ Skapa veckorapport {`v.${v.vecka}`}</button>
          </span>
        ))}
        <span className="spacer" />
        {onOppna !== undefined && <button className="btn sec sm" onClick={onOppna}>📅 Veckorapporter</button>}
      </div>
      {larm.oklara.map((r) => (
        <div key={r.id} style={{ marginTop: 4 }}>
          <small className="muted">Att göra för {veckaText(r)}:</small>
          <TodoLista r={r} kor={kor} />
        </div>
      ))}
    </div>
  );
}

/** Listan med alla veckorapporter, senaste först. */
export function Veckorapporter({ s, kor, nu, onTillbaka }: { s: Struktur; kor: Kor; nu?: Tidpunkt; onTillbaka?: () => void }) {
  const tid = nu ?? nuSvensk();
  const lista = veckorapporter(s);
  const [oppen, setOppen] = useState<string | null>(lista[0]?.id ?? null);
  const [forhand, setForhand] = useState(false);
  const larm = veckorapportLarm(s, tid);
  return (
    <div className="st-veckorapporter" aria-label="Veckorapporter">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {onTillbaka !== undefined && <button className="btn sm" onClick={onTillbaka}>← Rapporter</button>}
        <h3 style={{ margin: 0 }}>📅 Veckorapporter</h3>
        <small className="muted">en rapport per vecka — vad som hänt i varje ämne, skapas fredag {VECKORAPPORT_TID}, texten fryses när rapporten skapas</small>
      </div>
      <VeckorapportLarm s={s} kor={kor} nu={tid} />
      {larm.saknade.length === 0 && (
        <p className="muted small" style={{ margin: '6px 0' }}>
          Inget är dags. <button className="v3-lank" onClick={() => setForhand(!forhand)}>{forhand ? 'Dölj' : 'Visa'} hur veckans text ser ut just nu</button>
        </p>
      )}
      {forhand && larm.saknade.length === 0 && <Forhandsvisning s={s} nu={tid} />}
      {lista.length === 0 ? <p className="muted">Inga veckorapporter än.</p> : lista.map((r) => (
        <details key={r.id} open={oppen === r.id} onToggle={(e) => setOppen((e.target as HTMLDetailsElement).open ? r.id : null)}>
          <summary><b>{veckaText(r)}</b> <span className="muted">· skapad {r.skapad} · {r.todo.filter((t) => t.klar).length}/{r.todo.length} klara</span></summary>
          <div className="rad" style={{ gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            <button className="btn sec sm" onClick={() => { void tillWord(r); }}>📄 Till Word</button>
            <button className="btn sec sm" onClick={() => {
              if (!window.confirm(`Ta bort veckorapporten ${veckaText(r)}? Den kan skapas igen (texten räknas då om).`)) return;
              kor(() => taBortVeckorapport(lasStruktur(), r.id), `Veckorapport ${veckaText(r)} borttagen.`);
            }}>🗑 Ta bort</button>
          </div>
          {r.amnen.map((a) => (
            <div key={a.amneId} className="st-vecko-amne">
              <b>{a.klassNamn} · {a.amne}</b>
              {a.text.split('\n').map((rad, i) => { const k = rad.indexOf(': '); return <p key={i}>{k > 0 ? <><b className="st-samtal-rubrik">{rad.slice(0, k)}: </b>{rad.slice(k + 2)}</> : rad}</p>; })}
            </div>
          ))}
          <b className="st-samtal-rubrik">Att göra</b>
          <TodoLista r={r} kor={kor} />
        </details>
      ))}
    </div>
  );
}

function Forhandsvisning({ s, nu }: { s: Struktur; nu: Tidpunkt }) {
  const v = veckaFor(nu.datum);
  const amnen = s.amnen.map((a) => ({ a, klass: s.klasser.find((k) => k.id === a.klassId)?.namn ?? '', text: veckorapportText(s, a.id, v) })).filter((x) => !x.text.startsWith('Lektioner: inga'));
  return (
    <div className="st-vecko-forhand">
      <small className="muted">Innevarande vecka {veckaText(v)} — så här ser texten ut just nu:</small>
      {amnen.length === 0 ? <p className="muted">Inga lektioner planerade den här veckan.</p> : amnen.map((x) => (
        <div key={x.a.id} className="st-vecko-amne"><b>{x.klass} · {x.a.namn}</b>{x.text.split('\n').map((rad, i) => <p key={i}>{rad}</p>)}</div>
      ))}
    </div>
  );
}
