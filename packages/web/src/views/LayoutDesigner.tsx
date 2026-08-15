/**
 * Layoutdesigner för utskrift (del 20).
 * Rita ytor med gummiband på ett tomt A4-blad; varje yta visar ett fält ur
 * lektionsplaneringen. Flytt/skalning snappar mot andra ytors ovankant,
 * underkant och centrallinje samt "fyll sidled". Layouten beskriver EN
 * lektion; utskriften staplar alla kapitlets lektioner under en
 * kapitelrubrik. Export: PDF via utskriftsvyn (Spara som PDF) och Word.
 */
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from 'docx';
import {
  BLAD, LAYOUT_FALT, LINJE_FARGER, LJUSA_FARGER, arLinje, bandHojd, defaultUtskriftslayout, faltEtikett, fyllSidled,
  rektanglarKorsar,
  layoutFaltVarde, normaliseraRuta, nyBoxId, snapBox, svDateLabel,
  type LayoutBox, type ScheduledSlot, type LessonRecord, type SnapGuide, type UtskriftsLayout,
} from '@planner/core';
import { getUtskriftslayout, setUtskriftslayout, type LoadedLibrary } from '../state/store.js';

const PX = 2.4; // px per mm i designerytan
const mm = (v: number) => v * PX;

export interface LayoutDesignerProps {
  lib: LoadedLibrary;
  kapitel: number;
  lessons: LessonRecord[];
  slotFor: (kapitel: number, idx: number) => ScheduledSlot | null;
  classId: string;
  onClose: () => void;
}

type Drag =
  | { typ: 'rita'; falt: string; x1: number; y1: number; x2: number; y2: number }
  | { typ: 'markera'; x1: number; y1: number; x2: number; y2: number }
  | { typ: 'flytt'; id: string; startX: number; startY: number; origs: Record<string, LayoutBox> }
  | { typ: 'storlek'; id: string; startX: number; startY: number; orig: LayoutBox };

export function LayoutDesigner(props: LayoutDesignerProps) {
  const { lib, kapitel, lessons, slotFor, classId, onClose } = props;
  const [layout, setLayout] = useState<UtskriftsLayout>(() => getUtskriftslayout() ?? defaultUtskriftslayout());
  const [valtFalt, setValtFalt] = useState<string | null>(null);
  const [valda, setValda] = useState<string[]>([]); // del 21: flermarkering
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [msg, setMsg] = useState('');
  const bladRef = useRef<HTMLDivElement>(null);

  const spara = (l: UtskriftsLayout) => { setLayout(l); setUtskriftslayout(l); };
  const valdaBoxar = layout.boxar.filter((b) => valda.includes(b.id));
  const vald = valdaBoxar.length >= 1 ? valdaBoxar[0]! : null;

  const mmPos = (e: RPointerEvent): { x: number; y: number } => {
    const r = bladRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX };
  };

  const pekaNed = (e: RPointerEvent) => {
    const p = mmPos(e);
    if (valtFalt !== null) {
      setDrag({ typ: 'rita', falt: valtFalt, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else {
      // del 21: gummiband på tom yta = markera flera
      setDrag({ typ: 'markera', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (!e.shiftKey) setValda([]);
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const pekaFlytta = (e: RPointerEvent) => {
    if (drag === null) return;
    const p = mmPos(e);
    if (drag.typ === 'rita' || drag.typ === 'markera') { setDrag({ ...drag, x2: p.x, y2: p.y }); return; }
    const dx = p.x - drag.startX, dy = p.y - drag.startY;
    const flyttade = drag.typ === 'flytt' ? Object.keys(drag.origs) : [drag.id];
    const andra = layout.boxar.filter((b) => !flyttade.includes(b.id));
    if (drag.typ === 'flytt') {
      const led = drag.origs[drag.id]!;
      const grov = {
        xMm: Math.max(0, Math.min(led.xMm + dx, BLAD.breddMm - led.wMm)),
        yMm: Math.max(0, Math.min(led.yMm + dy, BLAD.hojdMm - led.hMm)),
        wMm: led.wMm, hMm: led.hMm,
      };
      const s = snapBox(grov, andra, 'flytt');
      setGuides(s.guides);
      const sdx = s.xMm - led.xMm, sdy = s.yMm - led.yMm; // snappad delta gäller hela gruppen
      spara({
        boxar: layout.boxar.map((b) => {
          const o = drag.origs[b.id];
          if (o === undefined) return b;
          return {
            ...b,
            xMm: Math.max(0, Math.min(o.xMm + sdx, BLAD.breddMm - o.wMm)),
            yMm: Math.max(0, Math.min(o.yMm + sdy, BLAD.hojdMm - o.hMm)),
          };
        }),
      });
    } else {
      const grov = {
        xMm: drag.orig.xMm, yMm: drag.orig.yMm,
        wMm: Math.max(6, Math.min(drag.orig.wMm + dx, BLAD.breddMm - drag.orig.xMm)),
        hMm: Math.max(6, Math.min(drag.orig.hMm + dy, BLAD.hojdMm - drag.orig.yMm)),
      };
      const s = snapBox(grov, andra, 'storlek');
      setGuides(s.guides);
      spara({ boxar: layout.boxar.map((b) => (b.id === drag.id ? { ...b, ...s } : b)) });
    }
  };

  const pekaUpp = () => {
    if (drag?.typ === 'markera') {
      const r = normaliseraRuta(drag.x1, drag.y1, drag.x2, drag.y2, 0.1);
      const traffar = layout.boxar.filter((b) => rektanglarKorsar(r, b)).map((b) => b.id);
      setValda((prev) => [...new Set([...prev, ...traffar])]);
      setDrag(null); setGuides([]);
      return;
    }
    if (drag?.typ === 'rita') {
      const r = normaliseraRuta(drag.x1, drag.y1, drag.x2, drag.y2);
      const id = nyBoxId(layout.boxar.map((b) => b.id));
      spara({
        boxar: [...layout.boxar, drag.falt === 'linje'
          ? { id, falt: 'linje', ...r, fontPt: 10, align: 'left' as const, visaEtikett: false, linjeMm: 0.6, linjeFarg: '#334155' }
          : { id, falt: drag.falt, ...r, fontPt: 10, align: 'left' as const, visaEtikett: true }],
      });
      setValda([id]); setValtFalt(null);
    }
    setDrag(null); setGuides([]);
  };

  const uppdateraValda = (patch: Partial<LayoutBox>) => {
    if (valda.length === 0) return;
    spara({ boxar: layout.boxar.map((b) => (valda.includes(b.id) ? { ...b, ...patch } : b)) });
  };
  const taBortValda = () => {
    if (valda.length === 0) return;
    spara({ boxar: layout.boxar.filter((b) => !valda.includes(b.id)) });
    setValda([]);
  };

  // ── Utskriftsdata: kapitelrubrik + alla lektioner efter varandra ──
  const kapMeta = lib.subject.kapitelMeta[String(kapitel)];
  const extraFor = (idx: number) => {
    const slot = slotFor(kapitel, idx);
    return {
      lektionsNr: idx + 1,
      datum: slot ? svDateLabel(slot.date) : '',
      tid: slot ? `${slot.start}–${slot.end}` : '',
    };
  };
  const delkapitel = useMemo(
    () => [...new Set(lessons.map((l) => l.avsnitt).filter((a) => /^\d+\.\d+/.test(a)))],
    [lessons],
  );

  const skrivUt = () => { // PDF: webbläsarens Skriv ut → Spara som PDF
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { setMsg('✗ Popup blockerad — tillåt popupfönster för utskrift.'); return; }
    const band = bandHojd(layout);
    const boxHtml = (b: LayoutBox, lesson: LessonRecord, idx: number) => {
      const raa = layoutFaltVarde(b.falt, lesson, extraFor(idx));
      const varde = raa === '—' ? '' : raa; // del 22b: '—' skrivs inte ut
      const text = b.visaEtikett && varde !== '' ? `<b>${faltEtikett(b.falt)}:</b> ${varde}` : varde;
      if (arLinje(b)) {
        const t = b.linjeMm ?? 0.6, f = b.linjeFarg ?? '#334155';
        const streck = b.wMm >= b.hMm
          ? `left:0;right:0;top:50%;transform:translateY(-50%);height:${t}mm`
          : `top:0;bottom:0;left:50%;transform:translateX(-50%);width:${t}mm`;
        return `<div style="position:absolute;left:${b.xMm}mm;top:${b.yMm}mm;width:${b.wMm}mm;height:${b.hMm}mm">` +
          `<div style="position:absolute;${streck};background:${f}"></div></div>`;
      }
      const ram = b.ram === true ? 'border:0.35mm solid #333;' : '';
      const platta = b.bakgrund !== undefined && b.bakgrund !== '' ? `background:${b.bakgrund};` : '';
      return `<div style="position:absolute;left:${b.xMm}mm;top:${b.yMm}mm;width:${b.wMm}mm;height:${b.hMm}mm;` +
        `${ram}${platta}box-sizing:border-box;padding:0.6mm;` +
        `font-size:${b.fontPt}pt;text-align:${b.align};overflow:hidden;line-height:1.25">${text}</div>`;
    };
    const bandHtml = lessons.map((l, i) =>
      `<div style="position:relative;height:${band}mm;page-break-inside:avoid;border-bottom:1mm solid #334155">` +
      layout.boxar.map((b) => boxHtml(b, l, i)).join('') + `</div>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Planering kap ${kapitel}</title>
      <style>@page{size:A4;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}
      .rubrik{padding:${BLAD.marginalMm}mm ${BLAD.marginalMm}mm 4mm}</style></head><body>
      <div class="rubrik"><h1 style="margin:0 0 2mm;font-size:16pt">Kapitel ${kapitel} — ${kapMeta?.name ?? ''} · ${classId}</h1>
      <div style="font-size:9pt">${lib.subject.meta.lärobok} · Innehåll: ${delkapitel.join(' · ')}</div></div>
      ${bandHtml}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  const exportWord = async () => { // Word: layoutens ordning/typografi som stycken
    const ordnade = [...layout.boxar].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
    const alignOf = (a: LayoutBox['align']) =>
      a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
    const barn: Paragraph[] = [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`Kapitel ${kapitel} — ${kapMeta?.name ?? ''} · ${classId}`)] }),
      new Paragraph({ children: [new TextRun({ text: `${lib.subject.meta.lärobok} · Innehåll: ${delkapitel.join(' · ')}`, size: 18 })] }),
    ];
    lessons.forEach((l, i) => {
      if (i > 0) barn.push(new Paragraph({ // del 22b: tjock linje mellan lektioner även i Word
        border: { bottom: { style: BorderStyle.SINGLE, size: Math.round(1 * 2.835 * 8), color: '334155' } },
        children: [],
      }));
      barn.push(new Paragraph({ children: [] }));
      for (const b of ordnade) {
        if (arLinje(b)) { // vågrät linje → styckekant med vald tjocklek/färg (lodräta kan inte flöda i Word)
          if (b.wMm >= b.hMm) barn.push(new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: Math.round((b.linjeMm ?? 0.6) * 2.835 * 8), color: (b.linjeFarg ?? '#334155').replace('#', '') } },
            children: [],
          }));
          continue;
        }
        const varde = layoutFaltVarde(b.falt, l, extraFor(i));
        if (varde === '' || varde === '—') continue; // del 22b: skriv inte ut tomma fält
        barn.push(new Paragraph({
          alignment: alignOf(b.align),
          ...(b.bakgrund !== undefined && b.bakgrund !== ''
            ? { shading: { type: 'clear' as const, fill: b.bakgrund.replace('#', '') } } : {}),
          ...(b.ram === true ? { border: {
            top: { style: BorderStyle.SINGLE, size: 8, color: '333333' },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: '333333' },
            left: { style: BorderStyle.SINGLE, size: 8, color: '333333' },
            right: { style: BorderStyle.SINGLE, size: 8, color: '333333' },
          } } : {}),
          children: [
            ...(b.visaEtikett ? [new TextRun({ text: `${faltEtikett(b.falt)}: `, bold: true, size: b.fontPt * 2 })] : []),
            new TextRun({ text: varde, size: b.fontPt * 2 }),
          ],
        }));
      }
    });
    const doc = new Document({ sections: [{ children: barn }] });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planering_kap${kapitel}_${classId}.docx`;
    a.click(); URL.revokeObjectURL(a.href);
    setMsg('✓ Wordfil nedladdad. (Word följer layoutens ordning och typografi; PDF är exakt.)');
  };

  const exempel = lessons[0];

  return createPortal(
    <div className="overlay" role="dialog" aria-label="Layout för utskrift" onClick={onClose}
      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px 0', zIndex: 1000 }}>
      {/* del 20b: portal till body + toppförankrad — öppnas alltid högst upp */}
      <div className="modal" style={{ width: 'min(980px, 96vw)', margin: 0 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="head-row"><h3>🖨 Layout för utskrift — kapitel {kapitel}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button></div>
        <p className="note">Välj ett fält och rita dess yta med gummiband på bladet. Dra för att flytta,
          hörnhandtaget skalar om. Ytor snappar mot andras ovankant, underkant och centrallinje;
          ⇔ fyller bladet i sidled. Layouten beskriver en lektion — utskriften staplar kapitlets alla lektioner.</p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 220, flexShrink: 0 }}>
            <h4 className="cm-h">FÄLT ({valtFalt ? 'rita på bladet' : 'välj ett'})</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {LAYOUT_FALT.map((f) => (
                <button key={f.id} className={`prio-pill ${valtFalt === f.id ? 'on' : ''}`}
                  onClick={() => setValtFalt(valtFalt === f.id ? null : f.id)}>{f.etikett}</button>
              ))}
            </div>

            {vald && arLinje(vald) && (<>
              <h4 className="cm-h">{valda.length > 1 ? `${valda.length} YTOR VALDA` : 'VALD LINJE'}</h4>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>Tjocklek <input type="number" min={0.2} max={3} step={0.1} style={{ width: 60 }}
                  value={vald.linjeMm ?? 0.6}
                  onChange={(e) => uppdateraValda({ linjeMm: Number(e.target.value) })} /> mm</label>
                <span className="muted">Färg:</span>
                {LINJE_FARGER.map((f) => (
                  <button key={f.namn} title={f.namn}
                    onClick={() => uppdateraValda({ linjeFarg: f.hex })}
                    style={{ width: 22, height: 22, borderRadius: 4, cursor: 'pointer', background: f.hex,
                      border: (vald.linjeFarg ?? '#334155') === f.hex ? '2px solid #175cd3' : '1px solid #d0d5dd' }} />
                ))}
                <button className="btn sec" title="Fyll bladet i sidled"
                  onClick={() => spara({ boxar: layout.boxar.map((b) => (valda.includes(b.id) ? fyllSidled(b) : b)) })}>⇔ Fyll sidled</button>
                <button className="btn warn" onClick={taBortValda}>🗑 Ta bort</button>
              </div>
            </>)}
            {vald && !arLinje(vald) && (<>
              <h4 className="cm-h">{valda.length > 1 ? `${valda.length} YTOR VALDA` : `VALD YTA — ${faltEtikett(vald.falt)}`}</h4>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>Font <input type="number" min={6} max={36} style={{ width: 54 }} value={vald.fontPt}
                  onChange={(e) => uppdateraValda({ fontPt: Number(e.target.value) })} /> pt</label>
                <span>
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={`icon-btn ${vald.align === a ? 'on' : ''}`}
                      title={a === 'left' ? 'Vänsterställt' : a === 'center' ? 'Centrerat' : 'Högerställt'}
                      onClick={() => uppdateraValda({ align: a })}>
                      {a === 'left' ? '⯇' : a === 'center' ? '≡' : '⯈'}
                    </button>
                  ))}
                </span>
                <label className="radio"><input type="checkbox" checked={vald.visaEtikett}
                  onChange={(e) => uppdateraValda({ visaEtikett: e.target.checked })} /> Etikett</label>
                <label className="radio"><input type="checkbox" checked={vald.ram === true}
                  onChange={(e) => uppdateraValda({ ram: e.target.checked })} /> Ram</label>
                <button className="btn sec" title="Fyll bladet i sidled"
                  onClick={() => spara({ boxar: layout.boxar.map((b) => (valda.includes(b.id) ? fyllSidled(b) : b)) })}>⇔ Fyll sidled</button>
                <button className="btn warn" onClick={taBortValda}>🗑 Ta bort</button>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <span className="muted">Platta:</span>
                {LJUSA_FARGER.map((f) => (
                  <button key={f.namn} title={f.namn}
                    onClick={() => uppdateraValda({ bakgrund: f.hex })}
                    style={{
                      width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                      background: f.hex === '' ? '#fff' : f.hex,
                      border: (vald.bakgrund ?? '') === f.hex ? '2px solid #175cd3' : '1px solid #d0d5dd',
                    }}>{f.hex === '' ? '∅' : ''}</button>
                ))}
              </div>
            </>)}

            <h4 className="cm-h">EXPORT</h4>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button className="btn" onClick={skrivUt}>⬇ PDF (Skriv ut)</button>
              <button className="btn sec" onClick={() => void exportWord()}>⬇ Word (.docx)</button>
              <button className="btn sec" onClick={() => { spara(defaultUtskriftslayout()); setValda([]); }}>↺ Standardlayout</button>
            </div>
            {msg && <p className="status">{msg}</p>}
          </div>

          <div>
            <div ref={bladRef}
              style={{
                position: 'relative', width: mm(BLAD.breddMm), height: mm(BLAD.hojdMm),
                background: '#fff', border: '1px solid #d0d5dd', boxShadow: '0 2px 8px rgba(16,24,40,.12)',
                cursor: valtFalt ? 'crosshair' : 'default', userSelect: 'none', touchAction: 'none',
              }}
              onPointerDown={pekaNed} onPointerMove={pekaFlytta} onPointerUp={pekaUpp}>
              {/* marginalram */}
              <div style={{ position: 'absolute', inset: mm(BLAD.marginalMm), border: '1px dashed #e4e7ec', pointerEvents: 'none' }} />
              {/* snapguider */}
              {guides.filter((g) => g.yMm !== undefined).map((g, i) => (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: mm(g.yMm!), height: 0, borderTop: '1px dashed #175cd3', pointerEvents: 'none' }} />
              ))}
              {guides.some((g) => g.typ === 'bredd') && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: mm(BLAD.marginalMm), right: mm(BLAD.marginalMm), border: '1px dashed #175cd3', pointerEvents: 'none' }} />
              )}
              {/* ytor */}
              {layout.boxar.map((b) => {
                const varde = exempel ? layoutFaltVarde(b.falt, exempel, extraFor(0)) : '';
                return (
                  <div key={b.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setValtFalt(null);
                      const nyaValda = e.shiftKey
                        ? (valda.includes(b.id) ? valda.filter((x) => x !== b.id) : [...valda, b.id])
                        : (valda.includes(b.id) ? valda : [b.id]);
                      setValda(nyaValda);
                      if (e.shiftKey && !nyaValda.includes(b.id)) return; // avmarkerad — dra inte
                      const p = mmPos(e);
                      const origs: Record<string, LayoutBox> = {};
                      for (const x of layout.boxar) if (nyaValda.includes(x.id)) origs[x.id] = x;
                      setDrag({ typ: 'flytt', id: b.id, startX: p.x, startY: p.y, origs });
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                    style={{
                      position: 'absolute', left: mm(b.xMm), top: mm(b.yMm), width: mm(b.wMm), height: mm(b.hMm),
                      border: valda.includes(b.id) ? '2px solid #175cd3' : b.ram === true ? '1.5px solid #344054' : '1px solid #cbd5e1',
                      background: b.bakgrund !== undefined && b.bakgrund !== '' ? b.bakgrund : 'rgba(23,92,211,0.04)',
                      overflow: 'hidden', cursor: 'move',
                      fontSize: b.fontPt * PX * 0.353, textAlign: b.align, lineHeight: 1.25, padding: 1,
                    }}
                    title={faltEtikett(b.falt)}>
                    {arLinje(b) ? (
                      b.wMm >= b.hMm
                        ? <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: Math.max(1, mm(b.linjeMm ?? 0.6)), background: b.linjeFarg ?? '#334155' }} />
                        : <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: Math.max(1, mm(b.linjeMm ?? 0.6)), background: b.linjeFarg ?? '#334155' }} />
                    ) : (<>
                      {b.visaEtikett ? <b>{faltEtikett(b.falt)}: </b> : null}{varde || <i style={{ color: '#98a2b3' }}>{faltEtikett(b.falt)}</i>}
                    </>)}
                    {valda.length === 1 && valda[0] === b.id && (
                      <div onPointerDown={(e) => {
                        e.stopPropagation();
                        const p = mmPos(e);
                        setDrag({ typ: 'storlek', id: b.id, startX: p.x, startY: p.y, orig: b });
                        (e.target as Element).setPointerCapture(e.pointerId);
                      }}
                        style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, background: '#175cd3', cursor: 'nwse-resize' }} />
                    )}
                  </div>
                );
              })}
              {/* gummiband */}
              {drag?.typ === 'markera' && (() => {
                const r = normaliseraRuta(drag.x1, drag.y1, drag.x2, drag.y2, 0.1);
                return <div style={{ position: 'absolute', left: mm(r.xMm), top: mm(r.yMm), width: mm(r.wMm), height: mm(r.hMm), border: '1.5px dashed #667085', background: 'rgba(102,112,133,0.08)', pointerEvents: 'none' }} />;
              })()}
              {drag?.typ === 'rita' && (() => {
                const r = normaliseraRuta(drag.x1, drag.y1, drag.x2, drag.y2, 0.1);
                return <div style={{ position: 'absolute', left: mm(r.xMm), top: mm(r.yMm), width: mm(r.wMm), height: mm(r.hMm), border: '1.5px dashed #175cd3', background: 'rgba(23,92,211,0.06)', pointerEvents: 'none' }} />;
              })()}
            </div>
            <p className="muted">A4 · lektionsbandets höjd just nu: {Math.round(bandHojd(layout))} mm — förhandsvärden från lektion 1 i kapitlet.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
