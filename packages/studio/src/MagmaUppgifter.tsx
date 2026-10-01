/**
 * Del 153 · Magma-testens uppgifter (PDF) och analys per delkapitel och förmåga.
 *
 * Läraren laddar upp testets PDF (utskriften från Magma) bredvid resultatfilen.
 * Uppgifterna läses och klassas (kernel magmauppgifter.ts): delkapitel ur bokens
 * delkapitelnamn och begrepp, förmåga B/M/P/R. Samma uppgifter = samma test;
 * uppgifter som återkommer i andra test (t.ex. diagnosen) jämförs uppgift för
 * uppgift. Klassningen kan ändras här och gäller uppgiften i alla test.
 * Analysen visar klassens och varje elevs andel rätt per delkapitel och förmåga,
 * med ett eget diagram för Magma-testen.
 */
import { useState } from 'react';
import {
  FORMAGA_NAMN, deladeUppgifter, magmaDelkapitelAnalys, magmaKlassFor, magmaTestForProv, sammaTestSom, sattMagmaKlassning,
  sparaMagmaTest, taBortMagmaTest, tolkaMagmaPdf,
  type Amne, type Klass, type MagmaDelkapitelAnalys, type MagmaDelkapitelInfo, type MagmaFormaga, type MagmaTestDef, type MagmaUppgiftDef, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';

const FORMAGOR: MagmaFormaga[] = ['B', 'M', 'P', 'R'];
const FORMAGA_FARG: Record<MagmaFormaga, string> = { B: '#1565C0', M: '#2E7D32', P: '#6A1B9A', R: '#EF6C00' };
const farg = (andel: number | null) => (andel === null ? '#ccc' : andel < 50 ? '#C62828' : andel < 70 ? '#EF6C00' : '#2E7D32');

/** Bokens delkapitel för ämnet (kod, namn, begrepp). */
function delkapitelInfo(s: Struktur, amne: Amne | undefined): MagmaDelkapitelInfo[] {
  const bok = s.bocker.find((b) => b.id === amne?.bokId);
  return bok === undefined ? [] : bok.kapitel.flatMap((k) => k.delkapitel.map((d) => ({ kod: d.kod, namn: d.namn, begrepp: d.begrepp })));
}

export function MagmaUppgifter({ s, klass, amne, kor }: {
  s: Struktur; klass: Klass; amne: Amne | undefined; kor: (fn: () => Struktur, m: string) => void;
}) {
  const [fel, setFel] = useState<string[]>([]);
  const dk = delkapitelInfo(s, amne);
  const tester = s.magmaTester ?? [];

  const lasPdf = async (lista: FileList | null) => {
    if (lista === null) return;
    const { lasPdfAllaSidor } = await import('./pdfLasare.js');
    const nya: MagmaTestDef[] = []; const fels: string[] = [];
    for (const fil of Array.from(lista)) {
      try { nya.push(tolkaMagmaPdf(await lasPdfAllaSidor(fil), fil.name, dk)); }
      catch (e) { fels.push(`${fil.name}: ${e instanceof Error ? e.message : 'kunde inte läsas'}`); }
    }
    setFel(fels);
    if (nya.length > 0) {
      kor(() => nya.reduce((st, d) => sparaMagmaTest(st, d), lasStruktur()),
        `${nya.length} Magma-test inlästa: ${nya.map((d) => `${d.titel} (${d.uppgifter.length} uppgifter)`).join(' · ')}.`);
    }
  };

  return (
    <div className="st-magma-uppg">
      <b>📄 Magma-uppgifter (pdf)</b>{' '}
      <small className="muted">Ladda upp testets utskrift från Magma. Uppgifterna läses in och klassas per <b>delkapitel</b> och <b>förmåga</b> (B begrepp · M metod · P problemlösning · R resonemang). Test med samma uppgifter räknas som ett test; uppgifter som återkommer i andra test (t.ex. diagnosen) jämförs uppgift för uppgift. PDF:en kopplas till resultatfilen via testets namn.</small>
      <div className="rad" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <input type="file" multiple accept=".pdf" aria-label="Magma-PDF:er" onChange={(e) => { void lasPdf(e.target.files); e.target.value = ''; }} />
        {dk.length === 0 && <span className="status warn small">⚠ Ämnet saknar bok — uppgifterna kan inte kopplas till delkapitel (förmåga klassas ändå).</span>}
      </div>
      {fel.map((f) => <p key={f} className="status warn small">{f}</p>)}
      {tester.length > 0 && (
        <table className="tbl small st-magma-tester">
          <thead><tr><th>Test</th><th>Uppgifter</th><th>Resultat</th><th>Samma test som</th><th>Uppgifter i andra test</th><th /></tr></thead>
          <tbody>{tester.map((t) => <TestRad key={t.titel} s={s} t={t} klass={klass} dk={dk} kor={kor} />)}</tbody>
        </table>
      )}
      <MagmaDelkapitelVy s={s} klass={klass} amne={amne} />
    </div>
  );
}

function TestRad({ s, t, klass, dk, kor }: { s: Struktur; t: MagmaTestDef; klass: Klass; dk: MagmaDelkapitelInfo[]; kor: (fn: () => Struktur, m: string) => void }) {
  const [oppen, setOppen] = useState(false);
  const elevIds = new Set(s.elever.filter((e) => e.klassId === klass.id).map((e) => e.id));
  const res = (s.resultat ?? []).filter((r) => r.kalla === 'magma' && elevIds.has(r.elevId) && magmaTestForProv(s, r.prov) === t);
  const fragor = res[0]?.svar?.length ?? null;
  const samma = sammaTestSom(s, t);
  const delade = deladeUppgifter(s, t);
  return (<>
    <tr>
      <td><b>{t.titel}</b><br /><small className="muted">{t.filnamn}</small></td>
      <td>{t.uppgifter.length}</td>
      <td>{res.length > 0 ? `${res.length} elever` : <span className="muted">inga — importera resultatfilen med samma namn</span>}
        {fragor !== null && fragor !== t.uppgifter.length && <span className="status warn small"> ⚠ resultatfilen har {fragor} uppgifter, PDF:en {t.uppgifter.length}</span>}</td>
      <td>{samma.length > 0 ? samma.map((x) => x.titel).join(', ') : <span className="muted">—</span>}</td>
      <td>{delade.size > 0 ? `${delade.size} uppgifter` : <span className="muted">—</span>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn sec sm" aria-expanded={oppen} onClick={() => setOppen(!oppen)}>{oppen ? 'Dölj' : 'Uppgifter'}</button>{' '}
        <button className="btn sec sm" title="Ta bort testets uppgifter (resultaten finns kvar)" onClick={() => { if (window.confirm(`Ta bort uppgifterna för ${t.titel}? Resultaten finns kvar men kan inte delas upp på delkapitel.`)) kor(() => taBortMagmaTest(lasStruktur(), t.titel), `${t.titel}: uppgifterna borttagna.`); }}>🗑</button>
      </td>
    </tr>
    {oppen && (
      <tr><td colSpan={6}>
        <table className="tbl small st-magma-uppglista">
          <thead><tr><th>Nr</th><th>Uppgift</th><th>Delkapitel</th><th>Förmåga</th><th>Finns även i</th></tr></thead>
          <tbody>{t.uppgifter.map((u) => <UppgiftRad key={u.nr} s={s} u={u} dk={dk} delad={delade.get(u.nr) ?? []} kor={kor} />)}</tbody>
        </table>
      </td></tr>
    )}
  </>);
}

function UppgiftRad({ s, u, dk, delad, kor }: { s: Struktur; u: MagmaUppgiftDef; dk: MagmaDelkapitelInfo[]; delad: Array<{ titel: string; nr: string }>; kor: (fn: () => Struktur, m: string) => void }) {
  const k = magmaKlassFor(s, u);
  const spara = (delkapitel: string | null, formagor: MagmaFormaga[]) =>
    kor(() => sattMagmaKlassning(lasStruktur(), u.nyckel, { delkapitel, formagor: formagor.length > 0 ? formagor : ['M'] }), `Uppgift ${u.nr} klassad: ${delkapitel ?? 'inget delkapitel'} · ${formagor.join('')} — gäller i alla test.`);
  return (
    <tr className={k.andrad ? 'st-magma-andrad' : ''}>
      <td>{u.nr}{u.flerval && <small className="muted" title="flerval"> ☐</small>}</td>
      <td className="st-magma-uppgtext">{u.text.split('\n').map((r, i) => <span key={i}>{r}<br /></span>)}</td>
      <td>
        <select aria-label={`Delkapitel för uppgift ${u.nr}`} value={k.delkapitel ?? ''} onChange={(e) => spara(e.target.value === '' ? null : e.target.value, k.formagor)}>
          <option value="">—</option>
          {dk.map((d) => <option key={d.kod} value={d.kod}>{d.kod} {d.namn}</option>)}
        </select>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{FORMAGOR.map((f) => (
        <label key={f} title={FORMAGA_NAMN[f]} className="st-magma-formaga" style={{ color: FORMAGA_FARG[f] }}>
          <input type="checkbox" aria-label={`${FORMAGA_NAMN[f]} uppgift ${u.nr}`} checked={k.formagor.includes(f)}
            onChange={(e) => spara(k.delkapitel, e.target.checked ? [...k.formagor, f] : k.formagor.filter((x) => x !== f))} />{f}
        </label>
      ))}{k.andrad && <button className="linkbtn small" title="Återgå till den automatiska klassningen" onClick={() => kor(() => sattMagmaKlassning(lasStruktur(), u.nyckel, null), `Uppgift ${u.nr}: automatisk klassning.`)}>↺</button>}</td>
      <td className="small">{delad.map((d) => `${d.titel} #${d.nr}`).join(' · ') || <span className="muted">—</span>}</td>
    </tr>
  );
}

// ── Eget diagram för Magma-testen: andel rätt per delkapitel och per förmåga ──

function DelkapitelDiagram({ a }: { a: MagmaDelkapitelAnalys }) {
  const staplar = [...a.delkapitel.map((d) => ({ etikett: d.kod, andel: d.andel, ratt: d.ratt, totalt: d.totalt, f: null as MagmaFormaga | null })),
    ...a.formagor.map((f) => ({ etikett: f.formaga, andel: f.andel, ratt: f.ratt, totalt: f.totalt, f: f.formaga }))];
  const bred = 46; const gap = a.delkapitel.length > 0 && a.formagor.length > 0 ? 24 : 0;
  const w = Math.max(360, staplar.length * bred + gap + 50); const h = 200; const bas = 158; const topp = 16;
  const y = (p: number) => bas - ((bas - topp) * p) / 100;
  let x = 40;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="st-diagram st-magma-diagram" role="img" aria-label="Magma per delkapitel och förmåga">
      {[0, 50, 70, 100].map((p) => <g key={p}><line x1={34} x2={w - 4} y1={y(p)} y2={y(p)} stroke={p === 70 ? '#2E7D32' : p === 50 ? '#C62828' : '#e0e0e0'} strokeDasharray={p === 50 || p === 70 ? '3 3' : undefined} /><text x={30} y={y(p) + 3} fontSize={9} textAnchor="end" fill="#666">{p}</text></g>)}
      {staplar.map((st, i) => {
        if (i === a.delkapitel.length && gap > 0) x += gap;
        const x0 = x; x += bred;
        const hh = bas - y(st.andel ?? 0);
        return (
          <g key={`${st.etikett}-${i}`}>
            <title>{`${st.f !== null ? FORMAGA_NAMN[st.f] : `Delkapitel ${st.etikett}`}: ${st.andel ?? '–'} % rätt (${st.ratt} av ${st.totalt} svar)`}</title>
            <rect x={x0 + 6} y={bas - hh} width={bred - 12} height={hh} rx={3} fill={st.f !== null ? FORMAGA_FARG[st.f] : farg(st.andel)} opacity={st.f !== null ? 0.85 : 1} />
            <text x={x0 + bred / 2} y={bas - hh - 4} fontSize={10} textAnchor="middle" fill="#222" fontWeight={700}>{st.andel ?? '–'}</text>
            <text x={x0 + bred / 2} y={bas + 13} fontSize={11} textAnchor="middle" fill="#222" fontWeight={st.f !== null ? 700 : 400}>{st.etikett}</text>
          </g>
        );
      })}
      <text x={40 + (a.delkapitel.length * bred) / 2} y={h - 6} fontSize={9} textAnchor="middle" fill="#666">delkapitel</text>
      {a.formagor.length > 0 && <text x={40 + a.delkapitel.length * bred + gap + (a.formagor.length * bred) / 2} y={h - 6} fontSize={9} textAnchor="middle" fill="#666">förmåga</text>}
    </svg>
  );
}

function MagmaDelkapitelVy({ s, klass, amne }: { s: Struktur; klass: Klass; amne: Amne | undefined }) {
  const a = magmaDelkapitelAnalys(s, klass.id, amne?.id);
  if (a.delkapitel.length === 0 && a.formagor.length === 0) {
    return (s.magmaTester ?? []).length > 0 ? <p className="small muted">Ingen analys än — importera resultatfilen (xlsx) för ett test vars PDF finns ovan.</p> : null;
  }
  const koder = a.delkapitel.map((d) => d.kod);
  return (
    <details className="st-magma-analys st-magma-dk" open>
      <summary>🧭 Magma per delkapitel och förmåga <small className="muted">· {klass.namn}{amne !== undefined ? ` · ${amne.namn}` : ''} · alla Magma-test med uppgifts-PDF</small></summary>
      {a.sammaTest.length > 0 && <p className="small">Räknas som samma test: {a.sammaTest.map((g) => g.join(' = ')).join(' · ')}</p>}
      {a.utanPdf.length > 0 && <p className="small muted">Utan uppgifts-PDF (ingår inte): {a.utanPdf.join(', ')}</p>}
      <DelkapitelDiagram a={a} />
      <h4 style={{ margin: '8px 0 4px' }}>Elever per delkapitel <small className="muted">— % rätt · rött under 50, orange under 70</small></h4>
      <table className="tbl small st-magma-tabell st-magma-dktabell">
        <thead><tr><th>Elev</th>{koder.map((k) => <th key={k}>{k}</th>)}{FORMAGOR.filter((f) => a.formagor.some((x) => x.formaga === f)).map((f) => <th key={f} title={FORMAGA_NAMN[f]} style={{ color: FORMAGA_FARG[f] }}>{f}</th>)}<th>Behöver förbättra</th></tr></thead>
        <tbody>{a.elever.map((e) => (
          <tr key={e.elevId}>
            <td>{e.namn}</td>
            {koder.map((k) => { const v = e.delkapitel[k]; return <td key={k} title={v === undefined ? 'inga uppgifter' : `${v.ratt} av ${v.totalt}`} style={v?.andel !== null && v !== undefined ? { background: `${farg(v.andel)}22`, color: farg(v.andel), fontWeight: 600 } : undefined}>{v === undefined || v.andel === null ? '—' : v.andel}</td>; })}
            {FORMAGOR.filter((f) => a.formagor.some((x) => x.formaga === f)).map((f) => <td key={f} title={`${e.formagor[f].ratt} av ${e.formagor[f].totalt}`}>{e.formagor[f].andel ?? '—'}</td>)}
            <td>{e.behoverForbattra.length > 0 ? e.behoverForbattra.map((k) => <span key={k} className="st-krav ej">{k}</span>) : <span className="muted">—</span>}</td>
          </tr>
        ))}</tbody>
      </table>
      <h4 style={{ margin: '8px 0 4px' }}>Svåraste uppgifterna <small className="muted">— samma uppgift i flera test räknas ihop</small></h4>
      <table className="tbl small">
        <thead><tr><th>Uppgift</th><th>Delkapitel</th><th>Förmåga</th><th>% rätt</th><th>Test</th></tr></thead>
        <tbody>{a.uppgifter.slice(0, 8).map((u) => (
          <tr key={u.nyckel}>
            <td className="st-magma-uppgtext">{u.text.split('\n')[0]}{u.text.includes('\n') ? ' …' : ''}</td>
            <td>{u.delkapitel ?? '—'}</td><td>{u.formagor.join('')}</td>
            <td style={{ color: farg(u.andel), fontWeight: 700 }}>{u.andel ?? '—'} <small className="muted">({u.ratt}/{u.totalt})</small></td>
            <td className="small">{u.forekomster.map((f) => `${f.titel} #${f.nr}`).join(' · ')}</td>
          </tr>
        ))}</tbody>
      </table>
    </details>
  );
}
