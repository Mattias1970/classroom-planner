/**
 * Mobil & responsivitet (FR-MOB-001…010): identifiering av mobil,
 * bottennavigation med Mer-meny, skärmstorleksprofil och
 * scrolla-till-nästa-kapitel.
 */
import { useEffect, useRef, useState } from 'react';
import { guessScreenSize, isMobileViewport, nextChapterOf, type ScreenSize } from '@planner/core';

const SCREEN_SIZE_KEY = 'classroom-planner.phone-screen-size.v1';

/** FR-MOB-001/010: sätter html.is-mobile vid init och resize. */
export function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const m = isMobileViewport(window.innerWidth, window.innerHeight, touch);
      setMobile(m);
      document.documentElement.classList.toggle('is-mobile', m);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

/** FR-MOB-005…007: applicerar phone-{size}; manuellt val persisteras. */
export function useScreenSize(): [ScreenSize, (s: ScreenSize) => void] {
  const [size, setSize] = useState<ScreenSize>(() => {
    const saved = localStorage.getItem(SCREEN_SIZE_KEY) as ScreenSize | null;
    if (saved === 'compact' || saved === 'standard' || saved === 'large') return saved;
    return guessScreenSize(window.screen.width * (window.devicePixelRatio || 1)); // FR-MOB-006
  });
  useEffect(() => {
    document.documentElement.classList.remove('phone-compact', 'phone-standard', 'phone-large');
    document.documentElement.classList.add(`phone-${size}`);
  }, [size]);
  const pick = (s: ScreenSize) => { localStorage.setItem(SCREEN_SIZE_KEY, s); setSize(s); }; // FR-MOB-007
  return [size, pick];
}

export function ScreenSizeModal(props: { size: ScreenSize; onPick: (s: ScreenSize) => void; onClose: () => void }) {
  const { size, onPick, onClose } = props;
  const OPTIONS: Array<[ScreenSize, string, string]> = [
    ['compact', 'Kompakt', '1560×720 · mindre telefon'],
    ['standard', 'Standard', '2340×1080 · vanligast'],
    ['large', 'Stor', '3120×1440 · flaggskepp/QHD+'],
  ];
  return (
    <div className="overlay" role="dialog" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Skärmstorlek</h3>
        <p className="muted">Anpassa textstorlek och layout efter din telefons upplösning. Sparas automatiskt.</p>
        {OPTIONS.map(([s, label, desc]) => (
          <button key={s} className={`ins-mode ${size === s ? 'sel' : ''}`}
            onClick={() => { onPick(s); onClose(); }}>
            <b>{label} {size === s && '✓'}</b><span>{desc}</span>
          </button>
        ))}
        <div className="modal-actions"><button className="btn sec" onClick={onClose}>Stäng</button></div>
      </div>
    </div>
  );
}

/** FR-MOB-003/004: bottennavigation med Mer-meny för Kapitel 3–5 m.m. */
export function BottomNav(props: {
  tab: string; kapitel: number; chapters: number[];
  onTab: (t: 'arsoversikt' | 'kalender') => void;
  onKapitel: (k: number) => void;
  extra: Array<[string, string]>; // [tab-id, etikett] för övriga vyer i Mer
  onExtra: (t: string) => void;
}) {
  const { tab, kapitel, chapters, onTab, onKapitel, extra, onExtra } = props;
  const [more, setMore] = useState(false);
  useEffect(() => { // stäng vid tryck utanför
    if (!more) return;
    const close = () => setMore(false);
    window.addEventListener('touchstart', close);
    window.addEventListener('click', close);
    return () => { window.removeEventListener('touchstart', close); window.removeEventListener('click', close); };
  }, [more]);
  const inKap = (k: number) => tab === 'planering' && kapitel === k;
  const moreActive = tab === 'planering' && kapitel >= 3;
  return (<>
    {more && (
      <div className="more-menu" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        {chapters.filter((k) => k >= 3).map((k) => (
          <button key={k} onClick={() => { onKapitel(k); setMore(false); }}>● Kapitel {k}</button>
        ))}
        <hr />
        {extra.map(([t, label]) => (
          <button key={t} onClick={() => { onExtra(t); setMore(false); }}>{label}</button>
        ))}
      </div>
    )}
    <nav className="bottom-nav" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <button className={tab === 'arsoversikt' ? 'active' : ''} onClick={() => onTab('arsoversikt')}>
        <span>📅</span>ÖVERSIKT</button>
      <button className={tab === 'kalender' ? 'active' : ''} onClick={() => onTab('kalender')}>
        <span>🗓</span>KALENDER</button>
      <button className={inKap(1) ? 'active' : ''} onClick={() => onKapitel(1)}>
        <span className="dot" style={{ background: '#A0522D' }} />KAP 1</button>
      <button className={inKap(2) ? 'active' : ''} onClick={() => onKapitel(2)}>
        <span className="dot" style={{ background: '#1D7A6B' }} />KAP 2</button>
      <button className={moreActive || more ? 'active' : ''} onClick={() => setMore(!more)}>
        <span>⋯</span>MER</button>
    </nav>
  </>);
}

/**
 * FR-MOB-008/009: fortsatt neddragning efter botten visar hint och byter
 * kapitel efter ~140 px extra pull. Aldrig efter sista kapitlet.
 */
export function useScrollToNextChapter(
  enabled: boolean, chapters: number[], kapitel: number, onNext: (k: number) => void,
): number | null {
  const pull = useRef(0);
  const [hint, setHint] = useState<number | null>(null);
  const next = nextChapterOf(chapters, kapitel);
  useEffect(() => {
    if (!enabled || next === null) { setHint(null); return; }
    const atBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
    const add = (delta: number) => {
      if (!atBottom() || delta <= 0) { pull.current = 0; setHint(null); return; }
      pull.current += delta;
      setHint(Math.min(140, pull.current));
      if (pull.current >= 140) { pull.current = 0; setHint(null); onNext(next); window.scrollTo(0, 0); }
    };
    const onWheel = (e: WheelEvent) => add(e.deltaY);
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => { const y = e.touches[0].clientY; add(lastY - y); lastY = y; };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [enabled, next, onNext]);
  return next !== null && hint !== null && hint > 10 ? hint : null;
}
