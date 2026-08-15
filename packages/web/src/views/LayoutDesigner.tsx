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
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from 'docx';
import {
  BLAD, LAYOUT_FALT, bandHojd, defaultUtskriftslayout, faltEtikett, fyllSidled,
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
  | { typ: 'flytt'; id: string; startX: number; startY: number; orig: LayoutBox }
  | { typ: 'storlek'; id: string; startX: number; startY: number; orig: LayoutBox };

export function LayoutDesigner(props: LayoutDesignerProps) {
  const { lib, kapitel, lessons, slotFor, classId, onClose } = props;
  const [layout, setLayout] = useState<UtskriftsLayout>(() => getUtskriftslayout() ?? defaultUtskriftslayout());
  const [valtFalt, setValtFalt] = useState<string | null>(null);
  const [valdBox, setValdBox] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [msg, setMsg] = useState('');
  const bladRef = useRef<HTMLDivElement>(null);

  const spara = (l: UtskriftsLayout) => { setLayout(l); setUtskriftslayout(l); };
  const boxFor = (id: string | null) => layout.boxar.find((b) => b.id === id) ?? null;
  const vald = boxFor(valdBox);

  const mmPos = (e: RPointerEvent): { x: number; y: number } => {
    const r = bladRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX };
  };

  const pekaNed = (e: RPointerEvent) => {
    if (valtFalt === null) return;
    const p = mmPos(e);
    setDrag({ typ: 'rita', falt: valtFalt, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const pekaFlytta = (e: RPointerEvent) => {
    if (drag === null) return;
    const p = mmPos(e);
    if (drag.typ === 'rita') { setDrag({ ...drag, x2: p.x, y2: p.y }); return; }
    const dx = p.x - drag.startX, dy = p.y - drag.startY;
    const andra = layout.boxar.filter((b) => b.id !== drag.id);
    if (drag.typ === 'flytt') {
      const grov = {
        xMm: Math.max(0, Math.min(drag.orig.xMm + dx, BLAD.breddMm - drag.orig.wMm)),
        yMm: Math.max(0, Math.min(drag.orig.yMm + dy, BLAD.hojdMm - drag.orig.hMm)),
        wMm: drag.orig.wMm, hMm: drag.orig.hMm,
      };
      const s = snapBox(grov, andra, 'flytt');
      setGuides(s.guides);
      spara({ boxar: layout.boxar.map((b) => (b.id === drag.id ? { ...b, ...s } : b)) });
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
    if (drag?.typ === 'rita') {
      const r = normaliseraRuta(drag.x1, drag.y1, drag.x2, drag.y2);
      const id = nyBoxId(layout.boxar.map((b) => b.id));
      spara({
        boxar: [...layout.boxar, {
          id, falt: drag.falt, ...r, fontPt: 10, align: 'left', visaEtikett: true,
        }],
      });
      setValdBox(id); setValtFalt(null);
    }
    setDrag(null); setGuides([]);
  };

  const uppdateraVald = (patch: Partial<LayoutBox>) => {
    if (vald === null) return;
    spara({ boxar: layout.boxar.map((b) => (b.id === vald.id ? { ...b, ...patch } : b)) });
  };
  const taBortVald = () => {
    if (vald === null) return;
    spara({ boxar: layout.boxar.filter((b) => b.id !== vald.id) });
    setValdBox(null);
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
      const varde = layoutFaltVarde(b.falt, lesson, extraFor(idx));
      const text = b.visaEtikett && varde !== '' ? `<b>${faltEtikett(b.falt)}:</b> ${varde}` : varde;
      return `<div style="position:absolute;left:${b.xMm}mm;top:${b.yMm}mm;width:${b.wMm}mm;height:${b.hMm}mm;` +
        `font-size:${b.fontPt}pt;text-align:${b.align};overflow:hidden;line-height:1.25">${text}</div>`;
    };
    const bandHtml = lessons.map((l, i) =>
      `<div style="position:relative;height:${band}mm;page-break-inside:avoid;border-bottom:0.3mm solid #ddd">` +
      layout.boxar.map((b) => boxHtml(b, l, i)).join('') + `</div>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Planering kap ${kapitel}</title>
      <style>@page{size:A4;margin:0}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}
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
      barn.push(new Paragraph({ children: [] }));
      for (const b of ordnade) {
        const varde = layoutFaltVarde(b.falt, l, extraFor(i));
        if (varde === '') continue;
        barn.push(new Paragraph({
          alignment: alignOf(b.align),
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
      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px 0' }}>
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

            {vald && (<>
              <h4 className="cm-h">VALD YTA — {faltEtikett(vald.falt)}</h4>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>Font <input type="number" min={6} max={36} style={{ width: 54 }} value={vald.fontPt}
                  onChange={(e) => uppdateraVald({ fontPt: Number(e.target.value) })} /> pt</label>
                <span>
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={`icon-btn ${vald.align === a ? 'on' : ''}`}
                      title={a === 'left' ? 'Vänsterställt' : a === 'center' ? 'Centrerat' : 'Högerställt'}
                      onClick={() => uppdateraVald({ align: a })}>
                      {a === 'left' ? '⯇' : a === 'center' ? '≡' : '⯈'}
                    </button>
                  ))}
                </span>
                <label className="radio"><input type="checkbox" checked={vald.visaEtikett}
                  onChange={(e) => uppdateraVald({ visaEtikett: e.target.checked })} /> Etikett</label>
                <button className="btn sec" title="Fyll bladet i sidled"
                  onClick={() => spara({ boxar: layout.boxar.map((b) => (b.id === vald.id ? fyllSidled(b) : b)) })}>⇔ Fyll sidled</button>
                <button className="btn warn" onClick={taBortVald}>🗑 Ta bort</button>
              </div>
            </>)}

            <h4 className="cm-h">EXPORT</h4>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button className="btn" onClick={skrivUt}>⬇ PDF (Skriv ut)</button>
              <button className="btn sec" onClick={() => void exportWord()}>⬇ Word (.docx)</button>
              <button className="btn sec" onClick={() => { spara(defaultUtskriftslayout()); setValdBox(null); }}>↺ Standardlayout</button>
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
                      setValdBox(b.id); setValtFalt(null);
                      const p = mmPos(e);
                      setDrag({ typ: 'flytt', id: b.id, startX: p.x, startY: p.y, orig: b });
                      (e.target as Element).setPointerCapture(e.pointerId);
                    }}
                    style={{
                      position: 'absolute', left: mm(b.xMm), top: mm(b.yMm), width: mm(b.wMm), height: mm(b.hMm),
                      border: valdBox === b.id ? '2px solid #175cd3' : '1px solid #98a2b3',
                      background: 'rgba(23,92,211,0.04)', overflow: 'hidden', cursor: 'move',
                      fontSize: b.fontPt * PX * 0.353, textAlign: b.align, lineHeight: 1.25, padding: 1,
                    }}
                    title={faltEtikett(b.falt)}>
                    {b.visaEtikett ? <b>{faltEtikett(b.falt)}: </b> : null}{varde || <i style={{ color: '#98a2b3' }}>{faltEtikett(b.falt)}</i>}
                    {valdBox === b.id && (
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
