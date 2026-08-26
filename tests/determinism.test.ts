import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/rapier-init';
import { Sim } from '../src/core/sim';
import { simpleStackLevel } from './fixtures';
import type { RapierModule } from '../src/core/rapier-init';

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initPhysics();
});

/** Runs a fixed scenario to a fixed tick count and returns a JSON-serialisable
 * fingerprint of every body's final pose. */
function runScenario(): string {
  const sim = new Sim(RAPIER, simpleStackLevel());
  const dropTick = 30;
  const releaseTick = 95;
  for (let i = 0; i < 400; i++) {
    if (sim.tick === dropTick) sim.dropCounterweight();
    if (sim.tick === releaseTick) sim.releaseSling();
    sim.step();
  }
  const snap = sim.snapshot();
  return JSON.stringify({
    blocks: snap.blocks.map((b) => [b.x, b.y, b.angle, b.detached]),
    people: snap.people.map((p) => [p.x, p.y, p.angle, p.alive]),
    payload: snap.trebuchet.payload,
  });
}

describe('determinism', () => {
  it('produces a bit-identical outcome across 50 runs of the same seed and input sequence', () => {
    const first = runScenario();
    for (let i = 0; i < 49; i++) {
      expect(runScenario()).toBe(first);
    }
  });
});
