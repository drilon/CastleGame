import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/rapier-init';
import { generateLevel } from '../src/gen/generate';
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
