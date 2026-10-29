/**
 * Del 206 · Bilden på provlappen: djup (orsakssamband i flera led, en kedja) och bredd
 * (flera exempel i ett led, en solfjäder). Ritas som SVG av begreppen i avsnittet; UI visar
 * den direkt, Word-filen får den som PNG via canvas (provlappWord.ts).
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kort = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** SVG-sträng (720×250) med kedjan till vänster och solfjädern till höger. `kedja` = 2–4 begrepp, `farg` = kapitlets färg. */
export function djupBreddSvg(kedja: string[], farg: string): string {
  const led = (kedja.length >= 2 ? kedja : [kedja[0] ?? 'A', '…', '…']).slice(0, 4);
  const f = /^#[0-9a-f]{6}$/i.test(farg) ? farg : '#B5532C';
  const W = 720; const H = 250;
  const ut: string[] = [];
  ut.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Calibri, Arial, sans-serif">`);
  ut.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  ut.push(`<defs><marker id="pil" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="${f}"/></marker></defs>`);
  // Djup — kedja
  ut.push(`<text x="20" y="30" font-size="18" font-weight="700" fill="${f}">DJUP — orsakssamband i flera led</text>`);
  ut.push(`<text x="20" y="50" font-size="12" fill="#555">varje pil svarar på "varför?"</text>`);
  const bx = 120; const by = 110; const bh = 44; const gap = (360 - bx * 0) / led.length;
  led.forEach((b, i) => {
    const x = 20 + i * gap; const w = gap - 22;
    ut.push(`<rect x="${x}" y="${by}" width="${Math.max(w, 40)}" height="${bh}" rx="8" fill="#fff" stroke="${f}" stroke-width="2"/>`);
    ut.push(`<text x="${x + Math.max(w, 40) / 2}" y="${by + bh / 2 + 5}" font-size="13" text-anchor="middle" fill="#222">${esc(kort(b))}</text>`);
    if (i < led.length - 1) ut.push(`<line x1="${x + Math.max(w, 40) + 2}" y1="${by + bh / 2}" x2="${x + gap - 2}" y2="${by + bh / 2}" stroke="${f}" stroke-width="2" marker-end="url(#pil)"/>`);
  });
  ut.push(`<text x="20" y="200" font-size="13" fill="#333">${esc(led[0])} leder till … som leder till … — förklara kedjan.</text>`);
  // Bredd — solfjäder
  const cx = 470;
  ut.push(`<line x1="${cx - 40}" y1="10" x2="${cx - 40}" y2="${H - 10}" stroke="#ddd"/>`);
  ut.push(`<text x="${cx - 20}" y="30" font-size="18" font-weight="700" fill="${f}">BREDD — flera exempel i ett led</text>`);
  ut.push(`<text x="${cx - 20}" y="50" font-size="12" fill="#555">samma begrepp, olika exempel</text>`);
  const rx = cx - 20; const ry = 110; const rw = 110;
  ut.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${bh}" rx="8" fill="${f}" />`);
  ut.push(`<text x="${rx + rw / 2}" y="${ry + bh / 2 + 5}" font-size="13" text-anchor="middle" fill="#fff" font-weight="700">${esc(kort(led[0]))}</text>`);
  ['exempel 1', 'exempel 2', 'exempel 3'].forEach((e, i) => {
    const ex = rx + rw + 70; const ey = 78 + i * 54;
    ut.push(`<line x1="${rx + rw + 2}" y1="${ry + bh / 2}" x2="${ex - 2}" y2="${ey + 20}" stroke="${f}" stroke-width="2" marker-end="url(#pil)"/>`);
    ut.push(`<rect x="${ex}" y="${ey}" width="100" height="40" rx="8" fill="#fff" stroke="${f}" stroke-width="2"/>`);
    ut.push(`<text x="${ex + 50}" y="${ey + 25}" font-size="13" text-anchor="middle" fill="#222">${e}</text>`);
  });
  ut.push(`<text x="${cx - 20}" y="${H - 20}" font-size="13" fill="#333">…och vad har exemplen gemensamt?</text>`);
  ut.push('</svg>');
  void bx;
  return ut.join('');
}

/** data-URL för <img>. */
export function djupBreddDataUrl(kedja: string[], farg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(djupBreddSvg(kedja, farg))}`;
}

/** SVG → PNG-bytes via canvas (webbläsaren). null om canvas saknas (t.ex. i test). */
export async function svgTillPng(svg: string, bredd = 1440, hojd = 500): Promise<Uint8Array | null> {
  try {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = bredd; canvas.height = hojd;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('svg')); img.src = url; });
    ctx.drawImage(img, 0, 0, bredd, hojd);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (blob === null) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch { return null; }
}
