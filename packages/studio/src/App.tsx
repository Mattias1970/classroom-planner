/**
 * Classroom Planner Studio (v2) — trädet Skolår ▸ Tjänst ▸ Klass ▸ Ämne
 * till vänster, detaljpanel till höger, fristående bokbibliotek och lärare.
 * Flöden: skolår (röda dagar beräknas; lov/temadagar/idrottsdagar via text
 * eller .ics), tjänst (lärare valfri), klass, ämne med eget schema, bok på
 * ämnet → "Skapa planering" ger datumsatt planering. Sidregister → Excel.
 */
import { Fragment, useMemo, useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  NO_TK, NO_TK_AMNEN, STANDARD_AMNEN, amneBakgrund, antalSlots, arbetsNivaer, arHalvklass,
  begreppsRum, delaHalvklassPass, delkapitelUrAvsnitt, foreslagnaRum, hamtaLektionsplan,
  effektivaNivaer, kombineraHalvklassPass, skapaTjanstFranSchema, tolkaSchemaPdf,
  handelserPerDatum, kalenderHandelser, klassFarg, noBudget, noOverBudget, sattLektionsplan,
  kapitelKort, manadsRutor, skolarManader, veckaRutor, viktigaDatum, bamTidslinje, begreppForLektion, bokBegrepp,
  bokFromValfriImport, bokSidregister, bokSidregisterCsv, elevSchema, exitStart, giltigtPass,
  kalendariumFromIcs, laggTillAmne, laggTillElev, laggTillKlass, laggTillLarare,
  laggTillSkolar, laggTillTjanst, larareSchema, normaliseraDagar, nyttId, parseKalendarium,
  ledigtStandardpass, passKonflikter, registreraPlanering, sattLarare, schemaKonflikter,
  skapaPlanering,
  socrativeRum, sparaBok,
  taBortAmne, taBortBok, taBortElev, taBortKlass, taBortLarare, taBortSkolar, taBortTjanst,
  tavelrubrik, uppdateraAmne, uppdateraElev, uppdateraSkolar,
  amnesOversikt, arStodAmne, aterstallPlanering, bokHarNivaer, importeraResultat,
  klassOversikt, klaratKrav, matchaElev, provLista, provSammanstallning,
  resultatProcent, saknadeResultat, type ResultatKalla, sattStodPass, skapaFriPlanering, STOD_AMNEN, type Amne, type Bok, type EgenRad, type Tjanst, type Grupp, type KalenderDagRuta, type KalenderHandelse,
  type LektionsPlan, type OmfattningsPass, type SchemaRad, type TolkatSchema,
  type Kapitel, type Klass, type Pass, type PlaneradLektion, type Skolar, type Struktur,
} from '@planner/kernel';
import { exportJson, importJson, lasStruktur, sparaStruktur } from './store.js';
import {
  hamtaBockerFranGitHub, konfigKomplett, laddaFranGitHub, lasGitHubConfig, sparaGitHubConfig, sparaTillGitHub,
  type GitHubConfig,
} from './github.js';

const DAGNAMN = ['', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
type Vald =
  | { typ: 'skolar'; id: string } | { typ: 'tjanst'; id: string }
  | { typ: 'klass'; id: string } | { typ: 'amne'; id: string }
  | { typ: 'bok'; id: string } | { typ: 'larare' }
  | { typ: 'nyttSkolar' } | { typ: 'nyBok' } | { typ: 'github' }
  | { typ: 'schemaPdf'; tolkat: TolkatSchema } | null;

/** Finns det vald pekar på kvar? (Skydd mot blank panel efter borttagning.) */
function valdFinns(s: Struktur, v: Vald): boolean {
  if (v === null) return false;
  switch (v.typ) {
    case 'skolar': return s.skolar.some((x) => x.id === v.id);
    case 'tjanst': return s.tjanster.some((x) => x.id === v.id);
    case 'klass': return s.klasser.some((x) => x.id === v.id);
    case 'amne': return s.amnen.some((x) => x.id === v.id);
    case 'bok': return s.bocker.some((x) => x.id === v.id);
    default: return true; // larare/github/nytt-paneler har inga id-krav
  }
}

export function App() {
  const [s, setS] = useState<Struktur>(() => lasStruktur());
  const [vald, setVald] = useState<Vald>(null);
  const [huvudvy, setHuvudvy] = useState<'struktur' | 'planering' | 'kalender' | 'superteach'>('struktur');
  const [lektionsHopp, setLektionsHopp] = useState<{ amneId: string; i: number; n: number } | null>(null);
  const [tema, setTema] = useState<string>(() => {
    try { return window.localStorage.getItem('classroom-planner.studio.tema') ?? 'varm'; } catch { return 'varm'; }
  });
  useEffect(() => {
    document.body.dataset.tema = tema;
    try { window.localStorage.setItem('classroom-planner.studio.tema', tema); } catch { /* ignoreras */ }
  }, [tema]);
  const [msg, setMsg] = useState('');
  const spara = (ny: Struktur, m = '') => { sparaStruktur(ny); setS(ny); if (m) setMsg(m); };
  const angraStack = useRef<string[]>([]);
  const kor = (fn: () => Struktur, m: string) => {
    try {
      const fore = JSON.stringify(lasStruktur());
      const ny = fn();
      angraStack.current = [...angraStack.current.slice(-19), fore];   // max 20 steg
      spara(ny, `✓ ${m}`);
    } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
  };
  const angra = () => {
    const fore = angraStack.current.pop();
    if (fore === undefined) { setMsg('Inget att ångra.'); return; }
    spara(JSON.parse(fore) as Struktur, '↩ Ångrat.');
  };

  return (
    <div className="studio">
      <header className="topbar">
        <span className="logo">📘 Classroom Planner <b>Studio</b> <small>v2</small></span>
        <nav className="toppflik" aria-label="Huvudvy">
          <button className={`tflik ${huvudvy === 'struktur' ? 'act' : ''}`} onClick={() => setHuvudvy('struktur')}>🗂 Struktur</button>
          <button className={`tflik ${huvudvy === 'planering' ? 'act' : ''}`} onClick={() => setHuvudvy('planering')}>📋 Planering</button>
          <button className={`tflik ${huvudvy === 'kalender' ? 'act' : ''}`} onClick={() => setHuvudvy('kalender')}>📆 Kalender</button>
          <button className={`tflik ${huvudvy === 'superteach' ? 'act' : ''}`} onClick={() => setHuvudvy('superteach')}>📊 SuperTeach</button>
        </nav>
        <span className="spacer" />
        <button className="btn sec" onClick={angra} title="Ångra senaste ändring (upp till 20 steg)">↩ Ångra</button>
        <select aria-label="Färgtema" className="tema-valj" value={tema} onChange={(e) => setTema(e.target.value)} title="Färgtema">
          <option value="varm">🎨 Varm</option>
          <option value="klassisk">🎨 Klassisk blå</option>
          <option value="skog">🎨 Skog</option>
        </select>
        <button className="btn sec" onClick={() => { setHuvudvy('struktur'); setVald({ typ: 'github' }); }}>☁ GitHub</button>
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
      {huvudvy === 'kalender' || huvudvy === 'superteach' ? (
        <main className="panel full">
          {msg && <p className="status">{msg}</p>}
          {huvudvy === 'superteach' && <SuperTeachVy s={s} kor={kor} />}
          {huvudvy === 'kalender' && <KalenderVy s={s} onOppnaLektion={(amneId, i) => { setLektionsHopp({ amneId, i, n: Date.now() }); setHuvudvy('planering'); }} />}
        </main>
      ) : huvudvy === 'planering' ? (
        <main className="panel full">
          {msg && <p className="status">{msg}</p>}
          <PlaneringVy s={s} kor={kor} setVald={setVald} hopp={lektionsHopp} />
        </main>
      ) : (
        <div className="cols">
          <nav className="tree" aria-label="Struktur">
            <Trad s={s} vald={vald} setVald={setVald} kor={kor} />
          </nav>
          <main className="panel">
            {msg && <p className="status">{msg}</p>}
            {(vald === null || !valdFinns(s, vald)) && <Start s={s} />}
            {vald?.typ === 'skolar' && <SkolarPanel s={s} id={vald.id} kor={kor} />}
            {vald?.typ === 'tjanst' && <TjanstPanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
            {vald?.typ === 'klass' && <KlassPanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
              {vald?.typ === 'amne' && <AmnePanel s={s} id={vald.id} kor={kor} setVald={setVald} />}
            {vald?.typ === 'bok' && <BokPanel s={s} id={vald.id} kor={kor} />}
            {vald?.typ === 'larare' && <LararePanel s={s} kor={kor} />}
            {vald?.typ === 'nyttSkolar' && <NyttSkolarPanel kor={kor} setVald={setVald} />}
            {vald?.typ === 'nyBok' && <NyBokPanel kor={kor} setVald={setVald} />}
            {vald?.typ === 'github' && <GitHubPanel s={s} spara={spara} setMsg={setMsg} />}
            {vald?.typ === 'schemaPdf' && <SchemaPdfPanel s={s} tolkat={vald.tolkat} kor={kor} setVald={setVald} />}
          </main>
        </div>
      )}
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
              {s.klasser.filter((k) => k.tjanstId === t.id).map((k) => {
                const klassAmnen = s.amnen.filter((a) => a.klassId === k.id);
                const vanliga = klassAmnen.filter((a) => a.noGrupp === undefined);
                const noGrupper = [...new Set(klassAmnen.filter((a) => a.noGrupp !== undefined).map((a) => a.noGrupp!))];
                const amnesNod = (a: Amne) => (
                  <div key={a.id} className="ind">
                    <button className={`node ${ar({ typ: 'amne', id: a.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'amne', id: a.id })}>
                      📖 {a.namn}{a.bokId ? '' : ' · (ingen bok)'}
                    </button>
                  </div>
                );
                return (
                  <div key={k.id} className="ind">
                    <button className={`node ${ar({ typ: 'klass', id: k.id }) ? 'act' : ''}`} onClick={() => setVald({ typ: 'klass', id: k.id })}>👥 {k.namn}</button>
                    {vanliga.map(amnesNod)}
                    {noGrupper.map((g) => {
                      const delamnen = klassAmnen.filter((a) => a.noGrupp === g)
                        .sort((x, y) => (x.noOrder ?? 0) - (y.noOrder ?? 0));
                      return (
                        <div key={g} className="ind">
                          <button className="node no-nod" onClick={() => { if (delamnen[0]) setVald({ typ: 'amne', id: delamnen[0].id }); }}>🧪 NO+Tk</button>
                          {delamnen.map(amnesNod)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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
      <label className="node add file-btn">⬆ Läs in schema (PDF)
        <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          // Lazy import: pdf.js laddas först vid användning (kräver webbläsar-API:er).
          if (f) void import('./pdfLasare.js')
            .then(async ({ lasPdfItems }) => { setVald({ typ: 'schemaPdf', tolkat: tolkaSchemaPdf(await lasPdfItems(f)) }); })
            .catch((fel: unknown) => kor(() => { throw new Error(`Kunde inte läsa PDF:en: ${(fel as Error).message}`); }, ''));
          e.currentTarget.value = '';
        }} />
      </label>
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
  const [rapport, setRapport] = useState<string[]>([]);
  const [hamtar, setHamtar] = useState(false);
  const hamtaFranRepo = () => {
    setHamtar(true); setRapport([]);
    void hamtaBockerFranGitHub(lasGitHubConfig())
      .then((bocker) => {
        const rader: string[] = [];
        for (const { id, json } of bocker) {
          try {
            const bok = bokFromValfriImport(json);
            kor(() => sparaBok(lasStruktur(), bok), `Bok "${bok.titel}" hämtad från datarepot.`);
            rader.push(`✅ ${id}: ${bok.titel} (${bok.amne}, åk ${bok.arskurs})`);
          } catch (fel) { rader.push(`⚠ ${id}: ${(fel as Error).message}`); }
        }
        setRapport(rader);   // stannar i panelen så rapporten syns; böckerna dyker upp i trädet
      })
      .catch((fel: unknown) => setRapport([`❌ ${(fel as Error).message}`]))
      .finally(() => setHamtar(false));
  };
  return (
    <div className="card">
      <h2>➕ Lägg till bok</h2>
      <p className="note">Böcker är fristående: lektioner skapas utan koppling till schema, lärare eller klass, och kopplas sedan till ett ämne. Skapa bokfilen (JSON) genom att fotografera boksidor och köra prompten <b>Bokimport</b> — importera den här.</p>
      <label className="btn file-btn">⬆ Importera bok (JSON)
        <input type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then((t) => {
            let nyId = '';
            kor(() => { const bok = bokFromValfriImport(t); nyId = bok.id; return sparaBok(lasStruktur(), bok); },
              'Bok importerad — koppla den till ett ämne för att skapa en planering.');
            if (nyId !== '' && lasStruktur().bocker.some((b) => b.id === nyId)) setVald({ typ: 'bok', id: nyId });
          });
          e.currentTarget.value = '';
        }} />
      </label>
      <p className="note">…eller hämta alla böcker ur datarepots <code>books/</code>-katalog (kräver ifylld ☁ GitHub-konfiguration). Befintliga böcker med samma id uppdateras.</p>
      <button className="btn" disabled={hamtar} onClick={hamtaFranRepo}>
        {hamtar ? '⏳ Hämtar…' : '☁ Hämta böcker från datarepot'}
      </button>
      {rapport.map((r, i) => <p key={i} className="note">{r}</p>)}
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
/** 🧩 Stödpass (t.ex. Ma/NO-stöd): öppna veckotider där elever gör klart obligatoriska uppgifter. */
function StodPassRedigerare({ t, kor }: { t: Tjanst; kor: (fn: () => Struktur, m: string) => void }) {
  const [namn, setNamn] = useState('Ma/NO-stöd');
  const [dag, setDag] = useState(4);
  const [start, setStart] = useState('15:00');
  const [slut, setSlut] = useState('16:00');
  const pass = t.stodPass ?? [];
  return (
    <div className="uppg-kort">
      <b>🧩 Stödpass</b> <small className="muted">Öppen tid (t.ex. Ma/NO-stöd) där elever gör klart Gröna/Blå uppgifter — syns i kalendern och i uppgiftsreglerna.</small>
      {pass.map((sp) => (
        <div key={sp.id} className="rad film-rad">
          <span>🧩 <b>{sp.namn}</b> — {DAGNAMN[sp.dag] ?? `dag ${sp.dag}`} {sp.start}–{sp.slut}</span>
          <button className="icon-btn" title="Ta bort stödpass" onClick={() => kor(
            () => sattStodPass(lasStruktur(), t.id, (lasStruktur().tjanster.find((x) => x.id === t.id)?.stodPass ?? []).filter((x) => x.id !== sp.id)),
            `Stödpasset "${sp.namn}" borttaget.`)}>✕</button>
        </div>
      ))}
      <div className="rad" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <input aria-label="Stödpassets namn" value={namn} onChange={(e) => setNamn(e.target.value)} style={{ width: 130 }} />
        <select aria-label="Stödpassets dag" value={dag} onChange={(e) => setDag(Number(e.target.value))}>
          {DAGNAMN.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <input aria-label="Stödpassets start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span>–</span>
        <input aria-label="Stödpassets slut" type="time" value={slut} onChange={(e) => setSlut(e.target.value)} />
        <button className="btn sec sm" disabled={namn.trim() === '' || !giltigtPass({ dag, start, slut })} onClick={() => {
          const ny = { id: nyttId('sp'), namn: namn.trim(), dag, start, slut };
          kor(() => sattStodPass(lasStruktur(), t.id, [...(lasStruktur().tjanster.find((x) => x.id === t.id)?.stodPass ?? []), ny]),
            `Stödpasset "${ny.namn}" tillagt (${DAGNAMN[dag]} ${start}–${slut}).`);
        }}>+ Lägg till stödpass</button>
      </div>
    </div>
  );
}

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

      <StodPassRedigerare t={t} kor={kor} />

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

// ── Konfliktvarning: kräver två bekräftelser för samma tid ────
const DAGKORT_KORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
function konfliktText(krock: SchemaRad[], steg: number): string {
  const lista = krock.map((r) => `${DAGKORT_KORT[r.dag - 1]} ${r.start}–${r.slut} ${r.klassNamn}${r.grupp !== undefined ? r.grupp : ''}/${r.amnesNamn}`).join('; ');
  return `⚠ Krock med redan lagd lektion: ${lista}. Klicka igen för att lägga ändå (${steg}/2).`;
}

// ── Passredigerare (delas av Klass- och Ämnespanelen) ────────
type PassRad = { dag: number; start: string; slut: string };
/** Nästa veckodag mån–fre med omslag: mån→tis … fre→mån. */
function nastaDag(dag: number): number { return (dag % 5) + 1; }

/**
 * Passredigerare för NO/halvklassämnen: varje pass märks Helklass (elever
 * från Grupp A och B tillsammans), Grupp A eller Grupp B (halvklass).
 */
function OmfPassRedigerare({ rader, onChange }: {
  rader: OmfattningsPass[]; onChange: (r: OmfattningsPass[]) => void;
}) {
  const andra = (i: number, delta: Partial<OmfattningsPass>) =>
    onChange(rader.map((r, ri) => (ri === i ? { ...r, ...delta } : r)));
  return (
    <div className="pass-red">
      {rader.map((r, i) => (
        <div key={i} className="rad pass-rad">
          <select aria-label={`Veckodag pass ${i + 1}`} value={r.dag} onChange={(e) => andra(i, { dag: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{DAGNAMN[d]}</option>)}
          </select>
          <input aria-label={`Start pass ${i + 1}`} type="time" value={r.start} onChange={(e) => andra(i, { start: e.target.value })} />
          –
          <input aria-label={`Slut pass ${i + 1}`} type="time" value={r.slut} onChange={(e) => andra(i, { slut: e.target.value })} />
          <select aria-label={`Omfattning pass ${i + 1}`} value={r.omfattning}
            onChange={(e) => andra(i, { omfattning: e.target.value as OmfattningsPass['omfattning'] })}>
            <option value="hel">Helklass (A+B)</option>
            <option value="A">Halvklass · Grupp A</option>
            <option value="B">Halvklass · Grupp B</option>
          </select>
          <button className="icon-btn" title="Ta bort pass" onClick={() => onChange(rader.filter((_x, ri) => ri !== i))}>🗑</button>
        </div>
      ))}
      <button className="btn sec sm" onClick={() => {
        const sista = rader[rader.length - 1] ?? { dag: 1, start: '08:10', slut: '09:10', omfattning: 'hel' as const };
        onChange([...rader, { ...sista, dag: nastaDag(sista.dag) }]);
      }}>➕ Pass</button>
    </div>
  );
}

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
  const forvalA = useMemo(() => ledigtStandardpass(s, id), [s, id]);
  const [pass, setPass] = useState<PassRad[]>([forvalA]);
  const [omfRader, setOmfRader] = useState<OmfattningsPass[]>([
    { ...forvalA, omfattning: 'A' }, { ...forvalA, dag: nastaDag(forvalA.dag), omfattning: 'B' },
  ]);
  const [konfliktSteg, setKonfliktSteg] = useState(0);
  const [konfliktMsg, setKonfliktMsg] = useState('');
  const [noOrdning, setNoOrdning] = useState<string[]>([...NO_TK_AMNEN]);
  const klassAmnen = s.amnen.filter((x) => x.klassId === id);
  const redan = new Set(klassAmnen.map((x) => x.namn));
  const tillgangliga = STANDARD_AMNEN.filter((a) => !redan.has(a));
  const noMojligt = NO_TK_AMNEN.every((a) => !redan.has(a)); // inget NO-ämne får finnas
  const stodTillgangliga = STOD_AMNEN.filter((a) => !redan.has(a));
  const alternativ = [...tillgangliga, ...(noMojligt ? [NO_TK] : []), ...stodTillgangliga];
  // Håll valt ämne giltigt när listan ändras
  if (k && alternativ.length > 0 && !alternativ.includes(namn)) { setNamn(alternativ[0]); }
  if (!k) return null;
  const arNoTk = namn === NO_TK;
  const halv = arNoTk || arHalvklass(namn); // NO+Tk läses i halvklass
  const giltiga = pass.filter((p) => giltigtPass(p as Pass));
  const delade = delaHalvklassPass(omfRader.filter((r) => giltigtPass(r)));
  const giltigaHalv = delade.schema.length > 0 && delade.schemaB.length > 0;
  const bocker = s.bocker.filter((b) => b.amne === namn);
  return (
    <div className="card">
      <h2>👥 {k.namn}</h2>
      <p className="note">Varje ämne får sitt eget schema — inget ärvs. Bokens lektioner mappas sedan på schemat.
        Biologi, Fysik, Kemi och Teknik läses i halvklass: Grupp A och Grupp B har varsin tid, och Socrative-rummen
        Varje ämne har ett Socrative-rum per klass (t.ex. {socrativeRum('Matematik', k.namn)}, {socrativeRum('Biologi', k.namn)}).</p>
      <h3>Nytt ämne</h3>
      {alternativ.length === 0
        ? <p className="muted">Alla ämnen finns redan i klassen. Ta bort ett ämne för att lägga till ett annat.</p>
        : <>
      <div className="ny rad">
        <select aria-label="Ämne" value={namn} onChange={(e) => { setNamn(e.target.value); setBokId(''); }}>
          {tillgangliga.map((a) => <option key={a} value={a}>{a}{arHalvklass(a) ? ' (halvklass)' : ''}</option>)}
          {noMojligt && <option value={NO_TK}>NO+Tk (Biologi, Fysik, Kemi, Teknik i följd)</option>}
          {stodTillgangliga.map((a) => <option key={a} value={a}>{a} (fri planering)</option>)}
        </select>
        {!arNoTk && (
          <select aria-label="Bok för ämnet" value={bokId} onChange={(e) => setBokId(e.target.value)} hidden={arStodAmne(namn)}>
            <option value="">{arStodAmne(namn) ? '— fri planering (utan bok) —' : '— bok senare —'}</option>
            {bocker.map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.amne})</option>)}
          </select>
        )}
      </div>
      {arNoTk && (
        <div className="no-ordning">
          <p className="note">NO+Tk delas i fyra lika stora block på det gemensamma schemat: budget ≈ {noBudget({ id: '', namn: '', start: s.skolar.find((x) => x.id === (s.tjanster.find((t) => t.id === k.tjanstId)?.skolarId))?.start ?? '2026-08-17', slut: s.skolar.find((x) => x.id === (s.tjanster.find((t) => t.id === k.tjanstId)?.skolarId))?.slut ?? '2027-06-11', dagar: [] }, giltiga.length > 0 ? giltiga as Pass[] : [{ dag: 2, start: '09:00', slut: '10:00' }])} lektioner per delämne. Välj läsordning:</p>
          <div className="rad" style={{ flexWrap: 'wrap', gap: 6 }}>
            {noOrdning.map((amn, i) => (
              <select key={i} aria-label={`NO-block ${i + 1}`} value={amn} onChange={(e) => {
                const nytt = [...noOrdning]; const gammalt = nytt[i];
                const j = nytt.indexOf(e.target.value); nytt[i] = e.target.value; nytt[j] = gammalt; // byt plats
                setNoOrdning(nytt);
              }}>
                {NO_TK_AMNEN.map((a) => <option key={a} value={a}>{i + 1}. {a}</option>)}
              </select>
            ))}
          </div>
        </div>
      )}
      {halv
        ? (<>
            <p className="note">NO läses i hel- och halvklass: märk varje pass <b>Helklass</b> (elever från Grupp A och B tillsammans) eller <b>Halvklass Grupp A/B</b> (bara den gruppens elever). Socrative-rum: {socrativeRum(namn, k.namn)}.</p>
            <OmfPassRedigerare rader={omfRader} onChange={setOmfRader} />
          </>)
        : <PassRedigerare pass={pass} onChange={setPass} />}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={halv ? !giltigaHalv : giltiga.length === 0}
          title={halv && !giltigaHalv ? 'Båda grupperna behöver minst ett pass (helklasspass räknas för båda)' : ''}
          onClick={() => {
            const allaPass = (halv ? [...delade.schema, ...delade.schemaB] : giltiga) as Pass[];
            const krock = passKonflikter(s, id, allaPass);
            if (krock.length > 0 && konfliktSteg < 2) {
              const steg = konfliktSteg + 1; setKonfliktSteg(steg); setKonfliktMsg(konfliktText(krock, steg)); return;
            }
            if (arNoTk) {
              const grupp = nyttId('no');
              let forsta = '';
              kor(() => {
                let st = lasStruktur();
                noOrdning.forEach((amn, order) => {
                  const aid = nyttId('am');
                  if (order === 0) forsta = aid;
                  st = laggTillAmne(st, {
                    id: aid, klassId: id, namn: amn, schema: delade.schema,
                    halvklass: true, schemaB: delade.schemaB, noGrupp: grupp, noOrder: order,
                  });
                });
                return st;
              }, `NO+Tk skapat: ${noOrdning.join(' → ')} i fyra lika block.`);
              setKonfliktSteg(0); setKonfliktMsg('');
              const nyttForval = ledigtStandardpass(lasStruktur(), id);
              setPass([nyttForval]);
              setOmfRader([{ ...nyttForval, omfattning: 'A' }, { ...nyttForval, dag: nastaDag(nyttForval.dag), omfattning: 'B' }]);
              if (forsta !== '') setVald({ typ: 'amne', id: forsta });
              return;
            }
            const amne: Amne = {
              id: nyttId('am'), klassId: id, namn, bokId: bokId === '' ? undefined : bokId,
              schema: halv ? delade.schema : giltiga as Pass[],
              ...(halv ? { halvklass: true as const, schemaB: delade.schemaB } : {}),
            };
            kor(() => laggTillAmne(lasStruktur(), amne), `Ämne ${namn} skapat${halv ? ' (halvklass, Grupp A/B)' : ''}${krock.length > 0 ? ' — trots schemakrock' : ''}.`);
            setKonfliktSteg(0); setKonfliktMsg('');
            const nyttForval = ledigtStandardpass(lasStruktur(), id);
            setPass([nyttForval]);
            setOmfRader([{ ...nyttForval, omfattning: 'A' }, { ...nyttForval, dag: nastaDag(nyttForval.dag), omfattning: 'B' }]);
            setVald({ typ: 'amne', id: amne.id });
          }}>{konfliktSteg > 0 ? `⚠ Lägg till ändå (${konfliktSteg}/2)` : arNoTk ? '➕ Skapa NO+Tk (fyra block)' : '➕ Lägg till ämne'}</button>
      </div>
      {konfliktMsg && <p className="status warn">{konfliktMsg}</p>}
      </>}
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
          <tbody>{elever.map((e) => (<Fragment key={e.id}>
            <tr>
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
                      <span key={i} className="chip">{DAGNAMN[r.dag]} {r.start}–{r.slut} {r.amnesNamn}{r.grupp !== undefined ? ` (Grupp ${r.grupp}, rum ${socrativeRum(r.amnesNamn, klassNamn)})` : ''}</span>
                    ))}
                </td>
              </tr>
            )}
          </Fragment>))}</tbody>
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
/** Kapitelheader som i HTML-förlagan: gradient i aktuella kapitlets färg + badges. */
function KapitelHeader({ bok, plan, s, amneId }: { bok: Bok; plan: PlaneradLektion[]; s: Struktur; amneId: string }) {
  const idag = new Date().toISOString().slice(0, 10);
  const nasta = plan.find((r) => r.datum !== null && r.datum >= idag) ?? plan[plan.length - 1];
  const kap = bok.kapitel.find((k) => k.nr === nasta.kapitel) ?? bok.kapitel[0];
  const kapPlan = plan.filter((r) => r.kapitel === kap.nr);
  const klara = plan.filter((_r, i) => hamtaLektionsplan(s, amneId, i)?.klar === true).length;
  const veckor = [...new Set(kapPlan.map((r) => r.vecka).filter((v): v is number => v !== null))];
  const prov = kapPlan.find((r) => r.lektion.typ === 'exam');
  return (
    <div className="kap-header" style={{ background: `linear-gradient(135deg, ${kap.farg} 0%, ${kap.farg}cc 100%)` }}>
      <div className="kap-eyebrow">Aktuellt kapitel</div>
      <div className="kap-h1">Kapitel {kap.nr} · {kap.namn}</div>
      <div className="kap-badges">
        <span className="kap-badge"><strong>{kapPlan.length}</strong> lektioner i kapitlet</span>
        <span className="kap-badge"><strong>{veckor.length > 0 ? `v.${Math.min(...veckor)}–${Math.max(...veckor)}` : '—'}</strong> veckospann</span>
        <span className="kap-badge"><strong>{klara}/{plan.length}</strong> avklarade totalt</span>
        {prov?.datum != null && <span className="kap-badge"><strong>{prov.datum}</strong> {prov.lektion.avsnitt}</span>}
      </div>
    </div>
  );
}

function AmnePanel({ s, id, kor, setVald, hopp }: { s: Struktur; id: string; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void; hopp?: { amneId: string; i: number; n: number } | null }) {
  const a = s.amnen.find((x) => x.id === id);
  const klass = s.klasser.find((k) => k.id === a?.klassId);
  const tjanst = s.tjanster.find((t) => t.id === klass?.tjanstId);
  const la = s.skolar.find((x) => x.id === tjanst?.skolarId);
  const bok = s.bocker.find((b) => b.id === a?.bokId);
  const budget = useMemo(() => (a && la && a.noGrupp !== undefined ? noBudget(la, a.schema) : 0), [a, la]);
  const offset = a?.noGrupp !== undefined && a.noOrder !== undefined ? a.noOrder * budget : 0;
  const plan = useMemo(() => (a && la && bok ? skapaPlanering(la, a.schema, bok, offset, a.egnaRader ?? []) : []), [a, la, bok, offset]);
  const planB = useMemo(() => (a && la && bok && a.halvklass === true ? skapaPlanering(la, a.schemaB ?? [], bok, offset, a.egnaRader ?? []) : []), [a, la, bok, offset]);
  const harPlanering = s.planeringar.some((p) => p.amneId === id);
  const [flik, setFlik] = useState<'planering' | 'detalj' | 'oversikt' | 'uppgifter' | 'begrepp' | 'filmer' | 'magma' | 'anteckningar' | 'arsoversikt' | 'installningar'>('planering');
  const [detaljIdx, setDetaljIdx] = useState(0);
  /** Öppnar en lektion i detaljplaneringen — används av alla flikars klickbara lektioner. */
  const oppnaLektion = (i: number) => { setDetaljIdx(i); setFlik('detalj'); };
  useEffect(() => { if (hopp != null && hopp.amneId === id) { setDetaljIdx(hopp.i); setFlik('detalj'); } }, [hopp?.n]);   // kalenderklick → lektionssidan
  if (!a || !klass || !la) return null;
  const halv = a.halvklass === true;
  const overBudget = a.noGrupp !== undefined && bok !== undefined && noOverBudget(bok, budget);
  const noSyskon = a.noGrupp !== undefined ? s.amnen.filter((x) => x.noGrupp === a.noGrupp).sort((x, y) => (x.noOrder ?? 0) - (y.noOrder ?? 0)) : [];
  const rum = socrativeRum(a.namn, klass.namn);
  return (
    <div className="card">
      <h2>📖 {klass.namn} · {a.namn}{halv ? <span className="pillm">halvklass A/B</span> : null}{a.noGrupp !== undefined ? <span className="pillm">NO+Tk block {(a.noOrder ?? 0) + 1}/4</span> : null}</h2>
      {bok && harPlanering && plan.length > 0 && <KapitelHeader bok={bok} plan={plan} s={s} amneId={a.id} />}
      <p className="muted">Socrative-rum: <b>{rum}</b>{halv ? ' (delas av Grupp A och B)' : ''} — läxförhör och exit tickets.</p>

      {overBudget && (
        <p className="status warn">⚠ {bok!.titel} har {bok!.kapitel.reduce((n, k2) => n + k2.delkapitel.reduce((m, d) => m + d.lektioner.length, 0) + k2.extraLektioner.length, 0)} lektioner men blocket rymmer bara {budget}. De sista lektionerna trängs in i nästa delämnes block — korta boken eller lägg fler NO-pass.</p>
      )}
      <div className="flikar no-print">
        <button className={`flik ${flik === 'planering' ? 'act' : ''}`} onClick={() => setFlik('planering')}>📝 Lektionsplan</button>
        <button className={`flik ${flik === 'detalj' ? 'act' : ''}`} onClick={() => setFlik('detalj')}>🧭 Detaljplanering</button>
        {([['oversikt', 'ℹ Översikt'], ['uppgifter', '✏ Uppgifter'], ['begrepp', '💡 Begrepp'], ['filmer', '🎬 Filmer'], ['magma', '🟫 Magma'], ['anteckningar', '👥 Anteckningar']] as const)
          .filter(([id]) => id !== 'magma' || !arHalvklass(a.namn)) // Magma är mattemjukvara — finns inte i NO/Tk
          .map(([id, txt]) => (
          <button key={id} className={`flik ${flik === id ? 'act' : ''}`} onClick={() => setFlik(id)} disabled={!bok}
            title={!bok ? 'Koppla en bok först' : ''}>{txt}</button>
        ))}
        <button className={`flik ${flik === 'installningar' ? 'act' : ''}`} onClick={() => setFlik('installningar')}>🗓 Schema</button>
        <button className={`flik ${flik === 'arsoversikt' ? 'act' : ''}`} onClick={() => setFlik('arsoversikt')}>📊 Årsöversikt</button>
        <span className="spacer" />
        <button className="flik" onClick={() => window.print()} title="Skriv ut aktiv flik">🖨 Skriv ut</button>
        <button className="flik" disabled={!bok || plan.length === 0} title={!bok ? 'Koppla en bok först' : 'Veckans lektioner som Word-dokument'}
          onClick={() => {
            if (!bok) return;
            const nu = plan.find((r) => r.datum !== null && r.vecka !== null);
            const vecka = plan.filter((r) => r.vecka !== null && r.vecka === nu?.vecka);
            void import('./wordExport.js').then(({ exporteraLektioner }) =>
              exporteraLektioner(s, a.id, bok, `${a.namn} ${klass.namn} — vecka ${nu?.vecka ?? ''}`,
                `${a.namn}-${klass.namn}-v${nu?.vecka ?? ''}`,
                vecka.map((rad) => ({ rad, index: plan.indexOf(rad) }))));
          }}>📄 Vecka → Word</button>
        <button className="flik" disabled={!bok || plan.length === 0} title={!bok ? 'Koppla en bok först' : 'Hela planeringen som Word-dokument'}
          onClick={() => {
            if (!bok) return;
            void import('./wordExport.js').then(({ exporteraLektioner }) =>
              exporteraLektioner(s, a.id, bok, `${a.namn} ${klass.namn} — planering`,
                `${a.namn}-${klass.namn}-planering`,
                plan.map((rad, index) => ({ rad, index }))));
          }}>📄 Kapitel → Word</button>
      </div>
      {flik === 'arsoversikt' && bok && <Arsoversikt bok={bok} plan={plan} nivaText={`${bok.nivaer.niva1} = introduktion · ${bok.nivaer.niva2} = E-nivå · ${bok.nivaer.niva3} = C/A-nivå`} />}
      {flik === 'arsoversikt' && !bok && <p className="muted">Koppla en bok för att se årsöversikten.</p>}
      {flik === 'detalj' && bok && <DetaljFlik s={s} amneId={a.id} plan={plan} bok={bok} amnesNamn={a.namn} kor={kor} idx={detaljIdx} setIdx={setDetaljIdx} />}
      {flik === 'detalj' && !bok && <p className="muted">Koppla en bok till ämnet för att använda detaljplaneringen.</p>}
      {bok && flik === 'oversikt' && <OversiktFlik plan={plan} bok={bok} oppnaLektion={oppnaLektion} />}
      {bok && flik === 'uppgifter' && <UppgifterFlik plan={plan} bok={bok} s={s} amneId={a.id} oppnaLektion={oppnaLektion} />}
      {bok && flik === 'begrepp' && <BegreppFlik plan={plan} bok={bok} oppnaLektion={oppnaLektion} />}
      {bok && flik === 'filmer' && <FilmerFlik s={s} amneId={a.id} plan={plan} bok={bok} kor={kor} oppnaLektion={oppnaLektion} />}
      {bok && flik === 'magma' && !arHalvklass(a.namn) && <MagmaFlik s={s} amneId={a.id} plan={plan} kor={kor} />}
      {bok && flik === 'anteckningar' && <AnteckningarFlik s={s} amneId={a.id} klassNamn={klass.namn} plan={plan} kor={kor} />}
      {flik === 'installningar' && (<>
        {halv
          ? <HalvklassSchemaRedigerare key={a.id} s={s} amne={a} kor={kor} />
          : <AmneSchemaRedigerare key={a.id} s={s} amne={a} kor={kor} falt="schema" rubrik="Schema" />}
        {a.noGrupp !== undefined && (<>
          <p className="note">Detta delämne har budget <b>{budget}</b> lektioner (block {(a.noOrder ?? 0) + 1}) och startar efter föregående block.</p>
          <NoOrdningRedigerare s={s} syskon={noSyskon} kor={kor} />
        </>)}
      </>)}
      {flik === 'planering' && (<>
      {!arStodAmne(a.namn) && <label>Bok:{' '}
        <select aria-label="Bok för ämnet" value={a.bokId ?? ''}
          onChange={(e) => kor(() => uppdateraAmne(lasStruktur(), id, { bokId: e.target.value }),
            e.target.value === '' ? 'Boken bortkopplad.' : 'Bok vald — skapa planeringen nedan.')}>
          <option value="">— ingen bok —</option>
          {s.bocker
            .filter((b) => b.amne === a.namn || b.id === a.bokId) // endast ämnets böcker; redan kopplad bok visas alltid
            .map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.forlag})</option>)}
        </select>
      </label>}{' '}
      {arStodAmne(a.namn) && <span className="muted small">Fri planering — varje schemapass blir ett tillfälle som detaljplaneras fritt. </span>}
      <button className="btn" disabled={!arStodAmne(a.namn) && !bok}
        onClick={() => arStodAmne(a.namn)
          ? kor(() => skapaFriPlanering(lasStruktur(), id, new Date().toISOString()),
              `Fri planering skapad: ett tillfälle per ${a.namn}-pass i skolåret. Detaljplanera texterna under 🧭 Detaljplanering.`)
          : kor(() => registreraPlanering(lasStruktur(), { id: nyttId('pl'), amneId: id, bokId: bok!.id, skapad: new Date().toISOString() }),
          halv
            ? `Planering skapad: ${bok!.titel} utlagd på Grupp A (${plan.filter((p) => p.datum !== null).length} lektioner) och Grupp B (${planB.filter((p) => p.datum !== null).length} lektioner).`
            : `Planering skapad: ${bok!.titel} utlagd på ${klass.namn}s schema — ${plan.filter((p) => p.datum !== null).length} lektioner får datum.`)}>
        {harPlanering ? '➕ Spara ny planeringsversion' : '▶ Skapa planering'}
      </button>
      {bok && harPlanering && <EgnaRaderRedigerare amne={a} plan={plan} kor={kor} />}
      {(s.planeringsarkiv ?? []).some((x) => x.amneId === a.id) && (
        <div className="uppg-kort no-print">
          <b>🗂 Tidigare planeringsversioner</b> <small className="muted">Sparade planeringar skrivs aldrig över — återställ vid behov.</small>
          {(s.planeringsarkiv ?? []).filter((x) => x.amneId === a.id).map((x) => (
            <div key={x.id} className="rad film-rad">
              <span>📋 <b>{x.namn ?? x.id}</b></span>
              <button className="btn sec sm" onClick={() => kor(() => aterstallPlanering(lasStruktur(), x.id),
                `Planeringen \"${x.namn ?? x.id}\" återställd — den tidigare aktiva ligger i arkivet.`)}>↩ Återställ</button>
            </div>
          ))}
        </div>
      )}
      {bok && !halv && <GruppPlanering plan={plan} bok={bok} amnesNamn={a.namn} klassNamn={klass.namn} rum={rum}
        s={s} amneId={a.id} kor={kor} />}
      {bok && halv && (
        <GruppPlanering plan={plan} planB={planB} bok={bok} amnesNamn={a.namn} klassNamn={klass.namn}
          rum={rum} rubrik={`${klass.namn} · rum ${rum} — en klass, gemensam planering`} s={s} amneId={a.id} kor={kor} />
      )}
      </>)}
      <div className="modal-actions">
        <button className="btn warn" onClick={() => {
          const klassId = klass.id;
          kor(() => taBortAmne(lasStruktur(), id), 'Ämne borttaget.');
          setVald({ typ: 'klass', id: klassId });
        }}>🗑 Ta bort ämne</button>
      </div>
    </div>
  );
}

/** ➕ Egna rader: prov, diagnoser och övningar som infogas i planeringen (bokens lektioner skjuts framåt). */
function EgnaRaderRedigerare({ amne, plan, kor }: {
  amne: Amne; plan: PlaneradLektion[]; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [rubrik, setRubrik] = useState('');
  const [typ, setTyp] = useState<EgenRad['typ']>('prov');
  const [pos, setPos] = useState(plan.length);
  const [beskrivning, setBeskrivning] = useState('');
  const rader = amne.egnaRader ?? [];
  const TYPNAMN: Record<EgenRad['typ'], string> = { prov: 'Prov', diagnos: 'Diagnos', ovning: 'Övning', annat: 'Annat' };
  return (
    <div className="uppg-kort no-print">
      <b>➕ Egna rader</b> <small className="muted">Prov, diagnoser och övningar infogas i planeringen — bokens lektioner skjuts framåt.</small>
      {rader.length > 0 && (
        <div style={{ margin: '6px 0' }}>
          {[...rader].sort((x, y) => x.position - y.position).map((r) => (
            <div key={r.id} className="rad film-rad">
              <span><TypChip typ={r.typ === 'prov' ? 'exam' : r.typ === 'diagnos' ? 'test' : r.typ === 'ovning' ? 'repetition' : 'regular'} /> <b>{r.rubrik}</b> <span className="muted small">— lektion {r.position + 1}{r.beskrivning !== undefined && r.beskrivning !== '' ? ` · ${r.beskrivning}` : ''}</span></span>
              <button className="icon-btn" title="Ta bort raden" onClick={() => kor(() => uppdateraAmne(lasStruktur(), amne.id, {
                egnaRader: (lasStruktur().amnen.find((x) => x.id === amne.id)?.egnaRader ?? []).filter((x) => x.id !== r.id),
              }), `Raden "${r.rubrik}" borttagen.`)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="rad" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <select aria-label="Radtyp" value={typ} onChange={(e) => setTyp(e.target.value as EgenRad['typ'])}>
          {(Object.keys(TYPNAMN) as Array<EgenRad['typ']>).map((t) => <option key={t} value={t}>{TYPNAMN[t]}</option>)}
        </select>
        <input aria-label="Radrubrik" placeholder="T.ex. Prov i Tal / Diagnos kap 2" value={rubrik}
          onChange={(e) => setRubrik(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <select aria-label="Radposition" value={pos} onChange={(e) => setPos(Number(e.target.value))}>
          {plan.map((r, i) => <option key={i} value={i}>Före lektion {i + 1} — {r.lektion.avsnitt}</option>)}
          <option value={plan.length}>Sist i planeringen</option>
        </select>
        <input aria-label="Radbeskrivning" placeholder="Beskrivning (valfri)" value={beskrivning}
          onChange={(e) => setBeskrivning(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <button className="btn sec sm" disabled={rubrik.trim() === ''} onClick={() => {
          const ny: EgenRad = { id: nyttId('er'), position: pos, rubrik: rubrik.trim(), typ,
            ...(beskrivning.trim() !== '' ? { beskrivning: beskrivning.trim() } : {}) };
          kor(() => uppdateraAmne(lasStruktur(), amne.id, {
            egnaRader: [...(lasStruktur().amnen.find((x) => x.id === amne.id)?.egnaRader ?? []), ny],
          }), `${TYPNAMN[typ]} "${ny.rubrik}" infogad som lektion ${pos + 1}.`);
          setRubrik(''); setBeskrivning('');
        }}>+ Infoga rad</button>
      </div>
    </div>
  );
}

// ── Planeringsflikar (portade från v1): Översikt, Uppgifter, Begrepp, Filmer, Magma, Anteckningar ──
const TYP_LABEL: Record<string, [string, string]> = {
  regular: ['LEKTION', '#eef4fb'], repetition: ['REPETITION', '#f3e8fd'],
  review: ['DIAGNOS', '#fef8e3'], test: ['DIAGNOS', '#fef8e3'],
  exam: ['PROV', '#fdecea'], ovaformagor: ['ÖVA FÖRMÅGOR', '#fff3e0'],
};
function TypChip({ typ }: { typ: string }) {
  const [txt, bg] = TYP_LABEL[typ] ?? ['LEKTION', '#eef4fb'];
  return <span className="typ-chip" style={{ background: bg }}>{txt}</span>;
}

/** Prio m.fl. använder färgnivåer (Grön/Blå/Röd) — då visas färgmarkörer.
 * Matematik Y använder ETT/TVÅ/TRE (versaler) — då visas namnen ordagrant. */
/**
 * Nivåfärgerna (grön/blå/röd) används ALLTID på nivå 1/2/3 — även när boken
 * heter ETT/TVÅ/TRE. Namnen kommer alltid ordagrant ur boken (bok.nivaer).
 */
function arFargnivaer(_bok: Bok): boolean { return true; }

/**
 * 🧭 Detaljplanering — lektionssida i HTML-förlagans stil: Tavlan (tider +
 * Vad ska vi göra / lära oss / Exempel vi räknar), Genomgång (text + länk +
 * Bokens exempel), Begrepp med förklaringar, Arbete, Magma, Filmer, Läxa och
 * Exit ticket. Alla ytor redigerbara — sparas i lektionsplanen (overlay).
 */
function DetaljFlik({ s, amneId, plan, bok, amnesNamn, kor, idx, setIdx }: {
  s: Struktur; amneId: string; plan: PlaneradLektion[]; bok: Bok; amnesNamn: string;
  kor: (fn: () => Struktur, m: string) => void; idx: number; setIdx: (i: number) => void;
}) {
  const [nyFilm, setNyFilm] = useState('');
  if (plan.length === 0) return <p className="muted">Skapa en planering först.</p>;
  const i = Math.min(idx, plan.length - 1);
  const rad = plan[i];
  const kap = bok.kapitel.find((k) => k.nr === rad.kapitel);
  const lpForBegrepp = hamtaLektionsplan(s, amneId, i);
  const begrepp = lpForBegrepp?.begreppText !== undefined && lpForBegrepp.begreppText.trim() !== ''
    ? lpForBegrepp.begreppText.split(',').map((b) => b.trim()).filter((b) => b !== '')
    : begreppForLektion(bok, rad.kapitel, rad.lektion);
  const forklaringar = kap?.resurser.forklaringar ?? {};
  const lp = hamtaLektionsplan(s, amneId, i);
  const filmer = lp?.filmer ?? [];
  const klass = s.klasser.find((k) => k.id === s.amnen.find((a) => a.id === amneId)?.klassId);
  const rum = socrativeRum(amnesNamn, klass?.namn ?? '');
  const N = bok.nivaer;
  const farg = arFargnivaer(bok);
  const eff = effektivaNivaer(rad.lektion, lp);
  const { minimum } = arbetsNivaer(rad.lektion);
  const arNo = arHalvklass(amnesNamn); // NO-ram: läsning + Testa dig själv, kumulativa läxförhör
  const har = (v: string) => v !== '—' && v !== '';
  const bas = () => hamtaLektionsplan(lasStruktur(), amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i };
  const satt = (falt: keyof LektionsPlan, v: string) =>
    kor(() => sattLektionsplan(lasStruktur(), { ...bas(), [falt]: v }), '');
  const oka = (t: string | null, min: number): string => {
    if (t === null) return '';
    const [h, m] = t.split(':').map(Number);
    const tot = h * 60 + m + min;
    return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
  };
  const exitTid = rad.start !== null && rad.slutTid !== null ? exitStart(rad.lektion, rad.start, rad.slutTid) : null;
  const harLax = har(rad.lektion.socStart);
  const genomStart = harLax && rad.start !== null ? oka(rad.start, 10) : rad.start ?? '';
  const genomSlut = genomStart !== '' ? oka(genomStart, 10) : '';
  const dagN = rad.datum !== null ? DAGNAMN[new Date(`${rad.datum}T00:00:00Z`).getUTCDay()] ?? '' : '';
  const kapFarg = kap?.farg ?? '#5c6b7a';

  return (
    <div className="detaljflik">
      <div className="rad" style={{ gap: 8 }}>
        <span>Välj lektion:</span>
        <select aria-label="Välj lektion" value={i} onChange={(e) => setIdx(Number(e.target.value))} style={{ flex: 1 }}>
          {plan.map((r, ri) => <option key={ri} value={ri}>Lektion {ri + 1} — {r.lektion.avsnitt} · Del {r.lektion.del}</option>)}
        </select>
        <button className="btn sec sm" disabled={i === 0} onClick={() => setIdx(i - 1)}>◀</button>
        <button className="btn sec sm" disabled={i === plan.length - 1} onClick={() => setIdx(i + 1)}>▶</button>
      </div>

      {/* ── Lektionshuvud ── */}
      <div className="ls-huvud" style={{ borderTopColor: kapFarg }}>
        <div className="rad">
          <h3 className="ls-titel">Lektion {i + 1} – {rad.lektion.avsnitt}</h3>
          <span className="spacer" />
          <span className="ls-nr">Lektion {i + 1} av {plan.length}</span>
        </div>
        <p className="muted small">📖 Teorisidor: <input aria-label="Teorisidor" value={lp?.sidorTeori ?? ''}
          placeholder={rad.lektion.sidorTeori} onChange={(e) => satt('sidorTeori', e.target.value)} style={{ width: 110 }} />
          {rad.datum !== null ? ` · ${dagN} ${rad.datum} · v.${rad.vecka}` : ' · ryms ej i skolåret'}</p>
        {begrepp.length > 0 && <span className="ls-begrepp-badge">💡 {begrepp.length} begrepp introduceras</span>}
      </div>

      {/* ── TAVLAN ── */}
      <section className="ls-sektion ls-tavlan">
        <div className="ls-sek-rubrik">📋 TAVLAN</div>
        <div className="ls-tavla-bar"><b>{amnesNamn}</b><span className="spacer" />
          <b>{rad.start !== null ? `${rad.start} – ${rad.slutTid}` : '—'}</b>&nbsp;<span className="muted-ljus">{dagN}{rad.vecka !== null ? ` · v.${rad.vecka}` : ''}</span></div>
        {rad.start !== null && (
          <div className="ls-tider">
            {harLax && <div className="ls-tid"><span className="ls-tid-t">{rad.start}–{genomStart}</span><b>📱 Läxförhör</b><span className="muted small">{rum}</span></div>}
            <div className="ls-tid"><span className="ls-tid-t">{genomStart}–{genomSlut}</span><b>□ Genomgång</b><span className="muted small">10 min</span></div>
            <div className="ls-tid"><span className="ls-tid-t">{genomSlut}–{exitTid ?? rad.slutTid}</span><b>✏ Arbete</b><span className="muted small">{arNo ? 'Läs + Testa dig själv' : har(eff.niva1) ? `${N.niva1} → ${N.niva2}` : `${N.niva2} → ${N.niva3}`}</span></div>
            {exitTid !== null && <div className="ls-tid"><span className="ls-tid-t">{exitTid}–{rad.slutTid}</span><b>📱 Exit ticket</b><span className="muted small">{rum}</span></div>}
          </div>
        )}
        <div className="ls-trekort">
          <div className="ls-kort ls-gora"><b>VAD SKA VI GÖRA</b>
            <textarea aria-label="Vad ska vi göra" rows={3} value={lp?.vadGora ?? ''}
              placeholder={`Arbeta med uppg. ${har(eff.niva1) ? eff.niva1 : eff.niva2} (${har(eff.niva1) ? N.niva1 : N.niva2})`}
              onChange={(e) => satt('vadGora', e.target.value)} /></div>
          <div className="ls-kort ls-lara"><b>VAD SKA VI LÄRA OSS</b>
            {rad.lektion.mal !== undefined && (
              <ul className="ls-mal">{rad.lektion.mal.split('\n').map((m, mi) => <li key={mi}>{m}</li>)}</ul>
            )}
            <textarea aria-label="Vad ska vi lära oss" rows={3} value={lp?.laraOss ?? ''}
              placeholder={begrepp.length > 0 ? begrepp.join(', ') : 'Lärandemål för lektionen'}
              onChange={(e) => satt('laraOss', e.target.value)} /></div>
          <div className="ls-kort ls-ex"><b>{arNo ? 'TESTA DIG SJÄLV' : 'EXEMPEL VI RÄKNAR'}</b>
            <textarea aria-label="Exempel vi räknar" rows={3} value={lp?.exempelRakna ?? ''}
              placeholder={har(rad.lektion.ex) ? rad.lektion.ex : arNo ? 'Testa dig själv-frågor' : 'Exempel ur boken'}
              onChange={(e) => satt('exempelRakna', e.target.value)} /></div>
        </div>
      </section>

      {/* ── LÄXFÖRHÖR (BAM: lektionen inleds med förhöret) ── */}
      {harLax && (
        <section className="ls-sektion ls-laxforhor">
          <div className="ls-sek-rubrik">📱 {rad.start !== null ? `${rad.start}–${genomStart} · ` : ''}LÄXFÖRHÖR</div>
          <div className="ls-soc-bar"><span className="ls-soc">Socrative.com</span><span className="ls-soc-rum">Roomname: {rum}</span><span className="ls-soc-quiz">{rad.lektion.socStart}</span></div>
          <p className="small">✅ <b>Klar med läxförhöret? Börja direkt med arbetet</b> — {arNo ? 'läs teorisidorna och sätt igång med Testa dig själv' : `${bok.nivaer.niva1}-uppgifterna`}. Ingen väntetid.</p>
        </section>
      )}

      {/* ── GENOMGÅNG ── */}
      <section className="ls-sektion ls-genomgang">
        <div className="ls-sek-rubrik">□ {rad.start !== null ? `${genomStart}–${genomSlut} · ` : ''}GENOMGÅNG</div>
        <textarea aria-label="Genomgång" rows={5} value={lp?.genomgang ?? ''}
          placeholder={har(rad.lektion.genomgang) ? rad.lektion.genomgang : 'Det du berättar under genomgången …'}
          onChange={(e) => satt('genomgang', e.target.value)} />
        {arNo && begrepp.length > 0 && (
          <p className="small">✍ <b>Skriv ner betydelsen av begreppen:</b> {begrepp.join(', ')} — begreppen förhörs på nästa lektions läxförhör.</p>
        )}
        {rad.lektion.genomgangLank !== undefined && (
          <p className="small">🎬 Bokens genomgångsfilm:{' '}
            <a href={rad.lektion.genomgangLank} target="_blank" rel="noreferrer">▶ {rad.lektion.genomgangLank}</a></p>
        )}
        <label className="small">🔗 Genomgångslänk (film — används i NO/flippat):{' '}
          <input aria-label="Genomgångslänk" value={lp?.flippFilm ?? ''} placeholder={rad.lektion.genomgangLank ?? 'https://…'}
            onChange={(e) => satt('flippFilm', e.target.value)} style={{ width: '60%' }} /></label>
        <div className="ls-bokex"><b>{arNo ? 'TESTA DIG SJÄLV – GÅS IGENOM GEMENSAMT' : 'BOKENS EXEMPEL – RÄKNA TILLSAMMANS'}</b>
          <textarea aria-label="Bokens exempel" rows={2} value={lp?.bokExempel ?? ''}
            placeholder={har(rad.lektion.ex) ? rad.lektion.ex : 'Exempel/frågor ur boken'}
            onChange={(e) => satt('bokExempel', e.target.value)} /></div>
      </section>

      {/* ── BEGREPP ── */}
      {begrepp.length > 0 && (
        <section className="ls-sektion ls-begrepp">
          <div className="ls-sek-rubrik">💡 BEGREPP – KAP {rad.kapitel}</div>
          <label className="small">✏ Begrepp (kommaseparerade):{' '}
            <input aria-label="Lektionens begrepp" value={lp?.begreppText ?? ''} placeholder={begrepp.join(', ')}
              onChange={(e) => satt('begreppText', e.target.value)} style={{ width: '70%' }} /></label>
          <div className="ls-begrepp-grid">
            {begrepp.map((b) => (
              <div key={b} className="ls-begrepp-kort"><b>{b}</b>
                {forklaringar[b] !== undefined && <p>{forklaringar[b]}</p>}</div>
            ))}
          </div>
        </section>
      )}

      {/* ── ARBETE ── */}
      <section className="ls-sektion ls-arbete">
        <div className="ls-sek-rubrik">✏ {rad.start !== null ? `${genomSlut}–${exitTid ?? rad.slutTid} · ` : ''}ARBETE</div>
        {arNo
          ? <p className="small"><b>Kap {rad.kapitel} · {rad.lektion.avsnitt}</b> — läs {lp?.sidorTeori !== undefined && lp.sidorTeori !== '' ? lp.sidorTeori : rad.lektion.sidorTeori} och besvara skriftligt: <b>{har(rad.lektion.ex) ? rad.lektion.ex : 'Testa dig själv'}</b>.</p>
          : <p className="small"><b>Lektion {rad.lektion.del} av 2 – {rad.lektion.avsnitt}</b> · minimum: <b>{minimum === 1 ? N.niva1 : N.niva2}</b> klar och inlämnad.</p>}
        <div className="uppg-rad">
          {har(eff.niva1) && <div className={`uppg-niva ${farg ? 'niva-gron' : 'niva-neutral'}`}><div className="un-rubrik">{N.niva1} – introduktion</div><div className="un-uppg">Uppg. <b><input aria-label={`Uppgifter ${N.niva1}`} value={lp?.uppgNiva1 ?? ''} placeholder={rad.lektion.niva1} onChange={(e) => satt('uppgNiva1', e.target.value)} style={{ width: 80 }} /></b></div><div className="un-obl">Obligatorisk</div></div>}
          {har(eff.niva2) && <div className={`uppg-niva ${farg ? 'niva-bla' : 'niva-neutral'}`}><div className="un-rubrik">{N.niva2} – E-nivå</div><div className="un-uppg">Uppg. <b><input aria-label={`Uppgifter ${N.niva2}`} value={lp?.uppgNiva2 ?? ''} placeholder={rad.lektion.niva2} onChange={(e) => satt('uppgNiva2', e.target.value)} style={{ width: 80 }} /></b></div><div className="un-obl">Obligatorisk</div></div>}
          {har(eff.niva3) && <div className={`uppg-niva ${farg ? 'niva-rod' : 'niva-neutral2'}`}><div className="un-rubrik">{N.niva3} – C/A-nivå</div><div className="un-uppg">Uppg. <b><input aria-label={`Uppgifter ${N.niva3}`} value={lp?.uppgNiva3 ?? ''} placeholder={rad.lektion.niva3} onChange={(e) => satt('uppgNiva3', e.target.value)} style={{ width: 80 }} /></b></div><div className="un-obl">Frivillig / vid lektionstid</div></div>}
        </div>
        {arNo
          ? <div className="ls-inlamning">📷 <b>Inlämning via Google Classroom</b> — skriftliga svar på Testa dig själv (obligatoriskt). Görs klart hemma om de ej hunnits med. Läxförhören är kumulativa: alla begrepp hittills, krav ≥ 90 %.</div>
          : <div className="ls-inlamning">📷 <b>Inlämning via Google Classroom</b> — foto på beräkningarna, minst <b>{N.niva1} + {N.niva2}</b> (obligatoriskt). {N.niva3} är frivillig. Görs klart hemma eller på stödtid om de ej hunnits med.</div>}
      </section>

      {/* ── MAGMA (mattemjukvara — finns inte i NO/Tk) ── */}
      {!arNo && <section className="ls-sektion ls-magma">
        <div className="ls-sek-rubrik">🟫 MAGMA – VÄLJ ÖVNING/TEST FÖR ELEVERNA</div>
        <input aria-label="Magma-länk" value={lp?.magma ?? ''} placeholder="Ingen Magma-länk tillagd — klistra in länk"
          onChange={(e) => satt('magma', e.target.value)} style={{ width: '80%' }} />
      </section>}

      {/* ── FILMER ── */}
      <section className="ls-sektion ls-filmer">
        <div className="ls-sek-rubrik">🎬 FILMER – BINOGI OCH ANNAT STÖDMATERIAL</div>
        {filmer.map((f, fi) => {
          const [titel, url] = f.includes('|') ? [f.split('|')[0], f.split('|').slice(1).join('|')] : [f, f];
          return (
            <div key={fi} className="rad film-rad">
              <a href={url} target="_blank" rel="noreferrer">▶ {titel}</a>
              <button className="icon-btn" title="Ta bort film" onClick={() => kor(() => sattLektionsplan(lasStruktur(), {
                ...bas(), filmer: (hamtaLektionsplan(lasStruktur(), amneId, i)?.filmer ?? []).filter((_x, xi) => xi !== fi),
              }), 'Film borttagen.')}>✕</button>
            </div>
          );
        })}
        <div className="rad" style={{ marginTop: 4 }}>
          <input aria-label="Ny film" placeholder="Titel|https://app.binogi.se/…" value={nyFilm}
            onChange={(e) => setNyFilm(e.target.value)} style={{ flex: 1 }} />
          <button className="btn sec sm" disabled={nyFilm.trim() === ''} onClick={() => {
            kor(() => sattLektionsplan(lasStruktur(), { ...bas(), filmer: [...filmer, nyFilm.trim()] }), `Film tillagd på lektion ${i + 1}.`);
            setNyFilm('');
          }}>+ Lägg till film</button>
        </div>
      </section>

      {/* ── LÄXA ── */}
      <section className="ls-sektion ls-laxa">
        <div className="ls-sek-rubrik">📚 LÄXA</div>
        {begrepp.length > 0 && (<>
          <p className="small"><b>Begrepp att kunna inför nästa lektions läxförhör:</b></p>
          <div className="rad" style={{ flexWrap: 'wrap', gap: 5 }}>{begrepp.map((b) => <span key={b} className="chip">{b}</span>)}</div>
        </>)}
        <textarea aria-label="Läxa" rows={2} value={lp?.laxa ?? ''}
          placeholder={har(rad.lektion.laxa) ? rad.lektion.laxa : `${N.niva1} och ${N.niva2} uppgifter klara och inlämnade via Google Classroom innan nästa lektion.`}
          onChange={(e) => satt('laxa', e.target.value)} />
      </section>

      {/* ── EXIT TICKET ── */}
      <section className="ls-sektion ls-exit">
        <div className="ls-sek-rubrik">📱 {exitTid !== null ? `${exitTid}–${rad.slutTid} · ` : ''}EXIT TICKET</div>
        <div className="ls-soc-bar"><span className="ls-soc">Socrative.com</span><span className="ls-soc-rum">Roomname: {rum}</span><span className="ls-soc-quiz"><input aria-label="Exit-quiz" value={lp?.exitQuiz ?? ''}
          placeholder={har(rad.lektion.exit) ? rad.lektion.exit : 'Quiz …'}
          onChange={(e) => satt('exitQuiz', e.target.value)} style={{ width: 110, border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} /></span></div>
        {arNo
          ? <p className="muted small">5 minuter. Delkapitlets begrepp — krav ≥ 70 %. Logga in på Socrative och välj rummet <b>{rum}</b>. Nästa lektions läxförhör är kumulativt (alla begrepp hittills, krav ≥ 90 %).</p>
          : <p className="muted small">5 minuter. Visa att du förstår grundläggande uppgifter från lektionen — logga in på Socrative och välj rummet <b>{rum}</b>. Exit ticket från denna lektion används som läxförhör nästa lektion.</p>}
      </section>

      <button className="btn sec ls-nyrad no-print" onClick={() => {
        const rubrik = window.prompt('Rubrik för den nya lektionen (t.ex. Repetition, Diagnos, Prov):', 'Extra övning');
        if (rubrik === null || rubrik.trim() === '') return;
        const amne = lasStruktur().amnen.find((x) => x.id === amneId);
        kor(() => uppdateraAmne(lasStruktur(), amneId, {
          egnaRader: [...(amne?.egnaRader ?? []), { id: nyttId('er'), position: i + 1, rubrik: rubrik.trim(), typ: 'ovning' as const }],
        }), `\"${rubrik.trim()}\" infogad efter lektion ${i + 1} — bokens lektioner skjuts framåt.`);
      }}>➕ Lägg till lektion efter denna</button>
      {arHalvklass(amnesNamn) && (
        <NoPlanering key={`${amneId}-${i}`} s={s} amneId={amneId} lektionsIndex={i} kor={kor}
          amnesNamn={amnesNamn} rad={rad} bok={bok} alltidOppen />
      )}
    </div>
  );
}

function OversiktFlik({ plan, bok, oppnaLektion }: { plan: PlaneradLektion[]; bok: Bok; oppnaLektion: (i: number) => void }) {
  const farg = arFargnivaer(bok);
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Översikt – alla {plan.length} lektioner <small className="muted">klicka på en rad för att redigera lektionen i detalj</small></h3>
      <table className="tbl plan clickable">
        <thead><tr><th>Lek.</th><th>Vecka</th><th>Datum</th><th>Tid</th><th>Avsnitt</th><th>Typ</th>
          {bokHarNivaer(bok) && <><th>🟢 {bok.nivaer.niva1}</th><th>🔵 {bok.nivaer.niva2}</th><th>🔴 {bok.nivaer.niva3}</th></>}</tr></thead>
        <tbody>{plan.map((r, i) => (
          <tr key={i} className={r.datum === null ? 'saknas' : ''} onClick={() => oppnaLektion(i)} title="Öppna lektionen i detaljplaneringen">
            <td>{i + 1}</td><td>{r.vecka !== null ? `v.${r.vecka}` : ''}</td><td>{r.datum ?? 'ryms ej'}</td>
            <td>{r.start !== null ? `${r.start}–${r.slutTid}` : ''}</td>
            <td>{r.lektion.avsnitt}</td><td><TypChip typ={r.lektion.typ} /></td>
            {bokHarNivaer(bok) && <><td>{r.lektion.niva1}</td><td>{r.lektion.niva2}</td><td className="rod">{r.lektion.niva3}</td></>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
function UppgifterFlik({ plan, bok, s, amneId, oppnaLektion }: { plan: PlaneradLektion[]; bok: Bok; s: Struktur; amneId: string; oppnaLektion: (i: number) => void }) {
  const N = bok.nivaer;
  const har = (v: string) => v !== '—' && v !== '';
  const amne = s.amnen.find((a) => a.id === amneId);
  const tjanst = s.tjanster.find((t) => t.id === s.klasser.find((k) => k.id === amne?.klassId)?.tjanstId);
  const stod = tjanst?.stodPass ?? [];
  const nivaer = bokHarNivaer(bok);
  return (
    <div>
      <div className="regel" style={{ marginBottom: 10 }}>
        <h4>📌 Inlämning</h4>
        {nivaer
          ? <p>Foto på beräkningar laddas upp i klassens inlämningsyta (Teams, Classroom m.fl.). <b>{N.niva1} + {N.niva2} är obligatoriska.</b> {N.niva3} görs och lämnas in om lektionstid finns, annars frivillig fördjupning.</p>
          : <p>Skriftliga <b>Testa dig själv-svar</b> laddas upp i klassens inlämningsyta (obligatoriskt). Läxförhören är kumulativa — alla begrepp hittills, krav ≥ 90 %; exit tickets kräver ≥ 70 %.</p>}
        {stod.length > 0 && (
          <p>🧩 Inte klar på lektionen? Gör klart hemma eller på {stod.map((sp, i) => (
            <span key={sp.id}>{i > 0 ? ' eller ' : ''}<b>{sp.namn}</b> ({DAGNAMN[sp.dag]?.toLowerCase()} {sp.start}–{sp.slut})</span>
          ))} — sedan lämnas uppgifterna in.</p>
        )}
      </div>
      {plan.map((r, i) => {
        const { minimum } = arbetsNivaer(r.lektion);
        const farg = arFargnivaer(bok);
        const eff = effektivaNivaer(r.lektion, hamtaLektionsplan(s, amneId, i));
        const kort: Array<[string, string, string, string]> = [];
        if (har(eff.niva1)) kort.push([`${N.niva1} – introduktion`, eff.niva1, farg ? 'niva-gron' : 'niva-neutral', 'Obligatorisk']);
        if (har(eff.niva2)) kort.push([`${N.niva2} – E-nivå`, eff.niva2, farg ? 'niva-bla' : 'niva-neutral', 'Obligatorisk']);
        if (har(eff.niva3)) kort.push([`${N.niva3} – C/A-nivå`, eff.niva3, farg ? 'niva-rod' : 'niva-neutral2', 'Frivillig / vid lektionstid']);
        return (
          <div key={i} className="uppg-kort">
            <div className="rad"><b>Lektion {i + 1} — {r.lektion.avsnitt}</b><span className="spacer" />
              {nivaer && <span className="pillm">Lek {r.lektion.del}: min. {minimum === 1 ? N.niva1 : N.niva2}</span>}
              {r.lektion.sidorTeori !== '' && <span className="muted small">📖 {r.lektion.sidorTeori}</span>}
              <button className="btn sec sm" onClick={() => oppnaLektion(i)}>Öppna lektion →</button></div>
            {kort.length === 0 ? <p className="muted small">Inga uppgiftsintervall (repetition/diagnos/prov).</p> : (
              <div className="uppg-rad">{kort.map(([rubrik, uppg, cls, obl]) => (
                <div key={rubrik} className={`uppg-niva ${cls}`}>
                  <div className="un-rubrik">{rubrik}</div>
                  <div className="un-uppg">Uppg. <b>{uppg}</b></div>
                  <div className="un-obl">{obl}</div>
                </div>
              ))}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BegreppFlik({ plan, bok, oppnaLektion }: { plan: PlaneradLektion[]; bok: Bok; oppnaLektion: (i: number) => void }) {
  const rader = plan.flatMap((r, i) =>
    begreppForLektion(bok, r.kapitel, r.lektion)
      .filter((_, bi, arr) => r.lektion.del === 1 || arr.length === 0) // begrepp introduceras på del 1
      .map((b) => ({ lektion: i + 1, index: i, begrepp: b, avsnitt: r.lektion.avsnitt,
        forklaring: bok.kapitel.find((k) => k.nr === r.kapitel)?.resurser.forklaringar?.[b] ?? '' })));
  const alla = [...new Set(bok.kapitel.flatMap((k) => k.begreppslista))];
  return (
    <div>
      <table className="tbl plan clickable begrepp-tbl">
        <thead><tr><th>Lektion</th><th>Begrepp</th><th>Avsnitt</th><th>Förklaring</th></tr></thead>
        <tbody>{rader.map((r, i) => (
          <tr key={i} onClick={() => oppnaLektion(r.index)} title="Öppna lektionen i detaljplaneringen">
            <td>{r.lektion}</td><td><b>{r.begrepp}</b></td><td>{r.avsnitt}</td>
            <td className="muted">{r.forklaring !== '' ? r.forklaring : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      <h3>Alla begrepp</h3>
      <div className="rad" style={{ flexWrap: 'wrap', gap: 5 }}>{alla.map((b) => <span key={b} className="chip">{b}</span>)}</div>
    </div>
  );
}
function FilmerFlik({ s, amneId, plan, bok, kor, oppnaLektion }: {
  s: Struktur; amneId: string; plan: PlaneradLektion[]; bok: Bok;
  kor: (fn: () => Struktur, m: string) => void; oppnaLektion: (i: number) => void;
}) {
  const [nyTitel, setNyTitel] = useState<Record<number, string>>({});
  const [nyUrl, setNyUrl] = useState<Record<number, string>>({});
  const totalt = plan.reduce((n, _r, i) => n + (hamtaLektionsplan(s, amneId, i)?.filmer?.length ?? 0), 0);
  const laggPa = (lektionsIndex: number, titel: string, url: string) => {
    kor(() => {
      const bef = hamtaLektionsplan(lasStruktur(), amneId, lektionsIndex);
      return sattLektionsplan(lasStruktur(), {
        ...(bef ?? { id: `lp-${amneId}-${lektionsIndex}`, amneId, lektionsIndex }),
        filmer: [...(bef?.filmer ?? []), titel === '' ? url : `${titel}|${url}`],
      });
    }, `"${titel === '' ? url : titel}" tillagd på lektion ${lektionsIndex + 1}.`);
  };
  return (
    <div>
      <div className="regel" style={{ marginBottom: 10 }}>
        <h4>🎬 Filmlänkar per lektion</h4>
        <p>Alla filmlänkar (t.ex. Binogi) som lagts till på enskilda lektioner samlas här. Lägg till eller ta bort en länk direkt — det uppdaterar automatiskt motsvarande lektionssida.</p>
      </div>
      <p className="muted small"><b>{totalt} filmer totalt i planeringen</b></p>
      {bok.kapitel.filter((k) => k.resurser.filmer.length > 0).map((k) => (
        <div key={k.nr} className="uppg-kort" style={{ borderLeft: `4px solid ${k.farg}` }}>
          <b>📚 Kapitel {k.nr} {k.namn}</b> <small className="muted">— bokens filmresurser ({k.resurser.filmer.length}); välj lektion för att lägga till</small>
          {k.resurser.filmer.map((f, fi) => (
            <div key={fi} className="rad film-rad">
              <a href={f.url} target="_blank" rel="noreferrer">▶ {f.titel}</a>
              <select aria-label={`Lägg ${f.titel} på lektion`} value="" onChange={(e) => {
                if (e.target.value !== '') laggPa(Number(e.target.value), f.titel, f.url);
                e.target.value = '';
              }}>
                <option value="">+ på lektion …</option>
                {plan.map((r, ri) => r.kapitel === k.nr
                  ? <option key={ri} value={ri}>Lektion {ri + 1} — {r.lektion.avsnitt}</option> : null)}
              </select>
            </div>
          ))}
        </div>
      ))}
      {plan.map((r, i) => {
        const kapFarg = bok.kapitel.find((k) => k.nr === r.kapitel)?.farg ?? '#5c6b7a';
        const filmer = hamtaLektionsplan(s, amneId, i)?.filmer ?? [];
        return (
          <div key={i} className="film-lekt" style={{ borderLeft: `4px solid ${kapFarg}` }}>
            <div className="rad">
              <b className="film-lekt-rubrik">🎬 LEKTION {i + 1} – {r.lektion.avsnitt.toUpperCase()}</b>
              <span className="spacer" />
              <button className="btn sec sm" onClick={() => oppnaLektion(i)}>Öppna lektion →</button>
            </div>
            {filmer.length === 0 && <p className="muted small" style={{ margin: '4px 0' }}><i>Inga filmer tillagda ännu.</i></p>}
            {filmer.map((f, fi) => {
              const [titel, url] = f.includes('|') ? [f.split('|')[0], f.split('|').slice(1).join('|')] : [f, f];
              return (
                <div key={fi} className="rad film-rad film-lekt-rad">
                  <span>▶ <a href={url} target="_blank" rel="noreferrer"><b>{titel}</b></a><br /><small className="muted">{url}</small></span>
                  <button className="icon-btn" title="Ta bort film" onClick={() => kor(() => sattLektionsplan(lasStruktur(), {
                    ...(hamtaLektionsplan(lasStruktur(), amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i }),
                    filmer: filmer.filter((_x, xi) => xi !== fi),
                  }), 'Film borttagen.')}>✕</button>
                </div>
              );
            })}
            <div className="rad" style={{ gap: 6, marginTop: 4 }}>
              <input aria-label={`Filmtitel lektion ${i + 1}`} placeholder="Titel (valfri)" value={nyTitel[i] ?? ''}
                onChange={(e) => setNyTitel({ ...nyTitel, [i]: e.target.value })} style={{ width: 160 }} />
              <input aria-label={`Filmlänk lektion ${i + 1}`} placeholder="https://youtube.com/…" value={nyUrl[i] ?? ''}
                onChange={(e) => setNyUrl({ ...nyUrl, [i]: e.target.value })} style={{ flex: 1 }} />
              <button className="btn sm" disabled={(nyUrl[i] ?? '').trim() === ''} onClick={() => {
                laggPa(i, (nyTitel[i] ?? '').trim(), (nyUrl[i] ?? '').trim());
                setNyTitel({ ...nyTitel, [i]: '' }); setNyUrl({ ...nyUrl, [i]: '' });
              }}>+ Lägg till film</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function MagmaFlik({ s, amneId, plan, kor }: {
  s: Struktur; amneId: string; plan: PlaneradLektion[]; kor: (fn: () => Struktur, m: string) => void;
}) {
  const antal = plan.filter((_r, i) => (hamtaLektionsplan(s, amneId, i)?.magma ?? '') !== '').length;
  return (
    <div>
      <p className="note">🟫 Magma är en app med övningsuppgifter och test som du väljer åt eleverna. Länken per lektion visas på lektionskortet.</p>
      <p className="muted small">{antal} av {plan.length} lektioner har en Magma-aktivitet</p>
      {plan.map((r, i) => {
        const lp = hamtaLektionsplan(s, amneId, i);
        return (
          <div key={i} className="uppg-kort rad">
            <b>🟫 Lektion {i + 1} — {r.lektion.avsnitt}</b>
            <span className="spacer" />
            <input aria-label={`Magma-länk lektion ${i + 1}`} placeholder="Ingen Magma-länk — klistra in https://…"
              value={lp?.magma ?? ''} style={{ flex: 1 }}
              onChange={(e) => kor(() => sattLektionsplan(lasStruktur(), {
                ...(hamtaLektionsplan(lasStruktur(), amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i }),
                magma: e.target.value,
              }), '')} />
          </div>
        );
      })}
    </div>
  );
}

function AnteckningarFlik({ s, amneId, klassNamn, plan, kor }: {
  s: Struktur; amneId: string; klassNamn: string; plan: PlaneradLektion[]; kor: (fn: () => Struktur, m: string) => void;
}) {
  return (
    <div>
      <p className="note">👥 Anteckningar för klass {klassNamn} — vad som hände, vad som behöver följas upp, per lektion. Sparas direkt.</p>
      {plan.map((r, i) => {
        const lp = hamtaLektionsplan(s, amneId, i);
        return (
          <div key={i} className="ant-rad">
            <b>Lek. {i + 1}: {r.lektion.avsnitt}</b>
            <textarea aria-label={`Anteckning lektion ${i + 1}`} rows={2} placeholder={`Anteckningar om ${klassNamn}…`}
              value={lp?.anteckning ?? ''}
              onChange={(e) => kor(() => sattLektionsplan(lasStruktur(), {
                ...(hamtaLektionsplan(lasStruktur(), amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i }),
                anteckning: e.target.value,
              }), '')} />
          </div>
        );
      })}
    </div>
  );
}

// ── NO+Tk: redigera läsordningen i efterhand ─────────────────
function NoOrdningRedigerare({ s, syskon, kor }: {
  s: Struktur; syskon: Amne[]; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [ordning, setOrdning] = useState<string[]>(syskon.map((x) => x.namn));
  const original = syskon.map((x) => x.namn);
  const andrad = JSON.stringify(ordning) !== JSON.stringify(original);
  const byt = (i: number, namn: string) => {
    const nytt = [...ordning]; const j = nytt.indexOf(namn); const tmp = nytt[i];
    nytt[i] = namn; nytt[j] = tmp; setOrdning(nytt);
  };
  return (
    <div className="no-ordning">
      <h4 style={{ margin: '0 0 6px' }}>NO+Tk-läsordning</h4>
      <div className="rad" style={{ flexWrap: 'wrap', gap: 6 }}>
        {ordning.map((namn, i) => (
          <select key={i} aria-label={`Ändra NO-block ${i + 1}`} value={namn} onChange={(e) => byt(i, e.target.value)}>
            {NO_TK_AMNEN.map((a) => <option key={a} value={a}>{i + 1}. {a}</option>)}
          </select>
        ))}
      </div>
      <button className="btn sec sm" disabled={!andrad} style={{ marginTop: 6 }}
        onClick={() => kor(() => {
          let st = lasStruktur();
          // Sätt noOrder efter den nya ordningen (matcha på delämnets namn inom gruppen)
          ordning.forEach((namn, order) => {
            const am = syskon.find((x) => x.namn === namn);
            if (am) st = uppdateraAmne(st, am.id, { noOrder: order });
          });
          return st;
        }, `NO+Tk-ordning ändrad: ${ordning.join(' → ')} — planeringar och kalender räknas om.`)}>
        {andrad ? '💾 Spara ny ordning' : 'Ordning sparad'}
      </button>
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
  plan: PlaneradLektion[]; planB?: PlaneradLektion[]; bok: Bok; amnesNamn: string; klassNamn: string;
  rum: string; rubrik?: string;
  s?: Struktur; amneId?: string; kor?: (fn: () => Struktur, m: string) => void;
}) {
  const { plan, planB, bok, amnesNamn, klassNamn, rum, rubrik, s, amneId, kor } = props;
  const [valdRad, setValdRad] = useState<number | null>(null);
  const halvklassAmne = planB !== undefined;
  /**
   * En klass — en planering: Grupp A:s och B:s rader slås ihop per (datum, tid).
   * Samma lektion i båda grupperna på samma slot visas EN gång som Helklass;
   * gruppspecifika tillfällen märks Grupp A/B. Kryss och lektionskort följer
   * lektionens index (samma lektion = samma kryss oavsett grupp).
   */
  const rader: Array<{ r: PlaneradLektion; index: number; klassTyp: string }> = (() => {
    if (planB === undefined) return plan.map((r, index) => ({ r, index, klassTyp: '' }));
    const ut: Array<{ r: PlaneradLektion; index: number; klassTyp: string }> = [];
    const bNyckel = new Map(planB.map((r, index) => [`${r.datum}|${r.start}`, { r, index }]));
    const tagna = new Set<string>();
    for (const [index, r] of plan.entries()) {
      const nyckel = `${r.datum}|${r.start}`;
      const b = bNyckel.get(nyckel);
      if (r.datum !== null && b !== undefined && b.r.lektion.id === r.lektion.id && b.r.kapitel === r.kapitel) {
        ut.push({ r, index, klassTyp: 'Helklass' }); tagna.add(nyckel);
      } else {
        ut.push({ r, index, klassTyp: 'Grupp A' });
      }
    }
    for (const [index, r] of planB.entries()) {
      if (!tagna.has(`${r.datum}|${r.start}`)) ut.push({ r, index, klassTyp: 'Grupp B' });
    }
    return ut.sort((x, y) => (x.r.datum ?? '9999').localeCompare(y.r.datum ?? '9999') || (x.r.start ?? '').localeCompare(y.r.start ?? ''));
  })();
  if (plan.length === 0) return null;
  return (
    <>
      {rubrik !== undefined && <h3 className="grupp-h">{rubrik}</h3>}
      <table className="tbl plan clickable">
        <thead><tr><th title="Avklarad">✓</th><th>Datum</th><th>Dag</th><th>V.</th><th>Tid</th>{halvklassAmne && <th>Klass</th>}<th>Kap</th><th>Avsnitt</th>{bokHarNivaer(bok) && <><th>{bok.nivaer.niva1}</th><th>{bok.nivaer.niva2}</th><th>{bok.nivaer.niva3}</th></>}</tr></thead>
        <tbody>{rader.map(({ r, index: i, klassTyp }, radNr) => {
          const klar = s !== undefined && amneId !== undefined && hamtaLektionsplan(s, amneId, i)?.klar === true;
          return (
          <tr key={radNr} className={`${r.datum === null ? 'saknas' : ''} ${valdRad === radNr ? 'vald' : ''} ${klar ? 'klar' : ''}`}
            onClick={() => setValdRad(valdRad === radNr ? null : radNr)} title="Öppna lektionskort">
            <td onClick={(e) => e.stopPropagation()}>
              {s !== undefined && amneId !== undefined && kor !== undefined && (
                <input type="checkbox" aria-label={`Lektion ${i + 1} avklarad`} checked={klar}
                  onChange={(e) => kor(() => sattLektionsplan(lasStruktur(), {
                    ...(hamtaLektionsplan(lasStruktur(), amneId, i) ?? { id: `lp-${amneId}-${i}`, amneId, lektionsIndex: i }),
                    klar: e.target.checked,
                  }), e.target.checked ? `Lektion ${i + 1} avklarad ✓` : `Lektion ${i + 1} markerad som ej klar.`)} />
              )}
            </td>
            <td>{r.datum ?? 'ryms ej'}</td>
            <td>{r.datum !== null ? DAGNAMN[new Date(`${r.datum}T00:00:00Z`).getUTCDay()] ?? '' : ''}</td>
            <td>{r.vecka ?? ''}</td>
            <td>{r.start !== null ? `${r.start}–${r.slutTid}` : ''}</td>
            {halvklassAmne && <td><span className={`omf-chip ${klassTyp === 'Helklass' ? 'omf-hel' : 'omf-halv'}`}>{klassTyp}</span></td>}
            <td>{r.kapitel}</td><td>{r.lektion.avsnitt} · Del {r.lektion.del}</td>
            {bokHarNivaer(bok) && <><td>{r.lektion.niva1}</td><td>{r.lektion.niva2}</td><td>{r.lektion.niva3}</td></>}
          </tr>
          );
        })}</tbody>
      </table>
      {valdRad !== null && rader[valdRad] && (
        <Lektionskort rad={rader[valdRad].r} bok={bok} amnesNamn={amnesNamn} klassNamn={klassNamn}
          rum={rum} grupp={rader[valdRad].klassTyp === 'Grupp A' ? 'A' : rader[valdRad].klassTyp === 'Grupp B' ? 'B' : undefined}
          nr={rader[valdRad].index + 1} onStang={() => setValdRad(null)}
          s={s} amneId={amneId} lektionsIndex={rader[valdRad].index} kor={kor} />
      )}
    </>
  );
}

// ── Ämnets schema: redigeras och sparas uttryckligen ─────────
function AmneSchemaRedigerare({ s, amne, kor, falt, rubrik }: {
  s: Struktur; amne: Amne; kor: (fn: () => Struktur, m: string) => void;
  falt: 'schema' | 'schemaB'; rubrik: string;
}) {
  const nuvarande = (falt === 'schema' ? amne.schema : amne.schemaB) ?? [];
  const [rows, setRows] = useState<PassRad[]>(nuvarande.map((p) => ({ ...p })));
  const [sparat, setSparat] = useState(false);
  const [konfliktSteg, setKonfliktSteg] = useState(0);
  const [konfliktMsg, setKonfliktMsg] = useState('');
  const giltiga = rows.every((p) => giltigtPass(p as Pass));
  const andrad = JSON.stringify(rows) !== JSON.stringify(nuvarande);
  return (
    <div className="schema-red">
      <h3>{rubrik} <small className="muted">{nuvarande.map((p) => `${DAGNAMN[p.dag]} ${p.start}–${p.slut}`).join(' · ')}</small></h3>
      <PassRedigerare pass={rows} onChange={(p) => { setRows(p); setSparat(false); setKonfliktSteg(0); setKonfliktMsg(''); }} />
      <button className="btn" disabled={!andrad || !giltiga || rows.length === 0}
        title={!giltiga ? 'Minst ett pass är ogiltigt (start < slut, mån–fre)' : !andrad ? 'Inga osparade ändringar' : ''}
        onClick={() => {
          const krock = passKonflikter(s, amne.klassId, rows as Pass[], amne.id);
          if (krock.length > 0 && konfliktSteg < 2) {
            const steg = konfliktSteg + 1; setKonfliktSteg(steg); setKonfliktMsg(konfliktText(krock, steg)); return;
          }
          kor(() => uppdateraAmne(lasStruktur(), amne.id, { [falt]: rows.map((p) => ({ ...p })) }),
            `Schema sparat (${rows.length} pass/vecka)${krock.length > 0 ? ' — trots schemakrock' : ''} — planeringen har räknats om.`);
          setSparat(true); setKonfliktSteg(0); setKonfliktMsg(''); setTimeout(() => setSparat(false), 2500);
        }}>{sparat ? '✓ Sparat!' : konfliktSteg > 0 ? `⚠ Spara ändå (${konfliktSteg}/2)` : '💾 Spara schema'}</button>
      {andrad && !sparat && konfliktSteg === 0 && <span className="osparat">● osparade ändringar</span>}
      {konfliktMsg && <p className="status warn">{konfliktMsg}</p>}
    </div>
  );
}

/** Halvklass-/NO-schemat redigeras som EN lista där varje pass är Helklass/Grupp A/Grupp B. */
function HalvklassSchemaRedigerare({ s, amne, kor }: {
  s: Struktur; amne: Amne; kor: (fn: () => Struktur, m: string) => void;
}) {
  const nuvarande = kombineraHalvklassPass(amne.schema, amne.schemaB ?? []);
  const [rader, setRader] = useState<OmfattningsPass[]>(nuvarande.map((r) => ({ ...r })));
  const [sparat, setSparat] = useState(false);
  const [konfliktSteg, setKonfliktSteg] = useState(0);
  const [konfliktMsg, setKonfliktMsg] = useState('');
  const giltiga = rader.every((r) => giltigtPass(r));
  const delade = delaHalvklassPass(rader.filter((r) => giltigtPass(r)));
  const komplett = delade.schema.length > 0 && delade.schemaB.length > 0;
  const andrad = JSON.stringify(rader) !== JSON.stringify(nuvarande);
  const beskrivning = (r: OmfattningsPass) =>
    `${DAGNAMN[r.dag]} ${r.start}–${r.slut} ${r.omfattning === 'hel' ? 'Helklass' : `Grupp ${r.omfattning}`}`;
  return (
    <div className="schema-red">
      <h3>Schema <small className="muted">{nuvarande.map(beskrivning).join(' · ')}</small></h3>
      <p className="note">Helklass = elever från Grupp A och B tillsammans · Halvklass Grupp A/B = bara den gruppens elever. Helklasspass räknas in i båda gruppernas planering.</p>
      <OmfPassRedigerare rader={rader} onChange={(r) => { setRader(r); setSparat(false); setKonfliktSteg(0); setKonfliktMsg(''); }} />
      <button className="btn" disabled={!andrad || !giltiga || !komplett}
        title={!komplett ? 'Båda grupperna behöver minst ett pass (helklasspass räknas för båda)' : !andrad ? 'Inga osparade ändringar' : ''}
        onClick={() => {
          const krock = passKonflikter(s, amne.klassId, [...delade.schema, ...delade.schemaB], amne.id);
          if (krock.length > 0 && konfliktSteg < 2) {
            const steg = konfliktSteg + 1; setKonfliktSteg(steg); setKonfliktMsg(konfliktText(krock, steg)); return;
          }
          kor(() => uppdateraAmne(lasStruktur(), amne.id, { schema: delade.schema, schemaB: delade.schemaB }),
            `Schema sparat (${rader.length} pass/vecka)${krock.length > 0 ? ' — trots schemakrock' : ''} — planeringen har räknats om.`);
          setSparat(true); setKonfliktSteg(0); setKonfliktMsg(''); setTimeout(() => setSparat(false), 2500);
        }}>{sparat ? '✓ Sparat!' : konfliktSteg > 0 ? `⚠ Spara ändå (${konfliktSteg}/2)` : '💾 Spara schema'}</button>
      {andrad && !sparat && konfliktSteg === 0 && <span className="osparat">● osparade ändringar</span>}
      {konfliktMsg && <p className="status warn">{konfliktMsg}</p>}
    </div>
  );
}

// ── Lektionskort (BAM: Läxförhör → Genomgång → Arbete → Exit ticket) ──
function Lektionskort(props: {
  rad: PlaneradLektion; bok: Bok; amnesNamn: string; klassNamn: string;
  rum: string; grupp?: Grupp; nr: number; onStang: () => void;
  s?: Struktur; amneId?: string; lektionsIndex?: number; kor?: (fn: () => Struktur, m: string) => void;
}) {
  const { rad, bok, amnesNamn, klassNamn, rum, grupp, nr, onStang, s, amneId, lektionsIndex, kor } = props;
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
              <h6>{nivaNamn[i]} {i === 0 ? '– introduktion' : i === 1 ? '– E-nivå' : '– C/A-nivå'}</h6>
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
      {s !== undefined && amneId !== undefined && lektionsIndex !== undefined && kor !== undefined && (
        <NoPlanering s={s} amneId={amneId} lektionsIndex={lektionsIndex} kor={kor}
          amnesNamn={amnesNamn} rad={rad} bok={bok} />
      )}
    </div>
  );
}

/**
 * Detaljerad planering (viktig i NO): presentation, sammanfattning, mål,
 * läxa/läxförhör med begreppsrum (Biologi41/Biologi412 …), exit ticket,
 * flippat underlag (teoritext, film, quiz + elevlayout) och laboration
 * (länk eller frågeställning för systematisk undersökning).
 */
function NoPlanering({ s, amneId, lektionsIndex, kor, amnesNamn, rad, bok, alltidOppen = false }: {
  s: Struktur; amneId: string; lektionsIndex: number; kor: (fn: () => Struktur, m: string) => void;
  amnesNamn: string; rad: PlaneradLektion; bok: Bok; alltidOppen?: boolean;
}) {
  const arNo = (NO_TK_AMNEN as readonly string[]).includes(amnesNamn);
  const sparad = hamtaLektionsplan(s, amneId, lektionsIndex);
  const dk = delkapitelUrAvsnitt(rad.lektion.avsnitt);
  const forslag = dk !== null ? foreslagnaRum(amnesNamn, dk.kap, dk.del) : null;
  const kapNamn = bok.kapitel.find((k) => k.nr === rad.kapitel)?.namn ?? '';
  const defaultLaxa = begreppForLektion(bok, rad.kapitel, rad.lektion).join(', ');
  const tomPlan: LektionsPlan = {
    id: `lp-${amneId}-${lektionsIndex}`, amneId, lektionsIndex,
    presentation: '', sammanfattning: '', mal: '',
    laxa: defaultLaxa, laxforhorRum: forslag?.laxforhor ?? '', exitQuiz: '',
    flippTeori: '', flippFilm: '', flippQuiz: '', labLank: '', labFraga: '', genomgang: '',
  };
  const [plan, setPlan] = useState<LektionsPlan>({ ...tomPlan, ...(sparad ?? {}) });
  const [oppen, setOppen] = useState(alltidOppen);
  const andra = (delta: Partial<LektionsPlan>) => setPlan((f) => ({ ...f, ...delta }));
  const falt = (label: string, nyckel: keyof LektionsPlan, placeholder = '', rad3 = false) => (
    <label className="np-falt">{label}
      {rad3
        ? <textarea aria-label={label} rows={3} value={(plan[nyckel] as string | undefined) ?? ''} placeholder={placeholder}
            onChange={(e) => andra({ [nyckel]: e.target.value })} />
        : <input aria-label={label} value={(plan[nyckel] as string | undefined) ?? ''} placeholder={placeholder}
            onChange={(e) => andra({ [nyckel]: e.target.value })} />}
    </label>
  );
  return (
    <div className="no-planering no-print-safe">
      {!alltidOppen && <button className="btn sec sm" onClick={() => setOppen(!oppen)}>
        {oppen ? '▲ Dölj detaljerad planering' : `▼ Detaljerad planering${arNo ? ' (NO)' : ''}${sparad !== null ? ' ·  ifylld' : ''}`}
      </button>}
      {oppen && (
        <div className="np-grid">
          {falt('Presentation', 'presentation', 'T.ex. Fotosyntes.pptx')}
          {falt('Genomgång', 'genomgang', 'Det du berättar under genomgången …', true)}
          {falt('Sammanfattning av delkapitlet', 'sammanfattning', `Ur ${kapNamn}s sammanfattning …`, true)}
          {falt('Vad ska vi lära oss (mål)', 'mal', 'Ur kapitlets sammanfattning …', true)}
          {falt('Läxa (begrepp)', 'laxa', 'Delkapitlets begrepp', true)}
          <div className="np-falt">
            <span>Läxförhör · Socrative-rum {forslag !== null && (
              <small className="muted">förslag: {forslag.laxforhor}
                {dk !== null && dk.del > 1 && <> · enskilt: {begreppsRum(amnesNamn, dk.kap, [dk.del])}</>}
              </small>
            )}</span>
            <input aria-label="Läxförhörsrum" value={plan.laxforhorRum ?? ''} placeholder={forslag?.laxforhor ?? ''}
              onChange={(e) => andra({ laxforhorRum: e.target.value })} />
          </div>
          {falt('Exit ticket · quiznamn', 'exitQuiz', forslag !== null ? `Rum ${forslag.exit}` : 'T.ex. Quiz 4.2')}
          <div className="np-sektion">🧪 Laboration <small className="muted">länk till laboration ELLER frågeställning för systematisk undersökning</small></div>
          {falt('Länk till laboration', 'labLank', 'https://…')}
          {falt('Frågeställning (systematisk undersökning)', 'labFraga', 'T.ex. Hur påverkar ljusmängden fotosyntesens hastighet?', true)}
          <div className="np-sektion">🔁 Flippat underlag <small className="muted">skickas till eleven inför lektionen</small></div>
          {falt('Kort teoritext', 'flippTeori', 'Kort teoritext eleven läser hemma …', true)}
          {falt('Länk till kort film', 'flippFilm', 'https://binogi.se/…')}
          {falt('Quiz (namn)', 'flippQuiz', forslag !== null ? `T.ex. ${forslag.exit}` : 'Quiznamn')}
          {(plan.flippTeori !== '' || plan.flippFilm !== '' || plan.flippQuiz !== '') && (
            <div className="flipp-preview">
              <div className="fp-rubrik">📨 Det här skickas till eleven (flippad lektion)</div>
              <div className="fp-kropp">
                <p><b>{amnesNamn} · {rad.lektion.avsnitt}</b>{rad.datum !== null ? ` · inför ${rad.datum}` : ''}</p>
                {plan.flippTeori !== '' && <p>{plan.flippTeori}</p>}
                {plan.flippFilm !== '' && <p>🎬 Se filmen: <span className="fp-lank">{plan.flippFilm}</span></p>}
                {plan.flippQuiz !== '' && <p>✅ Gör quizet <b>{plan.flippQuiz}</b> på socrative.com{forslag !== null ? <> · rum <b>{forslag.exit}</b></> : null}</p>}
                {(plan.laxa ?? '') !== '' && <p>💡 Begrepp att kunna: {plan.laxa}</p>}
              </div>
            </div>
          )}
          <button className="btn" onClick={() => kor(() => sattLektionsplan(lasStruktur(), plan),
            `Detaljerad planering sparad för lektion ${lektionsIndex + 1} (${rad.lektion.avsnitt}).`)}>💾 Spara planering</button>
        </div>
      )}
    </div>
  );
}

// ── Kalender (läsår / termin / månad / vecka) ────────────────
const MANADSNAMN = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];

/** 📋 Planering: egen huvudflik — välj klass · ämne och arbeta direkt med lektionsplan,
 * detaljplanering (alla texter redigerbara), egna rader (prov/diagnoser/övningar) och filmer. */
const KALLNAMN: Record<ResultatKalla, string> = {
  'socrative-laxforhor': 'Läxförhör', 'socrative-exit': 'Exit tickets', magma: 'Magma test', digiexam: 'DigiExam prov',
};
const ALLA_KALLOR: ResultatKalla[] = ['socrative-laxforhor', 'socrative-exit', 'magma', 'digiexam'];

/**
 * 📊 SuperTeach — resultat samlas ämnesvis och aggregeras: importera
 * (klistra in Namn / Poäng / Max från Socrative-, Magma- eller DigiExam-
 * export), matcha mot klassens elever, och läs översikten med källfilter
 * och BAM-kraven (läxförhör ≥ 90 %, exit ≥ 70 %). Varningar när
 * planeringens förhör saknar resultat.
 */
function SuperTeachVy({ s, kor }: { s: Struktur; kor: (fn: () => Struktur, m: string) => void }) {
  const klasser = [...s.klasser].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const [klassId, setKlassId] = useState(klasser[0]?.id ?? '');
  const klass = klasser.find((k) => k.id === klassId) ?? klasser[0];
  const amnen = s.amnen.filter((a) => a.klassId === klass?.id);
  const [amneId, setAmneId] = useState('');
  const amne = amnen.find((a) => a.id === amneId);
  const [kalla, setKalla] = useState<ResultatKalla>('socrative-exit');
  const [prov, setProv] = useState('');
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [maxP, setMaxP] = useState('10');
  const [radText, setRadText] = useState('');
  const [filter, setFilter] = useState<ResultatKalla[]>([]);
  const [visaProv, setVisaProv] = useState('');

  if (klass === undefined) return <div className="card"><h2>📊 SuperTeach</h2><p className="muted">Skapa klasser och elever under 🗂 Struktur först.</p></div>;

  /** 'Anna Berg  8  10' / 'Berg, Anna;8' → rader; poäng med decimalkomma stöds. */
  const parse = (text: string) => {
    const ut: Array<{ namn: string; poang: number; maxPoang: number }> = [];
    for (const rad of text.split('\n')) {
      const delar = rad.split(/\t|;/).map((x) => x.trim()).filter((x) => x !== '');
      if (delar.length < 2) continue;
      const poang = Number(delar[1].replace(',', '.').replace('%', ''));
      if (Number.isNaN(poang)) continue;
      const max = delar.length >= 3 ? Number(delar[2].replace(',', '.')) : Number(maxP);
      ut.push({ namn: delar[0], poang, maxPoang: Number.isNaN(max) || max <= 0 ? Number(maxP) : max });
    }
    return ut;
  };
  const rader = parse(radText);
  const omatchade = rader.filter((r) => matchaElev(s, klass.id, r.namn) === null).map((r) => r.namn);

  const kanSpara = amne !== undefined && prov.trim() !== '' && rader.length > 0;
  const spara = () => {
    if (amne === undefined) return;
    kor(() => importeraResultat(lasStruktur(), {
      klassId: klass.id, amneId: amne.id, kalla, prov: prov.trim(), datum, rader,
    }).s, `${rader.length - omatchade.length} resultat sparade på ${amne.namn} · ${prov.trim()}${omatchade.length > 0 ? ` — ⚠ omatchade: ${omatchade.join(', ')}` : ''}`);
    setRadText(''); setProv('');
  };

  // Varningar: förväntade läxförhör/exits utan resultat (kräver planering + bok)
  const varningar = (() => {
    if (amne === undefined) return [];
    const tjanst = s.tjanster.find((t) => t.id === klass.tjanstId);
    const skolar = s.skolar.find((x) => x.id === tjanst?.skolarId);
    const bok = s.bocker.find((b) => b.id === amne.bokId);
    if (!skolar || !bok || !s.planeringar.some((pl) => pl.amneId === amne.id)) return [];
    const offset = amne.noGrupp !== undefined && amne.noOrder !== undefined ? amne.noOrder * noBudget(skolar, amne.schema) : 0;
    const plan = skapaPlanering(skolar, amne.schema, bok, offset, amne.egnaRader ?? []);
    return saknadeResultat(s, amne.id, plan, new Date().toISOString().slice(0, 10));
  })();

  const kallor = filter.length > 0 ? filter : undefined;
  const oversikt = amne !== undefined
    ? amnesOversikt(s, amne.id, kallor)
    : klassOversikt(s, klass.id, kallor !== undefined ? { kallor } : undefined);
  const proven = provLista(s, klass.id);

  return (
    <div className="card superteach">
      <h2>📊 SuperTeach — resultat</h2>
      <div className="rad" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label>Klass:{' '}
          <select aria-label="SuperTeach klass" value={klass.id} onChange={(e) => { setKlassId(e.target.value); setAmneId(''); }}>
            {klasser.map((k) => <option key={k.id} value={k.id}>{k.namn}</option>)}
          </select></label>
        <label>Ämne:{' '}
          <select aria-label="SuperTeach ämne" value={amneId} onChange={(e) => setAmneId(e.target.value)}>
            <option value="">— alla ämnen (aggregerat) —</option>
            {amnen.map((a) => <option key={a.id} value={a.id}>{a.namn}</option>)}
          </select></label>
        <span className="spacer" />
        {ALLA_KALLOR.map((k) => (
          <button key={k} className={`chipbtn ${filter.includes(k) ? 'act' : ''}`}
            onClick={() => setFilter(filter.includes(k) ? filter.filter((x) => x !== k) : [...filter, k])}>{KALLNAMN[k]}</button>
        ))}
      </div>

      {varningar.length > 0 && (
        <div className="st-varning">⚠ <b>{varningar.length} förväntade prov saknar resultat:</b>{' '}
          {varningar.map((v) => `${v.prov} (${v.datum})`).join(' · ')}</div>
      )}

      {/* ── Import ── */}
      <div className="uppg-kort">
        <b>📥 Importera resultat</b> <small className="muted">Klistra in rader från Socrative-/Magma-/DigiExam-exporten: <code>Namn ⇥ Poäng ⇥ Max</code> (Max kan utelämnas — fältet nedan används). Filuppladdning byggs mot dina exportfiler.</small>
        <div className="rad" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <select aria-label="Källa" value={kalla} onChange={(e) => setKalla(e.target.value as ResultatKalla)}>
            {ALLA_KALLOR.map((k) => <option key={k} value={k}>{KALLNAMN[k]}</option>)}
          </select>
          <input aria-label="Provnamn" placeholder="Provnamn, t.ex. Quiz 1.1a" value={prov} onChange={(e) => setProv(e.target.value)} style={{ width: 180 }} />
          <input aria-label="Provdatum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          <label>Max:{' '}<input aria-label="Maxpoäng" value={maxP} onChange={(e) => setMaxP(e.target.value)} style={{ width: 50 }} /></label>
        </div>
        <textarea aria-label="Resultatrader" rows={4} value={radText} onChange={(e) => setRadText(e.target.value)}
          placeholder={'Anna Berg\t8\nOmar Ali\t6\t10'} style={{ width: '100%', marginTop: 6, fontFamily: 'ui-monospace, monospace' }} />
        <div className="rad" style={{ gap: 8 }}>
          <span className="small muted">{rader.length} rader · {rader.length - omatchade.length} matchade{omatchade.length > 0 ? ` · ⚠ omatchade: ${omatchade.join(', ')}` : ''}</span>
          <span className="spacer" />
          <button className="btn" disabled={!kanSpara} title={amne === undefined ? 'Välj ämne — resultat samlas ämnesvis' : ''} onClick={spara}>💾 Spara resultat</button>
        </div>
      </div>

      {/* ── Översikt ── */}
      <h3>{amne !== undefined ? `${klass.namn} · ${amne.namn}` : `${klass.namn} · alla ämnen`} <small className="muted">— snitt och BAM-krav per källa</small></h3>
      <table className="tbl plan st-tabell">
        <thead><tr><th>Elev</th><th>Snitt</th>{ALLA_KALLOR.map((k) => <th key={k}>{KALLNAMN[k]}</th>)}</tr></thead>
        <tbody>{oversikt.map(({ elev, perKalla, snittProcent }) => (
          <tr key={elev.id}>
            <td>{elev.namn}</td>
            <td><b>{snittProcent !== null ? `${snittProcent} %` : '—'}</b></td>
            {ALLA_KALLOR.map((k) => {
              const a = perKalla.find((x) => x.kalla === k);
              if (a === undefined) return <td key={k} className="muted">—</td>;
              return (
                <td key={k}>
                  {a.snittProcent !== null ? `${a.snittProcent} %` : '—'} <small className="muted">({a.antal} st)</small>
                  {a.medKrav > 0 && <span className={`st-krav ${a.klarade === a.medKrav ? 'ok' : 'ej'}`}>{a.klarade}/{a.medKrav} ✓</span>}
                </td>
              );
            })}
          </tr>
        ))}</tbody>
      </table>

      {/* ── Per prov ── */}
      {proven.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label>Visa enskilt prov:{' '}
            <select aria-label="Visa prov" value={visaProv} onChange={(e) => setVisaProv(e.target.value)}>
              <option value="">— välj —</option>
              {proven.map((p) => <option key={`${p.kalla}|${p.prov}`} value={p.prov}>{KALLNAMN[p.kalla]} · {p.prov}</option>)}
            </select></label>
          {visaProv !== '' && (
            <table className="tbl plan st-tabell">
              <thead><tr><th>Elev</th><th>Poäng</th><th>%</th><th>Krav</th></tr></thead>
              <tbody>{provSammanstallning(s, klass.id, visaProv).map(({ elev, resultat }) => (
                <tr key={elev.id}>
                  <td>{elev.namn}</td>
                  <td>{resultat !== null ? `${resultat.poang}/${resultat.maxPoang}` : <span className="muted">saknas</span>}</td>
                  <td>{resultat !== null ? `${resultatProcent(resultat) ?? '—'} %` : ''}</td>
                  <td>{resultat !== null && klaratKrav(resultat) !== null
                    ? <span className={`st-krav ${klaratKrav(resultat) === true ? 'ok' : 'ej'}`}>{klaratKrav(resultat) === true ? 'klarat ✓' : 'ej klarat'}</span>
                    : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function PlaneringVy({ s, kor, setVald, hopp }: {
  s: Struktur; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void;
  hopp?: { amneId: string; i: number; n: number } | null;
}) {
  const alternativ = s.amnen
    .map((a) => ({ a, klass: s.klasser.find((k) => k.id === a.klassId) }))
    .filter((x): x is { a: Amne; klass: Klass } => x.klass !== undefined)
    .sort((x, y) => x.klass.namn.localeCompare(y.klass.namn, 'sv') || x.a.namn.localeCompare(y.a.namn, 'sv'));
  const [amneId, setAmneId] = useState<string>(() => s.planeringar[0]?.amneId ?? alternativ[0]?.a.id ?? '');
  useEffect(() => { if (hopp != null) setAmneId(hopp.amneId); }, [hopp?.n]);   // kalenderklick → rätt ämne
  const valt = alternativ.some((x) => x.a.id === amneId) ? amneId : alternativ[0]?.a.id ?? '';
  if (alternativ.length === 0) {
    return <div className="card"><h2>📋 Planering</h2><p className="muted">Skapa skolår, tjänst, klass och ämne under 🗂 Struktur först.</p></div>;
  }
  const harPlan = new Set(s.planeringar.map((pl) => pl.amneId));
  return (
    <>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="rad" style={{ gap: 8 }}>
          <b>📋 Planera:</b>
          <select aria-label="Planera ämne" value={valt} onChange={(e) => setAmneId(e.target.value)} style={{ flex: 1, maxWidth: 420 }}>
            {alternativ.map(({ a, klass }) => (
              <option key={a.id} value={a.id}>{klass.namn} · {a.namn}{harPlan.has(a.id) ? '' : ' — (ingen planering ännu)'}</option>
            ))}
          </select>
        </div>
      </div>
      {valt !== '' && <AmnePanel key={valt} s={s} id={valt} kor={kor} setVald={setVald} hopp={hopp} />}
    </>
  );
}

/** Dagens datum om det ligger inom skolåret (kalendern öppnar på aktuell vecka), annars skolårets start. */
function startAnkare(la?: Skolar): string {
  const idag = new Date().toISOString().slice(0, 10);
  return la && idag >= la.start && idag <= la.slut ? idag : la?.start ?? '2026-08-17';
}

function KalenderVy({ s, onOppnaLektion }: { s: Struktur; onOppnaLektion?: (amneId: string, i: number) => void }) {
  const [skolarId, setSkolarId] = useState(s.skolar[0]?.id ?? '');
  const [lage, setLage] = useState<'lasar' | 'termin' | 'manad' | 'vecka'>('vecka');
  const [klassFilter, setKlassFilter] = useState<string>('__alla__');
  const [amnesFilter, setAmnesFilter] = useState<string>('__alla__');
  const [termin, setTermin] = useState<'HT' | 'VT'>('HT');
  const skolar = s.skolar.find((x) => x.id === skolarId) ?? s.skolar[0];
  const [utskrift, setUtskrift] = useState(false);
  const [utskriftLage, setUtskriftLage] = useState<'manader' | 'veckor'>('manader');
  const [ankare, setAnkare] = useState<string>(startAnkare(skolar));

  const handelser = useMemo(() => (skolar ? kalenderHandelser(s, skolar.id) : []), [s, skolar]);
  const filtrerade = useMemo(() => handelser.filter((h) =>
    (klassFilter === '__alla__' || h.klassId === klassFilter)
    && (amnesFilter === '__alla__' || h.amnesNamn === amnesFilter)), [handelser, klassFilter, amnesFilter]);
  const perDatum = useMemo(() => handelserPerDatum(filtrerade), [filtrerade]);
  const klasserMedPlan = useMemo(() => {
    const ids = new Set(handelser.map((h) => h.klassId));
    return s.klasser.filter((k) => ids.has(k.id));
  }, [s.klasser, handelser]);
  const amnenMedPlan = useMemo(() => [...new Set(handelser.map((h) => h.amnesNamn))], [handelser]);

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

  if (utskrift) {
    const manader: Array<{ ar: number; m0: number }> = [];
    const d = new Date(`${skolar.start.slice(0, 7)}-01T00:00:00Z`);
    const slutD = new Date(`${skolar.slut}T00:00:00Z`);
    while (d <= slutD) { manader.push({ ar: d.getUTCFullYear(), m0: d.getUTCMonth() }); d.setUTCMonth(d.getUTCMonth() + 1); }
    const veckoStarter: string[] = [];
    { const v = new Date(`${skolar.start}T00:00:00Z`);
      const vd = v.getUTCDay() === 0 ? 7 : v.getUTCDay();
      v.setUTCDate(v.getUTCDate() - (vd - 1));                       // måndagen i startveckan
      while (v <= slutD) { veckoStarter.push(v.toISOString().slice(0, 10)); v.setUTCDate(v.getUTCDate() + 7); } }
    return (
      <div className="kal-utskrift">
        <div className="rad no-print" style={{ gap: 8, margin: '8px 0' }}>
          <button className="btn" onClick={() => window.print()}>🖨 Skriv ut</button>
          <div className="kal-lagen">
            <button className={`btn sec sm ${utskriftLage === 'manader' ? 'active' : ''}`} onClick={() => setUtskriftLage('manader')}>Månader</button>
            <button className={`btn sec sm ${utskriftLage === 'veckor' ? 'active' : ''}`} onClick={() => setUtskriftLage('veckor')}>Veckor</button>
          </div>
          <button className="btn sec" onClick={() => setUtskrift(false)}>Stäng</button>
          <span className="muted small">{utskriftLage === 'manader' ? `En månad per sida (${manader.length} sidor)` : `En vecka per sida (${veckoStarter.length} sidor)`} — skriv ut och häfta ihop.</span>
        </div>
        {utskriftLage === 'manader' && manader.map(({ ar, m0 }) => (
          <section key={`${ar}-${m0}`} className="kal-utskrift-sida">
            <h3>{skolar.namn} — {MANADSNAMN[m0]} {ar}</h3>
            <MonadsGrid ar={ar} manad0={m0} skolar={skolar} perDatum={perDatum} onPrev={() => undefined} onNext={() => undefined} />
          </section>
        ))}
        {utskriftLage === 'veckor' && veckoStarter.map((vs) => (
          <section key={vs} className="kal-utskrift-sida">
            <h3>{skolar.namn} — vecka {isoVeckaLbl(vs)} <small className="muted">({vs})</small></h3>
            <VeckoSchema rutor={veckaRutor(vs, skolar, perDatum)} onPrev={() => undefined} onNext={() => undefined} onIdag={() => undefined} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="card kalender">
      <div className="rad kal-topp">
        <h2>📆 Kalender <small className="muted">{skolar.namn}</small></h2>
        <span className="spacer" />
        <select aria-label="Skolår" value={skolar.id} onChange={(e) => { setSkolarId(e.target.value); const ny = s.skolar.find((x) => x.id === e.target.value); if (ny) setAnkare(startAnkare(ny)); }}>
          {s.skolar.map((la) => <option key={la.id} value={la.id}>{la.namn}</option>)}
        </select>
        <div className="kal-lagen">
          {(['lasar', 'termin', 'manad', 'vecka'] as const).map((l) => (
            <button key={l} className={`btn sec sm ${lage === l ? 'active' : ''}`} onClick={() => setLage(l)}>
              {l === 'lasar' ? 'Läsår' : l === 'termin' ? 'Termin' : l === 'manad' ? 'Månad' : 'Vecka'}
            </button>
          ))}
          <button className="btn sec sm" onClick={() => setUtskrift(true)}>🖨 Skriv ut (månader/veckor)</button>
        </div>
      </div>
      <div className="kal-filter">
        <button className={`chipbtn ${klassFilter === '__alla__' ? 'act' : ''}`} onClick={() => setKlassFilter('__alla__')}>Alla klasser</button>
        {klasserMedPlan.map((k) => (
          <button key={k.id} className={`chipbtn ${klassFilter === k.id ? 'act' : ''}`} onClick={() => setKlassFilter(k.id)}>{k.namn}</button>
        ))}
        <span className="kal-filter-sep" />
        <button className={`chipbtn ${amnesFilter === '__alla__' ? 'act' : ''}`} onClick={() => setAmnesFilter('__alla__')}>Alla ämnen</button>
        {amnenMedPlan.map((a) => (
          <button key={a} className={`chipbtn ${amnesFilter === a ? 'act' : ''}`} onClick={() => setAmnesFilter(a)}>{a}</button>
        ))}
        {lage === 'termin' && (<>
          <span className="kal-filter-sep" />
          <button className={`chipbtn ${termin === 'HT' ? 'act' : ''}`} onClick={() => setTermin('HT')}>HT</button>
          <button className={`chipbtn ${termin === 'VT' ? 'act' : ''}`} onClick={() => setTermin('VT')}>VT</button>
        </>)}
      </div>

      {handelser.length === 0 && <p className="note">Inga planeringar i det här skolåret ännu — skapa en planering på ett ämne, så dyker lektionerna upp här.</p>}

      {lage === 'manad' && (
        <MonadsGrid onOppna={onOppnaLektion} ar={ankAr} manad0={ankManad} skolar={skolar} perDatum={perDatum}
          onPrev={() => flyttaManad(-1)} onNext={() => flyttaManad(1)} />
      )}
      {lage === 'vecka' && (
        <VeckoSchema rutor={veckaRutor(ankare, skolar, perDatum)} onOppna={onOppnaLektion}
          onPrev={() => flyttaVecka(-1)} onNext={() => flyttaVecka(1)} onIdag={() => setAnkare(new Date().toISOString().slice(0, 10))} />
      )}
      {(lage === 'lasar' || lage === 'termin') && (
        <div className="lasar-grid">
          {skolarManader(skolar)
            .filter(([, m]) => lage === 'lasar' || (termin === 'HT' ? m >= 6 : m <= 5))
            .map(([y, m]) => (
              <MiniManad key={`${y}-${m}`} ar={y} manad0={m} skolar={skolar} perDatum={perDatum}
                onDag={(datum) => { setAnkare(datum); setLage('vecka'); }} />
            ))}
        </div>
      )}
      <Kapitelforklaring handelser={filtrerade} />
    </div>
  );
}

function Handelsechip({ h, onOppna }: { h: KalenderHandelse; onOppna?: (amneId: string, i: number) => void }) {
  const klickbar = onOppna !== undefined && h.amneId !== undefined && h.lektionsIndex !== undefined;
  return (
    <span className="kh" style={{ background: h.amnesFarg, cursor: klickbar ? 'pointer' : undefined }}
      onClick={klickbar ? () => onOppna(h.amneId!, h.lektionsIndex!) : undefined}
      title={`${h.start}–${h.slut} ${h.klassNamn} ${h.amnesNamn}${h.grupp !== undefined ? ` ${h.grupp}` : ''} · ${h.avsnitt}${klickbar ? ' — klicka för lektionsplaneringen' : ''}`}>
      <b style={{ color: klassFarg(h.klassNamn) }}>{h.klassNamn} {h.amnesNamn}{h.grupp !== undefined ? ` ${h.grupp}` : ''}</b> {h.start} {h.avsnitt}
    </span>
  );
}

const DAGKORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function MonadsGrid({ ar, manad0, skolar, perDatum, onPrev, onNext, onOppna }: {
  ar: number; manad0: number; skolar: Skolar; perDatum: Map<string, KalenderHandelse[]>;
  onPrev: () => void; onNext: () => void; onOppna?: (amneId: string, i: number) => void;
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
      <div className="mgrid vecko">
        <div className="mgrid-h vk">v.</div>
        {DAGKORT.map((d) => <div key={d} className="mgrid-h">{d}</div>)}
        {rutor.map((r, i) => (
          <Fragment key={r.datum}>
            {i % 7 === 0 && <div className="mgrid-vk">{isoVeckaLbl(r.datum)}</div>}
            <div className={`mcell ${r.iManad ? '' : 'dim'} ${r.helg ? 'helg' : ''} ${r.ledig ? 'ledig' : ''} ${r.halvdag ? 'halvdag' : ''} ${r.datum === idag ? 'idag' : ''}`}>
              <div className="mcell-d">{Number(r.datum.slice(8))}{r.ledig ? <span className="ledig-l">{r.ledig}</span> : r.halvdag ? <span className="ledig-l">½ {r.halvdag}</span> : null}</div>
              {r.handelser.map((h, j) => <Handelsechip key={j} h={h} onOppna={onOppna} />)}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function VeckoSchema({ rutor, onPrev, onNext, onIdag, onOppna }: {
  rutor: KalenderDagRuta[]; onPrev: () => void; onNext: () => void; onIdag: () => void;
  onOppna?: (amneId: string, i: number) => void;
}) {
  const DAG_START = 7, DAG_SLUT = 17;
  const timmar = Array.from({ length: DAG_SLUT - DAG_START + 1 }, (_, i) => DAG_START + i);
  const vardagar = rutor.filter((r) => r.dag <= 5); // Mån–Fre som ett schema
  const min = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const topp = (t: string) => ((min(t) - DAG_START * 60) / ((DAG_SLUT - DAG_START) * 60)) * 100;
  const hojd = (a: string, b: string) => ((min(b) - min(a)) / ((DAG_SLUT - DAG_START) * 60)) * 100;
  return (
    <div>
      <div className="rad kal-nav">
        <button className="btn sec sm" onClick={onPrev}>◀</button>
        <button className="btn sec sm" onClick={onIdag}>Idag</button>
        <button className="btn sec sm" onClick={onNext}>▶</button>
        <b>Vecka {rutor[0] ? isoVeckaLbl(rutor[0].datum) : ''}</b>
      </div>
      <div className="schema" style={{ gridTemplateColumns: `48px repeat(${vardagar.length}, 1fr)` }}>
        <div className="sch-hdr" />
        {vardagar.map((r) => (
          <div key={r.datum} className={`sch-hdr ${r.ledig ? 'ledig' : ''}`}>
            {DAGKORT[r.dag - 1]} {Number(r.datum.slice(8))}/{Number(r.datum.slice(5, 7))}
            {r.ledig ? <div className="ledig-l">{r.ledig}</div> : r.halvdag ? <div className="ledig-l">½ {r.halvdag}</div> : null}
          </div>
        ))}
        <div className="sch-tidkol">
          {timmar.map((h) => <div key={h} className="sch-tid">{String(h).padStart(2, '0')}:00</div>)}
        </div>
        {vardagar.map((r) => (
          <div key={r.datum} className={`sch-kol ${r.ledig ? 'ledig' : ''}`}>
            {timmar.map((h) => <div key={h} className="sch-linje" style={{ top: `${topp(`${String(h).padStart(2, '0')}:00`)}%` }} />)}
            {r.handelser.map((h, i) => {
              const klickbar = onOppna !== undefined && h.amneId !== undefined && h.lektionsIndex !== undefined;
              return (
              <div key={i} className="sch-lekt" style={{ top: `${topp(h.start)}%`, height: `${hojd(h.start, h.slut)}%`, background: h.amnesFarg, cursor: klickbar ? 'pointer' : undefined }}
                onClick={klickbar ? () => onOppna(h.amneId!, h.lektionsIndex!) : undefined}
                title={`${h.start}–${h.slut} ${h.klassNamn} ${h.amnesNamn}${h.grupp !== undefined ? ` ${h.grupp}` : ''} · ${h.avsnitt}${klickbar ? ' — klicka för lektionsplaneringen' : ''}`}>
                <b style={{ color: klassFarg(h.klassNamn) }}>{h.klassNamn} {h.amnesNamn}{h.grupp !== undefined ? ` ${h.grupp}` : ''}</b>
                <span>{h.avsnitt}</span>
                <small>{h.start}–{h.slut}</small>
              </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniManad({ ar, manad0, skolar, perDatum, onDag }: {
  ar: number; manad0: number; skolar: Skolar; perDatum: Map<string, KalenderHandelse[]>;
  onDag?: (datum: string) => void;
}) {
  const rutor = manadsRutor(ar, manad0, skolar, perDatum);
  return (
    <div className="minimanad">
      <div className="mini-h">{MANADSNAMN[manad0]} {ar}</div>
      <div className="mini-grid vecko">
        <div className="mini-dh vk">v</div>
        {DAGKORT.map((d) => <div key={d} className="mini-dh">{d[0]}</div>)}
        {rutor.map((r, i) => (
          <Fragment key={r.datum}>
            {i % 7 === 0 && <div className="mini-vk">{isoVeckaLbl(r.datum)}</div>}
            <div
              className={`mini-d ${r.iManad ? '' : 'dim'} ${r.ledig ? 'ledig' : ''} ${r.handelser.length > 0 ? 'har' : ''}`}
              style={{ cursor: onDag !== undefined && r.handelser.length > 0 ? 'pointer' : undefined }}
              onClick={onDag !== undefined && r.handelser.length > 0 ? () => onDag(r.datum) : undefined}
              title={(r.handelser.map((h) => `${h.klassNamn} ${h.amnesNamn}${h.grupp !== undefined ? ` ${h.grupp}` : ''} ${h.avsnitt}`).join('\n') || r.ledig || '') + (r.handelser.length > 0 ? '\n— klicka för veckovyn' : '')}>
              {Number(r.datum.slice(8))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Kapitelforklaring({ handelser }: { handelser: KalenderHandelse[] }) {
  const amnen = new Map<string, string>();
  const klasser = new Map<string, string>();
  for (const h of handelser) {
    if (!amnen.has(h.amnesNamn)) amnen.set(h.amnesNamn, h.amnesFarg);
    if (!klasser.has(h.klassNamn)) klasser.set(h.klassNamn, klassFarg(h.klassNamn));
  }
  if (amnen.size === 0) return null;
  return (
    <div className="kal-forkl">
      <b className="muted small">Ämne (bakgrund):</b>
      {[...amnen].map(([namn, farg]) => (
        <span key={namn} className="forkl-item"><span className="prick" style={{ background: farg }} />{namn}</span>
      ))}
      <span className="kal-filter-sep" />
      <b className="muted small">Klass (färg):</b>
      {[...klasser].map(([namn, farg]) => (
        <span key={namn} className="forkl-item"><b style={{ color: farg, background: '#333', padding: '0 5px', borderRadius: 3 }}>{namn}</b></span>
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

// ── Schema-PDF: förhandsvisning + skapa tjänst ───────────────
const DAGKORT5 = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre'];
function SchemaPdfPanel({ s, tolkat, kor, setVald }: {
  s: Struktur; tolkat: TolkatSchema; kor: (fn: () => Struktur, m: string) => void; setVald: (v: Vald) => void;
}) {
  const [skolarId, setSkolarId] = useState(s.skolar[0]?.id ?? '');
  const klasser = [...new Set(tolkat.lektioner.map((l) => l.klass))].sort();
  const omf = (o: 'hel' | 'A' | 'B') => (o === 'hel' ? 'Helklass' : `Grupp ${o}`);
  return (
    <div className="card">
      <h2>📄 Inläst schema{tolkat.lasar !== null ? ` · ${tolkat.lasar}` : ''}</h2>
      <p className="muted">Lärare: <b>{tolkat.larareNamn}</b> ({tolkat.signatur})</p>
      {tolkat.lektioner.length === 0 && <p className="status warn">⚠ Inga lektioner kunde tolkas ur PDF:en — kontrollera att det är ett utskrivet veckoschema (Skola24-stil).</p>}
      {klasser.map((k) => (
        <div key={k} className="uppg-kort">
          <b>👥 {k}</b>
          <table className="tbl">
            <thead><tr><th>Dag</th><th>Tid</th><th>Ämne</th><th>Omfattning</th><th>Sal</th></tr></thead>
            <tbody>{tolkat.lektioner.filter((l) => l.klass === k).map((l, i) => (
              <tr key={i}>
                <td>{DAGKORT5[l.dag - 1]}</td><td>{l.start}–{l.slut}</td><td>{l.amne}</td>
                <td>{l.amne === 'Matematik' ? '—' : omf(l.omfattning)}</td><td>{l.sal}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {tolkat.ovrigt.length > 0 && (
        <p className="note">Hoppas över (ej klasslektioner): {tolkat.ovrigt.join(' · ')}</p>
      )}
      <div className="rad" style={{ gap: 8 }}>
        <label>Koppla till skolår:{' '}
          <select aria-label="Skolår för schemat" value={skolarId} onChange={(e) => setSkolarId(e.target.value)}>
            {s.skolar.length === 0 && <option value="">— skapa ett skolår först —</option>}
            {s.skolar.map((la) => <option key={la.id} value={la.id}>{la.namn}</option>)}
          </select>
        </label>
        <button className="btn" disabled={skolarId === '' || tolkat.lektioner.length === 0} onClick={() => {
          kor(() => skapaTjanstFranSchema(lasStruktur(), tolkat, skolarId),
            `Tjänst skapad ur schemat: ${tolkat.larareNamn}, ${klasser.join(' & ')} med Matematik och NO+Tk. Koppla böcker och skapa planeringar.`);
          setVald(null);
        }}>▶ Skapa tjänst ur schemat</button>
      </div>
      <p className="muted small">NO+Tk skapas som fyra blockdelämnen (Biologi → Fysik → Kemi → Teknik — ordningen kan ändras efteråt) med hel-/halvklasspassen ur schemat (:a = Grupp A, :b = Grupp B).</p>
    </div>
  );
}

// ── GitHub-synk ──────────────────────────────────────────────
function GitHubPanel({ s, spara, setMsg }: {
  s: Struktur; spara: (ny: Struktur, m?: string) => void; setMsg: (m: string) => void;
}) {
  const [cfg, setCfg] = useState<GitHubConfig>(() => lasGitHubConfig());
  const [arbetar, setArbetar] = useState<'' | 'spara' | 'ladda'>('');
  const komplett = konfigKomplett(cfg);
  const uppdatera = (delta: Partial<GitHubConfig>) => { const ny = { ...cfg, ...delta }; setCfg(ny); sparaGitHubConfig(ny); };

  return (
    <div className="card">
      <h2>☁ Synka med GitHub (planner-data)</h2>
      <p className="note">Hela planeringen (skolår, tjänster, klasser, ämnen, planeringar) sparas som en JSON-fil i ditt datarepo och kan laddas tillbaka på en annan dator. Böckerna ligger kvar som read-only innehåll i samma repo. Token är din egen fine-grained PAT med <b>Contents: Read and write</b> scopad till datarepot — den lagras bara lokalt i den här webbläsaren och skickas enbart till api.github.com.</p>
      <div className="gh-grid">
        <label>Ägare (owner)<input aria-label="GitHub owner" value={cfg.owner} placeholder="Mattias1970" onChange={(e) => uppdatera({ owner: e.target.value.trim() })} /></label>
        <label>Repo<input aria-label="GitHub repo" value={cfg.repo} onChange={(e) => uppdatera({ repo: e.target.value.trim() })} /></label>
        <label>Gren<input aria-label="GitHub branch" value={cfg.branch} onChange={(e) => uppdatera({ branch: e.target.value.trim() })} /></label>
        <label>Sökväg<input aria-label="GitHub path" value={cfg.path} onChange={(e) => uppdatera({ path: e.target.value.trim() })} /></label>
        <label className="gh-token">Token (PAT, Contents: R/W)<input aria-label="GitHub token" type="password" value={cfg.token} placeholder="github_pat_…" onChange={(e) => uppdatera({ token: e.target.value.trim() })} /></label>
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={!komplett || arbetar !== ''} onClick={() => {
          setArbetar('spara'); setMsg('☁ Sparar till GitHub …');
          void sparaTillGitHub(cfg, exportJson(s))
            .then(() => setMsg(`✓ Sparat till ${cfg.owner}/${cfg.repo}/${cfg.path}.`))
            .catch((e: unknown) => setMsg(`✗ ${(e as Error).message}`))
            .finally(() => setArbetar(''));
        }}>{arbetar === 'spara' ? '… Sparar' : '⬆ Spara till GitHub'}</button>
        <button className="btn sec" disabled={!komplett || arbetar !== ''} onClick={() => {
          if (!window.confirm('Ladda från GitHub och ersätta den lokala planeringen? Osparade lokala ändringar skrivs över.')) return;
          setArbetar('ladda'); setMsg('☁ Laddar från GitHub …');
          void laddaFranGitHub(cfg)
            .then((json) => { spara(importJson(json), `✓ Laddat från ${cfg.owner}/${cfg.repo}/${cfg.path}.`); })
            .catch((e: unknown) => setMsg(`✗ ${(e as Error).message}`))
            .finally(() => setArbetar(''));
        }}>{arbetar === 'ladda' ? '… Laddar' : '⬇ Ladda från GitHub'}</button>
      </div>
      {!komplett && <p className="muted small">Fyll i owner, repo, sökväg och token för att aktivera synk.</p>}
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
          onClick={() => { kor(() => laggTillLarare(lasStruktur(), { id: nyttId('lar'), namn: namn.trim(), signatur: sign.trim() }), 'Lärare tillagd — koppla till en tjänst i tjänstpanelen.'); setNamn(''); setSign(''); }}>➕ Lägg till lärare</button>
      </div>
      <p className="note">Lärarens schema härleds ur tjänstens klassers ämnespass — det lagras aldrig separat, så det uppdateras automatiskt när ämnen ändras.</p>
    </div>
  );
}
