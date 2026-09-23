/**
 * Del 141 · StWidget — en fällbar dashboard-ruta med miniatyr.
 *
 * Alla grafer och tabeller i SuperTeach ligger i samma slags ruta: rubrikraden
 * är alltid synlig och klickbar; hopfälld visar rutan en liten "bild" (sparkline,
 * nyckeltal eller färgremsa) som sammanfattar innehållet, utfälld visas allt.
 * Vilka rutor som är öppna sparas per webbläsare (localStorage) så att lärarens
 * upplägg består mellan besöken.
 */
import React, { useState } from 'react';

const NYCKEL = 'classroom-planner.studio.st-widgets';

function lasOppna(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(NYCKEL);
    if (raw === null) return {};
    const v = JSON.parse(raw) as unknown;
    return v !== null && typeof v === 'object' ? (v as Record<string, boolean>) : {};
  } catch { return {}; }
}

function sparaOppna(v: Record<string, boolean>): void {
  try { window.localStorage.setItem(NYCKEL, JSON.stringify(v)); } catch { /* minnesfallback räcker */ }
}

/** Öppet/stängt per widget-id med persistens. `standard` gäller tills läraren själv fällt. */
export function useWidgetLage(standard: Record<string, boolean>) {
  const [oppna, setOppna] = useState<Record<string, boolean>>(() => lasOppna());
  const arOppen = (id: string) => oppna[id] ?? standard[id] ?? false;
  const satt = (id: string, oppen: boolean) => setOppna((f) => {
    if ((f[id] ?? standard[id] ?? false) === oppen) return f;
    const n = { ...f, [id]: oppen };
    sparaOppna(n);
    return n;
  });
  return { arOppen, satt };
}

export interface StWidgetProps {
  id: string;
  ikon: string;
  rubrik: React.ReactNode;
  /** ℹ-knapp eller annat direkt efter rubriken. */
  info?: React.ReactNode;
  /** Förklarande underrad (visas alltid). */
  under?: React.ReactNode;
  /** Miniatyren som visas när rutan är hopfälld — en sparkline, ett nyckeltal, en färgremsa. */
  mini?: React.ReactNode;
  oppen: boolean;
  onToggle: (oppen: boolean) => void;
  /** Markering (t.ex. efter hopp från ett KPI-kort). */
  lyst?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function StWidget({ id, ikon, rubrik, info, under, mini, oppen, onToggle, lyst, className, children }: StWidgetProps) {
  return (
    <details className={`uppg-kort st-widget st-fall${lyst === true ? ' lyst' : ''}${className !== undefined ? ` ${className}` : ''}`} id={id}
      open={oppen} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary title={oppen ? 'Fäll ihop' : 'Fäll ut'}>
        <b><span className="st-widget-ikon" aria-hidden="true">{ikon}</span> {rubrik}</b>{info}
        {under !== undefined && <small className="muted st-widget-under">{under}</small>}
        {mini !== undefined && <span className="st-mini" aria-hidden="true">{mini}</span>}
      </summary>
      <div className="st-widget-kropp">{children}</div>
    </details>
  );
}

/** Miniatyr: ett nyckeltal med etikett. */
export function MiniTal({ tal, etikett, farg }: { tal: React.ReactNode; etikett?: string; farg?: string }) {
  return <span className="st-mini-tal" style={farg !== undefined ? { color: farg } : undefined}><b>{tal}</b>{etikett !== undefined && <small>{etikett}</small>}</span>;
}

/** Miniatyr: en rad färgade rutor (t.ex. andel rätt per fråga). */
export function MiniRemsa({ farger, titel }: { farger: string[]; titel?: string }) {
  return <span className="st-mini-remsa" title={titel}>{farger.slice(0, 40).map((f, i) => <i key={i} style={{ background: f }} />)}</span>;
}
