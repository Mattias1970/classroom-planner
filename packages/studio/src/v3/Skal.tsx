/**
 * v3 · Skalet — layouten från designbilderna.
 *
 *   ┌────────────┬──────────────────────────────────────────────┐
 *   │ sidopanel  │ topprad: filter (klass · läsår · ämne · period) · sök · 🔔 · lärare │
 *   │ Översikt   ├──────────────────────────────────────────────┤
 *   │ Planering  │ innehåll (KPI-kort, kort, tabeller)   [detaljpanel] │
 *   │ Matematik… │                                              │
 *   │ …          │                                              │
 *   │ skola      │                                              │
 *   └────────────┴──────────────────────────────────────────────┘
 *
 * Skalet äger inga data — det renderar vad App ger det. Vyerna från v2 ligger
 * kvar oförändrade som innehåll, så ingen funktion försvinner.
 */
import React, { useEffect, useState } from 'react';
import type { Struktur } from '@planner/kernel';
import { Ikon, amnesIkon } from './ikoner.js';

export type V3Vy =
  | { typ: 'oversikt' } | { typ: 'planering' } | { typ: 'amne'; amneNamn: string }
  | { typ: 'classroom' } | { typ: 'resultat' } | { typ: 'elever' } | { typ: 'foraldrakontakt' } | { typ: 'kalender' } | { typ: 'datarepo' };

export function vyNyckel(v: V3Vy): string { return v.typ === 'amne' ? `amne:${v.amneNamn}` : v.typ; }

/** Globala filter i toppraden. Vyerna som har egna väljare fortsätter med dem; de nya vyerna läser härifrån. */
export interface Filter { klassId: string; skolarId: string; amneId: string; periodText: string; sok: string }

export function Skal({ s, vy, setVy, filter, setFilter, notiser, larareNamn, verktyg, detalj, children }: {
  s: Struktur; vy: V3Vy; setVy: (v: V3Vy) => void;
  filter: Filter; setFilter: (f: Filter) => void;
  /** Antal varningar (t.ex. förväntade prov utan resultat) — visas på klockan. */
  notiser: Array<{ text: string; onKlick?: () => void }>;
  larareNamn: string;
  /** Knappar i användarmenyn: Ångra, tema, GitHub, Backup, Återställ. */
  verktyg: React.ReactNode;
  /** Valfri detaljpanel till höger. */
  detalj?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [meny, setMeny] = useState<'ingen' | 'notiser' | 'anvandare'>('ingen');
  useEffect(() => {
    if (meny === 'ingen') return;
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMeny('ingen'); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [meny]);

  // Ämnesposter i sidopanelen: unika ämnesnamn i vald klass (annars alla), i designens ordning
  const klassAmnen = s.amnen.filter((a) => filter.klassId === '' || a.klassId === filter.klassId);
  const ORDNING = ['matematik', 'kemi', 'biologi', 'fysik', 'teknik'];
  const amnesNamn = [...new Set((klassAmnen.length > 0 ? klassAmnen : s.amnen).map((a) => a.namn))]
    .sort((a, b) => {
      const ia = ORDNING.findIndex((o) => a.toLowerCase().includes(o)); const ib = ORDNING.findIndex((o) => b.toLowerCase().includes(o));
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, 'sv');
    });

  const klasser = s.klasser;
  const skolar = s.skolar;
  const amnenIKlass = s.amnen.filter((a) => a.klassId === filter.klassId);
  const skolaNamn = s.tjanster[0]?.namn ?? 'Skolan';
  const ar = (v: V3Vy) => vyNyckel(v) === vyNyckel(vy);

  const Nav = ({ v, ikon: I, text }: { v: V3Vy; ikon: (p: { storlek?: number }) => React.JSX.Element; text: string }) => (
    <button className={`v3-nav${ar(v) ? ' act' : ''}`} onClick={() => setVy(v)} aria-current={ar(v) ? 'page' : undefined}>
      <I storlek={20} /><span>{text}</span>
    </button>
  );

  return (
    <div className="v3">
      <aside className="v3-sida">
        <div className="v3-logo"><Ikon.logo storlek={44} /></div>
        <nav aria-label="Huvudmeny">
          <Nav v={{ typ: 'oversikt' }} ikon={Ikon.hus} text="Översikt" />
          <Nav v={{ typ: 'planering' }} ikon={Ikon.kalender} text="Planering" />
          {amnesNamn.map((namn) => <Nav key={namn} v={{ typ: 'amne', amneNamn: namn }} ikon={amnesIkon(namn)} text={namn} />)}
          <Nav v={{ typ: 'classroom' }} ikon={Ikon.klassrum} text="Classroom" />
          <Nav v={{ typ: 'resultat' }} ikon={Ikon.staplar} text="Resultat" />
          <Nav v={{ typ: 'elever' }} ikon={Ikon.elever} text="Elever" />
          <Nav v={{ typ: 'foraldrakontakt' }} ikon={Ikon.kuvert} text="Föräldrakontakt" />
          <Nav v={{ typ: 'datarepo' }} ikon={Ikon.klassrum} text="Datarepo" />
        </nav>
        <div className="v3-sida-fot"><Ikon.skola storlek={18} /><span>{skolaNamn}</span></div>
      </aside>

      <div className="v3-huvud">
        <header className="v3-topp">
          <label className="v3-filter"><span className="v3-filter-ikon"><Ikon.elever storlek={16} /></span>Klass:
            <select aria-label="Filter klass" value={filter.klassId} onChange={(e) => setFilter({ ...filter, klassId: e.target.value, amneId: '' })}>
              <option value="">alla</option>{klasser.map((k) => <option key={k.id} value={k.id}>{k.namn}</option>)}
            </select></label>
          <label className="v3-filter"><span className="v3-filter-ikon"><Ikon.kalender storlek={16} /></span>Läsår:
            <select aria-label="Filter läsår" value={filter.skolarId} onChange={(e) => setFilter({ ...filter, skolarId: e.target.value })}>
              {skolar.length === 0 && <option value="">—</option>}{skolar.map((x) => <option key={x.id} value={x.id}>{x.namn.replace(/^Läsåret\s+/i, '')}</option>)}
            </select></label>
          <label className="v3-filter"><span className="v3-filter-ikon"><Ikon.bok storlek={16} /></span>Ämne:
            <select aria-label="Filter ämne" value={filter.amneId} onChange={(e) => setFilter({ ...filter, amneId: e.target.value })}>
              <option value="">alla</option>{(filter.klassId === '' ? s.amnen : amnenIKlass).map((a) => <option key={a.id} value={a.id}>{a.namn}</option>)}
            </select></label>
          <label className="v3-filter"><span className="v3-filter-ikon"><Ikon.kalender storlek={16} /></span>Period:
            <input aria-label="Filter period" placeholder="v.34–42" value={filter.periodText} onChange={(e) => setFilter({ ...filter, periodText: e.target.value })} /></label>
          <span className="spacer" />
          <label className="v3-sok"><Ikon.sok storlek={16} /><input aria-label="Filter sök" placeholder="Sök elev, delkapitel, moment…" value={filter.sok} onChange={(e) => setFilter({ ...filter, sok: e.target.value })} /></label>
          <div className="v3-meny-anker">
            <button className="v3-ikonknapp" aria-label={`Notiser (${notiser.length})`} onClick={() => setMeny(meny === 'notiser' ? 'ingen' : 'notiser')}>
              <Ikon.klocka storlek={20} />{notiser.length > 0 && <span className="v3-badge">{notiser.length}</span>}
            </button>
            {meny === 'notiser' && (
              <div className="v3-meny" role="dialog" aria-label="Notiser">
                {notiser.length === 0 ? <p className="muted small">Inga notiser.</p> : notiser.map((n, i) => (
                  <button key={i} className="v3-meny-rad" onClick={() => { setMeny('ingen'); n.onKlick?.(); }}><Ikon.varning storlek={16} /><span>{n.text}</span></button>
                ))}
              </div>
            )}
          </div>
          <div className="v3-meny-anker">
            <button className="v3-anvandare" onClick={() => setMeny(meny === 'anvandare' ? 'ingen' : 'anvandare')} aria-haspopup="menu" aria-expanded={meny === 'anvandare'}>
              <span className="v3-avatar" aria-hidden>{larareNamn.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase() || 'L'}</span>
              <span className="v3-anvandare-text"><b>{larareNamn || 'Lärare'}</b><small>Lärare</small></span>
              <Ikon.pil storlek={16} />
            </button>
            {meny === 'anvandare' && <div className="v3-meny v3-verktyg" role="menu" onClick={() => setMeny('ingen')}>{verktyg}</div>}
          </div>
        </header>

        <div className={`v3-innehall${detalj !== undefined ? ' med-detalj' : ''}`}>
          <main className="v3-main">{children}</main>
          {detalj !== undefined && <aside className="v3-detalj">{detalj}</aside>}
        </div>
      </div>
    </div>
  );
}

/** KPI-kort som i designen: ikon, siffra, etikett och valfri underrad/badge. */
export function Kpi({ ikon: I, varde, rubrik, under, badge, ton = 'bla', onKlick }: {
  ikon: (p: { storlek?: number }) => React.JSX.Element; varde: React.ReactNode; rubrik: string; under?: React.ReactNode;
  badge?: { text: string; ton: 'gron' | 'bla' | 'gul' | 'rod' }; ton?: 'bla' | 'gron' | 'lila' | 'orange' | 'rod' | 'gul'; onKlick?: () => void;
}) {
  const Tag = onKlick !== undefined ? 'button' : 'div';
  return (
    <Tag className={`v3-kpi ton-${ton}${onKlick !== undefined ? ' klick' : ''}`} onClick={onKlick}>
      <span className="v3-kpi-ikon"><I storlek={22} /></span>
      <span className="v3-kpi-text">
        <small>{rubrik}</small>
        <b>{varde}</b>
        {under !== undefined && <span className="v3-kpi-under">{under}</span>}
        {badge !== undefined && <span className={`v3-badge-text ${badge.ton}`}>{badge.text}</span>}
      </span>
    </Tag>
  );
}

/** Kort med rubrik, som i designen. */
export function Kort({ rubrik, under, hoger, children, className }: { rubrik: React.ReactNode; under?: React.ReactNode; hoger?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`v3-kort${className !== undefined ? ` ${className}` : ''}`}>
      <div className="v3-kort-huvud"><div><b>{rubrik}</b>{under !== undefined && <small className="muted"> {under}</small>}</div>{hoger !== undefined && <div>{hoger}</div>}</div>
      {children}
    </section>
  );
}

/** "Data saknas"-platshållare, som designen kräver för varje modul. */
export function DataSaknas({ text, atgard }: { text: string; atgard?: { text: string; onKlick: () => void } }) {
  return (
    <div className="v3-saknas">
      <Ikon.staplar storlek={28} />
      <div><b>Data saknas</b><p>{text}</p></div>
      {atgard !== undefined && <button className="v3-knapp sek" onClick={atgard.onKlick}>{atgard.text}</button>}
    </div>
  );
}
