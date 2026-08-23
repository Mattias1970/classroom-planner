/**
 * Classroom Planner Studio (v2) — trädet Skolår ▸ Tjänst ▸ Klass ▸ Ämne
 * till vänster, detaljpanel till höger, fristående bokbibliotek och lärare.
 * Flöden: skolår (röda dagar beräknas; lov/temadagar/idrottsdagar via text
 * eller .ics), tjänst (lärare valfri), klass, ämne med eget schema, bok på
 * ämnet → "Skapa planering" ger datumsatt planering. Sidregister → Excel.
 */
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  arbetsNivaer, bamTidslinje, begreppForLektion, bokBegrepp, bokFromImport, bokSidregister,
  bokSidregisterCsv, exitStart, giltigtPass, kalendariumFromIcs, laggTillAmne, laggTillKlass,
  laggTillLarare, laggTillSkolar, laggTillTjanst, larareSchema, normaliseraDagar, nyttId,
  parseKalendarium, registreraPlanering, sattLarare, schemaKonflikter, skapaPlanering,
  sparaBok, taBortAmne, taBortBok, taBortKlass, taBortLarare, taBortSkolar, taBortTjanst,
  tavelrubrik, uppdateraAmne, uppdateraKlass, uppdateraSkolar,
  type Amne, type Bok, type Kapitel, type Klass, type Pass, type PlaneradLektion,
  type Skolar, type Struktur,
} from '@planner/kernel';
import { exportJson, importJson, lasStruktur, sparaStruktur } from './store.js';

const DAGNAMN = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
type Vald =
  | { typ: 'skolar'; id: string } | { typ: 'tjanst'; id: string }
  | { typ: 'klass'; id: string } | { typ: 'amne'; id: string }
  | { typ: 'bok'; id: string } | { typ: 'larare' } | null;

export function App() {
  const [s, setS] = useState<Struktur>(() => lasStruktur());
  const [vald, setVald] = useState<Vald>(null);
  const [msg, setMsg] = useState('');
  const spara = (ny: Struktur, m = '') => { sparaStruktur(ny); setS(ny); if (m) setMsg(m); };
  const kor = (fn: () => Struktur, m: string) => {
    try { spara(fn(), `✓ ${m}`); } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
  };

  return (
    <div className="studio">
      <header className="topbar">
        <span className="logo">📘 Classroom Planner <b>Studio</b> <small>v2</small></span>
        <span className="spacer" />
        <button className="btn sec" onClick={() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([exportJson(s)], { type: 'application/json' }));
          a.download = `studio_backup_${new Date().toISOString().slice(0, 10)}.json`;
          a.click(); URL.revokeObjectURL(a.href);
        }}>⬇ Backup</button>
        <label className="btn sec file-btn">⬆ Återställ
          <input type="file" accept="application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void f.text().then((t) => { try { spara(importJson(t), '✓ Backup återställd.'); } catch (err) { setMsg(`✗ ${(err as Error).message}`); } });
            e.currentTarget.value = '';
          }} />
        </label>
      </header>
      <div className="cols">
        <nav className="tree" aria-label="Struktur">
          <Trad s={s} vald={vald} setVald={setVald} kor={kor} />
        </nav>
        <main className="panel">
          {msg && <p className="status">{msg}</p>}
          {vald === null && <Start s={s} />}
          {vald?.typ === 'skolar' && <SkolarPanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'tjanst' && <TjanstPanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'klass' && <KlassPanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
          {vald?.typ === 'amne' && <AmnePanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'bok' && <BokPanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'larare' && <LararePanel s={s} kor={kor} />}
        </main>
      </div>
    </div>
  );
}

function Start({ s }: { s: Struktur }) {
  return (
    <div className="card">
      <h2>Kom igång</h2>
      <ol className="steg">
        <li><b>Skolår</b> — lägg till läsåret; röda dagar beräknas automatiskt, lov/temadagar/idrottsdagar klistras in eller läses ur .ics.</li>
        <li><b>Bibliotek</b> — importera böcker (JSON från Bokimport-prompten). Lektioner skapas fristående, utan koppling till schema, lärare eller klass.</li>
        <li><b>Tjänst → Klass → Ämne</b> — varje ämne får sitt eget schema (inget ärvs). Lärare är valfri och kan kopplas till tjänsten när som helst.</li>
        <li><b>Planering</b> — välj bok på ämnet och klicka <i>Skapa planering</i>: bokens lektioner läggs på schemat med datum.</li>
      </ol>
      <p className="muted">{s.skolar.length} skolår · {s.tjanster.length} tjänster · {s.klasser.length} klasser · {s.amnen.length} ämnen · {s.bocker.length} böcker · {s.planeringar.length} planeringar</p>
    </div>
  );
}

// ── Trädet ───────────────────────────────────────────────────
function Trad(props: { s: Struktur; vald: Vald; setVald: (v: Vald) => void; kor: (fn: () => Struktur, m: string) => void }) {
  const { s, vald, setVald, kor } = props;
  const ar = (v: Vald) => JSON.stringify(v) === JSON.stringify(vald);
  return (
    <>
      <div className="tree-h">SKOLÅR</div>
      {s.skolar.map((la) => (
        <div key={la.id}>
          <button className={`node ${ar({ typ: 'skolar', id: la.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'skolar', id: la.id })}>📅 {la.namn}</button>
          {s.tjanster.filter((t) => t.skolarId === la.id).map((t) => (
            <div key={t.id} className="ind">
              <button className={`node ${ar({ typ: 'tjanst', id: t.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'tjanst', id: t.id })}>
                💼 {t.namn}{t.larareId ? ` · ${s.larare.find((l) => l.id === t.larareId)?.signatur ?? ''}` : ''}
              </button>
              {s.klasser.filter((k) => k.tjanstId === t.id).map((k) => (
                <div key={k.id} className="ind">
                  <button className={`node ${ar({ typ: 'klass', id: k.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'klass', id: k.id })}>👥 {k.namn}</button>
                  {s.amnen.filter((a) => a.klassId === k.id).map((a) => (
                    <div key={a.id} className="ind">
                      <button className={`node ${ar({ typ: 'amne', id: a.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'amne', id: a.id })}>
                        📖 {a.namn}{a.bokId ? '' : ' · (ingen bok)'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      <NyttSkolar kor={kor} />
      <div className="tree-h">BIBLIOTEK</div>
      {s.bocker.map((b) => (
        <button key={b.id} className={`node ${ar({ typ: 'bok', id: b.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'bok', id: b.id })}>📗 {b.titel}</button>
      ))}
      <label className="node file-btn">⬆ Importera bok (JSON)
        <input type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then((t) => kor(() => { const bok = bokFromImport(t); return sparaBok(lasStruktur(), bok); },
            'Bok importerad — lektioner skapade utan koppling till schema, lärare eller klass.'));
          e.currentTarget.value = '';
        }} />
      </label>
      <div className="tree-h">LÄRARE</div>
      <button className={`node ${ar({ typ: 'larare' }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'larare' })}>🧑‍🏫 Lärare ({s.larare.length})</button>
    </>
  );
}

function NyttSkolar({ kor }: { kor: (fn: () => Struktur, m: string) => void }) {
  const [namn, setNamn] = useState('Läsåret 2026/2027');
  const [start, setStart] = useState('2026-08-17');
  const [slut, setSlut] = useState('2027-06-11');
  return (
    <div className="ny">
      <input aria-label="Skolårets namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
      <input aria-label="Start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      <input aria-label="Slut" type="date" value={slut} onChange={(e) => setSlut(e.target.value)} />
      <button className="btn" disabled={namn.trim() === '' || start === '' || slut === '' || slut <= start}
        onClick={() => kor(() => laggTillSkolar(lasStruktur(), { id: nyttId('la'), namn: namn.trim(), start, slut, dagar: [] }),
          `Skolår ${namn.trim()} skapat — röda dagar beräknas automatiskt; lägg till lov och temadagar i panelen.`)}>➕ Skolår</button>
    </div>
  );
}

// ── Skolår ───────────────────────────────────────────────────
function SkolarPanel({ s, id, kor }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void }) {
  const la = s.skolar.find((x) => x.id === id);
  const [text, setText] = useState('');
  if (!la) return null;
  const laggTillDagar = (nya: Skolar['dagar'], källa: string) => kor(
    () => uppdateraSkolar(lasStruktur(), id, { dagar: normaliseraDagar([...la.dagar, ...nya]) }),
    `${nya.length} dagar tillagda från ${källa} — berörda lektioner utgår ur planeringarna.`,
  );
  return (
    <div className="card">
      <h2>📅 {la.namn} <small className="muted">{la.start} – {la.slut}</small></h2>
      <p className="note">Röda dagar (helgdagar) hämtas automatiskt ur almanackan. Längre lov, temadagar, idrottsdagar och halvdagar lägger du till här — manuellt, via klistrad text eller via ett kalendarium (.ics / AI-prompten Kalendarium som ger samma textformat).</p>
      <div className="kal-paste">
        <textarea rows={4} aria-label="Kalendariumtext" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'2026-09-15 Temadag\n2026-10-26--2026-10-30 Höstlov\n2026-12-18 halvdag 12:00 Julavslutning\n2027-02-05 Idrottsdag'} />
        <div>
          <button className="btn" disabled={text.trim() === ''} onClick={() => {
            try { laggTillDagar(parseKalendarium(text), 'texten'); setText(''); } catch (e) { kor(() => { throw e; }, ''); }
          }}>➕ Lägg till från text</button>
          <label className="btn sec file-btn">⬆ Kalendarium (.ics)
            <input type="file" accept=".ics,text/calendar" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then((t) => { try { laggTillDagar(kalendariumFromIcs(t), f.name); } catch (err) { kor(() => { throw err; }, ''); } });
              e.currentTarget.value = '';
            }} />
          </label>
        </div>
      </div>
      {la.dagar.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Datum</th><th>Typ</th><th>Etikett</th><th></th></tr></thead>
          <tbody>{la.dagar.map((d) => (
            <tr key={d.datum}>
              <td>{d.datum}</td>
              <td>{d.typ === 'lov' ? 'Lov' : d.typ === 'heldag' ? 'Heldag' : `Halvdag — slutar ${d.slut}`}</td>
              <td>{d.label}</td>
              <td><button className="icon-btn" title="Ta bort" onClick={() => kor(
                () => uppdateraSkolar(lasStruktur(), id, { dagar: la.dagar.filter((x) => x.datum !== d.datum) }), 'Dag borttagen.')}>🗑</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <NyTjanst s={s} skolarId={id} kor={kor} />
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort ${la.namn}? Tjänster, klasser, ämnen och planeringar i skolåret försvinner.`)) {
            kor(() => taBortSkolar(lasStruktur(), id), 'Skolår borttaget.');
          }
        }}>🗑 Ta bort skolår</button>
      </div>
    </div>
  );
}

function NyTjanst({ s, skolarId, kor }: { s: Struktur; skolarId: string; kor: (fn: () => Struktur, m: string) => void }) {
  const [namn, setNamn] = useState('');
  return (
    <div className="ny rad">
      <input aria-label="Tjänstens namn" placeholder="Ny tjänst, t.ex. Ma/NO åk 8" value={namn} onChange={(e) => setNamn(e.target.value)} />
      <button className="btn" disabled={namn.trim() === ''}
        onClick={() => { kor(() => laggTillTjanst(lasStruktur(), { id: nyttId('tj'), skolarId, namn: namn.trim() }),
          `Tjänst ${namn.trim()} skapad — koppla lärare när du vill; ämnen kan planeras utan lärare.`); setNamn(''); }}>➕ Tjänst</button>
    </div>
  );
}

// ── Tjänst ───────────────────────────────────────────────────
function TjanstPanel({ s, id, kor }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void }) {
  const t = s.tjanster.find((x) => x.id === id);
  const [namn, setNamn] = useState('');
  if (!t) return null;
  return (
    <div className="card">
      <h2>💼 {t.namn}</h2>
      <label>Lärare:{' '}
        <select aria-label="Lärare för tjänsten" value={t.larareId ?? ''}
          onChange={(e) => kor(() => sattLarare(lasStruktur(), id, e.target.value === '' ? undefined : e.target.value),
            e.target.value === '' ? 'Läraren bortkopplad — planeringarna påverkas inte.' : 'Lärare kopplad till tjänsten.')}>
          <option value="">— ingen (planera utan lärare) —</option>
          {s.larare.map((l) => <option key={l.id} value={l.id}>{l.namn} ({l.signatur})</option>)}
        </select>
      </label>
      <div className="ny rad">
        <input aria-label="Klassens namn" placeholder="Ny klass, t.ex. 8B" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <button className="btn" disabled={namn.trim() === ''}
          onClick={() => { kor(() => laggTillKlass(lasStruktur(), {
            id: nyttId('k'), tjanstId: id, namn: namn.trim(),
            socrative: `Matte${namn.trim().replace(/\s+/g, '')}`,
          }), `Klass ${namn.trim()} skapad — lägg till ämnen med egna scheman.`); setNamn(''); }}>➕ Klass</button>
      </div>
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort tjänsten ${t.namn} med alla klasser och ämnen?`)) kor(() => taBortTjanst(lasStruktur(), id), 'Tjänst borttagen.');
        }}>🗑 Ta bort tjänst</button>
      </div>
    </div>
  );
}

// ── Passredigerare (delas av Klass- och Ämnespanelen) ────────
type PassRad = { dag: number; start: string; slut: string };
/** Nästa veckodag mån–fre med omslag: mån→tis … fre→mån. */
function nastaDag(dag: number): number { return (dag % 5) + 1; }

function PassRedigerare(props: { pass: PassRad[]; onChange: (p: PassRad[]) => void }) {
  const { pass, onChange } = props;
  return (
    <>
      {pass.map((p, i) => (
        <div key={i} className="ny rad">
          <select aria-label={`Veckodag pass ${i + 1}`} value={p.dag} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, dag: Number(e.target.value) } : x)))}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{DAGNAMN[d]}</option>)}
          </select>
          <input aria-label={`Start pass ${i + 1}`} type="time" value={p.start} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <span>–</span>
          <input aria-label={`Slut pass ${i + 1}`} type="time" value={p.slut} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, slut: e.target.value } : x)))} />
          <button className="icon-btn" title="Ta bort pass" disabled={pass.length <= 1} onClick={() => onChange(pass.filter((_, j) => j !== i))}>🗑</button>
        </div>
      ))}
      <button className="btn sec" onClick={() => {
        const sista = pass[pass.length - 1] ?? { dag: 0, start: '08:10', slut: '09:10' };
        onChange([...pass, { ...sista, dag: nastaDag(sista.dag) }]); // dagen hoppar automatiskt vidare
      }}>➕ Pass</button>
    </>
  );
}

// ── Klass ────────────────────────────────────────────────────
function KlassPanel({ s, id, kor, setVald }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void }) {
  const k = s.klasser.find((x) => x.id === id);
  const [namn, setNamn] = useState('');
  const [bokId, setBokId] = useState('');
  const [pass, setPass] = useState<Array<{ dag: number; start: string; slut: string }>>([{ dag: 1, start: '08:10', slut: '09:10' }]);
  if (!k) return null;
  const giltiga = pass.filter((p) => giltigtPass(p as Pass));
  return (
    <div className="card">
      <h2>👥 {k.namn}</h2>
      <SocrativeFalt key={k.id} klass={k} kor={kor} />
      <p className="note">Varje ämne får sitt eget schema — inget ärvs. Bokens lektioner mappas sedan på schemat.</p>
      <h3>Nytt ämne</h3>
      <div className="ny rad">
        <input aria-label="Ämnets namn" placeholder="Ämne, t.ex. Matematik" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <select aria-label="Bok för ämnet" value={bokId} onChange={(e) => setBokId(e.target.value)}>
          <option value="">— bok senare —</option>
          {s.bocker.map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.amne})</option>)}
        </select>
      </div>
      <PassRedigerare pass={pass} onChange={setPass} />
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={namn.trim() === '' || giltiga.length === 0}
          onClick={() => {
            const amne: Amne = { id: nyttId('am'), klassId: id, namn: namn.trim(), bokId: bokId === '' ? undefined : bokId, schema: giltiga as Pass[] };
            kor(() => laggTillAmne(lasStruktur(), amne), `Ämne ${namn.trim()} skapat med ${giltiga.length} pass/vecka.`);
            setVald({ typ: 'amne', id: amne.id }); setNamn('');
          }}>➕ Lägg till ämne</button>
      </div>
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort klass ${k.namn} med alla ämnen och planeringar?`)) kor(() => taBortKlass(lasStruktur(), id), 'Klass borttagen.');
        }}>🗑 Ta bort klass</button>
      </div>
    </div>
  );
}

function SocrativeFalt({ klass, kor }: { klass: Klass; kor: (fn: () => Struktur, m: string) => void }) {
  const [rum, setRum] = useState(klass.socrative ?? '');
  const [sparat, setSparat] = useState(false);
  const andrad = rum !== (klass.socrative ?? '');
  return (
    <div className="ny rad">
      <label>Socrative-rum:{' '}
        <input aria-label="Socrative-rum" value={rum} placeholder={`t.ex. Matte${klass.namn.replace(/\s+/g, '')}`}
          onChange={(e) => { setRum(e.target.value); setSparat(false); }} />
      </label>
      <button className="btn" disabled={!andrad} onClick={() => {
        kor(() => uppdateraKlass(lasStruktur(), klass.id, { socrative: rum.trim() }),
          'Socrative-rum sparat — används i lektionskortens läxförhör och exit tickets.');
        setSparat(true); setTimeout(() => setSparat(false), 2500);
      }}>{sparat ? '✓ Sparat!' : '💾 Spara'}</button>
    </div>
  );
}

// ── Ämne + planering ─────────────────────────────────────────
function AmnePanel({ s, id, kor }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void }) {
  const a = s.amnen.find((x) => x.id === id);
  const klass = s.klasser.find((k) => k.id === a?.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const la = s.skolar.find((x) => x.id === tjanst?.skolarId);
  const bok = s.bocker.find((b) => b.id === a?.bokId);
  const plan = useMemo(() => (a && la && bok ? skapaPlanering(la, a.schema, bok) : []), [a, la, bok]);
  const harPlanering = s.planeringar.some((p) => p.amneId === id);
  const [valdRad, setValdRad] = useState<number | null>(null);
  if (!a || !klass || !la) return null;
  return (
    <div className="card">
      <h2>📖 {klass.namn} · {a.namn}</h2>
      <AmneSchemaRedigerare key={a.id} amne={a} kor={kor} />
      <label>Bok:{' '}
        <select aria-label="Bok för ämnet" value={a.bokId ?? ''}
          onChange={(e) => kor(() => uppdateraAmne(lasStruktur(), id, { bokId: e.target.value }),
            e.target.value === '' ? 'Boken bortkopplad.' : 'Bok vald — skapa planeringen nedan.')}>
          <option value="">— ingen bok —</option>
          {s.bocker.map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.forlag})</option>)}
        </select>
      </label>{' '}
      <button className="btn" disabled={!bok}
        onClick={() => kor(() => registreraPlanering(lasStruktur(), { id: nyttId('pl'), amneId: id, bokId: bok!.id, skapad: new Date().toISOString() }),
          `Planering skapad: ${bok!.titel} utlagd på ${klass.namn}s schema — ${plan.filter((p) => p.datum !== null).length} lektioner får datum.`)}>
        {harPlanering ? '↻ Uppdatera planering' : '▶ Skapa planering'}
      </button>
      {bok && plan.length > 0 && (
        <table className="tbl plan clickable">
          <thead><tr><th>Datum</th><th>V.</th><th>Tid</th><th>Kap</th><th>Avsnitt</th><th>{bok.nivaer.niva1}</th><th>{bok.nivaer.niva2}</th><th>{bok.nivaer.niva3}</th></tr></thead>
          <tbody>{plan.map((r, i) => (
            <tr key={i} className={`${r.datum === null ? 'saknas' : ''} ${valdRad === i ? 'vald' : ''}`}
              onClick={() => setValdRad(valdRad === i ? null : i)} title="Öppna lektionskort">
              <td>{r.datum ?? 'ryms ej'}</td><td>{r.vecka ?? ''}</td>
              <td>{r.start !== null ? `${r.start}–${r.slutTid}` : ''}</td>
              <td>{r.kapitel}</td><td>{r.lektion.avsnitt} · Del {r.lektion.del}</td>
              <td>{r.lektion.niva1}</td><td>{r.lektion.niva2}</td><td>{r.lektion.niva3}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {bok && valdRad !== null && plan[valdRad] && (
        <Lektionskort rad={plan[valdRad]} bok={bok} amnesNamn={a.namn} klass={klass}
          nr={valdRad + 1} onStang={() => setValdRad(null)} />
      )}
      <div className="modal-actions">
        <button className="btn warn" onClick={() => kor(() => taBortAmne(lasStruktur(), id), 'Ämne borttaget.')}>🗑 Ta bort ämne</button>
      </div>
    </div>
  );
}

// ── Bok ──────────────────────────────────────────────────────
function BokPanel({ s, id, kor }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void }) {
  const b = s.bocker.find((x) => x.id === id);
  const [kap, setKap] = useState<number | null>(null);
  if (!b) return null;
  const exportXlsx = () => {
    const rader = bokSidregister(b);
    const ws = XLSX.utils.json_to_sheet(rader.map((r) => ({ Nivå: r.niva, Kod: r.kod, Namn: r.namn, Sidor: r.sidor, Begrepp: r.begrepp })));
    ws['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 44 }, { wch: 12 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sidregister');
    XLSX.writeFile(wb, `${b.id}_sidregister.xlsx`);
  };
  const valtKap = b.kapitel.find((k) => k.nr === kap) ?? null;
  return (
    <div className="card">
      <h2>📗 {b.titel} <small className="muted">{b.forlag} · {b.amne}{b.arskurs ? ` åk ${b.arskurs}` : ''} · nivåer {b.nivaer.niva1}/{b.nivaer.niva2}/{b.nivaer.niva3}</small></h2>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" onClick={exportXlsx}>⬇ Sidregister (Excel)</button>
        <button className="btn sec" onClick={() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([bokSidregisterCsv(b)], { type: 'text/csv' }));
          a.download = `${b.id}_sidregister.csv`; a.click(); URL.revokeObjectURL(a.href);
        }}>⬇ CSV</button>
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort ${b.titel}? Ämnen kopplas loss och bokens planeringar tas bort.`)) kor(() => taBortBok(lasStruktur(), id), 'Bok borttagen.');
        }}>🗑 Ta bort bok</button>
      </div>
      <table className="tbl">
        <thead><tr><th>Kap</th><th>Namn</th><th>Sidor</th><th>Delkapitel</th><th>Begrepp</th><th></th></tr></thead>
        <tbody>{b.kapitel.map((k) => (
          <tr key={k.nr}>
            <td><span className="kap-farg" style={{ background: k.farg }} />{k.nr}</td>
            <td>{k.namn}</td><td>{k.sidor}</td>
            <td>{k.delkapitel.map((d) => d.kod).join(', ')}</td>
            <td>{k.begreppslista.length}</td>
            <td><button className="btn sec" onClick={() => setKap(kap === k.nr ? null : k.nr)}>{kap === k.nr ? 'Dölj' : 'Öppna'}</button></td>
          </tr>
        ))}</tbody>
      </table>
      {valtKap && <KapitelDetalj s={s} bok={b} kap={valtKap} kor={kor} />}
      <h3>Begreppslista</h3>
      <ul className="begrepp">
        {bokBegrepp(b).map((g) => <li key={g.kod}><b>{g.kod}</b>: {g.begrepp.join(', ')}</li>)}
      </ul>
    </div>
  );
}

function KapitelDetalj({ s, bok, kap, kor }: { s: Struktur; bok: Bok; kap: Kapitel; kor: (fn: () => Struktur, m: string) => void }) {
  const [titel, setTitel] = useState('');
  const [url, setUrl] = useState('');
  const uppdateraKap = (patch: Partial<Kapitel>, m: string) => kor(() => {
    const nu = lasStruktur();
    const b = nu.bocker.find((x) => x.id === bok.id)!;
    return sparaBok(nu, { ...b, kapitel: b.kapitel.map((k) => (k.nr === kap.nr ? { ...k, ...patch } : k)) });
  }, m);
  const res = kap.resurser;
  const sattFlip = (falt: 'flippSammanfattningUrl' | 'flippFilmUrl' | 'flippQuizUrl', label: string) => {
    const v = window.prompt(`${label} (länk):`, res[falt] ?? '');
    if (v !== null) uppdateraKap({ resurser: { ...res, [falt]: v.trim() === '' ? undefined : v.trim() } }, `${label} sparad.`);
  };
  return (
    <div className="kapdetalj">
      <h3>Kapitel {kap.nr} — {kap.namn} <small className="muted">{kap.sidor}</small></h3>
      <table className="tbl">
        <thead><tr><th>Delkapitel</th><th>Sidor</th><th>Begrepp</th></tr></thead>
        <tbody>{kap.delkapitel.map((d) => (
          <tr key={d.kod}><td>{d.kod} {d.namn}</td><td>{d.sidor}</td><td>{d.begrepp.join(', ')}</td></tr>
        ))}</tbody>
      </table>
      <h4>Flippat klassrum</h4>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn sec" onClick={() => sattFlip('flippSammanfattningUrl', 'Teorisammanfattning (Word)')}>
          📄 Sammanfattning {res.flippSammanfattningUrl ? '✓' : ''}</button>
        <button className="btn sec" onClick={() => sattFlip('flippFilmUrl', 'Film för flippat klassrum')}>
          🎬 Filmlänk {res.flippFilmUrl ? '✓' : ''}</button>
        <button className="btn sec" onClick={() => sattFlip('flippQuizUrl', 'Quiz')}>
          ❓ Quiz {res.flippQuizUrl ? '✓' : ''}</button>
      </div>
      <h4>Filmer ({res.filmer.length})</h4>
      {res.filmer.map((f, i) => (
        <div key={i} className="rad">
          <a href={f.url} target="_blank" rel="noreferrer">{f.titel}</a>
          <button className="icon-btn" onClick={() => uppdateraKap({ resurser: { ...res, filmer: res.filmer.filter((_, j) => j !== i) } }, 'Film borttagen.')}>🗑</button>
        </div>
      ))}
      <div className="ny rad">
        <input aria-label="Filmtitel" placeholder="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
        <input aria-label="Filmlänk" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={titel.trim() === '' || !url.startsWith('http')}
          onClick={() => { uppdateraKap({ resurser: { ...res, filmer: [...res.filmer, { titel: titel.trim(), url: url.trim() }] } }, 'Film tillagd.'); setTitel(''); setUrl(''); }}>➕ Film</button>
      </div>
    </div>
  );
}

// ── Ämnets schema: redigeras och sparas uttryckligen ─────────
function AmneSchemaRedigerare({ amne, kor }: { amne: Amne; kor: (fn: () => Struktur, m: string) => void }) {
  const [rows, setRows] = useState<PassRad[]>(amne.schema.map((p) => ({ ...p })));
  const [sparat, setSparat] = useState(false);
  const giltiga = rows.every((p) => giltigtPass(p as Pass));
  const andrad = JSON.stringify(rows) !== JSON.stringify(amne.schema);
  return (
    <div className="schema-red">
      <h3>Schema <small className="muted">{amne.schema.map((p) => `${DAGNAMN[p.dag]} ${p.start}–${p.slut}`).join(' · ')}</small></h3>
      <PassRedigerare pass={rows} onChange={(p) => { setRows(p); setSparat(false); }} />
      <button className="btn" disabled={!andrad || !giltiga || rows.length === 0}
        title={!giltiga ? 'Minst ett pass är ogiltigt (start < slut, mån–fre)' : !andrad ? 'Inga osparade ändringar' : ''}
        onClick={() => {
          kor(() => uppdateraAmne(lasStruktur(), amne.id, { schema: rows.map((p) => ({ ...p })) }),
            `Schema sparat (${rows.length} pass/vecka) — planeringen har räknats om med de nya tiderna.`);
          setSparat(true); setTimeout(() => setSparat(false), 2500);
        }}>{sparat ? '✓ Sparat!' : '💾 Spara schema'}</button>
      {andrad && !sparat && <span className="osparat">● osparade ändringar</span>}
    </div>
  );
}

// ── Lektionskort (BAM: Läxförhör → Genomgång → Arbete → Exit ticket) ──
function Lektionskort(props: {
  rad: PlaneradLektion; bok: Bok; amnesNamn: string; klass: Klass; nr: number; onStang: () => void;
}) {
  const { rad, bok, amnesNamn, klass, nr, onStang } = props;
  const l = rad.lektion;
  const start = rad.start ?? '08:10';
  const slut = rad.slutTid ?? '09:10';
  const N = bok.nivaer;
  const har = (v: string) => v !== '—' && v !== '';
  const seg = bamTidslinje(l, start, slut);
  const exit = exitStart(l, start, slut);
  const begrepp = begreppForLektion(bok, rad.kapitel, l);
  const { minimum } = arbetsNivaer(l);
  const rum = klass.socrative?.trim() !== '' && klass.socrative !== undefined ? klass.socrative : '—';
  const nivaNamn = [N.niva1, N.niva2, N.niva3] as const;
  const nivaUppg = [l.niva1, l.niva2, l.niva3] as const;
  return (
    <div className="lkort" data-testid="lektionskort">
      <div className="lkort-topp">
        <div>
          <div className="tavla" title="Högst upp på tavlan">{tavelrubrik(amnesNamn, start, slut)}</div>
          <h3>Lektion {nr} · {l.avsnitt} · Del {l.del} <small className="muted">{rad.datum ?? 'ryms ej'}{rad.vecka !== null ? ` · v. ${rad.vecka}` : ''} · {klass.namn}</small></h3>
        </div>
        <div className="rad">
          <button className="btn sec no-print" onClick={() => window.print()}>🖨 Skriv ut</button>
          <button className="btn sec no-print" onClick={onStang}>✕ Stäng</button>
        </div>
      </div>

      {l.typ !== 'exam' && (
        <div className="lkort-sekt">
          <h4>📱 1 · Läxförhör <small className="muted">{seg[0]?.start}–{seg[0]?.slut}</small></h4>
          <p>Socrative — rum <b>{rum}</b>{har(l.socStart) ? <> · {l.socStart}</> : null}. Läxan är delkapitlets begrepp.</p>
        </div>
      )}

      <div className="lkort-sekt">
        <h4>🧑‍🏫 2 · Genomgång</h4>
        <p>{har(l.genomgang) ? l.genomgang : '—'}</p>
        {har(l.ex) && <p><b>Exempel att räkna tillsammans:</b> {l.ex}</p>}
        {har(l.sidorTeori) && <p className="muted">Teori: {l.sidorTeori}</p>}
      </div>

      <div className="lkort-sekt">
        <h4>✏️ 3 · Arbete — {l.del === 2 ? `${N.niva2}/${N.niva3}` : `${N.niva1}/${N.niva2}`} <small className="muted">minimum: {nivaNamn[minimum - 1]}</small></h4>
        <div className="nivaer">
          {[0, 1, 2].map((i) => har(nivaUppg[i]) && (
            <div key={i} className={`niva n${i + 1}`}>
              <h6>{nivaNamn[i].toUpperCase()} {i === 0 ? '– INTRODUKTION' : i === 1 ? '– E-NIVÅ' : '– C/A-NIVÅ'}</h6>
              <p>Uppg. {nivaUppg[i]}</p>
              <small>{i + 1 < 3 ? (i + 1 <= minimum ? 'Obligatorisk' : i === 1 ? 'Obligatorisk' : '') : 'Frivillig / vid lektionstid'}</small>
            </div>
          ))}
        </div>
        <p className="note">Klara uppgifter fotograferas och laddas upp i klassens inlämningsyta (Teams, Classroom m.fl.). Minst {nivaNamn[0]}- och {nivaNamn[1]}-uppgifter är obligatoriska; {nivaNamn[2]} är frivillig fördjupning. Ej klart görs hemma eller på stödtid.</p>
      </div>

      {begrepp.length > 0 && (
        <div className="lkort-sekt">
          <h4>📚 Begrepp / läxa</h4>
          <p>{begrepp.map((b) => <span key={b} className="chip">{b}</span>)}</p>
          {har(l.laxa) && <p className="muted">Läxa: {l.laxa}</p>}
        </div>
      )}

      {l.typ !== 'exam' && (
        <div className="lkort-sekt">
          <h4>🎫 4 · Exit ticket <small className="muted">{exit}–{slut}</small></h4>
          <p>Socrative — rum <b>{rum}</b>{har(l.exit) ? <> · {l.exit}</> : null}. Lektionstest på dagens grundläggande uppgifter, sista {seg[seg.length - 1]?.minuter} minuterna.</p>
        </div>
      )}

      <table className="tbl bam">
        <thead><tr><th>Moment</th><th>Tid</th><th>Min</th></tr></thead>
        <tbody>{seg.map((x) => (
          <tr key={x.namn}><td>{x.ikon} {x.namn}</td><td>{x.start}–{x.slut}</td><td>{x.minuter}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── Lärare ───────────────────────────────────────────────────
function LararePanel({ s, kor }: { s: Struktur; kor: (fn: () => Struktur, m: string) => void }) {
  const [namn, setNamn] = useState('');
  const [sign, setSign] = useState('');
  return (
    <div className="card">
      <h2>🧑‍🏫 Lärare</h2>
      {s.larare.map((l) => {
        const schema = larareSchema(s, l.id);
        const konflikter = schemaKonflikter(schema);
        return (
          <div key={l.id} className="larare">
            <div className="rad">
              <b>{l.namn}</b> <span className="muted">({l.signatur})</span>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => kor(() => taBortLarare(lasStruktur(), l.id), 'Lärare borttagen — tjänsterna består.')}>🗑</button>
            </div>
            {schema.length === 0
              ? <p className="muted">Inget schema ännu — koppla läraren till en tjänst.</p>
              : <table className="tbl">
                  <thead><tr><th>Dag</th><th>Tid</th><th>Klass</th><th>Ämne</th></tr></thead>
                  <tbody>{schema.map((r, i) => (
                    <tr key={i}><td>{DAGNAMN[r.dag]}</td><td>{r.start}–{r.slut}</td><td>{r.klassNamn}</td><td>{r.amnesNamn}</td></tr>
                  ))}</tbody>
                </table>}
            {konflikter.length > 0 && (
              <p className="status">⚠ {konflikter.length} schemakonflikt(er): {konflikter.map(([a, b2]) => `${DAGNAMN[a.dag]} ${a.start} ${a.klassNamn}/${a.amnesNamn} ↔ ${b2.klassNamn}/${b2.amnesNamn}`).join('; ')}</p>
            )}
          </div>
        );
      })}
      <div className="ny rad">
        <input aria-label="Lärarens namn" placeholder="Namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <input aria-label="Signatur" placeholder="Signatur" value={sign} onChange={(e) => setSign(e.target.value)} />
        <button className="btn" disabled={namn.trim() === '' || sign.trim() === ''}
          onClick={() => { kor(() => laggTillLarare(lasStruktur(), { id: nyttId('lar'), namn: namn.trim(), signatur: sign.trim() }), 'Lärare tillagd — koppla till en tjänst i tjänstpanelen.'); setNamn(''); setSign(''); }}>➕ Lärare</button>
      </div>
      <p className="note">Lärarens schema härleds ur tjänstens klassers ämnespass — det lagras aldrig separat, så det uppdateras automatiskt när ämnen ändras.</p>
    </div>
  );
}
