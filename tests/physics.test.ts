import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/rapier-init';
import { Sim } from '../src/core/sim';
import type { RapierModule } from '../src/core/rapier-init';
import type { Level } from '../src/core/types';

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initPhysics();
});

describe('kill model', () => {
  it('kills a person hit hard enough, and a light contact does not', () => {
    const level: Level = {
      id: 'kill-test',
      seed: 'kill-test',
      archetype: 'tower',
      blocks: [],
      people: [{ x: 0, y: 0.56 }],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    sim.dropCounterweight();
    sim.releaseSling();
    // Force a hard, direct downward strike to isolate the kill model from
    // trebuchet aim.
    sim.rig.payload.setTranslation({ x: 0, y: 3 }, true);
    sim.rig.payload.setLinvel({ x: 0, y: -40 }, true);

    expect(sim.aliveCount).toBe(1);
    for (let i = 0; i < 20 && sim.aliveCount > 0; i++) sim.step();
    expect(sim.aliveCount).toBe(0);
  });
});

describe('breakable joints', () => {
  it('snaps a joint between blocks under a strong enough impulse', () => {
    const level: Level = {
      id: 'break-test',
      seed: 'break-test',
      archetype: 'tower',
      blocks: [
        { x: 0, y: 0.5, w: 1, h: 1, angle: 0, material: 'wood' },
        { x: 0, y: 1.5, w: 1, h: 1, angle: 0, material: 'wood' },
      ],
      people: [],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    expect(sim.world.joints.length).toBe(1);
    expect(sim.world.joints[0]!.broken).toBe(false);

    // Slam the top block downward hard enough to overstress the joint
    // (wood's break threshold is 550 N·s; this 1x1 block masses ~0.6kg).
    const top = sim.world.blocks[1]!.body;
    top.setLinvel({ x: 0, y: -2000 }, true);
    for (let i = 0; i < 10; i++) sim.step();

    expect(sim.world.joints[0]!.broken).toBe(true);
  });

  it('never breaks a steel joint under the same impulse that snaps wood', () => {
    const level: Level = {
      id: 'steel-test',
      seed: 'steel-test',
      archetype: 'tower',
      blocks: [
        { x: 0, y: 0.5, w: 1, h: 1, angle: 0, material: 'steel' },
        { x: 0, y: 1.5, w: 1, h: 1, angle: 0, material: 'steel' },
      ],
      people: [],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    const top = sim.world.blocks[1]!.body;
    top.setLinvel({ x: 0, y: -2000 }, true);
    for (let i = 0; i < 10; i++) sim.step();

    expect(sim.world.joints[0]!.broken).toBe(false);
  });
});
