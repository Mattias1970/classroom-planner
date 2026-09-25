import { describe, expect, it } from 'vitest';
import { elevanalys } from '../src/domain/elevanalys.js';
import { rapportOmraden } from '../src/domain/rapportomraden.js';
import { importeraResultat } from '../src/domain/resultat.js';
import { laggTillAmne, laggTillElev, laggTillKlass, laggTillSkolar, laggTillTjanst } from '../src/domain/struktur.js';
import { tomStruktur, type Struktur } from '../src/domain/typer.js';

function bas(): Struktur {
  let s = laggTillSkolar(tomStruktur(), { id: 'la', namn: '2026/2027', start: '2026-08-17', slut: '2027-06-11', dagar: [] });
  s = laggTillTjanst(s, { id: 'tj', skolarId: 'la', namn: 'NO' });
  s = laggTillKlass(s, { id: 'k', tjanstId: 'tj', namn: '8B' });
  s = laggTillAmne(s, { id: 'bi', klassId: 'k', namn: 'Biologi', schema: [{ dag: 1, start: '08:10', slut: '09:10' }] });
  return laggTillElev(s, { id: 'e1', klassId: 'k', namn: 'Pia Övnegård', grupp: 'A' });
}
const B = ['cellkärna', 'cellmembran', 'mitokondrie', 'ribosom'];
/** Ett förhör där `monster` anger rätt/fel per begrepp (t/f). */
function forhor(s: Struktur, kalla: 'socrative-laxforhor' | 'socrative-exit', prov: string, datum: string, monster: string): Struktur {
  const svar = monster.split('').map((c, i) => ({ fraga: `Vad är ${B[i]}?`, svar: c === 't' ? B[i] : 'fel', ratt: c === 't', facit: B[i] }));
  return importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla, prov, datum, rader: [{ namn: 'Pia Övnegård', poang: svar.filter((x) => x.ratt).length, maxPoang: svar.length, svar }] }).s;
}

describe('Del 151: rapportens områden', () => {
  it('lektioner = exit tickets, läxor = läxförhör med vänt fel → rätt, minnet flaggar upprepade fel och fokus har underlag', () => {
    let s = bas();
    s = forhor(s, 'socrative-exit', 'Exit 1', '2026-09-01', 'tttf');
    s = forhor(s, 'socrative-exit', 'Exit 2', '2026-09-08', 'tttt');
    s = forhor(s, 'socrative-laxforhor', 'L1', '2026-09-04', 'tftf');   // ribosom fel
    s = forhor(s, 'socrative-laxforhor', 'L2', '2026-09-11', 'ttff');   // cellmembran vänt; mitokondrie fel
    s = forhor(s, 'socrative-laxforhor', 'L3', '2026-09-18', 'ftff');   // cellkärna fel (1:a gången)
    s = forhor(s, 'socrative-laxforhor', 'L4', '2026-09-25', 'ftft');   // cellkärna fel igen → börjar glömma
    const r = rapportOmraden(elevanalys(s, 'e1', { klassId: 'k', amneId: 'bi' }));
    // 1 Lektionerna
    expect(r.lektioner.rader.map((x) => [x.prov, x.procent, x.klarat])).toEqual([['Exit 1', 75, true], ['Exit 2', 100, true]]);
    expect(r.lektioner).toMatchObject({ ton: 'bra', status: 'Når kravet', snitt: 88, klarade: 2, utveckling: null });
    expect(r.lektioner.slutsats).toBe('Exit ticketen når kravet (70 %) på 2 av 2 lektioner, snitt 88 %.');
    // 2 Läxorna
    expect(r.laxor.rader.map((x) => x.procent)).toEqual([50, 50, 25, 50]);
    expect(r.laxor.klarade).toBe(0);
    expect(r.laxor.ton).toBe('oro');
    expect(r.laxor.slutsats).toContain('senast 50 % (fre 25 sep)');
    expect(r.laxor.vantTotalt).toBeGreaterThan(0);
    expect(r.laxor.vandSteg.flatMap((v) => v.begrepp).every((b) => !b.includes(' — '))).toBe(true);   // bara begreppsnamn
    expect(r.laxor.kvar.map((k) => k.begrepp)).toEqual(['cellkärna', 'mitokondrie']);
    // 3 Minnet: cellkärna rätt tre gånger, sedan fel två i rad; mitokondrie rätt tre gånger, sedan fel tre → båda flaggas
    expect(r.minne.flaggade.map((g) => g.begrepp)).toEqual(['cellkärna', 'mitokondrie']);
    expect(r.minne.status).toBe('Några att repetera');
    // Fokus: högst två, med prov och datum
    expect(r.fokus).toHaveLength(2);
    expect(r.fokus[0].rubrik).toBe('Repetera begrepp du kunnat');
    expect(r.fokus[0].text).toContain('cellkärna, mitokondrie — rätt tidigare, fel de två senaste gångerna (senast fre 25 sep)');
    expect(r.fokus[1].rubrik).toBe('Lär in begreppen som är kvar');
    expect(r.fokus[1].text).toContain('L4, fre 25 sep');
    expect(r.prov).toBeNull();                                   // inga DigiExam-prov → inget provområde
  });

  it('Del 153: DigiExam-prov ger ett provområde med poäng och klassens snitt', () => {
    let s = laggTillElev(bas(), { id: 'e2', klassId: 'k', namn: 'Omar Provlund', grupp: 'B' });
    const provet = (prov: string, datum: string, pia: number, omar: number) => {
      s = importeraResultat(s, { klassId: 'k', amneId: 'bi', kalla: 'digiexam', prov, datum, rader: [{ namn: 'Pia Övnegård', poang: pia, maxPoang: 20 }, { namn: 'Omar Provlund', poang: omar, maxPoang: 20 }] }).s;
    };
    provet('Prov kap 6 E', '2026-10-01', 12, 16);
    provet('Prov kap 6 CA', '2026-10-08', 15, 11);
    const r = rapportOmraden(elevanalys(s, 'e1', { klassId: 'k', amneId: 'bi' }));
    expect(r.prov!.rader.map((x) => [x.prov, x.procent, x.klassSnitt, x.mot])).toEqual([['Prov kap 6 E', 60, 70, -10], ['Prov kap 6 CA', 75, 65, 10]]);
    expect(r.prov!.slutsats).toBe('Senaste provet, Prov kap 6 CA (tor 8 okt): 15 av 20 poäng (75 %), 10 procentenheter över klassens snitt. Från första till senaste provet: +15 procentenheter. Provet bedöms per förmåga i DigiExam; betyget är lärarens sammanvägda bedömning.');
    expect(r.prov!.nyckeltal[1]).toEqual({ etikett: 'Klassens snitt', varde: '65 %', under: 'samma prov' });
  });

  it('utan resultat: inget underlag i alla områden och inga fokus', () => {
    const r = rapportOmraden(elevanalys(bas(), 'e1', { klassId: 'k', amneId: 'bi' }));
    expect([r.lektioner.status, r.laxor.status, r.minne.status]).toEqual(['Inget underlag', 'Inget underlag', 'Inget underlag']);
    expect(r.fokus).toEqual([]);
  });
});
