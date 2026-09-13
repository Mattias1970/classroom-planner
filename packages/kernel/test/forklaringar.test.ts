import { describe, expect, it } from 'vitest';
import { FORKLARINGAR, forklaring } from '../src/domain/forklaringar.js';
import { blockForklaring, laggTillBlock, nyMall, tolkaRapportmall, uppdateraBlock } from '../src/domain/rapportmall.js';

describe('förklaringar', () => {
  it('varje förklaring har rubrik, kort text och minst ett stycke', () => {
    for (const [id, f] of Object.entries(FORKLARINGAR)) {
      expect(f.rubrik, id).not.toBe('');
      expect(f.kort.length, id).toBeGreaterThan(20);
      expect(f.lang.length, id).toBeGreaterThan(0);
    }
    expect(forklaring('samband').kort).toContain('Pearson');
    expect(forklaring('elevProv').kort).toContain('Rött kryss');
  });

  it('block kopplas till rätt förklaring; KPI följer källan; plattor har ingen', () => {
    let m = laggTillBlock(nyMall('m', 'x', ''), 'k', 'kpi', 0, 0);
    expect(blockForklaring(m.block[0])).toBe('laxforhor'); // standardkälla
    m = uppdateraBlock(m, 'k', { kalla: 'socrative-exit' });
    expect(blockForklaring(m.block[0])).toBe('exit');
    m = laggTillBlock(m, 'p', 'platta', 0, 0);
    expect(blockForklaring(m.block[1])).toBeNull();
    m = laggTillBlock(m, 'f', 'fragematris', 0, 0);
    m = uppdateraBlock(m, 'f', { medForklaring: true });
    const tillbaka = tolkaRapportmall(JSON.stringify(m));
    expect(tillbaka.block.find((b) => b.id === 'f')!.medForklaring).toBe(true);
  });
});
