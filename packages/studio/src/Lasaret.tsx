/**
 * Del 205 · 📅 Läsåret — en tydlig meny i Översikt för det som ändrar läsårets tid:
 *
 *  1. Lov, temadagar och halvdagar — ett datumintervall i taget, även bakåt i tiden
 *     (då räknas lektionerna om trots att de varit — läraren bekräftar).
 *  2. Tid som försvinner från schemat (prao, friluftsdagar …) — samma panel som i Struktur
 *     men med dagar som varit tillåtna.
 *  3. NO+Tk-perioder — delämnenas start- och slutdatum i blocket, i stället för fyra lika delar.
 *
 * All beräkning sker i kernel (laggTillSkolarDagar, laggTillSchemaPeriod, sattNoPeriod, noPeriodFor).
 */
import { useState } from 'react';
import {
  laggTillSchemaPeriod, laggTillSkolarDagar, noPeriodFor, samlaSlots, sattNoPeriod, uppdateraSkolar,
  type Amne, type Skolar, type SkolarDag, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';
import { SchemaBortfall } from './App.js';

type Kor = (fn: () => Struktur, m: string) => void;

const TYP_TEXT: Record<SkolarDag['typ'], string> = { lov: 'Lov', heldag: 'Temadag / heldag', halvdag: 'Halvdag — skoldagen slutar tidigare' };
/** Del 205b · "Del av dag" (utvecklingssamtal 13–17, friluftsförmiddag …) läggs som tid som försvinner från schemat: från kl – till kl samma dag(ar). */
type DagTyp = SkolarDag['typ'] | 'del';

export function Lasaret({ s, skolarId, kor }: { s: Struktur; skolarId: string; kor: Kor }) {
  const la = s.skolar.find((x) => x.id === skolarId) ?? s.skolar[0];
  if (la === undefined) return <p className="muted small">Inget skolår än — skapa ett under Struktur & inställningar.</p>;
  return (
    <div className="st-lasaret" aria-label={`Läsåret ${la.namn}`}>
      <p className="small muted" style={{ margin: '0 0 6px' }}>{la.namn} · {la.start} – {la.slut}</p>
      <Dagar s={s} la={la} kor={kor} />
      <SchemaBortfall s={s} la={la} kor={kor} tillatGenomford />
      <NoPerioder s={s} la={la} kor={kor} />
    </div>
  );
}

/** Sektion 1 · lov, temadagar och halvdagar som datumintervall. */
function Dagar({ s, la, kor }: { s: Struktur; la: Skolar; kor: Kor }) {
  const idag = new Date().toISOString().slice(0, 10);
  const [oppen, setOppen] = useState(false);
  const [typ, setTyp] = useState<DagTyp>('lov');
  const [start, setStart] = useState('13:00');
  const [label, setLabel] = useState('');
  const [fran, setFran] = useState(idag);
  const [till, setTill] = useState(idag);
  const [slut, setSlut] = useState('12:00');
  const [visaGamla, setVisaGamla] = useState(false);
  void s;
  const dagar = la.dagar.filter((d) => visaGamla || d.datum >= idag);
  const gamla = la.dagar.length - la.dagar.filter((d) => d.datum >= idag).length;
  // Sammanhängande dagar med samma etikett visas som en rad
  const rader: Array<{ fran: string; till: string; n: number; d: SkolarDag }> = [];
  for (const d of dagar) {
    const sista = rader[rader.length - 1];
    if (sista !== undefined && sista.d.label === d.label && sista.d.typ === d.typ && d.datum <= nastaVardag(sista.till)) { sista.till = d.datum; sista.n++; }
    else rader.push({ fran: d.datum, till: d.datum, n: 1, d });
  }
  const spara = () => {
    const bakat = fran < idag;
    if (bakat && !window.confirm(`${label.trim()} börjar ${fran}, som redan varit. Lektioner på de dagarna utgår och planeringen räknas om — även genomförda lektioner. Fortsätt?`)) return;
    if (typ === 'del') {
      try {
        const r = laggTillSchemaPeriod(lasStruktur(), la.id, { fran, till, start, slut, label }, idag, true);
        const ber = r.berorda.filter((b) => b.pass > 0);
        kor(() => r.s, `${label.trim()} ${fran}${till !== fran ? ` – ${till}` : ''} kl. ${start}–${slut}: ${ber.length === 0 ? 'inga lektionspass berörs' : ber.map((b) => `${b.amne} ${b.pass} pass`).join(', ')} — visas under 🚫 Tid som försvinner från schemat.`);
        setLabel(''); setOppen(false);
      } catch (e) { kor(() => { throw e; }, ''); }
      return;
    }
    kor(() => laggTillSkolarDagar(lasStruktur(), la.id, { fran, till, typ, label, ...(typ === 'halvdag' ? { slut } : {}) }),
      `${TYP_TEXT[typ]} ${label.trim()} ${fran}${till !== fran ? ` – ${till}` : ''} tillagd${bakat ? ' (bakåt i tiden — lektionerna är omräknade)' : ' — berörda lektioner utgår ur planeringarna'}.`);
    setLabel(''); setOppen(false);
  };
  const taBort = (r: { fran: string; till: string; n: number; d: SkolarDag }) => {
    if (r.fran < idag && !window.confirm(`Ta bort ${r.d.label} (${r.fran}${r.till !== r.fran ? ` – ${r.till}` : ''}) som redan varit? Dagarna blir skoldagar igen och planeringen räknas om.`)) return;
    kor(() => { const nu = lasStruktur().skolar.find((x) => x.id === la.id)!; return uppdateraSkolar(lasStruktur(), la.id, { dagar: nu.dagar.filter((x) => !(x.datum >= r.fran && x.datum <= r.till && x.label === r.d.label)) }); },
      `${r.d.label} borttagen — ${r.n} dag${r.n === 1 ? '' : 'ar'} är skoldagar igen.`);
  };
  return (
    <div className="uppg-kort st-lasaret-sektion">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🏖 Lov, temadagar och halvdagar</h3>
        <small className="muted">dagar utan lektioner — läggs in som ett datumintervall, även bakåt i tiden</small>
        <button className="btn sec sm" aria-expanded={oppen} onClick={() => setOppen(!oppen)}>{oppen ? 'Stäng' : '➕ Lägg till dagar'}</button>
      </div>
      {oppen && (
        <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <select aria-label="Typ av dag" value={typ} onChange={(e) => setTyp(e.target.value as DagTyp)}>
            {(Object.keys(TYP_TEXT) as SkolarDag['typ'][]).map((k) => <option key={k} value={k}>{TYP_TEXT[k]}</option>)}
            <option value="del">Del av dag — från kl. till kl.</option>
          </select>
          <input aria-label="Dagens namn" placeholder={typ === 'lov' ? 't.ex. Höstlov' : typ === 'heldag' ? 't.ex. Temadag, Idrottsdag' : typ === 'halvdag' ? 't.ex. Julavslutning' : 't.ex. Utvecklingssamtal'} value={label} onChange={(e) => setLabel(e.target.value)} />
          <label className="small">från <input type="date" aria-label="Dagar från datum" value={fran} onChange={(e) => { if (e.target.value !== '') { setFran(e.target.value); if (till < e.target.value) setTill(e.target.value); } }} /></label>
          <label className="small">till <input type="date" aria-label="Dagar till datum" value={till} min={fran} onChange={(e) => { if (e.target.value !== '') setTill(e.target.value); }} /></label>
          {typ === 'halvdag' && <label className="small">skoldagen slutar kl. <input type="time" aria-label="Halvdagen slutar klockan" value={slut} onChange={(e) => setSlut(e.target.value)} /></label>}
          {typ === 'del' && <>
            <label className="small">från kl. <input type="time" aria-label="Del av dag från klockan" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="small">till kl. <input type="time" aria-label="Del av dag till klockan" value={slut} onChange={(e) => setSlut(e.target.value)} /></label>
          </>}
          <button className="btn sm" disabled={label.trim() === ''} onClick={spara}>Spara dagarna</button>
          {fran < idag && <span className="status warn small">⚠ bakåt i tiden — lektionerna räknas om</span>}
        </div>
      )}
      {oppen && (
        <p className="note" style={{ margin: '4px 0 0' }}>
          {typ === 'halvdag' ? 'Halvdag: passen som börjar efter sluttiden utgår, förmiddagen är kvar.' : typ === 'del' ? 'Del av dag: passen som överlappar klockslagen utgår (t.ex. utvecklingssamtal 13:00–17:00 tar eftermiddagens lektioner); resten av dagen är kvar. Hamnar i listan under 🚫 Tid som försvinner från schemat.' : 'Hela dagen utgår — inga lektioner.'}
        </p>
      )}
      {rader.length === 0 ? <p className="muted small" style={{ margin: '6px 0 0' }}>Inga {visaGamla ? '' : 'kommande '}lov eller temadagar inlagda.</p> : (
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead><tr><th>Datum</th><th>Typ</th><th>Etikett</th><th></th></tr></thead>
          <tbody>{rader.map((r) => (
            <tr key={`${r.fran}|${r.d.label}`} className={r.till < idag ? 'muted' : ''}>
              <td>{r.fran}{r.till !== r.fran ? ` – ${r.till}` : ''} {r.n > 1 && <small className="muted">({r.n} dagar)</small>}</td>
              <td>{r.d.typ === 'halvdag' ? `Halvdag — slutar ${r.d.slut}` : TYP_TEXT[r.d.typ]}</td>
              <td>{r.d.label}</td>
              <td><button className="icon-btn" title="Ta bort" aria-label={`Ta bort ${r.d.label} ${r.fran}`} onClick={() => taBort(r)}>🗑</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {gamla > 0 && <button className="v3-lank small" onClick={() => setVisaGamla(!visaGamla)}>{visaGamla ? 'Dölj dagar som varit' : `Visa ${gamla} dagar som varit`}</button>}
      <p className="note">Röda dagar hämtas ur almanackan. Kalendarium som text eller .ics klistras in under Struktur & inställningar → skolåret.</p>
    </div>
  );
}

function nastaVardag(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Sektion 3 · NO+Tk-perioder per klass och delämne. */
function NoPerioder({ s, la, kor }: { s: Struktur; la: Skolar; kor: Kor }) {
  const idag = new Date().toISOString().slice(0, 10);
  const klasser = s.klasser.filter((k) => s.tjanster.some((t) => t.id === k.tjanstId && t.skolarId === la.id)).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const grupper = klasser.flatMap((k) => [...new Set(s.amnen.filter((a) => a.klassId === k.id && a.noGrupp !== undefined).map((a) => a.noGrupp!))].map((g) => ({
    klass: k, amnen: s.amnen.filter((a) => a.klassId === k.id && a.noGrupp === g).sort((a, b) => (a.noOrder ?? 0) - (b.noOrder ?? 0)),
  })));
  if (grupper.length === 0) return null;
  return (
    <div className="uppg-kort st-lasaret-sektion">
      <div className="rad" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>🧪 NO+Tk-perioder</h3>
        <small className="muted">när varje delämne börjar och slutar på det gemensamma schemat — utan egna datum delas läsåret i fyra lika block</small>
      </div>
      {grupper.map(({ klass, amnen }) => (
        <table key={klass.id} className="tbl" style={{ marginTop: 8 }} aria-label={`NO+Tk-perioder ${klass.namn}`}>
          <thead><tr><th>{klass.namn}</th><th>Från</th><th>Till</th><th>Pass</th><th></th></tr></thead>
          <tbody>{amnen.map((a) => <NoPeriodRad key={`${a.id}|${a.noPeriod?.fran ?? ""}|${a.noPeriod?.till ?? ""}`} s={s} la={la} a={a} kor={kor} idag={idag} />)}</tbody>
        </table>
      ))}
      <p className="note">Ändras en period flyttas delämnets lektioner till de nya passen — även lektioner som varit. Perioderna får gärna överlappa om två delämnen går parallellt, men normalt följer de på varandra.</p>
    </div>
  );
}

function NoPeriodRad({ s, la, a, kor, idag }: { s: Struktur; la: Skolar; a: Amne; kor: Kor; idag: string }) {
  void s;
  const nu = noPeriodFor(la, a);
  const [fran, setFran] = useState(nu?.fran ?? la.start);
  const [till, setTill] = useState(nu?.till ?? la.slut);
  const pass = samlaSlots(la, a.schema, a.klassId).filter((x) => x.datum >= fran && x.datum <= till).length;
  const andrad = nu === null || fran !== nu.fran || till !== nu.till;
  const spara = () => {
    const bakat = fran < idag || (nu !== null && nu.fran < idag);
    if (bakat && !window.confirm(`${a.namn}s period rör datum som redan varit. Lektionerna läggs om efter den nya perioden — även genomförda. Fortsätt?`)) return;
    kor(() => sattNoPeriod(lasStruktur(), a.id, { fran, till }), `${a.namn}: period ${fran} – ${till} (${pass} pass).`);
  };
  return (
    <tr>
      <td><b>{a.namn}</b> {nu?.egen ? <span className="pillm">egen period</span> : <small className="muted">block {(a.noOrder ?? 0) + 1}</small>}</td>
      <td><input type="date" aria-label={`${a.namn} från datum`} value={fran} onChange={(e) => { if (e.target.value !== '') setFran(e.target.value); }} /></td>
      <td><input type="date" aria-label={`${a.namn} till datum`} value={till} min={fran} onChange={(e) => { if (e.target.value !== '') setTill(e.target.value); }} /></td>
      <td>{pass}</td>
      <td className="rad" style={{ gap: 4 }}>
        <button className="btn sm" disabled={!andrad || till < fran} onClick={spara}>Spara</button>
        {nu?.egen && <button className="btn sec sm" title="Tillbaka till fyra lika block" onClick={() => {
          if (!window.confirm(`Ta bort ${a.namn}s egna period och gå tillbaka till lika block? Lektionerna räknas om.`)) return;
          kor(() => sattNoPeriod(lasStruktur(), a.id, null), `${a.namn}: tillbaka till block ${(a.noOrder ?? 0) + 1}.`);
        }}>↺ Lika block</button>}
      </td>
    </tr>
  );
}
