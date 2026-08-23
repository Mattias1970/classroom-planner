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
  STANDARD_AMNEN, arbetsNivaer, arHalvklass, handelserPerDatum, kalenderHandelser,
  kapitelKort, manadsRutor, skolarManader, veckaRutor, viktigaDatum, bamTidslinje, begreppForLektion, bokBegrepp,
  bokFromImport, bokSidregister, bokSidregisterCsv, elevSchema, exitStart, giltigtPass,
  kalendariumFromIcs, laggTillAmne, laggTillElev, laggTillKlass, laggTillLarare,
  laggTillSkolar, laggTillTjanst, larareSchema, normaliseraDagar, nyttId, parseKalendarium,
  registreraPlanering, sattLarare, schemaKonflikter, skapaPlanering, socrativeRum, sparaBok,
  taBortAmne, taBortBok, taBortElev, taBortKlass, taBortLarare, taBortSkolar, taBortTjanst,
  tavelrubrik, uppdateraAmne, uppdateraElev, uppdateraSkolar,
  type Amne, type Bok, type Grupp, type KalenderDagRuta, type KalenderHandelse,
  type Kapitel, type Klass, type Pass, type PlaneradLektion, type Skolar, type Struktur,
} from '@planner/kernel';
import { exportJson, importJson, lasStruktur, sparaStruktur } from './store.js';

const DAGNAMN = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
type Vald =
  | { typ: 'skolar'; id: string } | { typ: 'tjanst'; id: string }
  | { typ: 'klass'; id: string } | { typ: 'amne'; id: string }
  | { typ: 'bok'; id: string } | { typ: 'larare' }
  | { typ: 'nyttSkolar' } | { typ: 'nyBok' } | { typ: 'kalender' } | null;

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
          {vald?.typ === 'tjanst' && <TjanstPanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
          {vald?.typ === 'klass' && <KlassPanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
          {vald?.typ === 'amne' && <AmnePanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'bok' && <BokPanel s={s} id={vald.id} kor={kor} />}
          {vald?.typ === 'larare' && <LararePanel s={s} kor={kor} />}
          {vald?.typ === 'nyttSkolar' && <NyttSkolarPanel kor={kor} setVald={setVald} />}
          {vald?.typ === 'nyBok' && <NyBokPanel kor={kor} setVald={setVald} />}
          {vald?.typ === 'kalender' && <KalenderVy s={s} />}
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
  const { s, vald, setVald } = props;
  const ar = (v: Vald) => JSON.stringify(v) === JSON.stringify(vald);
  return (
    <>
      <button className={`node stor ${ar({ typ: 'kalender' }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'kalender' })}>📆 Kalender</button>
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
      <button className="node add" onClick={() => setVald({ typ: 'nyttSkolar' })}>➕ Lägg till skolår</button>

      <div className="tree-h">TJÄNSTER</div>
      {s.tjanster.length === 0 && <div className="node muted">Inga tjänster ännu</div>}
      {s.tjanster.map((t) => {
        const la = s.skolar.find((x) => x.id === t.skolarId);
        const antalK = s.klasser.filter((k) => k.tjanstId === t.id).length;
        return (
          <button key={t.id} className={`node ${ar({ typ: 'tjanst', id: t.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'tjanst', id: t.id })}>
            💼 {t.namn} <small className="muted">{la?.namn ?? ''} · {antalK} klasser</small>
          </button>
        );
      })}
      <span className="node muted small">Tjänster läggs till på ett skolår</span>

      <div className="tree-h">BÖCKER</div>
      {s.bocker.map((b) => (
        <button key={b.id} className={`node ${ar({ typ: 'bok', id: b.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'bok', id: b.id })}>📗 {b.titel}</button>
      ))}
      <button className="node add" onClick={() => setVald({ typ: 'nyBok' })}>➕ Lägg till bok</button>

      <div className="tree-h">LÄRARE</div>
      {s.larare.map((l) => (
        <button key={l.id} className={`node ${ar({ typ: 'larare' }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'larare' })}>🧑‍🏫 {l.namn} <small className="muted">{l.signatur}</small></button>
      ))}
      <button className="node add" onClick={() => setVald({ typ: 'larare' })}>➕ Lägg till lärare</button>
    </>
  );
}

function NyttSkolarPanel({ kor, setVald }: { kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void }) {
  const [namn, setNamn] = useState('Läsåret 2026/2027');
  const [start, setStart] = useState('2026-08-17');
  const [slut, setSlut] = useState('2027-06-11');
  const giltigt = namn.trim() !== '' && start !== '' && slut > start;
  return (
    <div className="card">
      <h2>➕ Lägg till skolår</h2>
      <p className="note">Röda dagar (helgdagar) beräknas automatiskt. Lov, temadagar, idrottsdagar och halvdagar lägger du till i skolårets panel efteråt. Skolårets namn måste vara unikt.</p>
      <div className="ny rad">
        <input aria-label="Skolårets namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <input aria-label="Start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input aria-label="Slut" type="date" value={slut} onChange={(e) => setSlut(e.target.value)} />
      </div>
      <button className="btn" disabled={!giltigt} onClick={() => {
        const id = nyttId('la');
        kor(() => laggTillSkolar(lasStruktur(), { id, namn: namn.trim(), start, slut, dagar: [] }),
          `Skolår ${namn.trim()} skapat.`);
        if (lasStruktur().skolar.some((x) => x.id === id)) setVald({ typ: 'skolar', id });
      }}>➕ Lägg till skolår</button>
    </div>
  );
}

function NyBokPanel({ kor, setVald }: { kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void }) {
  return (
    <div className="card">
      <h2>➕ Lägg till bok</h2>
      <p className="note">Böcker är fristående: lektioner skapas utan koppling till schema, lärare eller klass, och kopplas sedan till ett ämne. Skapa bokfilen (JSON) genom att fotografera boksidor och köra prompten <b>Bokimport</b> — importera den här.</p>
      <label className="btn file-btn">⬆ Importera bok (JSON)
        <input type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then((t) => {
            let nyId = '';
            kor(() => { const bok = bokFromImport(t); nyId = bok.id; return sparaBok(lasStruktur(), bok); },
              'Bok importerad — koppla den till ett ämne för att skapa en planering.');
            if (nyId !== '' && lasStruktur().bocker.some((b) => b.id === nyId)) setVald({ typ: 'bok', id: nyId });
          });
          e.currentTarget.value = '';
        }} />
      </label>
    </div>
  );
}

// ── Skolår ───────────────────────────────────────────────────
function SkolarPanel({ s, id, kor }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void }) {
  const la = s.skolar.find((x) => x.id === id);
  const [text, setText] = useState('');
  if (!la) return null;
  return <SkolarPanelInner key={la.id} s={s} la={la} kor={kor} text={text} setText={setText} laggTillDagarFabrik={(fn) => fn} />;
}

function SkolarPanelInner(props: {
  s: Struktur; la: Skolar; kor: (fn: () => Struktur, m: string) => void;
  text: string; setText: (t: string) => void;
  laggTillDagarFabrik: <T>(x: T) => T;
}) {
  const { s, la, kor, text, setText } = props;
  const id = la.id;
  const laggTillDagar = (nya: Skolar['dagar'], källa: string) => kor(
    () => uppdateraSkolar(lasStruktur(), id, { dagar: normaliseraDagar([...la.dagar, ...nya]) }),
    `${nya.length} dagar tillagda från ${källa} — berörda lektioner utgår ur planeringarna.`,
  );
  return (
    <div className="card">
      <h2>📅 {la.namn} <small className="muted">{la.start} – {la.slut}</small></h2>
      <SkolarRedigerare la={la} kor={kor} />
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

function SkolarRedigerare({ la, kor }: { la: Skolar; kor: (fn: () => Struktur, m: string) => void }) {
  const [namn, setNamn] = useState(la.namn);
  const [start, setStart] = useState(la.start);
  const [slut, setSlut] = useState(la.slut);
  const [sparat, setSparat] = useState(false);
  const andrad = namn !== la.namn || start !== la.start || slut !== la.slut;
  const giltigt = namn.trim() !== '' && start !== '' && slut > start;
  return (
    <div className="ny rad">
      <input aria-label="Redigera skolårets namn" value={namn} onChange={(e) => { setNamn(e.target.value); setSparat(false); }} />
      <input aria-label="Redigera start" type="date" value={start} onChange={(e) => { setStart(e.target.value); setSparat(false); }} />
      <input aria-label="Redigera slut" type="date" value={slut} onChange={(e) => { setSlut(e.target.value); setSparat(false); }} />
      <button className="btn" disabled={!andrad || !giltigt}
        title={!giltigt ? 'Namn krävs och slutdatum måste vara efter start' : !andrad ? 'Inga osparade ändringar' : ''}
        onClick={() => {
          kor(() => uppdateraSkolar(lasStruktur(), la.id, { namn: namn.trim(), start, slut }),
            'Skolåret uppdaterat — planeringarna följer de nya datumen.');
          setSparat(true); setTimeout(() => setSparat(false), 2500);
        }}>{sparat ? '✓ Sparat!' : '💾 Spara skolår'}</button>
      {andrad && !sparat && <span className="osparat">● osparade ändringar</span>}
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
          `Tjänst ${namn.trim()} skapad — koppla lärare när du vill; ämnen kan planeras utan lärare.`); setNamn(''); }}>➕ Lägg till tjänst</button>
    </div>
  );
}

// ── Tjänst ───────────────────────────────────────────────────
function TjanstPanel({ s, id, kor, setVald }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void }) {
  const t = s.tjanster.find((x) => x.id === id);
  const [namn, setNamn] = useState('');
  if (!t) return null;
  const la = s.skolar.find((x) => x.id === t.skolarId);
  const klasser = s.klasser.filter((k) => k.tjanstId === id);
  return (
    <div className="card">
      <h2>💼 {t.namn} <small className="muted">{la?.namn ?? ''}</small></h2>
      <label>Lärare:{' '}
        <select aria-label="Lärare för tjänsten" value={t.larareId ?? ''}
          onChange={(e) => kor(() => sattLarare(lasStruktur(), id, e.target.value === '' ? undefined : e.target.value),
            e.target.value === '' ? 'Läraren bortkopplad — planeringarna påverkas inte.' : 'Lärare kopplad till tjänsten.')}>
          <option value="">— ingen (planera utan lärare) —</option>
          {s.larare.map((l) => <option key={l.id} value={l.id}>{l.namn} ({l.signatur})</option>)}
        </select>
      </label>

      <h3>Klasser och ämnen</h3>
      {klasser.length === 0 && <p className="muted">Inga klasser ännu — lägg till en nedan.</p>}
      {klasser.map((k) => {
        const amnen = s.amnen.filter((a) => a.klassId === k.id);
        const antalElever = s.elever.filter((e) => e.klassId === k.id).length;
        return (
          <div key={k.id} className="tj-klass">
            <div className="rad">
              <button className="lank" onClick={() => setVald({ typ: 'klass', id: k.id })}>👥 <b>{k.namn}</b></button>
              <span className="muted">· {amnen.length} ämnen · {antalElever} elever</span>
            </div>
            {amnen.length === 0
              ? <p className="muted small">Inga ämnen — öppna klassen för att lägga till.</p>
              : <table className="tbl">
                  <thead><tr><th>Ämne</th><th>Bok</th><th>Planering</th><th></th></tr></thead>
                  <tbody>{amnen.map((a) => {
                    const bok = s.bocker.find((b) => b.id === a.bokId);
                    const harPlan = s.planeringar.some((p) => p.amneId === a.id);
                    return (
                      <tr key={a.id}>
                        <td>{a.namn}{a.halvklass === true ? ' (A/B)' : ''}</td>
                        <td>{bok ? bok.titel : <span className="muted">— ingen bok —</span>}</td>
                        <td>{harPlan ? <span className="ok">✓ planerad</span> : bok ? <span className="muted">ej skapad</span> : <span className="muted">kräver bok</span>}</td>
                        <td><button className="btn sec sm" onClick={() => setVald({ typ: 'amne', id: a.id })}>Öppna / planera →</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>}
          </div>
        );
      })}

      <div className="ny rad">
        <input aria-label="Klassens namn" placeholder="Ny klass, t.ex. 8B" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <button className="btn" disabled={namn.trim() === ''}
          onClick={() => { kor(() => laggTillKlass(lasStruktur(), { id: nyttId('k'), tjanstId: id, namn: namn.trim() }),
            `Klass ${namn.trim()} skapad — lägg till ämnen med egna scheman.`); setNamn(''); }}>➕ Lägg till klass</button>
      </div>
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort tjänsten ${t.namn} med alla klasser och ämnen?`)) { kor(() => taBortTjanst(lasStruktur(), id), 'Tjänst borttagen.'); setVald(null); }
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

function PassRedigerareB(props: { pass: PassRad[]; onChange: (p: PassRad[]) => void }) {
  const { pass, onChange } = props;
  return (
    <>
      {pass.map((p, i) => (
        <div key={i} className="ny rad">
          <select aria-label={`Grupp B veckodag pass ${i + 1}`} value={p.dag} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, dag: Number(e.target.value) } : x)))}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{DAGNAMN[d]}</option>)}
          </select>
          <input aria-label={`Grupp B start pass ${i + 1}`} type="time" value={p.start} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <span>–</span>
          <input aria-label={`Grupp B slut pass ${i + 1}`} type="time" value={p.slut} onChange={(e) => onChange(pass.map((x, j) => (j === i ? { ...x, slut: e.target.value } : x)))} />
          <button className="icon-btn" title="Ta bort pass" disabled={pass.length <= 1} onClick={() => onChange(pass.filter((_, j) => j !== i))}>🗑</button>
        </div>
      ))}
      <button className="btn sec" onClick={() => {
        const sista = pass[pass.length - 1] ?? { dag: 0, start: '08:10', slut: '09:10' };
        onChange([...pass, { ...sista, dag: nastaDag(sista.dag) }]);
      }}>➕ Pass (Grupp B)</button>
    </>
  );
}

// ── Klass ────────────────────────────────────────────────────
function KlassPanel({ s, id, kor, setVald }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void }) {
  const k = s.klasser.find((x) => x.id === id);
  const [namn, setNamn] = useState<string>(STANDARD_AMNEN[0]);
  const [bokId, setBokId] = useState('');
  const [pass, setPass] = useState<PassRad[]>([{ dag: 1, start: '08:10', slut: '09:10' }]);
  const [passB, setPassB] = useState<PassRad[]>([{ dag: 2, start: '08:10', slut: '09:10' }]);
  if (!k) return null;
  const halv = arHalvklass(namn);
  const giltiga = pass.filter((p) => giltigtPass(p as Pass));
  const giltigaB = passB.filter((p) => giltigtPass(p as Pass));
  const bocker = s.bocker.filter((b) => b.amne === namn);
  return (
    <div className="card">
      <h2>👥 {k.namn}</h2>
      <p className="note">Varje ämne får sitt eget schema — inget ärvs. Bokens lektioner mappas sedan på schemat.
        Biologi, Fysik, Kemi och Teknik läses i halvklass: Grupp A och Grupp B har varsin tid, och Socrative-rummen
        heter t.ex. {socrativeRum('Biologi', k.namn, 'A')} / {socrativeRum('Biologi', k.namn, 'B')} (Matematik: {socrativeRum('Matematik', k.namn, 'A')}).</p>
      <h3>Nytt ämne</h3>
      <div className="ny rad">
        <select aria-label="Ämne" value={namn} onChange={(e) => { setNamn(e.target.value); setBokId(''); }}>
          {STANDARD_AMNEN.map((a) => <option key={a} value={a}>{a}{arHalvklass(a) ? ' (halvklass)' : ''}</option>)}
        </select>
        <select aria-label="Bok för ämnet" value={bokId} onChange={(e) => setBokId(e.target.value)}>
          <option value="">— bok senare —</option>
          {bocker.map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.amne})</option>)}
        </select>
      </div>
      {halv && <h4 className="grupp-h">Grupp A · rum {socrativeRum(namn, k.namn, 'A')}</h4>}
      <PassRedigerare pass={pass} onChange={setPass} />
      {halv && (<>
        <h4 className="grupp-h">Grupp B · rum {socrativeRum(namn, k.namn, 'B')}</h4>
        <PassRedigerareB pass={passB} onChange={setPassB} />
      </>)}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={giltiga.length === 0 || (halv && giltigaB.length === 0)}
          title={halv && giltigaB.length === 0 ? 'Halvklassämnen behöver schema för både Grupp A och Grupp B' : ''}
          onClick={() => {
            const amne: Amne = {
              id: nyttId('am'), klassId: id, namn, bokId: bokId === '' ? undefined : bokId,
              schema: giltiga as Pass[],
              ...(halv ? { halvklass: true as const, schemaB: giltigaB as Pass[] } : {}),
            };
            kor(() => laggTillAmne(lasStruktur(), amne), `Ämne ${namn} skapat${halv ? ' (halvklass, Grupp A/B)' : ''}.`);
            setVald({ typ: 'amne', id: amne.id });
          }}>➕ Lägg till ämne</button>
      </div>
      <Elevlista s={s} klassId={id} klassNamn={k.namn} kor={kor} />
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          if (window.confirm(`Ta bort klass ${k.namn} med alla ämnen och planeringar?`)) kor(() => taBortKlass(lasStruktur(), id), 'Klass borttagen.');
        }}>🗑 Ta bort klass</button>
      </div>
    </div>
  );
}

// ── Elevlista med Grupp A/B ──────────────────────────────────
function Elevlista({ s, klassId, klassNamn, kor }: {
  s: Struktur; klassId: string; klassNamn: string; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [namn, setNamn] = useState('');
  const [grupp, setGrupp] = useState<Grupp>('A');
  const [visaSchema, setVisaSchema] = useState<string | null>(null);
  const elever = s.elever.filter((e) => e.klassId === klassId)
    .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const antal = (g: Grupp) => elever.filter((e) => e.grupp === g).length;
  return (
    <div className="elevlista">
      <h3>Elever <small className="muted">Grupp A: {antal('A')} · Grupp B: {antal('B')}</small></h3>
      <p className="note">Gruppen styr vilka halvklasspass som gäller för eleven — klicka 🗓 för att se elevens lektioner.</p>
      {elever.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Namn</th><th>Grupp</th><th></th><th></th></tr></thead>
          <tbody>{elever.map((e) => (<>
            <tr key={e.id}>
              <td>{e.namn}</td>
              <td>
                <select aria-label={`Grupp för ${e.namn}`} value={e.grupp}
                  onChange={(ev) => kor(() => uppdateraElev(lasStruktur(), e.id, { grupp: ev.target.value as Grupp }),
                    `${e.namn} flyttad till Grupp ${ev.target.value} — elevens lektioner följer den nya gruppen.`)}>
                  <option value="A">A</option><option value="B">B</option>
                </select>
              </td>
              <td><button className="icon-btn" title="Visa elevens lektioner"
                onClick={() => setVisaSchema(visaSchema === e.id ? null : e.id)}>🗓</button></td>
              <td><button className="icon-btn" title="Ta bort elev"
                onClick={() => kor(() => taBortElev(lasStruktur(), e.id), `${e.namn} borttagen.`)}>🗑</button></td>
            </tr>
            {visaSchema === e.id && (
              <tr key={`${e.id}-schema`} className="elev-schema">
                <td colSpan={4}>
                  {elevSchema(s, e.id).length === 0 ? <span className="muted">Inga pass ännu.</span>
                    : elevSchema(s, e.id).map((r, i) => (
                      <span key={i} className="chip">{DAGNAMN[r.dag]} {r.start}–{r.slut} {r.amnesNamn}{r.grupp !== undefined ? ` (Grupp ${r.grupp}, rum ${socrativeRum(r.amnesNamn, klassNamn, r.grupp)})` : ''}</span>
                    ))}
                </td>
              </tr>
            )}
          </>))}</tbody>
        </table>
      )}
      <div className="ny rad">
        <input aria-label="Elevens namn" placeholder="Namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
        <select aria-label="Grupp för ny elev" value={grupp} onChange={(e) => setGrupp(e.target.value as Grupp)}>
          <option value="A">Grupp A</option><option value="B">Grupp B</option>
        </select>
        <button className="btn" disabled={namn.trim() === ''}
          onClick={() => { kor(() => laggTillElev(lasStruktur(), { id: nyttId('e'), klassId, namn: namn.trim(), grupp }),
            `${namn.trim()} tillagd i Grupp ${grupp}.`); setNamn(''); }}>➕ Lägg till elev</button>
      </div>
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
  const planB = useMemo(() => (a && la && bok && a.halvklass === true ? skapaPlanering(la, a.schemaB ?? [], bok) : []), [a, la, bok]);
  const harPlanering = s.planeringar.some((p) => p.amneId === id);
  if (!a || !klass || !la) return null;
  const halv = a.halvklass === true;
  const rumA = socrativeRum(a.namn, klass.namn, 'A');
  const rumB = socrativeRum(a.namn, klass.namn, 'B');
  const [flik, setFlik] = useState<'planering' | 'arsoversikt'>('planering');
  return (
    <div className="card">
      <h2>📖 {klass.namn} · {a.namn}{halv ? <span className="pillm">halvklass A/B</span> : null}</h2>
      <p className="muted">Socrative-rum: <b>{rumA}</b>{halv ? <> (Grupp A) · <b>{rumB}</b> (Grupp B)</> : <> · <b>{rumB}</b></>} — läxförhör och exit tickets.</p>
      <div className="flikar no-print">
        <button className={`flik ${flik === 'planering' ? 'act' : ''}`} onClick={() => setFlik('planering')}>📝 Planering</button>
        <button className={`flik ${flik === 'arsoversikt' ? 'act' : ''}`} onClick={() => setFlik('arsoversikt')}>📊 Årsöversikt</button>
      </div>
      {flik === 'arsoversikt' && bok && <Arsoversikt bok={bok} plan={plan} nivaText={`${bok.nivaer.niva1} = introduktion · ${bok.nivaer.niva2} = E-nivå · ${bok.nivaer.niva3} = C/A-nivå`} />}
      {flik === 'arsoversikt' && !bok && <p className="muted">Koppla en bok för att se årsöversikten.</p>}
      {flik === 'planering' && (<>
      <AmneSchemaRedigerare key={a.id} amne={a} kor={kor} falt="schema"
        rubrik={halv ? `Schema Grupp A · rum ${rumA}` : 'Schema'} />
      {halv && <AmneSchemaRedigerare key={`${a.id}-B`} amne={a} kor={kor} falt="schemaB"
        rubrik={`Schema Grupp B · rum ${rumB}`} />}
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
          halv
            ? `Planering skapad: ${bok!.titel} utlagd på Grupp A (${plan.filter((p) => p.datum !== null).length} lektioner) och Grupp B (${planB.filter((p) => p.datum !== null).length} lektioner).`
            : `Planering skapad: ${bok!.titel} utlagd på ${klass.namn}s schema — ${plan.filter((p) => p.datum !== null).length} lektioner får datum.`)}>
        {harPlanering ? '↻ Uppdatera planering' : '▶ Skapa planering'}
      </button>
      {bok && !halv && <GruppPlanering plan={plan} bok={bok} amnesNamn={a.namn} klassNamn={klass.namn}
        rum={`${rumA} · ${rumB}`} />}
      {bok && halv && (<>
        <GruppPlanering plan={plan} bok={bok} amnesNamn={a.namn} klassNamn={klass.namn}
          rum={rumA} grupp="A" rubrik={`Grupp A · rum ${rumA}`} />
        <GruppPlanering plan={planB} bok={bok} amnesNamn={a.namn} klassNamn={klass.namn}
          rum={rumB} grupp="B" rubrik={`Grupp B · rum ${rumB}`} />
      </>)}
      </>)}
      <div className="modal-actions">
        <button className="btn warn" onClick={() => kor(() => taBortAmne(lasStruktur(), id), 'Ämne borttaget.')}>🗑 Ta bort ämne</button>
      </div>
    </div>
  );
}

// ── Årsöversikt per klass/ämne (kapitelkort + viktiga datum) ──
function Arsoversikt({ bok, plan, nivaText }: { bok: Bok; plan: PlaneradLektion[]; nivaText: string }) {
  const kort = kapitelKort(bok, plan);
  const vd = viktigaDatum(plan);
  const dat = (d: string | null, v: number | null) => (d !== null ? `v.${v} · ${d.slice(8)}/${Number(d.slice(5, 7))}` : 'ryms ej');
  return (
    <div className="arsov">
      <h3>Årsöversikt — {bok.titel}</h3>
      <div className="kapkort-rad">
        {kort.map((k) => (
          <div key={k.nr} className="kapkort" style={{ borderTopColor: k.farg }}>
            <div className="kk-huvud" style={{ background: k.farg }}>Kapitel {k.nr}</div>
            <h4>{k.namn}</h4>
            <p className="muted small">{k.antalLektioner} lektioner{k.forstaVecka !== null ? ` · v.${k.forstaVecka}–${k.sistaVecka}` : ''}</p>
            <div className="kk-stat">💡 {k.begreppAntal} begrepp</div>
            <div className="kk-stat">🎬 {k.filmAntal} filmer</div>
          </div>
        ))}
      </div>
      {vd.length > 0 && (<>
        <h3>Viktiga datum — repetition, diagnoser och prov</h3>
        <table className="tbl">
          <thead><tr><th>Kap</th><th>Typ</th><th>Moment</th><th>När</th></tr></thead>
          <tbody>{vd.map((v, i) => (
            <tr key={i} className={`vd-${v.typ}`}>
              <td>{v.kapitel}</td>
              <td>{v.typ === 'diagnos' ? 'Diagnos/test' : v.typ === 'prov' ? 'PROV' : v.typ === 'repetition' ? 'Repetition' : 'Öva förmågor'}</td>
              <td>{v.etikett}</td>
              <td>{dat(v.datum, v.vecka)}</td>
            </tr>
          ))}</tbody>
        </table>
      </>)}
      <h3>Lektionsregler — {bok.amne} (gemensam grund)</h3>
      <div className="regler">
        <div className="regel"><h4>Lektionsstruktur (BAM)</h4><p>Tavlan högst upp: [Ämne] [starttid]–[sluttid]. Läxförhör via Socrative → Genomgång → Arbete → Exit ticket i slutet (Socrative).</p></div>
        <div className="regel"><h4>Uppgiftsnivåer</h4><p>{nivaText}. Varje delkapitel har två lektioner: del 1 arbetar {bok.nivaer.niva1}/{bok.nivaer.niva2} (minimum {bok.nivaer.niva1} klart), del 2 arbetar {bok.nivaer.niva2}/{bok.nivaer.niva3}.</p></div>
        <div className="regel"><h4>Inlämning</h4><p>{bok.nivaer.niva1}- och {bok.nivaer.niva2}-uppgifter är obligatoriska: fotografera och ladda upp i klassens inlämningsyta (Teams, Classroom m.fl.). {bok.nivaer.niva3} är frivillig fördjupning.</p></div>
        <div className="regel"><h4>Läxor</h4><p>Läxa till varje delkapitel: alla begrepp som hör till delkapitlet. Läxförhör i början av nästa lektion via Socrative.</p></div>
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

// ── Planeringstabell (helklass eller en grupp) + lektionskort ─
function GruppPlanering(props: {
  plan: PlaneradLektion[]; bok: Bok; amnesNamn: string; klassNamn: string;
  rum: string; grupp?: Grupp; rubrik?: string;
}) {
  const { plan, bok, amnesNamn, klassNamn, rum, grupp, rubrik } = props;
  const [valdRad, setValdRad] = useState<number | null>(null);
  if (plan.length === 0) return null;
  return (
    <>
      {rubrik !== undefined && <h3 className="grupp-h">{rubrik}</h3>}
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
      {valdRad !== null && plan[valdRad] && (
        <Lektionskort rad={plan[valdRad]} bok={bok} amnesNamn={amnesNamn} klassNamn={klassNamn}
          rum={rum} grupp={grupp} nr={valdRad + 1} onStang={() => setValdRad(null)} />
      )}
    </>
  );
}

// ── Ämnets schema: redigeras och sparas uttryckligen ─────────
function AmneSchemaRedigerare({ amne, kor, falt, rubrik }: {
  amne: Amne; kor: (fn: () => Struktur, m: string) => void;
  falt: 'schema' | 'schemaB'; rubrik: string;
}) {
  const nuvarande = (falt === 'schema' ? amne.schema : amne.schemaB) ?? [];
  const [rows, setRows] = useState<PassRad[]>(nuvarande.map((p) => ({ ...p })));
  const [sparat, setSparat] = useState(false);
  const giltiga = rows.every((p) => giltigtPass(p as Pass));
  const andrad = JSON.stringify(rows) !== JSON.stringify(nuvarande);
  return (
    <div className="schema-red">
      <h3>{rubrik} <small className="muted">{nuvarande.map((p) => `${DAGNAMN[p.dag]} ${p.start}–${p.slut}`).join(' · ')}</small></h3>
      <PassRedigerare pass={rows} onChange={(p) => { setRows(p); setSparat(false); }} />
      <button className="btn" disabled={!andrad || !giltiga || rows.length === 0}
        title={!giltiga ? 'Minst ett pass är ogiltigt (start < slut, mån–fre)' : !andrad ? 'Inga osparade ändringar' : ''}
        onClick={() => {
          kor(() => uppdateraAmne(lasStruktur(), amne.id, { [falt]: rows.map((p) => ({ ...p })) }),
            `Schema sparat (${rows.length} pass/vecka) — planeringen har räknats om med de nya tiderna.`);
          setSparat(true); setTimeout(() => setSparat(false), 2500);
        }}>{sparat ? '✓ Sparat!' : '💾 Spara schema'}</button>
      {andrad && !sparat && <span className="osparat">● osparade ändringar</span>}
    </div>
  );
}

// ── Lektionskort (BAM: Läxförhör → Genomgång → Arbete → Exit ticket) ──
function Lektionskort(props: {
  rad: PlaneradLektion; bok: Bok; amnesNamn: string; klassNamn: string;
  rum: string; grupp?: Grupp; nr: number; onStang: () => void;
}) {
  const { rad, bok, amnesNamn, klassNamn, rum, grupp, nr, onStang } = props;
  const l = rad.lektion;
  const start = rad.start ?? '08:10';
  const slut = rad.slutTid ?? '09:10';
  const N = bok.nivaer;
  const har = (v: string) => v !== '—' && v !== '';
  const seg = bamTidslinje(l, start, slut);
  const exit = exitStart(l, start, slut);
  const begrepp = begreppForLektion(bok, rad.kapitel, l);
  const { minimum } = arbetsNivaer(l);
  const nivaNamn = [N.niva1, N.niva2, N.niva3] as const;
  const nivaUppg = [l.niva1, l.niva2, l.niva3] as const;
  return (
    <div className="lkort" data-testid="lektionskort">
      <div className="lkort-topp">
        <div>
          <div className="tavla" title="Högst upp på tavlan">{tavelrubrik(amnesNamn, start, slut)}</div>
          <h3>Lektion {nr} · {l.avsnitt} · Del {l.del} <small className="muted">{rad.datum ?? 'ryms ej'}{rad.vecka !== null ? ` · v. ${rad.vecka}` : ''} · {klassNamn}{grupp !== undefined ? ` · Grupp ${grupp}` : ''}</small></h3>
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

// ── Kalender (läsår / termin / månad / vecka) ────────────────
const MANADSNAMN = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];

function KalenderVy({ s }: { s: Struktur }) {
  const [skolarId, setSkolarId] = useState(s.skolar[0]?.id ?? '');
  const [lage, setLage] = useState<'manad' | 'vecka' | 'lasar'>('manad');
  const [klassFilter, setKlassFilter] = useState<string>('__alla__');
  const skolar = s.skolar.find((x) => x.id === skolarId) ?? s.skolar[0];
  const [ankare, setAnkare] = useState<string>(skolar?.start ?? '2026-08-17');

  const handelser = useMemo(() => (skolar ? kalenderHandelser(s, skolar.id) : []), [s, skolar]);
  const filtrerade = useMemo(
    () => (klassFilter === '__alla__' ? handelser : handelser.filter((h) => h.klassId === klassFilter)),
    [handelser, klassFilter],
  );
  const perDatum = useMemo(() => handelserPerDatum(filtrerade), [filtrerade]);
  const klasserMedPlan = useMemo(() => {
    const ids = new Set(handelser.map((h) => h.klassId));
    return s.klasser.filter((k) => ids.has(k.id));
  }, [s.klasser, handelser]);

  if (!skolar) return <div className="card"><h2>📆 Kalender</h2><p className="muted">Skapa ett skolår och minst en planering först.</p></div>;

  const flyttaManad = (steg: number) => {
    const d = new Date(`${ankare}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + steg);
    setAnkare(d.toISOString().slice(0, 10));
  };
  const flyttaVecka = (steg: number) => {
    const d = new Date(`${ankare}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + steg * 7);
    setAnkare(d.toISOString().slice(0, 10));
  };
  const ankAr = Number(ankare.slice(0, 4));
  const ankManad = Number(ankare.slice(5, 7)) - 1;

  return (
    <div className="card kalender">
      <div className="rad kal-topp">
        <h2>📆 Kalender <small className="muted">{skolar.namn}</small></h2>
        <span className="spacer" />
        <select aria-label="Skolår" value={skolar.id} onChange={(e) => { setSkolarId(e.target.value); const ny = s.skolar.find((x) => x.id === e.target.value); if (ny) setAnkare(ny.start); }}>
          {s.skolar.map((la) => <option key={la.id} value={la.id}>{la.namn}</option>)}
        </select>
        <select aria-label="Klassfilter" value={klassFilter} onChange={(e) => setKlassFilter(e.target.value)}>
          <option value="__alla__">Alla klasser</option>
          {klasserMedPlan.map((k) => <option key={k.id} value={k.id}>{k.namn}</option>)}
        </select>
        <div className="kal-lagen">
          {(['manad', 'vecka', 'lasar'] as const).map((l) => (
            <button key={l} className={`btn sec sm ${lage === l ? 'active' : ''}`} onClick={() => setLage(l)}>
              {l === 'manad' ? 'Månad' : l === 'vecka' ? 'Vecka' : 'Läsår'}
            </button>
          ))}
        </div>
      </div>

      {handelser.length === 0 && <p className="note">Inga planeringar i det här skolåret ännu — skapa en planering på ett ämne, så dyker lektionerna upp här.</p>}

      {lage === 'manad' && (
        <MonadsGrid ar={ankAr} manad0={ankManad} skolar={skolar} perDatum={perDatum}
          onPrev={() => flyttaManad(-1)} onNext={() => flyttaManad(1)} />
      )}
      {lage === 'vecka' && (
        <VeckoLista rutor={veckaRutor(ankare, skolar, perDatum)}
          onPrev={() => flyttaVecka(-1)} onNext={() => flyttaVecka(1)} />
      )}
      {lage === 'lasar' && (
        <div className="lasar-grid">
          {skolarManader(skolar).map(([y, m]) => (
            <MiniManad key={`${y}-${m}`} ar={y} manad0={m} skolar={skolar} perDatum={perDatum} />
          ))}
        </div>
      )}
      <Kapitelforklaring handelser={filtrerade} />
    </div>
  );
}

function Handelsechip({ h }: { h: KalenderHandelse }) {
  return (
    <span className="kh" style={{ background: h.kapitelFarg }} title={`${h.start}–${h.slut} ${h.klassNamn}${h.grupp !== undefined ? ` (Grupp ${h.grupp})` : ''} · ${h.amnesNamn} · ${h.avsnitt}`}>
      {h.start} {h.klassNamn}{h.grupp !== undefined ? h.grupp : ''} {h.avsnitt}
    </span>
  );
}

const DAGKORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function MonadsGrid({ ar, manad0, skolar, perDatum, onPrev, onNext }: {
  ar: number; manad0: number; skolar: Skolar; perDatum: Map<string, KalenderHandelse[]>;
  onPrev: () => void; onNext: () => void;
}) {
  const rutor = manadsRutor(ar, manad0, skolar, perDatum);
  const idag = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <div className="rad kal-nav">
        <button className="btn sec sm" onClick={onPrev}>◀</button>
        <b>{MANADSNAMN[manad0]} {ar}</b>
        <button className="btn sec sm" onClick={onNext}>▶</button>
      </div>
      <div className="mgrid">
        {DAGKORT.map((d) => <div key={d} className="mgrid-h">{d}</div>)}
        {rutor.map((r) => (
          <div key={r.datum} className={`mcell ${r.iManad ? '' : 'dim'} ${r.helg ? 'helg' : ''} ${r.ledig ? 'ledig' : ''} ${r.halvdag ? 'halvdag' : ''} ${r.datum === idag ? 'idag' : ''}`}>
            <div className="mcell-d">{Number(r.datum.slice(8))}{r.ledig ? <span className="ledig-l">{r.ledig}</span> : r.halvdag ? <span className="ledig-l">½ {r.halvdag}</span> : null}</div>
            {r.handelser.map((h, i) => <Handelsechip key={i} h={h} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function VeckoLista({ rutor, onPrev, onNext }: { rutor: KalenderDagRuta[]; onPrev: () => void; onNext: () => void }) {
  return (
    <div>
      <div className="rad kal-nav">
        <button className="btn sec sm" onClick={onPrev}>◀ Föregående</button>
        <b>Vecka {rutor[0] ? isoVeckaLbl(rutor[0].datum) : ''}</b>
        <button className="btn sec sm" onClick={onNext}>Nästa ▶</button>
      </div>
      <div className="vlista">
        {rutor.map((r) => (
          <div key={r.datum} className={`vrad ${r.helg ? 'helg' : ''} ${r.ledig ? 'ledig' : ''}`}>
            <div className="vrad-d">
              <b>{DAGKORT[r.dag - 1]}</b> {Number(r.datum.slice(8))}/{Number(r.datum.slice(5, 7))}
              {r.ledig ? <span className="ledig-l"> {r.ledig}</span> : r.halvdag ? <span className="ledig-l"> ½ {r.halvdag}</span> : null}
            </div>
            <div className="vrad-h">
              {r.handelser.length === 0 ? <span className="muted small">—</span> : r.handelser.map((h, i) => <Handelsechip key={i} h={h} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniManad({ ar, manad0, skolar, perDatum }: {
  ar: number; manad0: number; skolar: Skolar; perDatum: Map<string, KalenderHandelse[]>;
}) {
  const rutor = manadsRutor(ar, manad0, skolar, perDatum);
  return (
    <div className="minimanad">
      <div className="mini-h">{MANADSNAMN[manad0]} {ar}</div>
      <div className="mini-grid">
        {DAGKORT.map((d) => <div key={d} className="mini-dh">{d[0]}</div>)}
        {rutor.map((r) => (
          <div key={r.datum}
            className={`mini-d ${r.iManad ? '' : 'dim'} ${r.ledig ? 'ledig' : ''} ${r.handelser.length > 0 ? 'har' : ''}`}
            title={r.handelser.map((h) => `${h.klassNamn}${h.grupp ?? ''} ${h.avsnitt}`).join('\n') || r.ledig || ''}>
            {Number(r.datum.slice(8))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kapitelforklaring({ handelser }: { handelser: KalenderHandelse[] }) {
  const farger = new Map<string, { farg: string; namn: string }>();
  for (const h of handelser) {
    const nyckel = `${h.amnesNamn}-${h.kapitel}`;
    if (!farger.has(nyckel)) farger.set(nyckel, { farg: h.kapitelFarg, namn: `${h.amnesNamn} kap ${h.kapitel}` });
  }
  if (farger.size === 0) return null;
  return (
    <div className="kal-forkl">
      <b className="muted small">Färg per kapitel:</b>
      {[...farger.values()].map((f) => (
        <span key={f.namn} className="forkl-item"><span className="prick" style={{ background: f.farg }} />{f.namn}</span>
      ))}
    </div>
  );
}

/** ISO-vecka som etikett (utan att importera fler helpers i UI-lagret). */
function isoVeckaLbl(datum: string): number {
  const d = new Date(`${datum}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - y0.getTime()) / 86400000 + 1) / 7);
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
          onClick={() => { kor(() => laggTillLarare(lasStruktur(), { id: nyttId('lar'), namn: namn.trim(), signatur: sign.trim() }), 'Lärare tillagd — koppla till en tjänst i tjänstpanelen.'); setNamn(''); setSign(''); }}>➕ Lägg till lärare</button>
      </div>
      <p className="note">Lärarens schema härleds ur tjänstens klassers ämnespass — det lagras aldrig separat, så det uppdateras automatiskt när ämnen ändras.</p>
    </div>
  );
}
