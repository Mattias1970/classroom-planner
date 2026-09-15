import { describe, expect, it } from 'vitest';
import { elevanalys } from '../src/domain/elevanalys.js';
import { importeraResultat, type FragaSvar } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

const A = 'Vad kallas samspelet i naturen?';
const B = 'Vad är en population?';

function sv(par: Array<[string, boolean]>): FragaSvar[] {
  return par.map(([fraga, ratt]) => ({ fraga, svar: ratt ? 'r' : 'f', ratt }));
}

/** Anna: starka läxförhör. Omar: svaga läxförhör, frånvaro, tappar under lektionen. */
function bygg(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '09:00', slut: '10:00' }] });
  s = laggTillElev(s, { id: 'a', klassId: 'k', namn: 'Anna Berg', grupp: 'A' });
  s = laggTillElev(s, { id: 'b', klassId: 'k', namn: 'Omar Ali', grupp: 'A' });
  const lax = (prov: string, datum: string, rum: string, anna: FragaSvar[], omar: FragaSvar[] | null) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov, datum, rum, rader: [
      { namn: 'Anna Berg', poang: anna.filter((x) => x.ratt).length, maxPoang: anna.length, svar: anna },
      ...(omar === null ? [] : [{ namn: 'Omar Ali', poang: omar.filter((x) => x.ratt).length, maxPoang: omar.length, svar: omar }]),
    ] }).s;
  };
  const ex = (prov: string, datum: string, rum: string, annaP: number, omarP: number | null) => {
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-exit', prov, datum, rum, rader: [
      { namn: 'Anna Berg', poang: annaP, maxPoang: 10 },
      ...(omarP === null ? [] : [{ namn: 'Omar Ali', poang: omarP, maxPoang: 10 }]),
    ] }).s;
  };
  lax('Biologi 4.1 Begrepp', '2026-08-21', 'Biologi41', sv([[A, true], [B, true]]), sv([[A, false], [B, true]]));
  ex('Biologi 4.2 Begrepp', '2026-08-21', 'Biologi42', 10, 4);
  lax('4.1-4.2 Begrepp', '2026-08-28', 'Biologi412', sv([[A, true], [B, true]]), sv([[A, false], [B, false]]));
  ex('Biologi 4.3 Begrepp', '2026-08-28', 'Biologi43', 9, 5);
  // 4 sep: Omar helt frånvarande (varken läxförhör eller exit)
  lax('4.1-4.3 Begrepp', '2026-09-04', 'Biologi4123', sv([[A, true], [B, true]]), null);
  ex('Biologi 4.4 Begrepp', '2026-09-04', 'Biologi44', 9, null);
  return s;
}
const f = { klassId: 'k', amneId: 'bi' };

describe('elevanalys', () => {
  it('Anna: läxförhören sitter, jämförelse mot klassen, råd att fortsätta', () => {
    const a = elevanalys(bygg(), 'a', f);
    expect(a.amneNamn).toBe('Biologi');
    const lax = a.kallor.find((k) => k.kalla === 'socrative-laxforhor')!;
    expect(lax).toMatchObject({ snittProcent: 100, krav: 90, andelKlarade: 100, antal: 3 });
    expect(a.narvaroProcent).toBe(100);
    expect(a.laget.map((r) => r.rubrik)).toContain('Läxförhör: Utmärkt'); // 100 % → Utmärkt
    const laxRad = a.laget.find((r) => r.rubrik === 'Läxförhör: Utmärkt')!.text;
    expect(laxRad).toContain('kumulativa');
    expect(laxRad).toContain('inte ett ämnesbetyg');
    expect(laxRad).toMatch(/på \d+ läxförhör/); // underlaget anges
    expect(a.fastnat).toEqual([]);
    // Exit vs läxförhör jämförs inte längre (olika innehåll); inga orsaksslutsatser om koncentration
    expect(a.laget.some((r) => r.rubrik.startsWith('Exit ticket jämfört med läxförhör'))).toBe(false);
    expect(a.laget.map((r) => r.text).join(' ')).not.toMatch(/koncentration|fungerar för dig|tappar under/);
    // Anna tappade 4.1 från exit (100 %) till läxförhör (94 %... i fixturen 100→100) — inget tapp här
    expect(a.laget.some((r) => r.rubrik.includes('tappade från exit ticket'))).toBe(false);
    expect(a.sammanfattning).toContain('Anna Berg: rätt på 2 av 2 testade begreppsfrågor i Biologi');
    expect(a.laget[0].rubrik).toBe('Rätt på 2 av 2 testade begreppsfrågor'); // nuläget först, med underlag
    expect(a.laget[0].text).toContain('senaste försöket'); // inte "sitter"
  });

  it('Omar: svaga läxförhör, frånvaro och begrepp som fastnat ger konkreta råd', () => {
    const o = elevanalys(bygg(), 'b', f);
    expect(o.narvaroProcent).toBe(67);
    expect(o.franvaroDatum).toEqual(['2026-09-04']);
    expect(o.laget.map((r) => r.rubrik)).toEqual(expect.arrayContaining(['Läxförhören ligger under godkänd nivå']));
    // Frånvaro beskrivs som saknat quizsvar, inte som en påverkan
    const narvRad = o.laget.find((r) => r.rubrik.startsWith('Quizsvar saknas'))!;
    expect(narvRad.text).toContain('visar inte att du var borta');
    expect(o.laget.map((r) => r.rubrik).join(' ')).not.toContain('Frånvaron påverkar');
    expect(o.fastnat.map((b) => b.fraga)).toEqual([A]);
    const rubriker = o.rad.map((r) => r.rubrik);
    expect(rubriker[0]).toContain('Fokus 1'); // ett tydligt fokus, med underlag
    expect(o.rad[0].text).toContain('Uppföljning vid nästa läxförhör');
    expect(rubriker).toEqual(expect.arrayContaining(['Lektioner utan quizsvar']));
    expect(o.rad.find((r) => r.rubrik === 'Lektioner utan quizsvar')!.text).toContain('2026-09-04');
    expect(o.rad.map((r) => r.text).join(' ')).not.toMatch(/hur mycket du övat\.|Läxförhören behöver mer tid/);
  });

  it('elev utan resultat ger tom men läsbar analys; okänd elev kastar', () => {
    let s = bygg();
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    const p = elevanalys(s, 'c', f);
    expect(p.kallor).toEqual([]);
    expect(p.sammanfattning).toBe('Pia Provlund har inga resultat i urvalet.');
    expect(p.rad).toHaveLength(1);
    expect(() => elevanalys(s, 'finns-ej', f)).toThrow('Okänd elev');
  });
});

describe('rapportOversikt', () => {
  it('ger nyckeltal per elev utan att köra hela analysen', async () => {
    const { rapportOversikt } = await import('../src/domain/elevanalys.js');
    const r = rapportOversikt(bygg(), f);
    const anna = r.find((x) => x.elev.id === 'a')!;
    expect(anna).toMatchObject({ laxforhorProcent: 100, narvaroProcent: 100, antalFastnat: 0, oro: 0 });
    const omar = r.find((x) => x.elev.id === 'b')!;
    expect(omar.laxforhorProcent).toBeLessThan(90);
    expect(omar.antalFastnat).toBe(1);
    expect(omar.oro).toBeGreaterThanOrEqual(3); // låga läxförhör + låga exit + frånvaro + fastnat
  });

  it('elev utan resultat får noll prov och ingen oro; sökningen filtrerar', async () => {
    const { rapportOversikt } = await import('../src/domain/elevanalys.js');
    let s = bygg();
    s = laggTillElev(s, { id: 'c', klassId: 'k', namn: 'Pia Provlund', grupp: 'B' });
    const pia = rapportOversikt(s, f).find((x) => x.elev.id === 'c')!;
    expect(pia).toMatchObject({ antalProv: 0, oro: 0, laxforhorProcent: null });
    expect(rapportOversikt(s, f, 'omar').map((x) => x.elev.namn)).toEqual(['Omar Ali']);
  });
});

describe('Del 88: frågematris, övningsrum och filmer i analysen', () => {
  it('matrisen följer med och råden pekar på Socrative-rummet', () => {
    const o = elevanalys(bygg(), 'b', f);
    expect(o.matris.rader.length).toBeGreaterThan(0);
    expect(o.matris.rader[0].elevCeller).not.toBeUndefined();
  });

  it('socrativeElevLank bygger en klickbar länk och rumUrLektion plockar rummet', async () => {
    const { socrativeElevLank, rumUrLektion } = await import('../src/domain/elevrapport.js');
    expect(socrativeElevLank('Biologi41')).toBe('https://b.socrative.com/student/#joinRoom/BIOLOGI41');
    expect(rumUrLektion(['Biologi41 (krav ≥ 70 %)'])).toBe('Biologi41');
    expect(rumUrLektion(['—', 'Biologi412 (krav ≥ 90 %)'])).toBe('Biologi412');
    expect(rumUrLektion(['—'])).toBeNull();
  });
});

describe('Del 92: övning med samma frågor flaggas i analysen', () => {
  it('en övning som återanvänder läxförhörets frågor nämns under Hur går det?', () => {
    let s = bygg();
    const svar = [{ fraga: A, svar: 'r', ratt: true }, { fraga: B, svar: 'r', ratt: true }];
    // Läxförhöret 21/8 hade A och B; övningen har samma frågor
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-ovning', prov: 'Extraövning', autoTyp: true, datum: '2026-09-10', rum: 'BIOLOGI8BB',
      rader: [{ namn: 'Anna Berg', poang: 2, maxPoang: 2, svar }] }).s;
    const a = elevanalys(s, 'a', f);
    // Samma quiz → räknas in som läxförhör i analysen, inte som separat övning
    expect(a.inkluderadeOvningar).toHaveLength(1);
    expect(a.inkluderadeOvningar[0]).toMatchObject({ prov: 'Extraövning', som: 'socrative-laxforhor', overlapp: 100 });
    expect(a.ovningsDubbletter).toEqual([]);
    expect(a.laget.map((r) => r.rubrik)).toContain('Övningar som räknas som förhör');
    expect(a.kallor.find((k) => k.kalla === 'socrative-laxforhor')!.antal).toBe(4); // 3 förhör + övningen
  });
});

describe('Del 116: glömska och läsrytm', () => {
  it('svar som gick rätt→fel och tapp exit→läxförhör ger fokus på att läsa på oftare', () => {
    let s = bygg();
    // Omar: A rätt på läxförhör 21/8 (nej: fel) — bygg ett tydligt fall: rätt först, fel sen
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.4 Begrepp', datum: '2026-09-11', rum: 'Biologi41234',
      rader: [{ namn: 'Anna Berg', poang: 0, maxPoang: 2, svar: sv([[A, false], [B, false]]) }] }).s; // Anna hade rätt förut → glömt
    const a = elevanalys(s, 'a', f);
    const glom = a.laget.find((r) => r.rubrik.includes('svar glömda'));
    expect(glom).toBeDefined();
    expect(glom!.rubrik).toMatch(/^2 svar glömda, 0 vända till rätt/);
    expect(glom!.text).toContain('hur ofta du läser på');
    const fokus = a.rad.find((r) => r.rubrik.includes('läs på oftare'));
    expect(fokus).toBeDefined();
    expect(fokus!.text).toContain('tio minuter varje dag');
    expect(fokus!.text).toContain('Uppföljning vid nästa läxförhör');
  });
});

describe('Del 121: trendkollens steg följer med i analysen', () => {
  it('varje jämförelse har datum, prov och begreppen som glömdes eller vändes', () => {
    let s = bygg();
    s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'socrative-laxforhor', prov: '4.1-4.4 Begrepp', datum: '2026-09-11', rum: 'Biologi41234',
      rader: [{ namn: 'Anna Berg', poang: 0, maxPoang: 2, svar: sv([[A, false], [B, false]]) }] }).s;
    const a = elevanalys(s, 'a', f);
    expect(a.trendsteg.length).toBeGreaterThan(0);
    const sista = a.trendsteg[a.trendsteg.length - 1];
    expect(sista).toMatchObject({ datum: '2026-09-11', prov: '4.1-4.4 Begrepp', glomt: 2, lart: 0 });
    expect(sista.foreDatum < sista.datum).toBe(true);
    expect(sista.glomtFragor).toEqual(expect.arrayContaining([A, B]));
  });
});

describe('Del 122: bedömningsnivåer, lektionsarbete, övar eleven?, befästa delkapitel', () => {
  it('lektionsarbetet bedöms i ord per exit ticket och som snitt', () => {
    const a = elevanalys(bygg(), 'a', f);
    // Anna: exit 100, 90, 90 → snitt 93 → Utmärkt
    expect(a.lektionsarbete.rader.map((x) => `${x.procent}:${x.niva}`)).toEqual(['100:Utmärkt', '90:Mycket bra', '90:Mycket bra']);
    expect(a.lektionsarbete.niva).toBe('Utmärkt');
    expect(a.laget.find((r) => r.rubrik.startsWith('Lektionsarbete'))!.rubrik).toBe('Lektionsarbete: Utmärkt');
    // Ingen jämförelse exit mot läxförhör på samma lektion
    expect(a.laget.some((r) => r.rubrik.includes('jämfört med läxförhör'))).toBe(false);
  });

  it('övar eleven? syns per läxförhör; befästa delkapitel märks aldrig öva', () => {
    const o = elevanalys(bygg(), 'b', f);
    // Omar läxförhör 4/9 (tidigare läxa A,B fel) → inte övat; 4/9 finns inte för Omar — hitta raden som finns
    expect(o.ovar.length).toBeGreaterThan(0);
    expect(o.laget.some((r) => r.rubrik.startsWith('Inför läxförhöret'))).toBe(true);
    // Anna har alla rätt på 4.1 i alla tre läxförhör → befäst
    const a = elevanalys(bygg(), 'a', f);
    expect(a.befasta).toContain('4.1');
    expect(a.rad.some((r) => r.rubrik === 'Delkapitel att repetera' && r.text.includes('4.1'))).toBe(false);
  });
});
