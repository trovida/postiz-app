import { makeId } from './make.is';

const ALPHABET = /^[A-Za-z0-9]*$/;

describe('makeId (S7 — CSPRNG)', () => {
  it('returns a string of the requested length', () => {
    for (const n of [1, 5, 10, 32, 100]) {
      expect(makeId(n)).toHaveLength(n);
    }
  });

  it('returns an empty string for non-positive lengths', () => {
    expect(makeId(0)).toBe('');
    expect(makeId(-3)).toBe('');
  });

  it('only ever emits [A-Za-z0-9]', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(makeId(24)).toMatch(ALPHABET);
    }
  });

  it('does NOT use Math.random (stubbing it does not fix the output)', () => {
    // A Math.random()-based makeId with random() pinned to 0 would return all
    // 'A's. The CSPRNG implementation ignores Math.random entirely, so the
    // output stays high-entropy even when Math.random is constant.
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const out = makeId(40);
      expect(out).not.toBe('A'.repeat(40));
      expect(new Set(out.split('')).size).toBeGreaterThan(5);
    } finally {
      spy.mockRestore();
    }
  });

  it('is collision-free across many draws (high entropy)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      seen.add(makeId(16));
    }
    expect(seen.size).toBe(5000);
  });

  it('has a roughly uniform character distribution (no gross modulo bias)', () => {
    const counts: Record<string, number> = {};
    const sample = makeId(62_000); // ~1000 expected per symbol
    for (const ch of sample) {
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    const values = Object.values(counts);
    // Every one of the 62 symbols should appear; none wildly over/under 1000.
    expect(Object.keys(counts).length).toBe(62);
    expect(Math.min(...values)).toBeGreaterThan(700);
    expect(Math.max(...values)).toBeLessThan(1300);
  });
});
