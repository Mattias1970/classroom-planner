/**
 * 🎨 Rapportdesign — bygg en rapportlayout genom att dra block till ett A4-ark.
 *
 * Vänster: paletten (blocktyper) och listan över sparade mallar.
 * Mitten:  arket i skala, med drag, storleksändring och markering.
 * Höger:   egenskaper för markerat block, förhandsvisningselev, spara/synka/skriv ut.
 *
 * Mallen är kernel-data (Rapportmall). All layoutlogik ligger i kernel; den här
 * filen sköter bara pekare, tangenter och rendering av blocken med elevens data.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  A4, BLOCK_NAMN, BLOCK_STANDARD, RUTNAT, RUTNAT_VAL, TYPNAMN, andraStorlek, antalSidor, arDatablock, blockSida, dupliceraBlock,
  elevanalys, enkelRapport, flyttaBlock, flyttaFlera, fordelaBlock, fyllText, laggTillBlock, laggTillSida, linjeraBlock, nyMall, nyttId,
  ordnaBlock, ritordning, socrativeElevLank, sparaRapportmall, standardmall, studieguide, taBortBlock, taBortRapportmall, taBortSida,
  tillSida, tolkaRapportmall, uppdateraBlock, vaxBlock,
  type Block, type BlockTyp, type DashboardFilter, type Linjering, type Rapportmall, type Struktur,
} from '@planner/kernel';
import { lasStruktur } from './store.js';
import { hamtaFilerFranGitHub, konfigKomplett, lasGitHubConfig, sparaFilTillGitHub } from './github.js';

const PALETT: Array<{ grupp: string; typer: BlockTyp[] }> = [
  { grupp: 'Dekor', typer: ['platta', 'rubrik', 'text', 'bild', 'qr'] },
  { grupp: 'Texter', typer: ['sammanfattning', 'laget', 'rad', 'studieplan'] },
  { grupp: 'Siffror och grafer', typer: ['kpi', 'laxkurva', 'exitlax', 'delkapitel', 'narvaro', 'fragematris'] },
  { grupp: 'Begrepp', typer: ['begrepp-kvar', 'begrepp-vant'] },
];
const KALLOR = [
  ['socrative-laxforhor', 'Läxförhör'], ['socrative-exit', 'Exit tickets'], ['socrative-ovning', 'Övning'],
  ['magma', 'Magma'], ['digiexam', 'DigiExam'], ['helhet', 'Helhet'],
] as const;

type Elevdata = {
  analys: ReturnType<typeof elevanalys> | null;
  enkel: ReturnType<typeof enkelRapport> | null;
  guide: ReturnType<typeof studieguide> | null;
  namn: string; klass: string; amne: string;
};

/** Datablockens innehåll för vald elev — räknas en gång per elev/ämne. */
function anvandElevdata(s: Struktur, elevId: string, klassId: string, amneId: string): Elevdata {
  return useMemo(() => {
    const elev = s.elever.find((e) => e.id === elevId);
    const klass = s.klasser.find((k) => k.id === klassId);
    const amne = s.amnen.find((a) => a.id === amneId);
    if (elev === undefined || klass === undefined) return { analys: null, enkel: null, guide: null, namn: '', klass: '', amne: amne?.namn ?? '' };
    const f: DashboardFilter & { amneId?: string } = { klassId, ...(amneId !== '' ? { amneId } : {}) };
    let analys = null; let enkel = null; let guide = null;
    try { analys = elevanalys(s, elevId, f); } catch { /* ingen data */ }
    try { enkel = enkelRapport(s, elevId, f); } catch { /* ingen data */ }
    if (amneId !== '') { try { guide = studieguide(s, elevId, { klassId, amneId }, new Date().toISOString().slice(0, 10)); } catch { /* ingen bok */ } }
    return { analys, enkel, guide, namn: elev.namn, klass: klass.namn, amne: amne?.namn ?? '' };
  }, [s, elevId, klassId, amneId]);
}

const VECKODAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** '2026-08-20' → 'tor 20 aug' — samma form som i Rapporter. */
function datumMedDag(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  return `${VECKODAG[d.getUTCDay()]} ${d.getUTCDate()} ${MANAD[d.getUTCMonth()]}`;
}

// ── Enkla, utskriftsvänliga grafer (SVG i mm-skala) ──────────

function LinjeMm({ varden, etiketter, krav, farg = '#2f5aa8' }: { varden: number[]; etiketter: string[]; krav?: number; farg?: string }) {
  const w = 100; const h = 60; const ml = 12; const mb = 12; const mt = 6;
  const n = varden.length;
  const x = (i: number) => (n <= 1 ? ml + (w - ml - 4) / 2 : ml + (i / (n - 1)) * (w - ml - 4));
  const y = (p: number) => mt + (1 - p / 100) * (h - mt - mb);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" className="rd-graf">
      {[0, 50, 100].map((p) => <g key={p}><line x1={ml} x2={w - 4} y1={y(p)} y2={y(p)} stroke="#E4E8EF" strokeWidth={0.3} /><text x={ml - 1.5} y={y(p) + 1.2} fontSize={3} textAnchor="end" fill="#999">{p}</text></g>)}
      {krav !== undefined && <line x1={ml} x2={w - 4} y1={y(krav)} y2={y(krav)} stroke="#E65100" strokeDasharray="2 1.5" strokeWidth={0.4} />}
      {n > 0 && <path d={varden.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={farg} strokeWidth={0.9} />}
      {varden.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={1.2} fill={krav !== undefined && v < krav ? '#B71C1C' : farg} />
          <text x={x(i)} y={y(v) - 2.4} fontSize={3} textAnchor="middle" fill="#333" fontWeight={700}>{v}</text>
          <text x={x(i)} y={h - 3} fontSize={2.8} textAnchor="middle" fill="#666">{etiketter[i]}</text>
        </g>
      ))}
    </svg>
  );
}

function StaplarMm({ par }: { par: Array<{ kod: string; a: number; b: number }> }) {
  const w = 100; const h = 60; const ml = 12; const mb = 12; const mt = 6;
  const band = (w - ml - 4) / Math.max(1, par.length);
  const bar = Math.min(8, band * 0.3);
  const y = (p: number) => mt + (1 - p / 100) * (h - mt - mb);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" className="rd-graf">
      {[0, 50, 100].map((p) => <g key={p}><line x1={ml} x2={w - 4} y1={y(p)} y2={y(p)} stroke="#E4E8EF" strokeWidth={0.3} /><text x={ml - 1.5} y={y(p) + 1.2} fontSize={3} textAnchor="end" fill="#999">{p}</text></g>)}
      {par.map((p, i) => {
        const cx = ml + band * (i + 0.5); const farg = p.b >= p.a ? '#1B5E20' : '#B71C1C';
        return (
          <g key={p.kod}>
            <rect x={cx - bar - 0.5} y={y(p.a)} width={bar} height={h - mb - y(p.a)} fill="#C7CEDB" />
            <rect x={cx + 0.5} y={y(p.b)} width={bar} height={h - mb - y(p.b)} fill={farg} />
            <text x={cx} y={h - 3} fontSize={3} textAnchor="middle" fill="#333" fontWeight={700}>{p.kod}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Innehållet i ett block, givet elevdata. */
function BlockInnehall({ b, d, s }: { b: Block; d: Elevdata; s: Struktur }) {
  const st = b.stil ?? {};
  const textStil = { fontSize: `${st.storlek ?? 11}pt`, fontWeight: st.fet ? 700 : 400, color: st.textfarg ?? '#111' };
  const vars = { elev: d.namn, amne: d.amne, klass: d.klass, datum: new Date().toISOString().slice(0, 10) };
  const tom = (t: string) => <div className="rd-tom">{t}</div>;
  const rubrik = b.rubrik !== undefined && b.rubrik !== '' ? <div className="rd-blockrubrik">{b.rubrik}</div> : null;
  switch (b.typ) {
    case 'platta': return null;
    case 'rubrik': return <div style={textStil} className="rd-text">{fyllText(b.text ?? '', vars)}</div>;
    case 'text': return <div style={textStil} className="rd-text">{fyllText(b.text ?? '', vars)}</div>;
    case 'bild': return b.bild !== undefined ? <img src={b.bild} alt="" className="rd-bild" /> : tom('Välj bild i egenskaperna');
    case 'qr': {
      const rum = b.rum ?? '';
      const qr = rum !== '' ? (s.socrativeQr ?? {})[rum.toUpperCase()] ?? null : null;
      return (<>{rubrik}{qr !== null ? <img src={qr} alt={`QR ${rum}`} className="rd-bild" /> : tom(rum === '' ? 'Ange rum' : `Ingen QR sparad för ${rum}`)}<div className="rd-qrrum">{rum}</div></>);
    }
    case 'kpi': {
      const k = d.analys?.kallor.find((x) => x.kalla === b.kalla) ?? null;
      const namn = KALLOR.find(([id]) => id === b.kalla)?.[1] ?? '';
      const helhet = b.kalla === 'helhet' ? d.analys?.nu.procent ?? null : k?.snittProcent ?? null;
      return (<div className="rd-kpi"><small>{b.rubrik !== undefined && b.rubrik !== '' ? b.rubrik : namn}</small><b>{helhet ?? '—'} %</b>{k?.krav !== undefined && k.krav !== null && helhet !== null && <small className={helhet >= k.krav ? 'ok' : 'ej'}>{helhet >= k.krav ? 'Godkänt' : 'Ej godkänt'}</small>}</div>);
    }
    case 'sammanfattning': return (<>{rubrik}<div className="rd-text" style={{ fontSize: '11pt', fontWeight: 600 }}>{d.enkel?.rubrik ?? d.analys?.sammanfattning ?? '—'}</div>{d.enkel !== null && d.enkel.text.map((t, i) => <p key={i} className="rd-p">{t}</p>)}</>);
    case 'laget': return (<>{rubrik}{(d.analys?.laget ?? []).length === 0 ? tom('Inga resultat') : d.analys!.laget.map((r, i) => <div key={i} className={`rd-punkt ${r.ton}`}><b>{r.rubrik}</b><p>{r.text}</p></div>)}</>);
    case 'rad': return (<>{rubrik}{(d.analys?.rad ?? []).length === 0 ? tom('Inga råd') : d.analys!.rad.map((r, i) => <div key={i} className={`rd-punkt ${r.ton}`}><b>{r.rubrik}</b><p>{r.text}</p></div>)}</>);
    case 'laxkurva': {
      const l = d.enkel?.laxforhor ?? [];
      return (<div className="rd-grafram">{rubrik ?? <div className="rd-blockrubrik">Läxförhör</div>}{l.length === 0 ? tom('Inga läxförhör') : <div className="rd-grafyta"><LinjeMm varden={l.map((x) => x.procent)} etiketter={l.map((x) => x.datum.slice(5).replace('-', '/'))} krav={90} /></div>}</div>);
    }
    case 'exitlax': {
      const e = d.enkel?.exitTillLax ?? [];
      return (<div className="rd-grafram">{rubrik ?? <div className="rd-blockrubrik">Exit ticket → läxförhör</div>}{e.length === 0 ? tom('Inga par') : <div className="rd-grafyta"><StaplarMm par={e.map((x) => ({ kod: x.kod, a: x.exitProcent, b: x.laxProcent }))} /></div>}</div>);
    }
    case 'delkapitel': {
      const nu = d.analys?.nu.delkapitel ?? [];
      return (<div className="rd-grafram">{rubrik ?? <div className="rd-blockrubrik">Delkapitel just nu</div>}{nu.length === 0 ? tom('Inga delkapitel') : <div className="rd-grafyta"><StaplarMm par={nu.map((x) => ({ kod: x.kod, a: 0, b: x.procent ?? 0 }))} /></div>}</div>);
    }
    case 'narvaro': {
      const a = d.analys;
      return (<>{rubrik ?? <div className="rd-blockrubrik">Närvaro</div>}<div className="rd-kpi"><b>{a?.narvaroProcent ?? '—'} %</b><small>{a?.narvaroLektioner ?? 0} lektioner</small></div></>);
    }
    case 'fragematris': {
      const m = d.analys?.matris;
      if (m === undefined || m.fragor.length === 0) return (<>{rubrik}{tom('Ingen frågedata')}</>);
      // Exakt som 'Fråga för fråga' i Rapporter: Quiz | Datum | grupprad med quiznamn och
      // '4.1 · 12 frågor' | frågenummer | grön = rätt, röd = fel, ljusgrå = ej gjord, tom = ingick inte
      const kolumner = `auto auto repeat(${m.fragor.length}, minmax(0, 1fr))`;
      return (<>{rubrik ?? <div className="rd-blockrubrik">Fråga för fråga</div>}
        <div className="rd-fmtext">Grön ruta = rätt, röd = fel, tom = frågan ingick inte i det quizet.</div>
        <div className="rd-fm" style={{ gridTemplateColumns: kolumner }}>
          <div className="rd-fm-horn" style={{ gridColumn: '1 / span 2' }} />
          {m.grupper.map((g) => (
            <div key={g.kod} className="rd-fm-grupp" style={{ gridColumn: `${2 + g.fran} / span ${g.till - g.fran + 1}` }} title={g.ursprung}>
              <b>{g.ursprung}</b><small>{g.kod !== '—' ? `${g.kod} · ` : ''}{g.till - g.fran + 1} frågor</small>
            </div>
          ))}
          <div className="rd-fm-h">Quiz</div><div className="rd-fm-h">Datum</div>
          {m.fragor.map((fr) => <div key={fr.nr} className={`rd-fm-nr${m.grupper.some((g) => g.fran === fr.nr) ? ' gstart' : ''}`} title={fr.fraga}>{fr.nr}</div>)}
          {m.rader.map((r) => (
            <React.Fragment key={r.nyckel}>
              <div className="rd-fm-c rd-fm-quiz" title={`${r.prov} · ${TYPNAMN[r.kalla]}`}>{r.prov}</div>
              <div className="rd-fm-c rd-fm-datum">{datumMedDag(r.datum)}{r.tid !== undefined ? ` ${r.tid}` : ''}</div>
              {m.fragor.map((fr, i) => {
                const c = r.celler[i]; const e = r.elevCeller?.[i];
                const klass = c === null ? 'tom' : e === true ? 'ok' : e === false ? 'ej' : 'ejgjord';
                return <i key={fr.nr} className={`rd-fm-ruta ${klass}${m.grupper.some((g) => g.fran === fr.nr) ? ' gstart' : ''}`} title={c === null ? 'ingick inte' : e === true ? `Fråga ${fr.nr}: rätt` : e === false ? `Fråga ${fr.nr}: fel` : 'ej gjord'} />;
              })}
            </React.Fragment>
          ))}
        </div>
      </>);
    }
    case 'begrepp-kvar': case 'begrepp-vant': {
      const lista = b.typ === 'begrepp-kvar' ? d.enkel?.kvar ?? [] : d.enkel?.vant ?? [];
      return (<>{rubrik ?? <div className="rd-blockrubrik">{b.typ === 'begrepp-kvar' ? 'Kvar att lära' : 'Var fel, sitter nu'}</div>}{lista.length === 0 ? tom('Inga') : <ul className="rd-lista">{lista.map((x) => <li key={x.nr}><b>{x.begrepp ?? ''}</b>{x.begrepp !== undefined ? ' — ' : ''}{x.fraga}</li>)}</ul>}</>);
    }
    case 'studieplan': {
      const g = d.guide;
      return (<>{rubrik ?? <div className="rd-blockrubrik">{g?.rubrik ?? 'Studieplan'}</div>}{g === null ? tom('Kräver ämne med bok') : <ul className="rd-lista">{g.plan.map((p) => <li key={p.dag}><b>Dag {p.dag}{p.datum !== null ? ` · ${p.datum}` : ''}:</b> {p.delar.join(', ') || '—'} <small>({p.minuter} min)</small></li>)}</ul>}</>);
    }
    default: return null;
  }
}

/** Position och stil i mm via --mm, så samma block kan ritas i skärmskala och i verklig A4 vid utskrift. */
function blockStil(b: Block): React.CSSProperties {
  const st = b.stil ?? {};
  const mm = (v: number) => `calc(var(--mm) * ${v})`;
  return {
    left: mm(b.x), top: mm(b.y), width: mm(b.b), height: mm(b.h),
    background: st.bakgrund, border: st.kant !== undefined ? `${mm(0.3)} solid ${st.kant}` : undefined,
    borderRadius: mm(st.radie ?? 0), opacity: st.opacitet ?? 1, padding: mm(st.marginal ?? 2),
  };
}

/**
 * Automatisk höjd. Efter varje render mäts blocken: om innehållet är högre än
 * blocket växer blocket (kernel vaxBlock — raden följer med, allt under flyttas).
 * Höjden växer bara, aldrig krymper, så loopen konvergerar när allt får plats.
 * Grafer växer inte (de skalas); block med autoHojd=false lämnas i fred.
 */
const VAXER_INTE: BlockTyp[] = ['platta', 'bild', 'qr', 'laxkurva', 'exitlax', 'delkapitel', 'kpi', 'narvaro'];

function useAutoHojd(mall: Rapportmall | null, aktiv: boolean, skala: number, andra: (m: Rapportmall) => void) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  useLayoutEffect(() => {
    if (!aktiv || mall === null) return;
    let ny = mall; let andrat = false;
    for (const b of mall.block) {
      if (b.autoHojd === false || VAXER_INTE.includes(b.typ)) continue;
      const el = refs.current.get(b.id);
      if (el === undefined) continue;
      const behov = el.scrollHeight / skala; // mm
      if (behov > b.h + 1) { ny = vaxBlock(ny, b.id, behov + (b.stil?.marginal ?? 2) * 2); andrat = true; }
    }
    if (andrat) andra(ny);
  });
  return (id: string) => (el: HTMLDivElement | null) => { if (el === null) refs.current.delete(id); else refs.current.set(id, el); };
}

// ── Designern ────────────────────────────────────────────────

export function RapportdesignVy({ s, kor, meddela }: { s: Struktur; kor: (fn: () => Struktur, m: string) => void; meddela: (m: string) => void }) {
  const idag = new Date().toISOString().slice(0, 10);
  const mallar = s.rapportmallar ?? [];
  const [mallId, setMallId] = useState(mallar[0]?.id ?? '');
  const [utkast, setUtkast] = useState<Rapportmall | null>(null);
  const mall = utkast ?? mallar.find((m) => m.id === mallId) ?? null;
  // Markering: flera block med Shift-klick; 'vald' är det senast markerade (egenskaper visar det)
  const [markerade, setMarkerade] = useState<string[]>([]);
  const vald = markerade.length > 0 ? markerade[markerade.length - 1] : null;
  const setVald = (id: string | null, laggTillMark = false) =>
    setMarkerade((f) => (id === null ? [] : laggTillMark ? (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]) : [id]));
  const [sida, setSida] = useState(1);
  const [snappPa, setSnappPa] = useState(true);
  const [autoHojd, setAutoHojd] = useState(true);
  const [skala, setSkala] = useState(2.6); // px per mm
  const klasser = s.klasser;
  const [klassId, setKlassId] = useState(klasser[0]?.id ?? '');
  const amnen = s.amnen.filter((a) => a.klassId === klassId);
  const [amneId, setAmneId] = useState('');
  const elever = s.elever.filter((e) => e.klassId === klassId);
  const [elevId, setElevId] = useState(elever[0]?.id ?? '');
  const valtAmne = amneId !== '' ? amneId : amnen[0]?.id ?? '';
  const data = anvandElevdata(s, elevId, klassId, valtAmne);
  const [synk, setSynk] = useState('');
  const arkRef = useRef<HTMLDivElement>(null);
  const andrad = utkast !== null;

  const satt = (m: Rapportmall) => setUtkast(m);
  const matRef = useAutoHojd(mall, autoHojd, skala, satt);
  const nyMallKnapp = () => { const id = nyttId('mall'); satt(nyMall(id, 'Ny mall', idag)); setMallId(id); setVald(null); };
  const standard = () => { const id = nyttId('mall'); satt(standardmall(id, idag)); setMallId(id); setVald(null); };
  const spara = () => {
    if (mall === null) return;
    kor(() => sparaRapportmall(lasStruktur(), mall, idag), `Mallen "${mall.namn}" sparad.`);
    setUtkast(null);
  };
  const taBort = () => {
    if (mall === null || !window.confirm(`Ta bort mallen "${mall.namn}"?`)) return;
    kor(() => taBortRapportmall(lasStruktur(), mall.id), `Mallen "${mall.namn}" borttagen.`);
    setUtkast(null); setMallId(''); setVald(null);
  };
  const laggTill = (typ: BlockTyp) => {
    if (mall === null) return;
    const id = nyttId('blk');
    satt(laggTillBlock(mall, id, typ, 20 + (mall.block.length % 5) * 5, 20 + (mall.block.length % 5) * 5, idag, sida));
    setVald(id);
  };

  // Drag och storleksändring i mm via pekare
  const drag = useRef<{ id: string; lage: 'flytt' | 'storlek'; startX: number; startY: number; start: Rapportmall; ids: string[] } | null>(null);
  const pekareNed = (ev: React.PointerEvent, b: Block, lage: 'flytt' | 'storlek') => {
    ev.stopPropagation(); ev.preventDefault();
    if (mall === null) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const ids = markerade.includes(b.id) ? markerade : [b.id];
    if (!markerade.includes(b.id)) setVald(b.id, ev.shiftKey);
    drag.current = { id: b.id, lage, startX: ev.clientX, startY: ev.clientY, start: mall, ids: ev.shiftKey ? [...ids, b.id] : ids };
  };
  const pekareRor = (ev: React.PointerEvent) => {
    const d = drag.current; if (d === null) return;
    const dx = (ev.clientX - d.startX) / skala; const dy = (ev.clientY - d.startY) / skala;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const b0 = d.start.block.find((x) => x.id === d.id); if (b0 === undefined) return;
    if (d.lage === 'flytt') satt(flyttaFlera(d.start, d.ids, dx, dy, snappPa));
    else satt(andraStorlek(d.start, d.id, b0.b + dx, b0.h + dy, snappPa));
  };
  const pekareUpp = () => { drag.current = null; };

  // Tangentbord: piltangenter flyttar 5 mm, Delete tar bort, Ctrl+D duplicerar
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (mall === null) return;
      const mal = ev.target as HTMLElement | null;
      if (mal !== null && typeof mal.closest === 'function' && mal.closest('input,textarea,select') !== null) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') { setMarkerade(ritordning(mall, sida).map((b) => b.id)); ev.preventDefault(); return; }
      if (ev.key === 'Escape') { setMarkerade([]); return; }
      if (markerade.length === 0) return;
      const steg = ev.shiftKey ? 1 : (mall.rutnat ?? RUTNAT) || 1;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { let m2 = mall; for (const id of markerade) m2 = taBortBlock(m2, id); satt(m2); setMarkerade([]); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { satt(flyttaFlera(mall, markerade, -steg, 0, !ev.shiftKey)); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { satt(flyttaFlera(mall, markerade, steg, 0, !ev.shiftKey)); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { satt(flyttaFlera(mall, markerade, 0, -steg, !ev.shiftKey)); ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { satt(flyttaFlera(mall, markerade, 0, steg, !ev.shiftKey)); ev.preventDefault(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { let m2 = mall; for (const id of markerade) m2 = dupliceraBlock(m2, id, nyttId('blk')); satt(m2); ev.preventDefault(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mall, markerade, sida]);

  // GitHub: rapportmallar/<id>.json
  const synkaUpp = async () => {
    if (mall === null) return;
    const cfg = lasGitHubConfig();
    if (!konfigKomplett(cfg)) { meddela('Fyll i ☁ GitHub-inställningarna först.'); return; }
    setSynk('sparar…');
    try {
      await sparaFilTillGitHub(cfg, `rapportmallar/${mall.id}.json`, JSON.stringify(mall, null, 2));
      meddela(`Mallen "${mall.namn}" sparad i datarepot som rapportmallar/${mall.id}.json.`);
    } catch (e) { meddela(`Kunde inte spara till GitHub: ${e instanceof Error ? e.message : String(e)}`); }
    setSynk('');
  };
  const hamtaNer = async () => {
    const cfg = lasGitHubConfig();
    if (!konfigKomplett(cfg)) { meddela('Fyll i ☁ GitHub-inställningarna först.'); return; }
    setSynk('hämtar…');
    try {
      const filer = await hamtaFilerFranGitHub(cfg, /^rapportmallar\/.+\.json$/);
      let antal = 0;
      kor(() => {
        let st = lasStruktur();
        for (const fil of filer) { try { st = sparaRapportmall(st, tolkaRapportmall(fil.json), idag); antal += 1; } catch { /* hoppa över trasig fil */ } }
        return st;
      }, `${antal} mallar hämtade från datarepot.`);
    } catch (e) { meddela(`Kunde inte hämta: ${e instanceof Error ? e.message : String(e)}`); }
    setSynk('');
  };

  const valtBlock = mall?.block.find((b) => b.id === vald) ?? null;
  const uppd = (patch: Partial<Omit<Block, 'id'>>) => { if (mall !== null && vald !== null) satt(uppdateraBlock(mall, vald, patch)); };

  return (
    <div className="rd">
      {/* ── Vänster: palett + mallar ── */}
      <aside className="rd-palett no-print">
        <h3>🎨 Rapportdesign</h3>
        <div className="rd-sektion">
          <div className="rd-rubrik">Mallar</div>
          <select aria-label="Rapportmall" value={mallId} onChange={(e) => { setMallId(e.target.value); setUtkast(null); setVald(null); }}>
            <option value="">— välj mall —</option>
            {mallar.map((m) => <option key={m.id} value={m.id}>{m.namn}</option>)}
          </select>
          <div className="rad" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button className="btn sec sm" onClick={nyMallKnapp}>➕ Ny</button>
            <button className="btn sec sm" onClick={standard}>✨ Startmall</button>
            {mall !== null && <button className="btn sec sm" onClick={taBort}>🗑</button>}
          </div>
          <div className="rad" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn sec sm" disabled={synk !== '' || mall === null} onClick={() => void synkaUpp()}>☁ Spara i datarepot</button>
            <button className="btn sec sm" disabled={synk !== ''} onClick={() => void hamtaNer()}>☁ Hämta mallar</button>
            {synk !== '' && <small className="muted">{synk}</small>}
          </div>
        </div>
        {mall !== null && (
          <div className="rd-sektion">
            <div className="rd-rubrik">Block <small className="muted">klicka för att lägga till</small></div>
            {PALETT.map((g) => (
              <div key={g.grupp} className="rd-grupp">
                <small className="muted">{g.grupp}</small>
                {g.typer.map((t) => (
                  <button key={t} className="rd-palettknapp" onClick={() => laggTill(t)} title={`${BLOCK_STANDARD[t].b}×${BLOCK_STANDARD[t].h} mm`}>{BLOCK_NAMN[t]}</button>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Mitten: arket ── */}
      <main className="rd-mitt">
        {mall === null ? (
          <div className="rd-tomark"><p>Välj en mall till vänster, eller skapa en ny.</p><button className="btn" onClick={standard}>✨ Börja med startmallen</button></div>
        ) : (<>
          <div className="rad rd-verktyg no-print">
            <input className="rd-mallnamn" aria-label="Mallens namn" value={mall.namn} onChange={(e) => satt({ ...mall, namn: e.target.value })} />
            <span className="spacer" />
            <label className="small">Zoom <input type="range" min={1.5} max={4} step={0.1} value={skala} onChange={(e) => setSkala(Number(e.target.value))} /></label>
            <button className="btn sec sm" onClick={() => window.print()}>🖨 Skriv ut / PDF</button>
            <button className="btn" disabled={!andrad} onClick={spara}>💾 Spara mall{andrad ? ' *' : ''}</button>
          </div>
          <div className="rad rd-verktyg2 no-print">
            {/* Sidor */}
            <div className="rd-sidflikar" role="tablist" aria-label="Sidor">
              {Array.from({ length: antalSidor(mall) }, (_, i) => i + 1).map((n) => (
                <button key={n} role="tab" aria-selected={sida === n} className={`rd-sidflik${sida === n ? ' act' : ''}`}
                  onClick={() => { setSida(n); setMarkerade([]); }}>Sida {n} <small>{ritordning(mall, n).length}</small></button>
              ))}
              <button className="rd-sidflik" title="Lägg till sida" onClick={() => { satt(laggTillSida(mall)); setSida(antalSidor(mall) + 1); setMarkerade([]); }}>＋</button>
              {antalSidor(mall) > 1 && <button className="rd-sidflik" title={`Ta bort sida ${sida} och dess block`}
                onClick={() => { if (window.confirm(`Ta bort sida ${sida}? Blocken på sidan försvinner.`)) { satt(taBortSida(mall, sida)); setSida(Math.max(1, sida - 1)); setMarkerade([]); } }}>🗑</button>}
            </div>
            <span className="rd-sep" />
            {/* Rutnät / snapp */}
            <label className="small">Rutnät{' '}
              <select aria-label="Rutnät" value={mall.rutnat ?? RUTNAT} onChange={(e) => satt({ ...mall, rutnat: Number(e.target.value) })}>
                {RUTNAT_VAL.map((r) => <option key={r} value={r}>{r === 0 ? 'fritt' : `${r} mm`}</option>)}
              </select></label>
            <label className="small"><input type="checkbox" checked={snappPa} onChange={(e) => setSnappPa(e.target.checked)} /> snapp</label>
            <label className="small" title="Block vars innehåll inte får plats växer; block på samma rad följer med och allt under flyttas ned"><input type="checkbox" checked={autoHojd} onChange={(e) => setAutoHojd(e.target.checked)} /> auto-höjd</label>
            <span className="rd-sep" />
            {/* Linjering — kräver minst två markerade */}
            <div className="rd-linjera" aria-label="Linjera markerade">
              {([['vanster', '⫷', 'Vänsterkanter'], ['hcenter', '⫶', 'Mitt vågrätt'], ['hoger', '⫸', 'Högerkanter'],
                ['topp', '⫠', 'Överkanter'], ['vcenter', '⫲', 'Mitt lodrätt'], ['botten', '⫡', 'Underkanter']] as Array<[Linjering, string, string]>).map(([l, ikon, titel]) => (
                <button key={l} className="rd-linj" title={`${titel} (kräver 2+ markerade)`} aria-label={titel} disabled={markerade.length < 2} onClick={() => satt(linjeraBlock(mall, markerade, l))}>{ikon}</button>
              ))}
              <button className="rd-linj" title="Fördela jämnt vågrätt (3+)" aria-label="Fördela vågrätt" disabled={markerade.length < 3} onClick={() => satt(fordelaBlock(mall, markerade, 'vagratt'))}>↔</button>
              <button className="rd-linj" title="Fördela jämnt lodrätt (3+)" aria-label="Fördela lodrätt" disabled={markerade.length < 3} onClick={() => satt(fordelaBlock(mall, markerade, 'lodratt'))}>↕</button>
            </div>
            {markerade.length > 0 && <small className="muted">{markerade.length} markerade · Shift+klick lägger till · Ctrl+A alla på sidan</small>}
          </div>
          <div className="rd-arkram" onPointerMove={pekareRor} onPointerUp={pekareUpp} onPointerCancel={pekareUpp}>
            <div ref={arkRef} className="rd-ark" style={{ width: A4.bredd * skala, height: A4.hojd * skala, ['--mm' as string]: `${skala}px` }}
              onPointerDown={() => setMarkerade([])}>
              {ritordning(mall, sida).map((b) => {
                const ar = markerade.includes(b.id);
                return (
                  <div key={b.id} ref={matRef(b.id)} className={`rd-block ${b.typ}${ar ? ' vald' : ''}`}
                    style={blockStil(b)}
                    onPointerDown={(ev) => pekareNed(ev, b, 'flytt')}>
                    <BlockInnehall b={b} d={data} s={s} />
                    {ar && vald === b.id && <div className="rd-handtag no-print" onPointerDown={(ev) => pekareNed(ev, b, 'storlek')} title="Dra för att ändra storlek" />}
                    {ar && vald === b.id && <div className="rd-etikett no-print">{BLOCK_NAMN[b.typ]} · {b.b}×{b.h} mm</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </>)}
      </main>

      {/* ── Höger: egenskaper ── */}
      <aside className="rd-egenskaper no-print">
        <div className="rd-sektion">
          <div className="rd-rubrik">Förhandsvisa med</div>
          <label>Klass <select aria-label="Klass för förhandsvisning" value={klassId} onChange={(e) => { setKlassId(e.target.value); setAmneId(''); setElevId(''); }}>{klasser.map((k) => <option key={k.id} value={k.id}>{k.namn}</option>)}</select></label>
          <label>Ämne <select aria-label="Ämne för förhandsvisning" value={valtAmne} onChange={(e) => setAmneId(e.target.value)}>{amnen.map((a) => <option key={a.id} value={a.id}>{a.namn}</option>)}</select></label>
          <label>Elev <select aria-label="Elev för förhandsvisning" value={elevId} onChange={(e) => setElevId(e.target.value)}><option value="">—</option>{elever.map((e) => <option key={e.id} value={e.id}>{e.namn}</option>)}</select></label>
        </div>
        {valtBlock === null ? (
          <div className="rd-sektion"><p className="small muted">Markera ett block på arket för att ändra det. Piltangenter flyttar, Delete tar bort, Ctrl+D duplicerar.</p></div>
        ) : (
          <div className="rd-sektion">
            <div className="rd-rubrik">{BLOCK_NAMN[valtBlock.typ]}</div>
            <div className="rd-fyra">
              <label>X <input type="number" step={RUTNAT} value={valtBlock.x} onChange={(e) => satt(flyttaBlock(mall!, vald!, Number(e.target.value), valtBlock.y))} /></label>
              <label>Y <input type="number" step={RUTNAT} value={valtBlock.y} onChange={(e) => satt(flyttaBlock(mall!, vald!, valtBlock.x, Number(e.target.value)))} /></label>
              <label>B <input type="number" step={RUTNAT} value={valtBlock.b} onChange={(e) => satt(andraStorlek(mall!, vald!, Number(e.target.value), valtBlock.h))} /></label>
              <label>H <input type="number" step={RUTNAT} value={valtBlock.h} onChange={(e) => satt(andraStorlek(mall!, vald!, valtBlock.b, Number(e.target.value)))} /></label>
            </div>
            {(valtBlock.typ === 'rubrik' || valtBlock.typ === 'text') && (
              <label>Text <textarea aria-label="Blockets text" rows={3} value={valtBlock.text ?? ''} onChange={(e) => uppd({ text: e.target.value })} />
                <small className="muted">{'{elev} {amne} {klass} {datum}'} byts ut</small></label>
            )}
            {arDatablock(valtBlock.typ) && <label>Rubrik <input aria-label="Blockets rubrik" value={valtBlock.rubrik ?? ''} placeholder="(standard)" onChange={(e) => uppd({ rubrik: e.target.value })} /></label>}
            {!VAXER_INTE.includes(valtBlock.typ) && <label className="rd-check"><input type="checkbox" checked={valtBlock.autoHojd !== false} onChange={(e) => uppd({ autoHojd: e.target.checked })} /> Växer med innehållet</label>}
            {valtBlock.typ === 'kpi' && (
              <label>Källa <select aria-label="KPI-källa" value={valtBlock.kalla ?? 'helhet'} onChange={(e) => uppd({ kalla: e.target.value as Block['kalla'] })}>{KALLOR.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
            )}
            {valtBlock.typ === 'qr' && <label>Socrative-rum <input aria-label="QR-rum" value={valtBlock.rum ?? ''} onChange={(e) => uppd({ rum: e.target.value })} placeholder="Biologi41" /></label>}
            {valtBlock.typ === 'bild' && (
              <label className="btn sec sm file-btn">📂 Välj bild
                <input type="file" accept="image/*" hidden onChange={(e) => {
                  const fil = e.target.files?.[0]; if (fil === undefined) return;
                  const las = new FileReader(); las.onload = () => uppd({ bild: String(las.result) }); las.readAsDataURL(fil);
                }} />
              </label>
            )}
            <div className="rd-fyra">
              <label>Bakgrund <input type="color" value={valtBlock.stil?.bakgrund ?? '#ffffff'} onChange={(e) => uppd({ stil: { bakgrund: e.target.value } })} /></label>
              <label>Kant <input type="color" value={valtBlock.stil?.kant ?? '#ffffff'} onChange={(e) => uppd({ stil: { kant: e.target.value } })} /></label>
              <label>Radie <input type="number" min={0} max={20} value={valtBlock.stil?.radie ?? 0} onChange={(e) => uppd({ stil: { radie: Number(e.target.value) } })} /></label>
              <label>Opacitet <input type="number" min={0} max={1} step={0.1} value={valtBlock.stil?.opacitet ?? 1} onChange={(e) => uppd({ stil: { opacitet: Number(e.target.value) } })} /></label>
              {(valtBlock.typ === 'rubrik' || valtBlock.typ === 'text') && (<>
                <label>Storlek <input type="number" min={6} max={48} value={valtBlock.stil?.storlek ?? 11} onChange={(e) => uppd({ stil: { storlek: Number(e.target.value) } })} /></label>
                <label>Färg <input type="color" value={valtBlock.stil?.textfarg ?? '#111111'} onChange={(e) => uppd({ stil: { textfarg: e.target.value } })} /></label>
                <label className="rd-check"><input type="checkbox" checked={valtBlock.stil?.fet ?? false} onChange={(e) => uppd({ stil: { fet: e.target.checked } })} /> Fet</label>
              </>)}
            </div>
            {antalSidor(mall!) > 1 && (
              <label>Sida <select aria-label="Blockets sida" value={blockSida(valtBlock)} onChange={(e) => { satt(tillSida(mall!, markerade, Number(e.target.value))); setSida(Number(e.target.value)); }}>
                {Array.from({ length: antalSidor(mall!) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Sida {n}</option>)}
              </select></label>
            )}
            <div className="rad" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              <button className="btn sec sm" onClick={() => satt(ordnaBlock(mall!, vald!, 'fram'))}>⬆ Främst</button>
              <button className="btn sec sm" onClick={() => satt(ordnaBlock(mall!, vald!, 'bak'))}>⬇ Bakerst</button>
              <button className="btn sec sm" onClick={() => satt(dupliceraBlock(mall!, vald!, nyttId('blk')))}>⧉ Duplicera</button>
              <button className="btn sec sm" onClick={() => { let m2 = mall!; for (const id of markerade) m2 = taBortBlock(m2, id); satt(m2); setMarkerade([]); }}>🗑 Ta bort{markerade.length > 1 ? ` (${markerade.length})` : ''}</button>
              <button className="btn sec sm" onClick={() => uppd({ stil: { bakgrund: undefined, kant: undefined } })} title="Ta bort bakgrund och kant">◻ Rensa stil</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Renderar en mall för en elev (används av Rapporter → Skriv ut med mall). */
export function MallRendering({ s, mall: malln, elevId, klassId, amneId }: { s: Struktur; mall: Rapportmall; elevId: string; klassId: string; amneId: string }) {
  const data = anvandElevdata(s, elevId, klassId, amneId);
  const skala = 3;
  // Utskriften får en egen kopia som växer efter elevens innehåll — mallen ändras inte
  const [mall, setMall] = useState(malln);
  useEffect(() => { setMall(malln); }, [malln, elevId]);
  const matRef = useAutoHojd(mall, true, skala, setMall);
  return (
    <div className="rd-sidor">
      {Array.from({ length: antalSidor(mall) }, (_, i) => i + 1).map((n) => (
        <div key={n} className="rd-ark rd-utskrift" style={{ width: A4.bredd * skala, height: A4.hojd * skala, ['--mm' as string]: `${skala}px` }}>
          {ritordning(mall, n).map((b) => (
            <div key={b.id} ref={matRef(b.id)} className={`rd-block ${b.typ}`} style={blockStil(b)}>
              <BlockInnehall b={b} d={data} s={s} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export { socrativeElevLank };
