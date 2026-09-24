import { describe, expect, it } from 'vitest';
import { begransaTillElever, elevUrval, klassensElever } from '../src/domain/elevurval.js';
import type { ElevNarvaro, KlusterGrupp } from '../src/domain/dashboard.js';
import type { Elev, Struktur } from '../src/domain/typer.js';
import { tomStruktur } from '../src/domain/typer.js';

const e = (id: string, namn: string, klassId = 'k1'): Elev => ({ id, klassId, namn, grupp: 'A' });
const anna = e('e1', 'Anna Testsson'); const bo = e('e2', 'Bo Provlund'); const cia = e('e3', 'Cia Övnegård'); const dan = e('e4', 'Dan Annanklass', 'k2');
const kluster: KlusterGrupp[] = [
  { kluster: 'stigande', elever: [anna], serie: [] }, { kluster: 'stabil', elever: [], serie: [] },
  { kluster: 'riskzon', elever: [bo, cia], serie: [] }, { kluster: 'ojamn', elever: [], serie: [] },
];
const narvaro: ElevNarvaro[] = [
  { elev: anna, lektioner: 10, narvarande: 10, narvaroProcent: 100, franvaroDatum: [] },
  { elev: bo, lektioner: 10, narvarande: 7, narvaroProcent: 70, franvaroDatum: [] },
  { elev: cia, lektioner: 0, narvarande: 0, narvaroProcent: null, franvaroDatum: [] },
];

describe('Del 141: elevurval', () => {
  it('alla = inget filter', () => {
    expect(elevUrval({ typ: 'alla' }, kluster, narvaro)).toMatchObject({ elevIds: null, etikett: 'alla elever' });
  });
  it('kluster pekar ut klustrens elever och namnger dem', () => {
    expect(elevUrval({ typ: 'kluster', kluster: ['riskzon'] }, kluster, narvaro)).toMatchObject({ elevIds: ['e2', 'e3'], etikett: 'Riskzon' });
    expect(elevUrval({ typ: 'kluster', kluster: ['stigande', 'riskzon'] }, kluster, narvaro).etikett).toBe('Stigande + Riskzon');
    expect(elevUrval({ typ: 'kluster', kluster: [] }, kluster, narvaro)).toMatchObject({ elevIds: [], etikett: 'inget kluster' });
  });
  it('närvaro under/över en gräns; elever utan lektioner hamnar aldrig med', () => {
    expect(elevUrval({ typ: 'narvaro', grans: 80, riktning: 'under' }, kluster, narvaro)).toMatchObject({ elevIds: ['e2'], etikett: 'närvaro under 80 %' });
    expect(elevUrval({ typ: 'narvaro', grans: 80, riktning: 'over' }, kluster, narvaro)).toMatchObject({ elevIds: ['e1'], etikett: 'närvaro minst 80 %' });
    expect(elevUrval({ typ: 'narvaro', grans: 140, riktning: 'over' }, kluster, narvaro)).toMatchObject({ elevIds: ['e1'], etikett: 'närvaro minst 100 %' }); // gränsen klipps till 0–100
  });
  it('elever: dubbletter tas bort, etiketten räknar', () => {
    expect(elevUrval({ typ: 'elever', elevIds: ['e1', 'e1', 'e3'] }, kluster, narvaro)).toMatchObject({ elevIds: ['e1', 'e3'], etikett: '2 elever' });
    expect(elevUrval({ typ: 'elever', elevIds: ['e1'], etikett: 'Riskzon (ändrad)' }, kluster, narvaro).etikett).toBe('Riskzon (ändrad)');
  });
  it('begransaTillElever behåller bara valda elever och deras resultat, rör inget annat', () => {
    const s: Struktur = { ...tomStruktur(), elever: [anna, bo, cia, dan], resultat: [
      { id: 'r1', elevId: 'e1', kalla: 'socrative-exit', prov: 'Q', datum: '2026-09-01', poang: 5, maxPoang: 5, procent: 100 },
      { id: 'r2', elevId: 'e2', kalla: 'socrative-exit', prov: 'Q', datum: '2026-09-01', poang: 2, maxPoang: 5, procent: 40 },
    ] as Struktur['resultat'] };
    const ut = begransaTillElever(s, ['e2', 'e4']);
    expect(ut.elever.map((x) => x.id)).toEqual(['e2', 'e4']);
    expect(ut.resultat!.map((r) => r.id)).toEqual(['r2']);
    expect(s.elever).toHaveLength(4);                       // ren funktion
    expect(begransaTillElever(s, null)).toBe(s);            // null = ingen kopia
    expect(klassensElever(s, 'k1').map((x) => x.namn)).toEqual(['Anna Testsson', 'Bo Provlund', 'Cia Övnegård']);
  });
});

describe('Del 148: namnurval som började i ett kluster', () => {
  it('etiketten visar klustret, och "ändrat urval" när namnen avviker', async () => {
    const { elevUrval, urvalAvvikerFranKluster, klusterElevIds } = await import('../src/domain/elevurval.js');
    const e = (id: string, namn: string) => ({ id, klassId: 'k', namn, grupp: 'A' as const });
    const kluster = [
      { kluster: 'riskzon' as const, elever: [e('e1', 'Anna Testsson'), e('e2', 'Omar Provlund')], snitt: 40, trend: -5 },
      { kluster: 'stabil' as const, elever: [e('e3', 'Pia Övnegård')], snitt: 90, trend: 0 },
    ] as unknown as Parameters<typeof elevUrval>[1];
    expect(klusterElevIds(kluster, ['riskzon'])).toEqual(['e1', 'e2']);
    const samma = { typ: 'elever' as const, elevIds: ['e2', 'e1'], franKluster: ['riskzon' as const] };
    expect(urvalAvvikerFranKluster(samma, kluster)).toBe(false);
    expect(elevUrval(samma, kluster, []).etikett).toBe('Riskzon');
    const andrat = { typ: 'elever' as const, elevIds: ['e1', 'e3'], franKluster: ['riskzon' as const] };
    expect(urvalAvvikerFranKluster(andrat, kluster)).toBe(true);
    expect(elevUrval(andrat, kluster, []).etikett).toBe('Riskzon · ändrat urval');
    expect(urvalAvvikerFranKluster({ typ: 'elever', elevIds: ['e1'] }, kluster)).toBe(false);
  });
});

describe('Del 149: gruppnamn för urvalet', () => {
  it('klassen → null; kluster/närvaro/ändrat kluster/eget urval får namn', async () => {
    const { elevUrval } = await import('../src/domain/elevurval.js');
    const e = (id: string) => ({ id, klassId: 'k', namn: id, grupp: 'A' as const });
    const kluster = [{ kluster: 'riskzon' as const, elever: [e('e1'), e('e2')], snitt: 40, trend: -5 }] as unknown as Parameters<typeof elevUrval>[1];
    const narv = [{ elev: e('e1'), narvaroProcent: 50 }] as unknown as Parameters<typeof elevUrval>[2];
    expect(elevUrval({ typ: 'alla' }, kluster, narv).grupp).toBeNull();
    expect(elevUrval({ typ: 'kluster', kluster: ['riskzon'] }, kluster, narv).grupp).toBe('Riskzon');
    expect(elevUrval({ typ: 'narvaro', grans: 80, riktning: 'under' }, kluster, narv).grupp).toBe('Närvaro under 80 %');
    expect(elevUrval({ typ: 'elever', elevIds: ['e1', 'e2'], franKluster: ['riskzon'] }, kluster, narv).grupp).toBe('Riskzon');
    expect(elevUrval({ typ: 'elever', elevIds: ['e1'], franKluster: ['riskzon'] }, kluster, narv).grupp).toBe('Riskzon (ändrat)');
    expect(elevUrval({ typ: 'elever', elevIds: ['e1'] }, kluster, narv).grupp).toBe('Egen grupp');
  });
});
