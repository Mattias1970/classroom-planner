/**
 * Del 155 · Lathund: ny klass steg för steg.
 *
 *   1 Läsår → 2 Klass & schema → 3 Böcker → 4 Planering → 5 Elever → 6 Klart
 *
 * Varje steg är en handling med en tydlig "Nästa". Stegen bockas av ur strukturen
 * själv (kernel: klassGuideStatus), så guiden kan stängas och öppnas igen och visar
 * alltid hur långt klassen faktiskt kommit. Schemat läses ur lärarens Skola24-PDF
 * (samma inläsning som under Struktur — kan köras om utan dubbletter); utan PDF
 * läggs klass och ämnen in för hand med den vanliga klasspanelen.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  bokFromValfriImport, klassGuideStatus, kopplaForeslagnaBocker, laggTillKlass, laggTillSkolar, laggTillTjanst, nyttId,
  schematsKlasser, skapaAllaPlaneringar, slaIhopSchemaForKlasser, sparaBok, tolkaSchemaPdf, type Struktur, type TolkatSchema,
} from '@planner/kernel';
import { lasStruktur } from './store.js';
import { hamtaBockerFranGitHub, konfigKomplett, lasGitHubConfig } from './github.js';

type Steg = 1 | 2 | 3 | 4 | 5 | 6;
const STEG: Array<{ nr: Steg; namn: string; ikon: string }> = [
  { nr: 1, namn: 'Läsår', ikon: '📅' },
  { nr: 2, namn: 'Klass & schema', ikon: '🗓' },
  { nr: 3, namn: 'Böcker', ikon: '📚' },
  { nr: 4, namn: 'Planering', ikon: '📋' },
  { nr: 5, namn: 'Elever', ikon: '🧑‍🎓' },
  { nr: 6, namn: 'Klart', ikon: '✅' },
];

function iDag(): string { return new Date().toISOString().slice(0, 10); }
/** Förslag på nytt läsår: augusti–juni runt idag. */
function lasarForslag(): { namn: string; start: string; slut: string } {
  const d = iDag(); const ar = Number(d.slice(0, 4)); const start = Number(d.slice(5, 7)) >= 7 ? ar : ar - 1;
  return { namn: `${start}/${start + 1}`, start: `${start}-08-17`, slut: `${start + 1}-06-11` };
}

export interface KlassGuideProps {
  s: Struktur;
  kor: (fn: () => Struktur, m: string) => void;
  onStang: () => void;
  /** Öppna en vy efter guiden: planeringen för ett ämne, resultat eller datarepot. */
  onOppna: (vart: { typ: 'planering'; amneId: string } | { typ: 'resultat' } | { typ: 'datarepo' }) => void;
  /** Klasspanelen från Struktur (lägg till ämnen och pass för hand). */
  klassPanel: (klassId: string) => React.ReactNode;
  /** Elevlista, Socrative-roster och gruppimport för klassen. */
  elevPanel: (klassId: string) => React.ReactNode;
  /** Läs PDF-text (pdf.js), injicerad för att kunna testas. */
  lasPdf?: (fil: File) => Promise<Parameters<typeof tolkaSchemaPdf>[0]>;
}

export function KlassGuide({ s, kor, onStang, onOppna, klassPanel, elevPanel, lasPdf }: KlassGuideProps) {
  const [steg, setSteg] = useState<Steg>(1);
  const idag = iDag();
  const [skolarId, setSkolarId] = useState(() => (s.skolar.find((x) => x.start <= idag && x.slut >= idag) ?? s.skolar[s.skolar.length - 1])?.id ?? '');
  const [nyttLasar, setNyttLasar] = useState(lasarForslag);
  const [klassId, setKlassId] = useState('');
  const [tolkat, setTolkat] = useState<TolkatSchema | null>(null);
  const [valdaKlasser, setValdaKlasser] = useState<string[]>([]);
  const [lasFel, setLasFel] = useState('');
  const [lasMed, setLasMed] = useState<'' | 'pdf' | 'hand'>('');
  const [handTjanst, setHandTjanst] = useState('');
  const [handTjanstNamn, setHandTjanstNamn] = useState('Ma/NO');
  const [handKlass, setHandKlass] = useState('');
  const [hamtar, setHamtar] = useState(false);
  const [info, setInfo] = useState('');
  const bokForslagKort = useRef<string>('');

  const skolar = s.skolar.find((x) => x.id === skolarId);
  const tjanster = s.tjanster.filter((t) => t.skolarId === skolarId);
  const klasserILasaret = s.klasser.filter((k) => tjanster.some((t) => t.id === k.tjanstId)).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const status = klassId === '' ? null : klassGuideStatus(s, klassId);
  const klar: Record<Steg, boolean> = {
    1: skolar !== undefined,
    2: status !== null && status.klart.schema,
    3: status !== null && status.klart.bocker,
    4: status !== null && status.klart.planering,
    5: status !== null && status.klart.elever,
    6: status !== null && status.klart.schema && status.klart.bocker && status.klart.planering && status.klart.elever,
  };

  // Steg 3: koppla entydiga bokförslag automatiskt när steget öppnas (en gång per klass)
  useEffect(() => {
    if (steg !== 3 || klassId === '' || bokForslagKort.current === klassId) return;
    bokForslagKort.current = klassId;
    const { kopplade } = kopplaForeslagnaBocker(lasStruktur(), klassId);
    if (kopplade.length > 0) kor(() => kopplaForeslagnaBocker(lasStruktur(), klassId).s, `Böcker valda automatiskt: ${kopplade.join(' · ')}.`);
  }, [steg, klassId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc stänger
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onStang(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onStang]);

  const lasSchema = async (fil: File) => {
    setLasFel(''); setTolkat(null);
    try {
      const las = lasPdf ?? (async (f: File) => (await import('./pdfLasare.js')).lasPdfItems(f));
      const t = tolkaSchemaPdf(await las(fil));
      if (t.lektioner.length === 0) { setLasFel('Inga lektioner hittades i PDF:en. Det ska vara ditt utskrivna veckoschema från Skola24.'); return; }
      setTolkat(t);
      const finns = new Set(klasserILasaret.map((k) => k.namn));
      const kl = schematsKlasser(t).map((k) => k.klass);
      setValdaKlasser(kl.filter((k) => !finns.has(k)).length > 0 ? kl.filter((k) => !finns.has(k)) : kl);
    } catch (e) { setLasFel(`PDF:en kunde inte läsas: ${(e as Error).message}`); }
  };

  const lasInSchema = () => {
    if (tolkat === null || skolar === undefined) return;
    let utfall = { skapade: [] as string[], kompletterade: [] as string[], hoppade: [] as string[] };
    kor(() => { const u = slaIhopSchemaForKlasser(lasStruktur(), tolkat, skolar.id, valdaKlasser); utfall = u; return u.s; },
      `Schemat inläst för ${valdaKlasser.join(' och ')}.`);
    const ny = lasStruktur();
    const tj = ny.tjanster.filter((t) => t.skolarId === skolar.id).map((t) => t.id);
    const forsta = ny.klasser.find((k) => tj.includes(k.tjanstId) && k.namn === valdaKlasser[0]);
    if (forsta !== undefined) setKlassId(forsta.id);
    setInfo([
      utfall.skapade.length > 0 ? `Skapat: ${utfall.skapade.join(', ')}.` : '',
      utfall.kompletterade.length > 0 ? `Fick schema: ${utfall.kompletterade.join(', ')}.` : '',
      utfall.hoppade.length > 0 ? `Fanns redan (orört): ${utfall.hoppade.join(', ')}.` : '',
    ].filter((x) => x !== '').join(' '));
  };

  const skapaKlassForHand = () => {
    if (skolar === undefined || handKlass.trim() === '') return;
    let tjId = handTjanst;
    let klId = '';
    kor(() => {
      let st = lasStruktur();
      if (tjId === '') { tjId = nyttId('tj'); st = laggTillTjanst(st, { id: tjId, skolarId: skolar.id, namn: handTjanstNamn.trim() || 'Min tjänst' }); }
      const finns = st.klasser.find((k) => k.tjanstId === tjId && k.namn.trim().toLowerCase() === handKlass.trim().toLowerCase());
      if (finns !== undefined) { klId = finns.id; return st; }
      klId = nyttId('kl');
      return laggTillKlass(st, { id: klId, tjanstId: tjId, namn: handKlass.trim() });
    }, `Klass ${handKlass.trim()} skapad — lägg till ämnen och lektionspass nedan.`);
    if (klId !== '') setKlassId(klId);
  };

  const hamtaBocker = () => {
    if (!konfigKomplett(lasGitHubConfig())) { setInfo('Fyll i Datarepo (ägare, repo och token) först — sedan hämtas böckerna härifrån.'); return; }
    setHamtar(true); setInfo('');
    void hamtaBockerFranGitHub(lasGitHubConfig())
      .then((bocker) => {
        let antal = 0; const fel: string[] = [];
        kor(() => bocker.reduce((st, { id, json }) => { try { const b = bokFromValfriImport(json); antal += 1; return sparaBok(st, b); } catch { fel.push(id); return st; } }, lasStruktur()),
          `${bocker.length} böcker hämtade från datarepot.`);
        bokForslagKort.current = '';
        const { kopplade } = kopplaForeslagnaBocker(lasStruktur(), klassId);
        if (kopplade.length > 0) kor(() => kopplaForeslagnaBocker(lasStruktur(), klassId).s, `Böcker valda: ${kopplade.join(' · ')}.`);
        setInfo(`${antal} böcker i biblioteket${fel.length > 0 ? ` (kunde inte läsas: ${fel.join(', ')})` : ''}.`);
      })
      .catch((e: unknown) => setInfo(`Kunde inte hämta böcker: ${(e as Error).message}`))
      .finally(() => setHamtar(false));
  };

  const nasta = (n: Steg) => { setInfo(''); setSteg(n); };
  const Nasta = ({ till, text, av }: { till: Steg; text?: string; av?: boolean }) => (
    <button type="button" className="btn kg-nasta" disabled={av === true} onClick={() => nasta(till)}>{text ?? 'Nästa'} →</button>
  );

  const utanBok = status === null ? [] : status.amnen.filter((g) => !g.stod && g.bok === null).map((g) => g.amne.namn);
  const utanPlan = status === null ? [] : status.amnen.filter((g) => !g.harPlanering).map((g) => g.amne.namn);

  const nyttLasarForm = (
    <>
      <div className="kg-rad">
        <input aria-label="Nytt läsår namn" value={nyttLasar.namn} onChange={(e) => setNyttLasar({ ...nyttLasar, namn: e.target.value })} style={{ width: 110 }} />
        <label>från <input type="date" aria-label="Nytt läsår start" value={nyttLasar.start} onChange={(e) => setNyttLasar({ ...nyttLasar, start: e.target.value })} /></label>
        <label>till <input type="date" aria-label="Nytt läsår slut" value={nyttLasar.slut} onChange={(e) => setNyttLasar({ ...nyttLasar, slut: e.target.value })} /></label>
        <button type="button" className={s.skolar.length === 0 ? 'btn' : 'btn sec'} onClick={() => {
          const id = nyttId('la');
          kor(() => laggTillSkolar(lasStruktur(), { id, namn: nyttLasar.namn.trim(), start: nyttLasar.start, slut: nyttLasar.slut, dagar: [] }), `Läsår ${nyttLasar.namn} skapat.`);
          if (lasStruktur().skolar.some((x) => x.id === id)) setSkolarId(id);
        }}>➕ Skapa läsår</button>
      </div>
      <p className="small muted">Lov och studiedagar kan läggas till senare under Struktur → läsåret (klistra in skolans kalender).</p>
    </>
  );

  return (
    <div className="kg-bak" onClick={(e) => { if (e.target === e.currentTarget) onStang(); }}>
      <div className="kg" role="dialog" aria-modal="true" aria-label="Ny klass steg för steg">
        <div className="kg-huvud">
          <div><b>🧭 Ny klass – steg för steg</b>{status !== null && <small className="muted"> · {status.klassNamn}{skolar !== undefined ? ` · ${skolar.namn}` : ''}</small>}</div>
          <button type="button" className="icon-btn" aria-label="Stäng guiden" onClick={onStang}>✕</button>
        </div>
        <ol className="kg-steg" aria-label="Steg">
          {STEG.map((x) => (
            <li key={x.nr}>
              <button type="button" className={`kg-stegknapp${steg === x.nr ? ' aktiv' : ''}${klar[x.nr] ? ' klar' : ''}`} aria-current={steg === x.nr ? 'step' : undefined}
                disabled={x.nr > 2 && klassId === ''} onClick={() => nasta(x.nr)}>
                <span className="kg-stegnr">{klar[x.nr] && steg !== x.nr ? '✓' : x.nr}</span>{x.ikon} {x.namn}
              </button>
            </li>
          ))}
        </ol>

        <div className="kg-kropp">
          {info !== '' && <p className="status kg-info" role="status">{info}</p>}

          {steg === 1 && (<>
            <h3>1 · Vilket läsår gäller klassen?</h3>
            {s.skolar.length > 0 && (
              <label className="kg-rad">Läsår{' '}
                <select aria-label="Läsår för klassen" value={skolarId} onChange={(e) => setSkolarId(e.target.value)}>
                  {s.skolar.map((x) => <option key={x.id} value={x.id}>{x.namn} ({x.start} – {x.slut})</option>)}
                </select>
              </label>
            )}
            {s.skolar.length === 0
              ? <div className="kg-ruta"><p>Inget läsår finns än. Datumen är förifyllda — ändra om det behövs och tryck <b>Skapa läsår</b>.</p>{nyttLasarForm}</div>
              : <details className="kg-alt"><summary>… eller skapa ett nytt läsår</summary>{nyttLasarForm}</details>}
            <div className="kg-fot"><span className="spacer" /><Nasta till={2} av={skolar === undefined} /></div>
          </>)}

          {steg === 2 && (<>
            <h3>2 · Klass och schema</h3>
            {klasserILasaret.length > 0 && (
              <label className="kg-rad">Fortsätt med en klass som redan finns{' '}
                <select aria-label="Befintlig klass" value={klasserILasaret.some((k) => k.id === klassId) ? klassId : ''} onChange={(e) => setKlassId(e.target.value)}>
                  <option value="">— välj —</option>
                  {klasserILasaret.map((k) => <option key={k.id} value={k.id}>{k.namn}</option>)}
                </select>
              </label>
            )}
            <div className="kg-val">
              <button type="button" className={`kg-valkort${lasMed === 'pdf' ? ' vald' : ''}`} onClick={() => setLasMed('pdf')}>
                <b>📄 Ladda upp schemat</b><small>Ditt veckoschema från Skola24 som PDF. Klasser, ämnen och alla pass läggs in automatiskt. Snabbast.</small>
              </button>
              <button type="button" className={`kg-valkort${lasMed === 'hand' ? ' vald' : ''}`} onClick={() => setLasMed('hand')}>
                <b>✍ Lägg in för hand</b><small>Namnge klassen och lägg till ämnen med veckodag och tider.</small>
              </button>
            </div>

            {lasMed === 'pdf' && (
              <div className="kg-ruta">
                <ol className="kg-instruktion">
                  <li>Öppna Skola24, välj <b>ditt</b> schema (lärarschema) och en hel vecka.</li>
                  <li>Skriv ut som <b>PDF</b> (Skriv ut → Spara som PDF).</li>
                  <li>Välj filen här:</li>
                </ol>
                <label className="btn file-btn">📄 Välj schema-PDF
                  <input type="file" accept="application/pdf,.pdf" aria-label="Schema-PDF" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void lasSchema(f); e.currentTarget.value = ''; }} />
                </label>
                {lasFel !== '' && <p className="status warn">⚠ {lasFel}</p>}
                {tolkat !== null && (<>
                  <p>Schemat för <b>{tolkat.larareNamn}</b>{tolkat.lasar !== null ? ` · ${tolkat.lasar}` : ''}. Välj klasserna som ska läggas in:</p>
                  <div className="kg-klasser">
                    {schematsKlasser(tolkat).map((k) => {
                      const finns = klasserILasaret.some((x) => x.namn === k.klass);
                      return (
                        <label key={k.klass} className="kg-klassval">
                          <input type="checkbox" aria-label={`Klass ${k.klass}`} checked={valdaKlasser.includes(k.klass)}
                            onChange={() => setValdaKlasser(valdaKlasser.includes(k.klass) ? valdaKlasser.filter((x) => x !== k.klass) : [...valdaKlasser, k.klass])} />
                          <b>{k.klass}</b> <small className="muted">{k.amnen.join(' · ')} · {k.lektioner} pass i veckan{finns ? ' · finns redan (kompletteras)' : ''}</small>
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" className="btn" disabled={valdaKlasser.length === 0} onClick={lasInSchema}>▶ Lägg in {valdaKlasser.join(' och ') || 'klasserna'}</button>
                  <p className="small muted">NO+Tk blir fyra block (Biologi → Fysik → Kemi → Teknik) med hel- och halvklasspassen; ordningen kan ändras efteråt. Kör du samma PDF igen läggs inget in två gånger.</p>
                </>)}
              </div>
            )}

            {lasMed === 'hand' && (
              <div className="kg-ruta">
                <div className="kg-rad">
                  <label>Tjänst{' '}
                    <select aria-label="Tjänst för klassen" value={handTjanst} onChange={(e) => setHandTjanst(e.target.value)}>
                      <option value="">➕ ny tjänst</option>
                      {tjanster.map((t) => <option key={t.id} value={t.id}>{t.namn}</option>)}
                    </select>
                  </label>
                  {handTjanst === '' && <input aria-label="Ny tjänst namn" value={handTjanstNamn} onChange={(e) => setHandTjanstNamn(e.target.value)} style={{ width: 120 }} />}
                  <label>Klass <input aria-label="Klassens namn i guiden" placeholder="t.ex. 8F" value={handKlass} onChange={(e) => setHandKlass(e.target.value)} style={{ width: 80 }} /></label>
                  <button type="button" className="btn" disabled={handKlass.trim() === ''} onClick={skapaKlassForHand}>➕ Skapa klassen</button>
                </div>
                {klassId !== '' && <div className="kg-inbaddad">{klassPanel(klassId)}</div>}
              </div>
            )}

            {status !== null && (
              <div className="kg-sammanfattning">
                <b>{status.klassNamn}</b>: {status.amnen.length === 0 ? 'inga ämnen än' : status.amnen.map((a) => `${a.amne.namn} (${a.passPerVecka} pass/v)`).join(' · ')}
              </div>
            )}
            <div className="kg-fot"><button type="button" className="btn sec" onClick={() => nasta(1)}>← Tillbaka</button><span className="spacer" /><Nasta till={3} av={!klar[2]} /></div>
          </>)}

          {steg === 3 && status !== null && (<>
            <h3>3 · Böcker</h3>
            <p className="small muted">Böcker som passar ämnet och klassens årskurs står först. Finns bara ett rimligt val är det redan valt.</p>
            <table className="tbl kg-tabell">
              <thead><tr><th>Ämne</th><th>Bok</th><th></th></tr></thead>
              <tbody>{status.amnen.map((g) => (
                <tr key={g.amne.id}>
                  <td><b>{g.amne.namn}</b></td>
                  <td>{g.stod ? <span className="muted">fri planering – ingen bok behövs</span> : (
                    <select aria-label={`Bok för ${g.amne.namn}`} value={g.amne.bokId ?? ''}
                      onChange={(e) => kor(() => ({ ...lasStruktur(), amnen: lasStruktur().amnen.map((a) => (a.id === g.amne.id ? { ...a, bokId: e.target.value === '' ? undefined : e.target.value } : a)) }),
                        e.target.value === '' ? `${g.amne.namn}: ingen bok.` : `${g.amne.namn}: bok vald.`)}>
                      <option value="">{g.forslag.length === 0 ? '— ingen bok i biblioteket —' : '— välj bok —'}</option>
                      {g.forslag.map((b) => <option key={b.id} value={b.id}>{b.titel} ({b.forlag}{b.arskurs > 0 ? `, åk ${b.arskurs}` : ''})</option>)}
                    </select>
                  )}</td>
                  <td>{g.stod || g.bok !== null ? <span className="kg-ok">✓</span> : <span className="kg-saknas">saknas</span>}</td>
                </tr>
              ))}</tbody>
            </table>
            {status.amnen.some((g) => !g.stod && g.forslag.length === 0) && (
              <div className="kg-ruta">
                <p>Någon bok saknas i biblioteket. Hämta alla böcker från ditt datarepo på GitHub:</p>
                <button type="button" className="btn" disabled={hamtar} onClick={hamtaBocker}>{hamtar ? '⏳ Hämtar…' : '☁ Hämta böcker från datarepot'}</button>{' '}
                <button type="button" className="btn sec" onClick={() => onOppna({ typ: 'datarepo' })}>Öppna Datarepo</button>
                <p className="small muted">Ämnen utan bok kan få boken senare — planeringen skapas då för de ämnen som har en.</p>
              </div>
            )}
            <div className="kg-fot"><button type="button" className="btn sec" onClick={() => nasta(2)}>← Tillbaka</button><span className="spacer" /><Nasta till={4} /></div>
          </>)}

          {steg === 4 && status !== null && (<>
            <h3>4 · Planering</h3>
            <p className="small muted">Bokens lektioner läggs ut på klassens schema från läsårets start (lov och studiedagar hoppas över). Ämnen som redan har en planering rörs inte.</p>
            <ul className="kg-lista">{status.amnen.map((g) => (
              <li key={g.amne.id}>
                {g.harPlanering ? <span className="kg-ok">✓</span> : g.stod || g.bok !== null ? <span className="kg-vantar">○</span> : <span className="kg-saknas">–</span>}
                {' '}<b>{g.amne.namn}</b> <small className="muted">{g.harPlanering ? 'planering finns' : g.stod ? 'fri planering skapas' : g.bok !== null ? `skapas ur ${g.bok.titel}` : 'saknar bok — hoppas över'}</small>
              </li>
            ))}</ul>
            <button type="button" className="btn" disabled={!status.amnen.some((g) => !g.harPlanering && (g.stod || g.bok !== null))} onClick={() => {
              let r = { skapade: [] as string[], utanBok: [] as string[] };
              kor(() => { const u = skapaAllaPlaneringar(lasStruktur(), klassId, new Date().toISOString()); r = u; return u.s; }, 'Planeringar skapade.');
              setInfo(`Planering skapad för ${r.skapade.join(', ') || 'inga ämnen'}.${r.utanBok.length > 0 ? ` Utan bok (hoppades över): ${r.utanBok.join(', ')}.` : ''}`);
            }}>▶ Skapa planeringar</button>
            <div className="kg-fot"><button type="button" className="btn sec" onClick={() => nasta(3)}>← Tillbaka</button><span className="spacer" /><Nasta till={5} /></div>
          </>)}

          {steg === 5 && status !== null && (<>
            <h3>5 · Elever</h3>
            <p className="small muted">Snabbast: klistra in namnen (ett per rad) eller importera klassens roster från Socrative. Grupp A/B kan klistras in efteråt. {status.antalElever > 0 ? `${status.antalElever} elever finns redan.` : ''}</p>
            <div className="kg-inbaddad">{elevPanel(klassId)}</div>
            <div className="kg-fot"><button type="button" className="btn sec" onClick={() => nasta(4)}>← Tillbaka</button><span className="spacer" /><Nasta till={6} text="Klart" /></div>
          </>)}

          {steg === 6 && status !== null && (<>
            <h3>6 · Klart — {status.klassNamn}</h3>
            <ul className="kg-lista kg-checklista">
              {([
                ['schema', status.amnen.length === 0 ? 'Schema: inga ämnen än' : `Schema: ${status.amnen.length} ämnen`],
                ['bocker', utanBok.length === 0 ? 'Böcker valda' : `Bok saknas för ${utanBok.join(', ')}`],
                ['planering', utanPlan.length === 0 ? 'Planeringar skapade' : `Planering saknas för ${utanPlan.join(', ')}`],
                ['elever', `Elever: ${status.antalElever}`],
              ] as const).map(([k, text]) => (
                <li key={k}>{status.klart[k] ? <span className="kg-ok">✓</span> : <span className="kg-saknas">!</span>} {text}
                  {!status.klart[k] && <button type="button" className="linkbtn" onClick={() => nasta(k === 'schema' ? 2 : k === 'bocker' ? 3 : k === 'planering' ? 4 : 5)}>gör klart</button>}</li>
              ))}
            </ul>
            <div className="kg-rad" style={{ flexWrap: 'wrap' }}>
              {status.amnen.filter((g) => g.harPlanering).slice(0, 1).map((g) => (
                <button key={g.amne.id} type="button" className="btn" onClick={() => onOppna({ typ: 'planering', amneId: g.amne.id })}>📋 Öppna planeringen</button>
              ))}
              <button type="button" className="btn sec" onClick={() => onOppna({ typ: 'resultat' })}>📊 Resultat</button>
              <button type="button" className="btn sec" onClick={() => onOppna({ typ: 'datarepo' })}>☁ Spara i datarepot</button>
              <button type="button" className="btn sec" onClick={() => { setKlassId(''); setTolkat(null); setLasMed(''); setHandKlass(''); nasta(2); }}>➕ En klass till</button>
            </div>
            {utanBok.length > 0 && <p className="small muted">Ämnen utan bok kan få den senare: hämta boken, öppna guiden igen och välj klassen — det som redan är gjort rörs inte.</p>}
            <p className="small muted">Spara i datarepot så finns klassen på alla dina datorer.</p>
          </>)}
        </div>
      </div>
    </div>
  );
}
