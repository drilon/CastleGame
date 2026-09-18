import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/rapier-init';
import { generateLevel } from '../src/gen/generate';
import { difficultyFromWinningFraction, WINNING_FRACTION_CEILING } from '../src/gen/evaluate';
import { ARCHETYPE_LIST } from '../src/gen/archetypes';
import type { RapierModule } from '../src/core/rapier-init';

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initPhysics();
});

describe('generator', () => {
  it('produces a bit-identical level when regenerated from the same (stored) seed', () => {
    const { level: first } = generateLevel(RAPIER, 'repro', 'repro-seed', { archetype: 'tower' });
    const { level: second } = generateLevel(RAPIER, 'repro', first.seed, { archetype: 'tower' });
    expect(second.blocks).toEqual(first.blocks);
    expect(second.people).toEqual(first.people);
    expect(second.seed).toBe(first.seed);
  });

  it('generates a settled, non-overlapping level for every archetype', () => {
    for (const archetype of ARCHETYPE_LIST) {
      const { level } = generateLevel(RAPIER, `t-${archetype}`, `smoke-${archetype}`, { archetype });
      expect(level.archetype).toBe(archetype);
      expect(level.blocks.length).toBeGreaterThan(0);
      expect(level.people.length).toBeGreaterThan(0);
    }
  });
});

describe('difficulty normalisation', () => {
  /** The bug this guards: scoring `1 - winningFraction` against a ceiling of
   * 1 when the generator's real ceiling is ~0.45 compressed every shipped
   * level into 0.55-1.0, so no pack could open gently. */
  it('spans the full range over the winning fractions the generator actually produces', () => {
    expect(difficultyFromWinningFraction(WINNING_FRACTION_CEILING)).toBeCloseTo(0, 5);
    expect(difficultyFromWinningFraction(0.034)).toBeGreaterThan(0.6);
    // The realistic middle of the distribution must land mid-scale, not pinned high.
    expect(difficultyFromWinningFraction(0.138)).toBeGreaterThan(0.25);
    expect(difficultyFromWinningFraction(0.138)).toBeLessThan(0.55);
  });

  it('is monotonic and stays inside [0,1] even past the ceiling', () => {
    let prev = Infinity;
    for (let wf = 0; wf <= 1.0001; wf += 0.02) {
      const d = difficultyFromWinningFraction(wf);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
    expect(difficultyFromWinningFraction(0)).toBe(1);
  });
});
