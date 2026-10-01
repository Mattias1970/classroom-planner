/**
 * Del 158 · Planeringstavlan — en alternativ planeringsvy. Alla pass från startdatum
 * ligger som lektionskort i en rad med veckorna som bakgrund (vecka, dag, datum, tid).
 * Bokens kapitel ligger bredvid; lektioner dras in (eller väljs och läggs med ⤵),
 * flyttas och tas bort så att de följande flyttas fram. Egna kort — tom lektion, prov,
 * repetition, diagnos, laboration — fylls i direkt i lektionskortet (BAM, genomgång,
 * uppgifter, filmer …). Utkastet namnges, sparas och kan ersätta den riktiga
 * planeringen från startdatum. Bokens lektionskort behålls: filmer, begrepp och
 * lektionsplaner följer sina lektioner.
 */
import { Fragment, useMemo, useState, type DragEvent } from 'react';
import {
  amnetsUtkast, infogaIUtkast, kortDetaljer, laggProvPaDatum, nyttKortIUtkast, planeringstavla, sattKortDetaljer,
  sparaUtkast, standardBamDelar, taBortUrUtkast, taBortUtkast, tabortInlagtUtkast, tillampaUtkast, uppdateraKortIUtkast,
  utkastFranPlan, type Bok, type LektionsDetaljer, type PlanFranUtkast, type Struktur, type TavlaKort, type UtkastKo, type UtkastKort,
} from '@planner/kernel';
import { BamRedigering } from './BamRedigering.js';
import { lasStruktur } from './store.js';

type Val = { nyckel: string; rubrik: string } | { nytt: UtkastKort['typ']; rubrik: string };

const NYA_KORT: Array<{ typ: UtkastKort['typ']; rubrik: string; ikon: string }> = [
  { typ: 'lektion', rubrik: 'Ny lektion', ikon: '📄' },
  { typ: 'prov', rubrik: 'Prov', ikon: '📝' },
  { typ: 'ovning', rubrik: 'Repetition', ikon: '🔁' },
  { typ: 'diagnos', rubrik: 'Diagnos', ikon: '🩺' },
  { typ: 'lab', rubrik: 'Laboration', ikon: '🧪' },
];
const TYP_NAMN: Record<UtkastKort['typ'], string> = { lektion: 'Lektion', prov: 'Prov', ovning: 'Repetition/övning', diagnos: 'Diagnos', annat: 'Annat', lab: 'Laboration' };
const DAG = ['', 'mån', 'tis', 'ons', 'tor', 'fre'];
const kortDatum = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const veckodag = (d: string) => { const x = new Date(`${d}T00:00:00Z`).getUTCDay(); return DAG[x === 0 ? 7 : x] ?? ''; };

export function PlaneringsTavla({ s, amneId, bok, kor, idag }: {
  s: Struktur; amneId: string; bok: Bok; idag: string;
  kor: (fn: () => Struktur, m: string) => void;
}) {
  const amne = s.amnen.find((a) => a.id === amneId)!;
  const inlagt = amne.planFranUtkast;
  const [fel, setFel] = useState('');
  const [info, setInfo] = useState('');
  const [utkast, setUtkast] = useState<PlanFranUtkast | null>(() => {
    try { return utkastFranPlan(s, amneId, inlagt !== undefined && inlagt.fran > idag ? inlagt.fran : idag, idag, ''); } catch { return null; }
  });
  const [sparatId, setSparatId] = useState<string | undefined>(undefined);
  const [valt, setValt] = useState<Val | null>(null);
  const [oppetKort, setOppetKort] = useState<string | null>(null);
  const [heltAr, setHeltAr] = useState(false);

  const tavla = useMemo(() => {
    if (utkast === null) return null;
    try { return planeringstavla(s, amneId, utkast, idag); } catch (e) { return (e as Error).message; }
  }, [s, amneId, utkast, idag]);

  if (utkast === null) return <p className="muted">Planeringstavlan behöver ett skolår och en bok för ämnet.</p>;
  if (typeof tavla === 'string' || tavla === null) return <p className="status warn">✗ {tavla}</p>;

  const andra = (fn: () => PlanFranUtkast, m = '') => {
    try { setUtkast(fn()); setFel(''); setInfo(m); } catch (e) { setFel((e as Error).message); setInfo(''); }
  };
  const fran = utkast.fran;
  const sparade = amnetsUtkast(s, amneId);

  // ── Lägg ett valt/draget kort på en plats ──
  const lagg = (v: Val, ko: UtkastKo, index: number) => andra(() => {
    if ('nyckel' in v) {
      if (ko === 'labbar' && !v.nyckel.startsWith('lab:') && utkast.egna.find((k) => `u:${k.id}` === v.nyckel)?.typ !== 'lab') throw new Error('Halvklasspassen tar bara laborationer.');
      return infogaIUtkast(utkast, ko, v.nyckel, index);
    }
    const r = nyttKortIUtkast(utkast, { typ: v.nytt, rubrik: v.rubrik }, ko, index);
    setOppetKort(r.nyckel);
    return r.utkast;
  }, `${v.rubrik} inlagd.`);
  const slapp = (k: TavlaKort) => (e: DragEvent) => {
    e.preventDefault();
    if (k.ko === null || k.koIndex === null) return;
    const data = e.dataTransfer?.getData('text/plain') ?? '';
    try { lagg(JSON.parse(data) as Val, k.ko, k.koIndex); } catch { /* inget giltigt kort */ }
    setValt(null);
  };
  const dra = (v: Val) => (e: DragEvent) => { e.dataTransfer?.setData('text/plain', JSON.stringify(v)); setValt(v); };
  const flytta = (k: TavlaKort, steg: -1 | 1) => andra(() => (k.ko === null || k.nyckel === null || k.koIndex === null ? utkast : infogaIUtkast(utkast, k.ko, k.nyckel, k.koIndex + steg + (steg === 1 ? 1 : 0))));

  // ── Synliga pass: fram till sista kortet/provet + några tomma ──
  const sistaFyllda = Math.max(-1, ...tavla.kolumner.map((k, i) => (!k.tom ? i : -1)));
  const provIdx = tavla.prov?.malDatum != null ? tavla.kolumner.findIndex((k) => k.datum === tavla.prov!.malDatum) : -1;
  const synliga = heltAr ? tavla.kolumner : tavla.kolumner.slice(0, Math.max(sistaFyllda, provIdx) + 5);
  const veckor: Array<{ vecka: number; kort: TavlaKort[] }> = [];
  for (const k of synliga) {
    const sista = veckor[veckor.length - 1];
    if (sista !== undefined && sista.vecka === k.vecka) sista.kort.push(k); else veckor.push({ vecka: k.vecka!, kort: [k] });
  }
  const kapFarg = (nr: number | null) => bok.kapitel.find((x) => x.nr === nr)?.farg ?? '#5c6b7a';
  const alla = [...tavla.kolumner, ...tavla.rymsEj];
  const oppet = oppetKort === null ? null : alla.find((k) => k.radNyckel === oppetKort || k.nyckel === oppetKort) ?? null;

  const kortVy = (k: TavlaKort) => {
    const arProv = tavla.prov?.malDatum === k.datum && k.ko === 'teori' && tavla.kolumner.find((x) => x.ko === 'teori' && x.datum === k.datum) === k;
    const flyttbar = k.ko !== null && k.nyckel !== null;
    return (
      <div className={`pt-kort ${k.tom ? 'tom' : ''} ${k.passTyp === 'lab' ? 'lab' : ''} ${k.lektionsTyp === 'exam' ? 'prov' : ''} ${arProv ? 'provdag' : ''}`}
        style={k.tom ? undefined : { borderTopColor: kapFarg(k.kapitel) }}
        draggable={flyttbar} onDragStart={flyttbar ? dra({ nyckel: k.nyckel!, rubrik: k.rubrik }) : undefined}
        onDragOver={(e) => { if (k.ko !== null) e.preventDefault(); }} onDrop={slapp(k)}
        aria-label={`Pass ${k.datum ?? 'utan datum'} ${k.start ?? ''}`}>
        <div className="pt-tid">
          {k.datum !== null ? <><b>{veckodag(k.datum)} {kortDatum(k.datum)}</b> · {k.start}–{k.slut}</> : <b>ryms inte</b>}
          {k.b !== null && <div className="muted">B: {veckodag(k.b.datum)} {kortDatum(k.b.datum)} {k.b.start}</div>}
        </div>
        {k.passTyp === 'lab' && <span className="pt-tag">halvklass</span>}
        {k.kod !== null && <span className="pt-kod" style={{ background: kapFarg(k.kapitel) }}>{k.kod}</span>}
        <div className="pt-rubrik">{k.egen !== null && k.egen.typ !== 'lab' ? '✎ ' : ''}{k.rubrik}</div>
        {arProv && <div className="pt-provflagga">📅 provdatum</div>}
        <div className="pt-knappar">
          {valt !== null && k.ko !== null && <button className="btn sm" aria-label={`Lägg ${valt.rubrik} här`} onClick={() => { lagg(valt, k.ko!, k.koIndex!); setValt(null); }}>⤵ Hit</button>}
          {k.passTyp === 'pass' && <small className="muted">🔒 eget passval</small>}
          {flyttbar && <>
            <button className="icon-btn" aria-label={`Flytta ${k.rubrik} bakåt`} disabled={k.koIndex === 0} onClick={() => flytta(k, -1)}>◀</button>
            <button className="icon-btn" aria-label={`Flytta ${k.rubrik} framåt`} onClick={() => flytta(k, 1)}>▶</button>
            <button className="icon-btn" aria-label={`Lektionskort ${k.rubrik}`} onClick={() => setOppetKort(k.radNyckel)}>✏️</button>
            <button className="icon-btn" aria-label={`Ta bort ${k.rubrik}`} title="Ta bort lektionen — de följande flyttas fram ett pass"
              onClick={() => { andra(() => taBortUrUtkast(utkast, k.nyckel!), `${k.rubrik} borttagen — följande lektioner flyttade fram.`); if (oppetKort === k.radNyckel) setOppetKort(null); }}>🗑</button>
          </>}
        </div>
      </div>
    );
  };

  return (
    <div className="pt">
      <div className="pt-huvud rad" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>Namn<br /><input aria-label="Planeringens namn" value={utkast.namn} placeholder="t.ex. Kapitel 2 med lab" onChange={(e) => andra(() => ({ ...utkast, namn: e.target.value }))} /></label>
        <label>Startdatum<br /><input aria-label="Startdatum" type="date" value={fran} onChange={(e) => { if (e.target.value !== '') andra(() => ({ ...utkast, fran: e.target.value })); }} /></label>
        <label>Provdatum<br /><input aria-label="Provdatum" type="date" value={utkast.provDatum ?? ''} onChange={(e) => andra(() => { const { provDatum: _p, ...rest } = utkast; void _p; return e.target.value === '' ? rest : { ...rest, provDatum: e.target.value }; })} /></label>
        <button className="btn sec" disabled={utkast.provDatum === undefined} onClick={() => andra(() => {
          const r = laggProvPaDatum(s, amneId, utkast, idag);
          setInfo(`Provet ligger ${r.utkast.provDatum}.${r.repetition > 0 ? ` ${r.repetition} repetitionspass lades till före provet.` : ''}${r.efterProv > 0 ? ` ${r.efterProv} lektioner ligger efter provet.` : ''}`);
          return r.utkast;
        })}>📌 Lägg provet på provdatum</button>
        <button className="btn sec" title="Börja om från ämnets nuvarande planering från startdatum" onClick={() => andra(() => ({ ...utkastFranPlan(s, amneId, fran, idag, utkast.namn), ...(utkast.provDatum !== undefined ? { provDatum: utkast.provDatum } : {}) }), 'Utkastet följer nuvarande planering från startdatum.')}>↺ Från nuvarande planering</button>
        <button className="btn sec" onClick={() => andra(() => ({ ...utkast, teori: [], labbar: [], egna: [] }), 'Tom tavla — dra in lektioner från kapitlen.')}>⌫ Töm</button>
      </div>
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn" onClick={() => {
          try {
            const r = sparaUtkast(lasStruktur(), amneId, utkast, sparatId, idag);
            setSparatId(r.id); setFel('');
            kor(() => r.s, `Planeringen ”${utkast.namn.trim()}” är sparad.`);
          } catch (e) { setFel((e as Error).message); }
        }}>💾 Spara utkast</button>
        {sparade.length > 0 && (
          <select aria-label="Sparade planeringar" value={sparatId ?? ''} onChange={(e) => {
            const p = sparade.find((x) => x.id === e.target.value);
            if (p === undefined) { setSparatId(undefined); return; }
            const { id: _i, amneId: _a, skapad: _s, ...u } = p; void _i; void _a; void _s;
            setSparatId(p.id); setUtkast(u); setInfo(`Öppnade ”${p.namn}”.`); setFel('');
          }}>
            <option value="">— sparade planeringar ({sparade.length}) —</option>
            {sparade.map((p) => <option key={p.id} value={p.id}>{p.namn} · från {p.fran}{p.provDatum !== undefined ? ` · prov ${p.provDatum}` : ''}</option>)}
          </select>
        )}
        {sparatId !== undefined && <button className="btn sec sm" onClick={() => { if (window.confirm(`Ta bort den sparade planeringen ”${utkast.namn}”?`)) { kor(() => taBortUtkast(lasStruktur(), sparatId), 'Sparad planering borttagen.'); setSparatId(undefined); } }}>🗑 Ta bort sparad</button>}
        <span className="spacer" />
        <button className="btn" disabled={utkast.namn.trim() === '' || fran < idag} title={fran < idag ? 'Startdatum ligger före idag' : utkast.namn.trim() === '' ? 'Ge planeringen ett namn först' : ''}
          onClick={() => {
            if (!window.confirm(`Ersätta ${amne.namn}s planering från ${fran} med ”${utkast.namn.trim()}”?\n\nLektioner före ${fran} ändras inte. Lektionskorten (filmer, begrepp, BAM …) följer sina lektioner.`)) return;
            kor(() => tillampaUtkast(lasStruktur(), amneId, utkast, idag), `”${utkast.namn.trim()}” gäller nu från ${fran}.`);
            setInfo(`”${utkast.namn.trim()}” är inlagd i planeringen.`);
          }}>✅ Ersätt nuvarande planering från {fran}</button>
      </div>
      {inlagt !== undefined && (
        <p className="note">Inlagd planering: <b>{inlagt.namn}</b> från {inlagt.fran}{inlagt.provDatum !== undefined ? `, prov ${inlagt.provDatum}` : ''}. Ändringar i kursordningen påverkar inte lektionerna efter {inlagt.fran}.
          {inlagt.fran >= idag && <button className="linkbtn warn" style={{ marginLeft: 8 }} onClick={() => { if (window.confirm('Ta bort den inlagda planeringen? Ämnet följer boken igen.')) kor(() => tabortInlagtUtkast(lasStruktur(), amneId, idag), 'Planeringen följer boken igen.'); }}>↺ Följ boken igen</button>}
        </p>
      )}
      {fel !== '' && <p className="status warn" role="alert">✗ {fel}</p>}
      {info !== '' && <p className="status">✓ {info}</p>}
      {tavla.varningar.map((v) => <p key={v} className="status warn">⚠ {v}</p>)}

      <div className="pt-yta">
        <aside className="pt-palett" aria-label="Kapitel och kort">
          <h4>Nya kort</h4>
          <div className="pt-nya">
            {NYA_KORT.map((n) => {
              const v: Val = { nytt: n.typ, rubrik: n.rubrik };
              const ar = valt !== null && 'nytt' in valt && valt.nytt === n.typ;
              return <button key={n.typ} className={`pt-chip ${ar ? 'valt' : ''}`} draggable onDragStart={dra(v)} onClick={() => setValt(ar ? null : v)}>{n.ikon} {n.rubrik}</button>;
            })}
          </div>
          {tavla.halvklass && tavla.labbar.length > 0 && <>
            <h4>🧪 Laborationer</h4>
            {tavla.labbar.map((l) => {
              const v: Val = { nyckel: l.nyckel, rubrik: l.rubrik };
              const ar = valt !== null && 'nyckel' in valt && valt.nyckel === l.nyckel;
              return <button key={l.nyckel} className={`pt-chip ${l.anvand ? 'anvand' : ''} ${ar ? 'valt' : ''}`} draggable onDragStart={dra(v)} onClick={() => setValt(ar ? null : v)}>{l.rubrik}{l.delkapitel !== null ? ` (${l.delkapitel})` : ''}</button>;
            })}
          </>}
          {tavla.palett.map((kap) => (
            <details key={kap.nr} open>
              <summary style={{ borderLeft: `4px solid ${kap.farg}` }}>Kapitel {kap.nr} · {kap.namn}</summary>
              {kap.grupper.map((g) => (
                <div key={g.nyckel} className="pt-grupp">
                  <div className="pt-grupptitel">{g.titel}</div>
                  {g.lektioner.map((l) => {
                    const v: Val = { nyckel: l.nyckel, rubrik: l.rubrik };
                    const ar = valt !== null && 'nyckel' in valt && valt.nyckel === l.nyckel;
                    return l.anvand === 'fore'
                      ? <span key={l.nyckel} className="pt-chip fore" title="Ligger före startdatum — ändras inte">✓ {l.rubrik}</span>
                      : <button key={l.nyckel} className={`pt-chip ${l.anvand === 'utkast' ? 'anvand' : ''} ${ar ? 'valt' : ''}`} draggable onDragStart={dra(v)}
                          title={l.anvand === 'utkast' ? 'Finns redan på tavlan — släpps den flyttas den' : 'Dra till ett pass, eller klicka och tryck ⤵ Hit'}
                          onClick={() => setValt(ar ? null : v)}>{l.rubrik}</button>;
                  })}
                </div>
              ))}
            </details>
          ))}
        </aside>

        <div className="pt-spar">
          {valt !== null && <p className="note">Valt: <b>{valt.rubrik}</b> — dra kortet till ett pass eller tryck <b>⤵ Hit</b> på passet. <button className="linkbtn" onClick={() => setValt(null)}>avbryt</button></p>}
          <div className="pt-rad" role="list" aria-label="Lektionskort i ordning">
            {veckor.map((v, i) => (
              <div key={`${v.vecka}-${i}`} className={`pt-vecka ${i % 2 === 1 ? 'udda' : ''}`} role="listitem">
                <div className="pt-veckanr">v. {v.vecka}</div>
                <div className="pt-veckakort">{v.kort.map((k) => <Fragment key={`${k.datum}|${k.start}`}>{kortVy(k)}</Fragment>)}</div>
              </div>
            ))}
            {tavla.rymsEj.length > 0 && (
              <div className="pt-vecka rymsej" role="listitem">
                <div className="pt-veckanr">ryms inte</div>
                <div className="pt-veckakort">{tavla.rymsEj.map((k) => <Fragment key={k.radNyckel ?? ''}>{kortVy(k)}</Fragment>)}</div>
              </div>
            )}
          </div>
          {!heltAr && synliga.length < tavla.kolumner.length && <button className="linkbtn" onClick={() => setHeltAr(true)}>Visa hela läsåret ({tavla.kolumner.length} pass)</button>}
          {heltAr && <button className="linkbtn" onClick={() => setHeltAr(false)}>Visa bara utkastets pass</button>}
        </div>
      </div>

      {oppet !== null && oppet.radNyckel !== null && (
        <KortRedigering key={oppet.radNyckel} kort={oppet} bok={bok}
          detaljer={kortDetaljer(s, amneId, utkast, oppet.radNyckel, idag)}
          onKort={(patch) => andra(() => uppdateraKortIUtkast(utkast, oppet.egen!.id, patch))}
          onSpara={(d) => andra(() => sattKortDetaljer(utkast, oppet.radNyckel!, d), `Lektionskortet ${oppet.rubrik} är ändrat i utkastet — det sparas i planeringen när utkastet läggs in.`)}
          onStang={() => setOppetKort(null)} />
      )}
    </div>
  );
}

/** Lektionskortet i utkastet: BAM och lektionens alla delar. */
function KortRedigering({ kort, bok, detaljer, onKort, onSpara, onStang }: {
  kort: TavlaKort; bok: Bok; detaljer: LektionsDetaljer;
  onKort: (patch: Partial<Omit<UtkastKort, 'id'>>) => void; onSpara: (d: LektionsDetaljer) => void; onStang: () => void;
}) {
  const [d, setD] = useState<LektionsDetaljer>(detaljer);
  const [filmer, setFilmer] = useState((detaljer.filmer ?? []).join('\n'));
  const egen = kort.egen;
  const N = bok.nivaer;
  const falt = (namn: keyof LektionsDetaljer, etikett: string, rader = 1, tips = '') => (
    <label className="pt-falt">{etikett}
      {rader > 1
        ? <textarea aria-label={etikett} rows={rader} value={(d[namn] as string | undefined) ?? ''} placeholder={tips} onChange={(e) => setD({ ...d, [namn]: e.target.value })} />
        : <input aria-label={etikett} value={(d[namn] as string | undefined) ?? ''} placeholder={tips} onChange={(e) => setD({ ...d, [namn]: e.target.value })} />}
    </label>
  );
  const standard = kort.start !== null && kort.slut !== null ? standardBamDelar({ typ: kort.lektionsTyp ?? 'regular' }, kort.start, kort.slut) : [];
  return (
    <div className="card pt-redigering" aria-label="Lektionskort i utkastet">
      <div className="rad" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>✏️ {kort.rubrik}</h3>
        <span className="muted small">{kort.datum !== null ? `${veckodag(kort.datum)} ${kortDatum(kort.datum)} · ${kort.start}–${kort.slut}` : 'ryms inte'}</span>
        <span className="spacer" />
        <button className="btn sec sm" onClick={onStang}>Stäng</button>
      </div>
      {egen !== null ? (
        <div className="rad" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="pt-falt">Rubrik<input aria-label="Kortets rubrik" defaultValue={egen.rubrik} onBlur={(e) => { if (e.target.value.trim() !== egen.rubrik) onKort({ rubrik: e.target.value }); }} /></label>
          <label className="pt-falt">Typ
            <select aria-label="Kortets typ" value={egen.typ} disabled={kort.passTyp === 'lab'} onChange={(e) => onKort({ typ: e.target.value as UtkastKort['typ'] })}>
              {(Object.keys(TYP_NAMN) as UtkastKort['typ'][]).map((t) => <option key={t} value={t}>{TYP_NAMN[t]}</option>)}
            </select>
          </label>
        </div>
      ) : <p className="muted small">Bokens lektionskort — bokens uppgifter, begrepp och filmer finns kvar. Det du fyller i här ersätter bara de fälten.</p>}
      <BamRedigering bam={d.bam} standard={standard} onSpara={(bam) => { const { bam: _b, ...rest } = d; void _b; const ny = bam === undefined ? rest : { ...rest, bam }; setD(ny); onSpara({ ...ny, filmer: filmer.split('\n').map((x) => x.trim()).filter((x) => x !== '') }); }} />
      {d.bam !== undefined && <p className="small">BAM: {d.bam.map((x) => `${x.ikon ?? '▪'} ${x.namn} ${x.minuter} min`).join(' · ')}</p>}
      <div className="pt-faltgrid">
        {falt('vadGora', 'Vad ska vi göra')}
        {falt('laraOss', 'Vad ska vi lära oss')}
        {falt('genomgang', 'Genomgång', 3)}
        {falt('exempelRakna', 'Exempel vi räknar tillsammans', 2)}
        {falt('uppgNiva1', `Uppgifter ${N.niva1}`)}
        {falt('uppgNiva2', `Uppgifter ${N.niva2}`)}
        {falt('uppgNiva3', `Uppgifter ${N.niva3}`)}
        {falt('laxa', 'Läxa')}
        {falt('begreppText', 'Begrepp (kommaseparerade)')}
        {falt('magma', 'Magma-aktivitet (länk)')}
        {kort.passTyp === 'lab' || egen?.typ === 'lab' ? <>{falt('labLank', 'Länk till laborationen')}{falt('labFraga', 'Frågeställning')}</> : null}
        <label className="pt-falt">Filmer (en per rad: Titel|https://…)
          <textarea aria-label="Filmer" rows={2} value={filmer} onChange={(e) => setFilmer(e.target.value)} />
        </label>
        {falt('anteckning', 'Anteckning', 2)}
      </div>
      <div className="rad" style={{ gap: 8 }}>
        <span className="spacer" />
        <button className="btn" onClick={() => onSpara({ ...d, filmer: filmer.split('\n').map((x) => x.trim()).filter((x) => x !== '') })}>💾 Spara lektionskortet</button>
      </div>
    </div>
  );
}
