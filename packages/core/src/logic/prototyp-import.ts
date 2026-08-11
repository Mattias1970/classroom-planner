/**
 * Import av resurslänkar ur HTML-prototypen
 * (planering_matematik8_alla_kapitel.html): filmer (Binogi/YouTube) och
 * Socrative-quizzar, associerade till närmast föregående delkapitelrubrik
 * i dokumentflödet. Ren kärna — ingen DOM, bara textanalys.
 */

export interface PrototypeLink {
  delkapitel: string;           // '1.1' … '5.8' ('' om ingen rubrik hittats ännu)
  typ: 'film' | 'quiz';
  titel: string;
  url: string;                  // för quiz utan länk: '' (rum/quiznamn i titel)
}

const FILM_HOSTS = ['app.binogi.se', 'binogi.se', 'youtube.com', 'youtu.be', 'vimeo.com'];

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/**
 * Skannar HTML linjärt: håller reda på senaste delkapitelrubriken (N.M) och
 * knyter varje påträffad länk/quizreferens till den. Dubbletter (samma
 * delkapitel + url/titel) filtreras.
 */
export function parsePrototypeLinks(html: string): PrototypeLink[] {
  const out: PrototypeLink[] = [];
  const seen = new Set<string>();
  const add = (l: PrototypeLink) => {
    const key = `${l.delkapitel}|${l.typ}|${(l.url || l.titel).toLowerCase()}`;
    if (l.delkapitel === '' || seen.has(key)) return;
    seen.add(key);
    out.push(l);
  };

  // Tokenisera: a-taggar, quizreferenser och delkapitelrubriker i dokumentordning.
  const tokenRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|(?:[Qq]uiz|[Rr]oomname)\s*:?\s*([A-Za-zÅÄÖåäö0-9._-]{2,40})|(?<![\d.])([1-5])\.(\d{1,2})(?![\d.])/g;

  let delkapitel = '';
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[4] !== undefined && m[5] !== undefined) {
      delkapitel = `${m[4]}.${m[5]}`;
      continue;
    }
    if (m[1] !== undefined) {
      const url = m[1];
      const text = stripTags(m[2] ?? '');
      let host = '';
      try { host = new URL(url, 'https://x.invalid').hostname.replace(/^www\./, ''); } catch { host = ''; }
      if (FILM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        add({ delkapitel, typ: 'film', titel: text || url, url });
      } else if (host.includes('socrative')) {
        add({ delkapitel, typ: 'quiz', titel: text || 'Socrative-quiz', url });
      }
      continue;
    }
    if (m[3] !== undefined) {
      const namn = m[3];
      // Filtrera bort uppenbara falsklarm (rena småtal och HTML-ord)
      if (/^\d{1,2}$/.test(namn) || /^(class|style|href|span|div)$/i.test(namn)) continue;
      add({ delkapitel, typ: 'quiz', titel: namn, url: '' });
    }
  }
  return out;
}

export interface PrototypeImportSummary {
  perKapitel: Record<number, { filmer: number; quiz: number }>;
  totalFilmer: number;
  totalQuiz: number;
}

export function summarizePrototypeLinks(links: PrototypeLink[]): PrototypeImportSummary {
  const perKapitel: Record<number, { filmer: number; quiz: number }> = {};
  let totalFilmer = 0, totalQuiz = 0;
  for (const l of links) {
    const kap = Number(l.delkapitel.split('.')[0]);
    perKapitel[kap] ??= { filmer: 0, quiz: 0 };
    if (l.typ === 'film') { perKapitel[kap].filmer++; totalFilmer++; }
    else { perKapitel[kap].quiz++; totalQuiz++; }
  }
  return { perKapitel, totalFilmer, totalQuiz };
}
