/**
 * v3 · Ikoner — tunna linjeikoner som i designbilderna (24 × 24, stroke 1.8).
 * Alla tar färg från `currentColor`, så samma ikon fungerar i sidopanelen
 * (vit på marinblått) och i korten (blå på vitt).
 */
import React from 'react';

type IkonProps = { storlek?: number; className?: string; titel?: string };

function Bas({ storlek = 22, className, titel, children }: IkonProps & { children: React.ReactNode }) {
  return (
    <svg className={className} width={storlek} height={storlek} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={titel === undefined} role={titel !== undefined ? 'img' : undefined}>
      {titel !== undefined && <title>{titel}</title>}
      {children}
    </svg>
  );
}

export const Ikon = {
  /** Översikt — hus. */
  hus: (p: IkonProps) => <Bas {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></Bas>,
  /** Planering — kalender med prickar. */
  kalender: (p: IkonProps) => <Bas {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><circle cx="8" cy="13.5" r=".9" fill="currentColor" /><circle cx="12" cy="13.5" r=".9" fill="currentColor" /><circle cx="16" cy="13.5" r=".9" fill="currentColor" /><circle cx="8" cy="17" r=".9" fill="currentColor" /><circle cx="12" cy="17" r=".9" fill="currentColor" /></Bas>,
  /** Matematik — pi. */
  pi: (p: IkonProps) => <Bas {...p}><path d="M4 7.5c1.5-1.5 3-1.5 16-1.5" /><path d="M8.5 6.5c0 6-1 9-3 12.5" /><path d="M15.5 6.5V16c0 2 1 3 2.5 3 1 0 1.8-.5 2.5-1.5" /></Bas>,
  /** Kemi — kolv. */
  kolv: (p: IkonProps) => <Bas {...p}><path d="M9.5 3.5h5" /><path d="M10 3.5v5.5L4.8 18.2A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.8-2.8L14 9V3.5" /><path d="M7.2 15.5h9.6" /><circle cx="10" cy="17.8" r=".8" fill="currentColor" /><circle cx="13.5" cy="18.5" r=".8" fill="currentColor" /></Bas>,
  /** Biologi — blad. */
  blad: (p: IkonProps) => <Bas {...p}><path d="M5 19c0-8 4-13 14-14 0 10-4 14-12 14" /><path d="M5 19c3-5 6-8 10-10" /></Bas>,
  /** Fysik — atom. */
  atom: (p: IkonProps) => <Bas {...p}><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></Bas>,
  /** Teknik — kugghjul. */
  kugg: (p: IkonProps) => <Bas {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="7" /></Bas>,
  /** Övrigt ämne — bok. */
  bok: (p: IkonProps) => <Bas {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></Bas>,
  /** Classroom — skärm med person. */
  klassrum: (p: IkonProps) => <Bas {...p}><rect x="3" y="4" width="18" height="12" rx="1.8" /><circle cx="15.5" cy="9" r="1.6" /><path d="M12.5 13.5c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2" /><path d="M6.5 21c0-2 1.3-3.2 3-3.2s3 1.2 3 3.2" /><circle cx="9.5" cy="15.2" r="1.5" /></Bas>,
  /** Resultat — staplar. */
  staplar: (p: IkonProps) => <Bas {...p}><path d="M4 20V13M10 20V8M16 20V4M22 20H2" /></Bas>,
  /** Elever — två personer. */
  elever: (p: IkonProps) => <Bas {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16.5 14.5c2.6 0 4.5 1.9 4.5 4.5" /></Bas>,
  /** Föräldrakontakt — kuvert. */
  kuvert: (p: IkonProps) => <Bas {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6.5L20.5 7" /></Bas>,
  sok: (p: IkonProps) => <Bas {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Bas>,
  klocka: (p: IkonProps) => <Bas {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Bas>,
  pil: (p: IkonProps) => <Bas {...p}><path d="m6 9 6 6 6-6" /></Bas>,
  check: (p: IkonProps) => <Bas {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16.5 9.5" /></Bas>,
  varning: (p: IkonProps) => <Bas {...p}><path d="M12 3.5 21 19.5H3z" /><path d="M12 10v4.5M12 17.2v.3" /></Bas>,
  skola: (p: IkonProps) => <Bas {...p}><path d="M3 21V9l9-5 9 5v12" /><path d="M9 21v-6h6v6" /><path d="M3 21h18" /></Bas>,
  /** Appens logotyp — tre staplar på ljus platta. */
  logo: (p: IkonProps) => (
    <svg className={p.className} width={p.storlek ?? 40} height={p.storlek ?? 40} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="9" fill="#fff" />
      <path d="M11 29V21M20 29V15M29 29V10" stroke="#0B2A5B" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
};

/** Ikon för ett ämne utifrån namnet: Matematik → π, Kemi → kolv, Biologi → blad, Fysik → atom, Teknik → kugghjul. */
export function amnesIkon(namn: string): (p: IkonProps) => React.JSX.Element {
  const n = namn.toLowerCase();
  if (/matte|matematik/.test(n)) return Ikon.pi;
  if (/kemi/.test(n)) return Ikon.kolv;
  if (/biologi/.test(n)) return Ikon.blad;
  if (/fysik/.test(n)) return Ikon.atom;
  if (/teknik/.test(n)) return Ikon.kugg;
  return Ikon.bok;
}
